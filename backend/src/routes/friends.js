const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

function getUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

function pickString(body, field) {
  return typeof body[field] === 'string' ? body[field].trim() : '';
}

async function listFriends(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const friends = await pocketBase.listFriends(user.id);

  sendJson(res, 200, {
    success: true,
    friends,
  });
}

async function searchFriends(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const url = getUrl(req);
  const query = url.searchParams.get('q') || '';
  const users = await pocketBase.searchUsersForFriend(query, user.id);

  sendJson(res, 200, {
    success: true,
    users,
  });
}

async function listFriendRequests(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const requests = await pocketBase.listFriendRequests(user.id);

  sendJson(res, 200, {
    success: true,
    requests,
  });
}

async function createFriendRequest(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const oroyaId = pickString(body, 'oroya_id') || pickString(body, 'oroyaId');
  const targetUserId = pickString(body, 'user_id') || pickString(body, 'userId');

  let receiverUserId = targetUserId;
  if (!receiverUserId) {
    if (!oroyaId) {
      throw new HttpError(400, 'Oroya ID is required.');
    }
    const profile = await pocketBase.findPaymentProfileByTag(oroyaId.replace(/^#|@/g, ''));
    if (!profile) {
      throw new HttpError(404, 'No user found with this Oroya ID.');
    }
    receiverUserId = profile.user_id;
  }

  const request = await pocketBase.createFriendRequest({
    requesterUserId: user.id,
    receiverUserId,
    message: pickString(body, 'message'),
  });

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'friends.request_create',
    ...requestContext,
    metadata: {
      request_id: request.id,
      receiver_user_id: receiverUserId,
    },
  });

  sendJson(res, 201, {
    success: true,
    request,
  });
}

async function acceptFriendRequest(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const requestId = pickString(body, 'request_id') || pickString(body, 'requestId');

  if (!requestId) {
    throw new HttpError(400, 'request_id is required.');
  }

  const result = await pocketBase.acceptFriendRequest(requestId, user.id);
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'friends.request_accept',
    ...requestContext,
    metadata: {
      request_id: requestId,
      friendship_id: result.friendship.id,
      thread_id: result.thread.id,
    },
  });

  sendJson(res, 200, {
    success: true,
    friendship: result.friendship,
    thread: result.thread,
  });
}

module.exports = {
  acceptFriendRequest,
  createFriendRequest,
  listFriendRequests,
  listFriends,
  searchFriends,
};
