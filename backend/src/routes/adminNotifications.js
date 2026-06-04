const crypto = require('node:crypto');
const { HttpError, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { config } = require('../config');
const { enforceRateLimit } = require('../rateLimit');
const { pocketBase } = require('../pocketbase');

const adminTokenFailures = new Map();
const ADMIN_TOKEN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_TOKEN_MAX_FAILURES = 8;
const ADMIN_REQUEST_MAX_PER_MIN = 30;
const ADMIN_TIMESTAMP_WINDOW_SECONDS = 300;

function pickString(body, field) {
  return typeof body[field] === 'string' ? body[field].trim() : '';
}

function isLocalAddress(ip) {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('fe80:')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  return false;
}

async function requireAdminNotificationToken(req) {
  if (!config.admin.notificationToken && !config.admin.notificationTokenHashes.length) {
    throw new HttpError(503, 'Admin notifications are not configured.', {
      code: 'admin_notifications_disabled',
    });
  }

  const requestContext = getRequestContext(req);
  const ipAddress = requestContext.ipAddress || '';
  if (!isLocalAddress(ipAddress) && process.env.NODE_ENV === 'production') {
    throw new HttpError(403, 'Admin notifications are only accepted from local networks.', {
      code: 'admin_source_rejected',
    });
  }

  const provided = String(req.headers['x-oroya-admin-token'] || '').trim();
  const key = getAdminFailureKey(req);
  assertAdminTokenNotThrottled(key);

  if (!isValidAdminToken(provided)) {
    recordAdminTokenFailure(key);
    await pocketBase.createAuditLog({
      action: 'admin.notification_token_invalid',
      ...requestContext,
      metadata: {
        key_prefix: key.slice(0, 8),
      },
    }).catch(() => {});
    throw new HttpError(401, 'Admin token is invalid.', {
      code: 'admin_token_invalid',
    });
  }

  adminTokenFailures.delete(key);
}

async function createAdminNotification(req, res) {
  await requireAdminNotificationToken(req);
  const requestContext = getRequestContext(req);

  await enforceRateLimit({
    scope: 'admin:notifications',
    identity: requestContext.ipAddress || 'unknown',
    limit: ADMIN_REQUEST_MAX_PER_MIN,
    windowMs: 60 * 1000,
  });

  const body = await parseJsonBody(req);

  const title = pickString(body, 'title');
  const message = pickString(body, 'body') || pickString(body, 'message');
  if (!title || !message) {
    throw new HttpError(400, 'Title and body are required.', {
      code: 'notification_validation_failed',
    });
  }

  if (title.length > 200 || message.length > 4000) {
    throw new HttpError(400, 'Notification payload is too large.', {
      code: 'notification_payload_too_large',
    });
  }

  const notification = await pocketBase.createAdminNotification({
    title,
    body: message,
    type: pickString(body, 'type') || 'system',
    imageUrl: pickString(body, 'image_url') || pickString(body, 'imageUrl'),
    icon: pickString(body, 'icon'),
    linkUrl: pickString(body, 'link_url') || pickString(body, 'linkUrl'),
    metadata:
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {},
  });

  await pocketBase.createAuditLog({
    action: 'admin.notification_created',
    ...requestContext,
    metadata: {
      notification_id: notification.id,
      title_length: title.length,
      body_length: message.length,
    },
  });

  sendJson(res, 201, {
    success: true,
    notification: {
      id: notification.id,
      title: notification.title,
      status: notification.status,
      publishedAt: notification.published_at,
    },
  });
}

module.exports = {
  createAdminNotification,
};

function constantTimeEqual(a, b) {
  const left = Buffer.from(crypto.createHash('sha256').update(String(a || '')).digest('hex'));
  const right = Buffer.from(crypto.createHash('sha256').update(String(b || '')).digest('hex'));
  return crypto.timingSafeEqual(left, right);
}

function isValidAdminToken(provided) {
  if (!provided) return false;
  if (config.admin.notificationTokenHashes.length) {
    const digest = crypto.createHash('sha256').update(String(provided)).digest('hex');
    return config.admin.notificationTokenHashes.some((hash) => constantTimeEqual(digest, hash));
  }
  return constantTimeEqual(provided, config.admin.notificationToken);
}

function getAdminFailureKey(req) {
  const ip = String(req.socket.remoteAddress || '').slice(0, 80);
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function assertAdminTokenNotThrottled(key) {
  const failure = adminTokenFailures.get(key);
  if (!failure) return;

  const now = Date.now();
  if (failure.resetAt <= now) {
    adminTokenFailures.delete(key);
    return;
  }

  if (failure.count >= ADMIN_TOKEN_MAX_FAILURES) {
    throw new HttpError(429, 'Too many admin token attempts.', {
      code: 'admin_token_temporarily_locked',
    });
  }
}

function recordAdminTokenFailure(key) {
  const now = Date.now();
  const existing = adminTokenFailures.get(key);
  if (!existing || existing.resetAt <= now) {
    adminTokenFailures.set(key, { count: 1, resetAt: now + ADMIN_TOKEN_WINDOW_MS });
    return;
  }

  existing.count += 1;
}
