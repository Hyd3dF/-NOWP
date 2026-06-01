const { getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase, sanitizeUser } = require('../pocketbase');

async function me(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  await pocketBase.ensurePaymentProfile(user);

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'users.me',
    ...getRequestContext(req),
    metadata: {},
  });

  sendJson(res, 200, {
    success: true,
    user: sanitizeUser(user),
  });
}

async function paymentProfile(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const profile = await pocketBase.ensurePaymentProfile(user);

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'users.payment_profile',
    ...getRequestContext(req),
    metadata: {
      payment_tag: profile.payment_tag,
    },
  });

  sendJson(res, 200, {
    success: true,
    paymentProfile: {
      user_id: profile.user_id,
      payment_tag: profile.payment_tag,
      display_name: profile.display_name,
      qr_payload: profile.qr_payload,
      is_active: profile.is_active,
    },
  });
}

async function updateMe(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);

  const updatedUser = await pocketBase.updateUserProfile(user.id, {
    displayName: typeof body.display_name === 'string' ? body.display_name : '',
    username: typeof body.username === 'string' ? body.username.trim().toLowerCase() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    profile_photo_base64:
      typeof body.profile_photo_base64 === 'string' ? body.profile_photo_base64 : '',
    profile_photo_mime:
      typeof body.profile_photo_mime === 'string' ? body.profile_photo_mime : '',
    profile_photo_name:
      typeof body.profile_photo_name === 'string' ? body.profile_photo_name : '',
  });

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'users.update_me',
    ...requestContext,
    metadata: {
      username: updatedUser.username || '',
      has_profile_photo: Boolean(updatedUser.profile_photo_url),
    },
  });

  sendJson(res, 200, {
    success: true,
    user: sanitizeUser(updatedUser),
  });
}

module.exports = { me, paymentProfile, updateMe };
