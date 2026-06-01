const { getBearerToken, getRequestContext, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

async function myWallets(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  await pocketBase.ensureDefaultWallet(user.id);
  const wallets = await pocketBase.getWallets(user.id);

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'wallets.me',
    ...getRequestContext(req),
    metadata: { wallet_count: wallets.length },
  });

  sendJson(res, 200, {
    success: true,
    wallets,
  });
}

module.exports = { myWallets };
