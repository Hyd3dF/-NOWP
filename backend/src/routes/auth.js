const crypto = require('node:crypto');
const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase, sanitizeUser } = require('../pocketbase');

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
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    password: requireString(body, 'password'),
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

async function register(req, res) {
  const body = await parseJsonBody(req);
  const input = pickRegisterInput(body);
  const requestContext = getRequestContext(req);

  if (input.passwordConfirm !== input.password) {
    throw new HttpError(400, 'passwordConfirm must match password.');
  }

  let user;
  let countedLoginAttempt = false;
  try {
    const existingUser = await pocketBase.findUserByEmail(input.email);
    if (existingUser) {
      const auth = await pocketBase.authenticateUserSmart(input.email, input.password);
      const existing = auth.record;

      await pocketBase.assertDeviceCanLogin(requestContext, existing.id);
      countedLoginAttempt = true;
      await pocketBase.updateUser(existing.id, { last_login_at: new Date().toISOString() });
      await pocketBase.ensureDefaultWallet(existing.id);
      await pocketBase.ensurePaymentProfile(existing);
      await pocketBase.ensureSecurityPin(existing).catch(() => {});
      await pocketBase.upsertDeviceSession(existing.id, requestContext).catch(() => {});
      await pocketBase.recordDeviceUsage(requestContext, {
        userId: existing.id,
        loggedIn: true,
      });
      countedLoginAttempt = false;
      await pocketBase.createAuditLog({
        userId: existing.id,
        action: 'auth.register_existing_email_login',
        ...requestContext,
        metadata: {
          email_hash: auditHash(input.email),
        },
      });

      sendJson(res, 200, {
        success: true,
        existingAccount: true,
        token: auth.token,
        user: sanitizeUser(existing),
      });
      return;
    }

    await pocketBase.assertUsernameAvailable(input.username);
    await pocketBase.assertDeviceCanRegister(requestContext);
    user = await pocketBase.createUser(input);
    await pocketBase.createWallet(user.id);
    await pocketBase.ensurePaymentProfile(user);
    await pocketBase.ensureSecurityPin(user).catch(() => {});
    await pocketBase.upsertDeviceSession(user.id, requestContext).catch(() => {});
    await pocketBase.recordDeviceUsage(requestContext, {
      userId: user.id,
      accountCreated: true,
    });
    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'auth.register',
      ...requestContext,
      metadata: {
        email_hash: auditHash(input.email),
        username: input.username,
      },
    });
  } catch (error) {
    if (countedLoginAttempt && error.status !== 429) {
      await pocketBase.recordDeviceUsage(requestContext, {
        loggedIn: true,
      }).catch(() => {});
    }
    await pocketBase.createAuditLog({
      action: 'auth.register_failed',
      ...requestContext,
      metadata: {
        email_hash: auditHash(input.email),
        reason_code: error.details?.code || 'register_failed',
      },
    });
    if (error.status === 401 || error.status === 400) {
      throw new HttpError(401, 'Invalid credentials.', { code: 'invalid_credentials' });
    }
    throw error;
  }

  const auth = await pocketBase.authenticateUser(input.email, input.password);

  sendJson(res, 201, {
    success: true,
    token: auth.token,
    user: sanitizeUser(auth.record || user),
  });
}

async function login(req, res) {
  const body = await parseJsonBody(req);
  const identity = requireString(body, 'identity');
  const password = requireString(body, 'password');
  const requestContext = getRequestContext(req);
  let countedLoginAttempt = false;

  try {
    const auth = await pocketBase.authenticateUserSmart(identity, password);
    const user = auth.record;

    await pocketBase.assertDeviceCanLogin(requestContext, user.id);
    countedLoginAttempt = true;
    await pocketBase.updateUser(user.id, { last_login_at: new Date().toISOString() });
    await pocketBase.ensureDefaultWallet(user.id);
    await pocketBase.ensurePaymentProfile(user);
    await pocketBase.ensureSecurityPin(user).catch(() => {});
    await pocketBase.upsertDeviceSession(user.id, requestContext).catch(() => {});
    await pocketBase.recordDeviceUsage(requestContext, {
      userId: user.id,
      loggedIn: true,
    });
    countedLoginAttempt = false;
    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'auth.login',
      ...requestContext,
      metadata: { identity_hash: auditHash(identity) },
    });

    sendJson(res, 200, {
      success: true,
      token: auth.token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (countedLoginAttempt && error.status !== 429) {
      await pocketBase.recordDeviceUsage(requestContext, {
        loggedIn: true,
      }).catch(() => {});
    }
    await pocketBase.createAuditLog({
      action: 'auth.login_failed',
      ...requestContext,
      metadata: {
        identity_hash: auditHash(identity),
        reason_code: error.details?.code || (error.status === 429 ? 'rate_limited' : 'invalid_credentials'),
      },
    });
    if (error.status === 429) throw error;
    throw new HttpError(401, 'Invalid credentials.', { code: 'invalid_credentials' });
  }
}

async function logout(req, res) {
  const token = getBearerToken(req);
  const requestContext = getRequestContext(req);
  const user = await pocketBase.authenticateBearer(token);

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

function auditHash(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex');
}

module.exports = {
  login,
  logout,
  register,
};
