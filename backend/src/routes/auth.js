const crypto = require('node:crypto');
const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase, sanitizeUser } = require('../pocketbase');
const { enforceRateLimit } = require('../rateLimit');
const logger = require('../logger');
const {
  buildDeviceFingerprint,
  issueDeviceToken,
  normalizeFingerprintHash,
  verifyDeviceToken,
  hashToken,
} = require('../deviceToken');
const { normalizePhoneNumber } = require('../phone');

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const REGISTER_MAX_PER_HOUR = Number(process.env.AUTH_REGISTER_MAX_PER_HOUR || 5);
const REGISTER_EMAIL_MAX_PER_HOUR = Number(process.env.AUTH_REGISTER_EMAIL_MAX_PER_HOUR || 3);
const LOGIN_MAX_PER_5_MIN = Number(process.env.AUTH_LOGIN_MAX_PER_5_MIN || 10);
const LOGIN_ACCOUNT_MAX_PER_15_MIN = Number(process.env.AUTH_LOGIN_ACCOUNT_MAX_PER_15_MIN || 20);
const PASSWORD_RESET_MAX_PER_HOUR = Number(process.env.AUTH_PASSWORD_RESET_MAX_PER_HOUR || 5);
const MAX_PROFILE_PHOTO_BASE64_CHARS = Number(process.env.MAX_PROFILE_PHOTO_BASE64_CHARS || 2_000_000);

const loginAttempts = new Map();

function requireString(body, field) {
  if (typeof body[field] !== 'string' || body[field].trim() === '') {
    throw new HttpError(400, `${field} is required.`);
  }
  return body[field].trim();
}

function pickRegisterInput(body) {
  return {
    first_name: typeof body.first_name === 'string' ? body.first_name.trim() : '',
    last_name: typeof body.last_name === 'string' ? body.last_name.trim() : '',
    username: typeof body.username === 'string' ? body.username.trim() : '',
    email: requireString(body, 'email').toLowerCase(),
    phone: normalizePhoneNumber(typeof body.phone === 'string' ? body.phone : ''),
    password: typeof body.password === 'string' ? body.password : '',
    passwordConfirm:
      typeof body.passwordConfirm === 'string' ? body.passwordConfirm : body.password,
    pin: typeof body.pin === 'string' ? body.pin : '',
    date_of_birth: typeof body.date_of_birth === 'string' ? body.date_of_birth : '',
    profile_photo_base64:
      typeof body.profile_photo_base64 === 'string' ? body.profile_photo_base64 : '',
    profile_photo_mime:
      typeof body.profile_photo_mime === 'string' ? body.profile_photo_mime : '',
    profile_photo_name:
      typeof body.profile_photo_name === 'string' ? body.profile_photo_name : '',
  };
}

function auditHash(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex');
}

function writeAuditLog(entry) {
  pocketBase.createAuditLog(entry).catch((error) => {
    logger.warn('audit_log_write_failed', {
      action: entry?.action || '',
      code: error?.details?.code || error?.code || '',
      status: error?.status || 0,
      message: error?.message || '',
    });
  });
}

function getLoginAttemptKey(identity, context) {
  return auditHash(`${identity || ''}|${context.deviceId || ''}|${context.ipAddress || ''}`);
}

function getAuthRateLimitIdentities(identity, context) {
  const identityHash = auditHash(identity);
  return {
    loginIpAccount: `${context.ipAddress || 'unknown'}|${identityHash}`,
    loginAccount: identityHash,
    registerIp: context.ipAddress || 'unknown',
    registerEmail: identityHash,
  };
}

function assertLoginNotThrottled(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return;

  const now = Date.now();
  if (attempt.resetAt <= now) {
    loginAttempts.delete(key);
    return;
  }

  if (attempt.count >= LOGIN_MAX_FAILURES) {
    throw new HttpError(429, 'Too many login attempts. Try again later.', {
      code: 'login_temporarily_locked',
    });
  }
}

function recordLoginFailure(key) {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  existing.count += 1;
}

function resetLoginAttempts(key) {
  loginAttempts.delete(key);
}

async function issueAndPersistDeviceToken(userId, context, fingerprint) {
  const issued = issueDeviceToken({ userId, fingerprint });
  await pocketBase.issueDeviceTokenRecord({
    userId,
    tokenHash: issued.tokenHash,
    fingerprint,
    fingerprintHash: normalizeFingerprintHash(fingerprint),
    context,
    issuedAt: issued.issuedAt,
    expiresAt: issued.expiresAt,
  });
  return issued;
}

async function resolveDeviceToken(userId, context) {
  const headerToken = context.deviceToken;
  if (headerToken) {
    try {
      const verified = verifyDeviceToken(headerToken, context);
      if (verified.userId !== userId) {
        return { status: 'rejected', reason: 'mismatch' };
      }
      const record = await pocketBase.findDeviceTokenByHash(verified.tokenHash);
      if (!record) {
        return { status: 'rejected', reason: 'unknown' };
      }
      if (record.revoked_at) {
        return { status: 'rejected', reason: 'revoked' };
      }
      return {
        status: 'valid',
        token: headerToken,
        record,
        fingerprintHash: verified.fingerprintHash,
      };
    } catch {
      return { status: 'rejected', reason: 'invalid' };
    }
  }
  return { status: 'missing' };
}

async function register(req, res) {
  const body = await parseJsonBody(req);
  const input = pickRegisterInput(body);
  const requestContext = getRequestContext(req);

  if (!input.password) {
    throw new HttpError(400, 'password is required.');
  }
  if (input.passwordConfirm !== input.password) {
    throw new HttpError(400, 'passwordConfirm must match password.');
  }
  if (input.profile_photo_base64.length > MAX_PROFILE_PHOTO_BASE64_CHARS) {
    throw new HttpError(413, 'Profile photo is too large. Please choose a smaller photo or continue without one.', {
      code: 'request_body_too_large',
      field: 'profile_photo_file',
    });
  }
  if (input.profile_photo_base64 && !/^image\/(jpeg|jpg|png|webp)$/i.test(input.profile_photo_mime || 'image/jpeg')) {
    throw new HttpError(400, 'Profile photo must be a JPEG, PNG, or WebP image.', {
      code: 'invalid_profile_photo',
      field: 'profile_photo_file',
    });
  }

  await enforceRateLimit({
    scope: 'auth:register',
    identity: requestContext.ipAddress || 'unknown',
    limit: REGISTER_MAX_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  await enforceRateLimit({
    scope: 'auth:register:email',
    identity: auditHash(input.email),
    limit: REGISTER_EMAIL_MAX_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });

  let user = null;
  let auth = null;
  try {
    const existingUser = await pocketBase.findUserByEmail(input.email);

    if (existingUser) {
      throw new HttpError(409, 'An account already exists for this email. Please log in or reset your password.', {
        code: 'email_already_exists',
        field: 'email',
      });
    }

    await Promise.all([
      pocketBase.assertUsernameAvailable(input.username),
      pocketBase.assertDeviceCanRegister(requestContext),
    ]);
    user = await pocketBase.createUser(input);
    await Promise.all([
      pocketBase.ensureDefaultWallet(user.id),
      pocketBase.ensurePaymentProfile(user),
      pocketBase.upsertTwoFactorSettings(user.id, true),
      pocketBase.ensureSecurityPin(user).catch(() => null),
      pocketBase.upsertDeviceSession(user.id, requestContext).catch(() => null),
    ]);
    await pocketBase.recordDeviceUsage(requestContext, {
      userId: user.id,
      accountCreated: true,
    });
    auth = await pocketBase.authenticateUser(input.email, input.password);
    const fingerprint = buildDeviceFingerprint(requestContext);
    const issued = await issueAndPersistDeviceToken(user.id, requestContext, fingerprint);
    writeAuditLog({
      userId: user.id,
      action: 'auth.register',
      ...requestContext,
      metadata: {
        email_hash: auditHash(input.email),
        username: input.username,
        created: true,
      },
    });
    sendJson(res, 201, {
      success: true,
      token: auth.token,
      device_token: issued.token,
      device_token_expires_at: new Date(issued.expiresAt * 1000).toISOString(),
      user: sanitizeUser(auth.record || user),
    });
  } catch (error) {
    writeAuditLog({
      action: 'auth.register_failed',
      ...requestContext,
      metadata: {
        email_hash: auditHash(input.email),
        reason_code: error.details?.code || 'register_failed',
        field: error.details?.field || '',
        validation_fields: error.details?.validation_fields || '',
      },
    });
    throw error;
  }
}

async function login(req, res) {
  const body = await parseJsonBody(req);
  const identity = requireString(body, 'identity');
  const password = requireString(body, 'password');
  const requestContext = getRequestContext(req);
  const attemptKey = getLoginAttemptKey(identity, requestContext);

  await enforceRateLimit({
    scope: 'auth:login',
    identity: `${requestContext.ipAddress || 'unknown'}|${auditHash(identity)}`,
    limit: LOGIN_MAX_PER_5_MIN,
    windowMs: 5 * 60 * 1000,
  });
  await enforceRateLimit({
    scope: 'auth:login:account',
    identity: auditHash(identity),
    limit: LOGIN_ACCOUNT_MAX_PER_15_MIN,
    windowMs: 15 * 60 * 1000,
  });

  let countedLoginAttempt = false;
  let preVerifiedFingerprintHash = '';

  try {
    if (requestContext.deviceToken) {
      try {
        const verified = verifyDeviceToken(requestContext.deviceToken, requestContext);
        preVerifiedFingerprintHash = verified.fingerprintHash;
      } catch {
        preVerifiedFingerprintHash = '';
      }
    }

    assertLoginNotThrottled(attemptKey);
    const auth = await pocketBase.authenticateUserSmart(identity, password);
    const user = auth.record;

    if (preVerifiedFingerprintHash && requestContext.deviceToken) {
      try {
        const verified = verifyDeviceToken(requestContext.deviceToken, requestContext);
        if (verified.userId !== user.id) {
          preVerifiedFingerprintHash = '';
        }
      } catch {
        preVerifiedFingerprintHash = '';
      }
    }

    await pocketBase.assertDeviceCanLogin(requestContext, user.id, preVerifiedFingerprintHash);
    countedLoginAttempt = true;
    await pocketBase.updateUser(user.id, { last_login_at: new Date().toISOString() });
    await pocketBase.ensureDefaultWallet(user.id);
    await pocketBase.ensurePaymentProfile(user);
    await pocketBase.ensureSecurityPin(user).catch(() => {});
    await pocketBase
      .upsertDeviceSession(user.id, requestContext, preVerifiedFingerprintHash)
      .catch(() => {});
    await pocketBase.recordDeviceUsage(requestContext, {
      userId: user.id,
      loggedIn: true,
    }, preVerifiedFingerprintHash);
    countedLoginAttempt = false;

    const fingerprint = buildDeviceFingerprint(requestContext);
    const issued = await issueAndPersistDeviceToken(user.id, requestContext, fingerprint);

    writeAuditLog({
      userId: user.id,
      action: 'auth.login',
      ...requestContext,
      metadata: { identity_hash: auditHash(identity) },
    });
    resetLoginAttempts(attemptKey);

    sendJson(res, 200, {
      success: true,
      token: auth.token,
      device_token: issued.token,
      device_token_expires_at: new Date(issued.expiresAt * 1000).toISOString(),
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (countedLoginAttempt && error.status !== 429) {
      await pocketBase.recordDeviceUsage(requestContext, {
        loggedIn: true,
      }).catch(() => {});
    }
    writeAuditLog({
      action: 'auth.login_failed',
      ...requestContext,
      metadata: {
        identity_hash: auditHash(identity),
        reason_code:
          error.details?.code ||
          (error.status === 429 ? 'rate_limited' : 'invalid_credentials'),
      },
    });
    if (error.status === 429) throw error;
    recordLoginFailure(attemptKey);
    throw new HttpError(401, 'Invalid credentials.', { code: 'invalid_credentials' });
  }
}

async function requestPasswordReset(req, res) {
  const body = await parseJsonBody(req);
  const email = requireString(body, 'email').toLowerCase();
  const requestContext = getRequestContext(req);
  const identityHash = auditHash(email);

  await enforceRateLimit({
    scope: 'auth:password-reset',
    identity: `${requestContext.ipAddress || 'unknown'}|${identityHash}`,
    limit: PASSWORD_RESET_MAX_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });

  const response = {
    success: true,
    message: 'If an account exists, password reset instructions will be sent.',
  };

  const user = await pocketBase.findUserByEmail(email).catch(() => null);
  if (user) {
    const issued = await pocketBase.issuePasswordResetToken(user.id);
    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'auth.password_reset_requested',
      ...requestContext,
      metadata: { email_hash: identityHash },
    });
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_PASSWORD_RESET_ECHO === 'true') {
      response.dev_reset_token = issued.token;
    }
  } else {
    await pocketBase.createAuditLog({
      action: 'auth.password_reset_requested_unknown',
      ...requestContext,
      metadata: { email_hash: identityHash },
    }).catch(() => {});
  }

  sendJson(res, 200, response);
}

async function confirmPasswordReset(req, res) {
  const body = await parseJsonBody(req);
  const resetToken = requireString(body, 'reset_token');
  const newPassword = requireString(body, 'new_password');
  const requestContext = getRequestContext(req);

  await enforceRateLimit({
    scope: 'auth:password-reset-confirm',
    identity: requestContext.ipAddress || 'unknown',
    limit: PASSWORD_RESET_MAX_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });

  const consumed = await pocketBase.consumePasswordResetToken(resetToken);
  if (!consumed) {
    throw new HttpError(401, 'Password reset token is invalid or expired.', {
      code: 'password_reset_token_invalid',
    });
  }

  const user = await pocketBase.getUserById(consumed.user_id);
  if (!user) {
    throw new HttpError(401, 'Password reset token is invalid or expired.', {
      code: 'password_reset_token_invalid',
    });
  }

  const result = await pocketBase.changePasswordWithoutCurrent(user, newPassword);
  await pocketBase.revokeAllDeviceTokensForUser(user.id, 'password_reset');
  await pocketBase.revokeBearerTokensForUser(user.id, 'password_reset');
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'auth.password_reset_completed',
    ...requestContext,
    metadata: {
      changed_at: result.changedAt,
      strength_score: result.strengthScore,
    },
  });

  sendJson(res, 200, {
    success: true,
    changedAt: result.changedAt,
  });
}

async function logout(req, res) {
  const token = getBearerToken(req);
  const requestContext = getRequestContext(req);
  const user = await pocketBase.authenticateBearer(token);

  await pocketBase.revokeBearerToken(token, {
    userId: user.id,
    reason: 'logout',
  });
  await pocketBase.revokeBearerTokensForUser(user.id, 'logout');

  if (requestContext.deviceToken) {
    try {
      const verified = verifyDeviceToken(requestContext.deviceToken, requestContext);
      if (verified.userId === user.id) {
        const record = await pocketBase.findDeviceTokenByHash(verified.tokenHash);
        if (record && !record.revoked_at) {
          await pocketBase.revokeDeviceToken(record.id, 'logout');
        }
      }
    } catch {
      // ignore invalid tokens during logout
    }
  }

  await pocketBase.recordDeviceUsage(requestContext, {
    userId: user.id,
  });
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'auth.logout',
    ...requestContext,
    metadata: {},
  });

  sendJson(res, 200, {
    success: true,
  });
}

async function revokeMySessions(req, res) {
  const token = getBearerToken(req);
  const requestContext = getRequestContext(req);
  const user = await pocketBase.authenticateBearer(token);

  await pocketBase.revokeBearerToken(token, {
    userId: user.id,
    reason: 'manual_revoke',
  });
  await pocketBase.revokeBearerTokensForUser(user.id, 'manual_revoke');
  await pocketBase.revokeAllDeviceTokensForUser(user.id, 'manual_revoke');

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'auth.sessions_revoked',
    ...requestContext,
    metadata: {},
  });

  sendJson(res, 200, {
    success: true,
  });
}

module.exports = {
  login,
  logout,
  confirmPasswordReset,
  register,
  requestPasswordReset,
  resolveDeviceToken,
  revokeMySessions,
};

module.exports.__testables = {
  auditHash,
  getLoginAttemptKey,
  assertLoginNotThrottled,
  recordLoginFailure,
  resetLoginAttempts,
  hashToken,
  getAuthRateLimitIdentities,
};
