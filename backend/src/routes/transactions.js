const { getBearerToken, getRequestContext, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

async function myTransactions(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const transactions = await pocketBase.getTransactionsForUser(user.id);

  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'transactions.me',
    ...getRequestContext(req),
    metadata: {
      transaction_count: transactions.length,
    },
  });

  sendJson(res, 200, {
    success: true,
    transactions,
  });
}

module.exports = {
  myTransactions,
};
