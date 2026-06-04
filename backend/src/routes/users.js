const crypto = require('node:crypto');
const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { verifyDeviceToken } = require('../deviceToken');
const { pocketBase, sanitizeUser } = require('../pocketbase');

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '');
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function hashForAudit(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSensitiveProfileUpdate(user, input) {
  const currentPhone = normalizePhone(user.phone);
  const nextPhone = normalizePhone(input.phone);
  const currentUsername = normalizeUsername(user.username);
  const nextUsername = normalizeUsername(input.username);
  return Boolean(
    (nextPhone && nextPhone !== currentPhone) ||
      (nextUsername && nextUsername !== currentUsername),
  );
}

async function requireDeviceTokenForUser(userId, context) {
  if (!context.deviceToken) {
    throw new HttpError(401, 'Device session token is required for sensitive profile updates.', {
      code: 'device_token_required',
    });
  }

  let verified;
  try {
    verified = verifyDeviceToken(context.deviceToken, context);
  } catch {
    throw new HttpError(401, 'Device session token is invalid.', {
      code: 'device_token_invalid',
    });
  }
  if (verified.userId !== userId) {
    throw new HttpError(401, 'Device session token does not match the user.', {
      code: 'device_token_mismatch',
    });
  }
  const record = await pocketBase.findDeviceTokenByHash(verified.tokenHash);
  if (!record || record.revoked_at) {
    throw new HttpError(401, 'Device session has been revoked.', {
      code: 'device_token_revoked',
    });
  }
  return record;
}

async function requireSecurityPin(user, body) {
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  if (!/^\d{4}$/.test(pin)) {
    throw new HttpError(401, 'Security PIN is required for sensitive profile updates.', {
      code: 'profile_step_up_required',
    });
  }
  await pocketBase.verifyUserPin(user, pin);
}

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
  const input = {
    displayName: typeof body.display_name === 'string' ? body.display_name : '',
    username: typeof body.username === 'string' ? body.username.trim().toLowerCase() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    profile_photo_base64:
      typeof body.profile_photo_base64 === 'string' ? body.profile_photo_base64 : '',
    profile_photo_mime:
      typeof body.profile_photo_mime === 'string' ? body.profile_photo_mime : '',
    profile_photo_name:
      typeof body.profile_photo_name === 'string' ? body.profile_photo_name : '',
  };

  const sensitiveUpdate = isSensitiveProfileUpdate(user, input);
  if (sensitiveUpdate) {
    await requireDeviceTokenForUser(user.id, requestContext);
    await requireSecurityPin(user, body);
  }

  const updatedUser = await pocketBase.updateUserProfile(user.id, input);

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'users.update_me',
    ...requestContext,
    metadata: {
      username_hash: hashForAudit(updatedUser.username || ''),
      phone_changed: sensitiveUpdate && normalizePhone(user.phone) !== normalizePhone(updatedUser.phone),
      username_changed:
        sensitiveUpdate && normalizeUsername(user.username) !== normalizeUsername(updatedUser.username),
      has_profile_photo: Boolean(updatedUser.profile_photo_url),
    },
  });

  sendJson(res, 200, {
    success: true,
    user: sanitizeUser(updatedUser),
  });
}

module.exports = { me, paymentProfile, updateMe };
module.exports.__testables = {
  isSensitiveProfileUpdate,
  normalizePhone,
  normalizeUsername,
  requireDeviceTokenForUser,
};
