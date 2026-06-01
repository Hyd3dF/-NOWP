const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

function getUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

function pickString(body, field) {
  return typeof body[field] === 'string' ? body[field].trim() : '';
}

async function openChat(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const friendUserId = pickString(body, 'friend_id') || pickString(body, 'friendId');

  if (!friendUserId) {
    throw new HttpError(400, 'friend_id is required.');
  }

  const friendship = await pocketBase.findFriendship(user.id, friendUserId);
  if (!friendship || friendship.status !== 'accepted') {
    throw new HttpError(403, 'You can only chat with accepted friends.');
  }

  const thread = await pocketBase.ensureChatThread(friendship);
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'chats.open',
    ...requestContext,
    metadata: {
      friend_user_id: friendUserId,
      thread_id: thread.id,
    },
  });

  sendJson(res, 200, {
    success: true,
    thread,
  });
}

async function listMessages(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const url = getUrl(req);
  const threadId = url.searchParams.get('thread_id') || '';

  if (!threadId) {
    throw new HttpError(400, 'thread_id is required.');
  }

  const messages = await pocketBase.listChatMessages(threadId, user.id);
  sendJson(res, 200, {
    success: true,
    messages,
  });
}

async function createMessage(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const threadId = pickString(body, 'thread_id') || pickString(body, 'threadId');
  const messageText = pickString(body, 'message');

  if (!threadId) {
    throw new HttpError(400, 'thread_id is required.');
  }

  const message = await pocketBase.createChatMessage({
    threadId,
    senderUserId: user.id,
    message: messageText,
  });

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'chats.message_create',
    ...requestContext,
    metadata: {
      thread_id: threadId,
      message_id: message.id,
    },
  });

  sendJson(res, 201, {
    success: true,
    message,
  });
}

module.exports = {
  createMessage,
  listMessages,
  openChat,
};
