const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('./config');
const { HttpError, getSafeErrorResponse, sendJson } = require('./http');
const { pocketBase } = require('./pocketbase');
const { createAdminNotification } = require('./routes/adminNotifications');
const { createMessage, listMessages, openChat } = require('./routes/chats');
const { login, logout, register } = require('./routes/auth');
const {
  acceptFriendRequest,
  createFriendRequest,
  listFriendRequests,
  listFriends,
  searchFriends,
} = require('./routes/friends');
const { createDeposit, depositCurrencies, nowPaymentsWebhook } = require('./routes/payments');
const { listNotifications, markNotificationRead } = require('./routes/notifications');
const { myTransactions } = require('./routes/transactions');
const { sendTransfer } = require('./routes/transfers');
const { me, paymentProfile, updateMe } = require('./routes/users');
const { myWallets } = require('./routes/wallets');

const routes = new Map([
  ['POST /auth/register', register],
  ['POST /auth/login', login],
  ['POST /auth/logout', logout],
  ['GET /users/me', me],
  ['POST /users/me/update', updateMe],
  ['GET /users/payment-profile', paymentProfile],
  ['GET /wallets/me', myWallets],
  ['GET /friends', listFriends],
  ['GET /friends/search', searchFriends],
  ['GET /friends/requests', listFriendRequests],
  ['POST /friends/request', createFriendRequest],
  ['POST /friends/accept', acceptFriendRequest],
  ['POST /chats/open', openChat],
  ['GET /chats/messages', listMessages],
  ['POST /chats/messages', createMessage],
  ['GET /notifications', listNotifications],
  ['POST /notifications/read', markNotificationRead],
  ['POST /admin/notifications', createAdminNotification],
  ['GET /payments/currencies', depositCurrencies],
  ['POST /payments/create-deposit', createDeposit],
  ['POST /payments/nowpayments-webhook', nowPaymentsWebhook],
  ['POST /transfers/send', sendTransfer],
  ['GET /transactions/me', myTransactions],
]);

function applyCors(req, res) {
  const allowedOrigin = getAllowedCorsOrigin(req.headers.origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,X-Oroya-Device-Id,X-Oroya-Client-Platform,X-Oroya-App-Version,X-NOWPayments-Sig,X-Oroya-Admin-Token',
  );
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    if (!allowedOrigin && req.headers.origin) {
      sendJson(res, 403, {
        success: false,
        error: 'CORS origin is not allowed.',
      });
    } else {
      res.writeHead(204);
      res.end();
    }
    return true;
  }

  return false;
}

function getAllowedCorsOrigin(origin) {
  if (!origin) return '';

  const configuredOrigins = config.corsOrigins?.length ? config.corsOrigins : [config.corsOrigin];
  if (configuredOrigins.includes(origin)) return origin;

  if (configuredOrigins.includes('*') && isLocalOrigin(origin)) {
    return origin;
  }

  return '';
}

function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function isLocalRequest(req) {
  const address = req.socket.remoteAddress || '';
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === ''
  );
}

async function handleRequest(req, res) {
  if (applyCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/admin/notifications-tool') {
    const filePath = path.resolve(__dirname, '..', 'admin', 'notifications.html');
    const html = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
    });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      success: true,
      status: 'ok',
      ...(isLocalRequest(req) ? { service: 'oroya-backend', mode: 'local' } : {}),
    });
    return;
  }

  const handler = routes.get(`${req.method} ${url.pathname}`);
  if (!handler) {
    throw new HttpError(404, 'Endpoint not found.');
  }

  await handler(req, res);
}

async function start() {
  await pocketBase.testConnection();

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      const { status, body } = getSafeErrorResponse(error);
      sendJson(res, status, body);
    });
  });

  server.listen(config.port, () => {
    console.log(`Oroya backend listening on http://localhost:${config.port}`);
    console.log('Runtime configuration loaded.');
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(`Failed to start backend: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { start };
