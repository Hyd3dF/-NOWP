const { getBearerToken, getRequestContext, sendJson } = require('../http');
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

module.exports = { me, paymentProfile };
