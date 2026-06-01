const { HttpError, parseJsonBody, sendJson } = require('../http');
const { config } = require('../config');
const { pocketBase } = require('../pocketbase');

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
  if (provided !== config.admin.notificationToken) {
    throw new HttpError(401, 'Admin token is invalid.', {
      code: 'admin_token_invalid',
    });
  }
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
