const crypto = require('node:crypto');
const { HttpError, parseJsonBody, sendJson } = require('../http');
const { config } = require('../config');
const { pocketBase } = require('../pocketbase');

const adminTokenFailures = new Map();
const ADMIN_TOKEN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_TOKEN_MAX_FAILURES = 8;

function pickString(body, field) {
  return typeof body[field] === 'string' ? body[field].trim() : '';
}

function requireAdminNotificationToken(req) {
  if (!config.admin.notificationToken) {
    throw new HttpError(503, 'Admin notifications are not configured.', {
      code: 'admin_notifications_disabled',
    });
  }

  const provided = String(req.headers['x-oroya-admin-token'] || '').trim();
  const key = getAdminFailureKey(req);
  assertAdminTokenNotThrottled(key);

  if (!constantTimeEqual(provided, config.admin.notificationToken)) {
    recordAdminTokenFailure(key);
    throw new HttpError(401, 'Admin token is invalid.', {
      code: 'admin_token_invalid',
    });
  }

  adminTokenFailures.delete(key);
}

async function createAdminNotification(req, res) {
  requireAdminNotificationToken(req);
  const body = await parseJsonBody(req);

  const title = pickString(body, 'title');
  const message = pickString(body, 'body') || pickString(body, 'message');
  if (!title || !message) {
    throw new HttpError(400, 'Title and body are required.', {
      code: 'notification_validation_failed',
    });
  }

  const notification = await pocketBase.createAdminNotification({
    title,
    body: message,
    type: pickString(body, 'type') || 'system',
    imageUrl: pickString(body, 'image_url') || pickString(body, 'imageUrl'),
    icon: pickString(body, 'icon'),
    linkUrl: pickString(body, 'link_url') || pickString(body, 'linkUrl'),
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {},
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
