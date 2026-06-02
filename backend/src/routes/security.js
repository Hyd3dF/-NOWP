const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

function pickString(body, field) {
  return typeof body[field] === 'string' ? body[field].trim() : '';
}

async function requireSecurityPin(user, body) {
  const pin = pickString(body, 'pin');
  if (!/^\d{4}$/.test(pin)) {
    throw new HttpError(400, 'PIN must be 4 digits.', {
      code: 'invalid_pin_format',
    });
  }
  await pocketBase.verifyUserPin(user, pin);
}

async function securityOverview(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const requestContext = getRequestContext(req);
  const security = await pocketBase.getSecurityOverview(user, requestContext);

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.overview',
    ...requestContext,
    metadata: {},
  });

  sendJson(res, 200, {
    success: true,
    security,
  });
}

async function updateBiometricLock(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const enabled = Boolean(body.enabled);
  await requireSecurityPin(user, body);

  const record = await pocketBase.upsertBiometricLock(user.id, requestContext, enabled);
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.biometric_update',
    ...requestContext,
    metadata: { enabled },
  });

  sendJson(res, 200, {
    success: true,
    biometricLock: {
      enabled: Boolean(record.enabled),
      updatedAt: record.updated_at,
    },
  });
}

async function updateTwoFactor(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const enabled = Boolean(body.enabled);
  await requireSecurityPin(user, body);

  const record = await pocketBase.upsertTwoFactorSettings(user.id, enabled);
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.two_factor_update',
    ...requestContext,
    metadata: { enabled },
  });

  sendJson(res, 200, {
    success: true,
    twoFactor: {
      enabled: Boolean(record.enabled),
      method: record.method,
      transferRequired: Boolean(record.transfer_required),
      updatedAt: record.updated_at,
    },
  });
}

async function verifyPin(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const pin = pickString(body, 'pin');

  if (!/^\d{4}$/.test(pin)) {
    throw new HttpError(400, 'PIN must be 4 digits.', {
      code: 'invalid_pin_format',
    });
  }

  await pocketBase.verifyUserPin(user, pin);
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.pin_verify',
    ...requestContext,
    metadata: {},
  });

  sendJson(res, 200, {
    success: true,
  });
}

async function changePin(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const currentPin = pickString(body, 'current_pin') || pickString(body, 'currentPin');
  const newPin = pickString(body, 'new_pin') || pickString(body, 'newPin');

  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
    throw new HttpError(400, 'PIN values must be 4 digits.', {
      code: 'invalid_pin_format',
    });
  }

  let result;
  try {
    result = await pocketBase.changeSecurityPin(user, currentPin, newPin);
  } catch (error) {
    if (error.status === 401 && error.details?.code === 'invalid_pin') {
      throw new HttpError(400, 'Current PIN is incorrect.', {
        code: 'invalid_pin',
      });
    }
    throw error;
  }
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.pin_change',
    ...requestContext,
    metadata: { changed_at: result.changedAt },
  });

  sendJson(res, 200, {
    success: true,
    changedAt: result.changedAt,
  });
}

async function changePassword(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);
  const currentPassword = pickString(body, 'current_password') || pickString(body, 'currentPassword');
  const newPassword = pickString(body, 'new_password') || pickString(body, 'newPassword');

  if (!currentPassword || !newPassword) {
    throw new HttpError(400, 'Current password and new password are required.', {
      code: 'password_required',
    });
  }

  let result;
  try {
    result = await pocketBase.changePassword(user, currentPassword, newPassword);
  } catch (error) {
    if (error.status === 401) {
      throw new HttpError(400, 'Current password is incorrect.', {
        code: 'current_password_invalid',
      });
    }
    throw error;
  }
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.password_change',
    ...requestContext,
    metadata: {
      changed_at: result.changedAt,
      strength_score: result.strengthScore,
    },
  });

  sendJson(res, 200, {
    success: true,
    changedAt: result.changedAt,
    strengthScore: result.strengthScore,
  });
}

module.exports = {
  changePassword,
  changePin,
  securityOverview,
  updateBiometricLock,
  updateTwoFactor,
  verifyPin,
};
