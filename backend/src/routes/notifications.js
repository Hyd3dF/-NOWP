const { getBearerToken, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

function pickString(body, field) {
  return typeof body[field] === 'string' ? body[field].trim() : '';
}

async function listNotifications(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const notifications = await pocketBase.listNotifications(user.id);

  sendJson(res, 200, {
    success: true,
    unreadCount: notifications.filter((item) => !item.isRead).length,
    notifications,
  });
}

async function markNotificationRead(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const notificationId = pickString(body, 'notification_id') || pickString(body, 'notificationId');

  await pocketBase.markNotificationRead(user.id, notificationId);

  sendJson(res, 200, {
    success: true,
  });
}

module.exports = {
  listNotifications,
  markNotificationRead,
};
