const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('./logger');
const { config } = require('./config');
const { HttpError, getSafeErrorResponse, getClientIp, sendJson } = require('./http');
const { pocketBase } = require('./pocketbase');
const { enforceRateLimit } = require('./rateLimit');
const { createAdminNotification } = require('./routes/adminNotifications');
const { createMessage, listMessages, openChat } = require('./routes/chats');
const {
  confirmPasswordReset,
  login,
  logout,
  register,
  requestPasswordReset,
  revokeMySessions,
} = require('./routes/auth');
const {
  acceptFriendRequest,
  createFriendRequest,
  listFriendRequests,
  listFriends,
  searchFriends,
} = require('./routes/friends');
const { createDeposit, depositCurrencies, nowPaymentsWebhook } = require('./routes/payments');
const { listNotifications, markNotificationRead } = require('./routes/notifications');
const {
  changePassword,
  changePin,
  securityOverview,
  updateBiometricLock,
  updateTwoFactor,
  verifyPin,
} = require('./routes/security');
const { myTransactions } = require('./routes/transactions');
const { sendTransfer, startTransferTwoFactorChallenge } = require('./routes/transfers');
const { me, paymentProfile, updateMe } = require('./routes/users');
const { myWallets } = require('./routes/wallets');

const routes = new Map([
  ['POST /auth/register', register],
  ['POST /auth/login', login],
  ['POST /auth/password-reset/request', requestPasswordReset],
  ['POST /auth/password-reset/confirm', confirmPasswordReset],
  ['POST /auth/logout', logout],
  ['POST /auth/sessions/revoke', revokeMySessions],
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
  ['GET /security/overview', securityOverview],
  ['POST /security/biometric-lock', updateBiometricLock],
  ['POST /security/two-factor', updateTwoFactor],
  ['POST /security/verify-pin', verifyPin],
  ['POST /security/change-pin', changePin],
  ['POST /security/change-password', changePassword],
  ['GET /payments/currencies', depositCurrencies],
  ['POST /payments/create-deposit', createDeposit],
  ['POST /payments/nowpayments-webhook', nowPaymentsWebhook],
  ['POST /transfers/send', sendTransfer],
  ['POST /transfers/two-factor/challenge', startTransferTwoFactorChallenge],
  ['GET /transactions/me', myTransactions],
]);

function applyCors(req, res) {
  const allowedOrigin = getAllowedCorsOrigin(req.headers.origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,X-Oroya-Device-Id,X-Oroya-Device-Token,X-Oroya-Client-Platform,X-Oroya-App-Version,X-NOWPayments-Sig',
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

function enforceIngressPolicy(req, url) {
  if (!config.security.localOnly) return;
  if (isLocalRequest(req)) return;
  if (config.security.publicIngressPaths.includes(url.pathname)) return;

  throw new HttpError(403, 'External requests are not allowed.', {
    code: 'external_ingress_denied',
  });
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex,nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

async function handleRequest(req, res) {
  applySecurityHeaders(res);
  if (applyCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  enforceIngressPolicy(req, url);

  if (req.method !== 'OPTIONS') {
    await enforceRateLimit({
      scope: 'http:ip',
      identity: getClientIp(req) || 'unknown',
      limit: req.method === 'GET' ? 900 : 600,
      windowMs: 60 * 1000,
    });
  }

  if (req.method === 'GET' && url.pathname === '/admin/notifications-tool') {
    if (!config.admin.toolEnabled || process.env.NODE_ENV === 'production') {
      throw new HttpError(404, 'Endpoint not found.');
    }

    const filePath = path.resolve(__dirname, '..', 'admin', 'notifications.html');
    const html = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    res.end(html);
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/health' || url.pathname === '/')) {
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end();
      return;
    }
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
    const startedAt = Date.now();
    const pathName = req.url ? new URL(req.url, 'http://localhost').pathname : '';
    if (process.env.NODE_ENV !== 'production') {
      logger.info('request_start', {
        method: req.method || '',
        path: pathName,
      });
      res.on('finish', () => {
        logger.info('request_done', {
          method: req.method || '',
          path: pathName,
          status: res.statusCode,
          duration_ms: Date.now() - startedAt,
        });
      });
    }

    handleRequest(req, res).catch((error) => {
      const requestId = crypto.randomBytes(8).toString('hex');
      if (!error.details || typeof error.details !== 'object' || Array.isArray(error.details)) {
        error.details = {};
      }
      error.details.request_id = requestId;
      const { status, body } = getSafeErrorResponse(error);
      logger.warn('request_error', {
        status,
        code: body?.code || body?.details?.code || '',
        field: body?.details?.field || '',
        validation_fields: body?.details?.validation_fields || '',
        request_id: requestId,
        method: req.method || '',
        path: req.url ? new URL(req.url, 'http://localhost').pathname : '',
        message: error.message,
      });
      sendJson(res, status, body);
    });
  });

  server.listen(config.port, config.host, () => {
    logger.info('backend_listening', {
      host: config.host,
      port: config.port,
      local_only: config.security.localOnly,
      env: process.env.NODE_ENV || 'development',
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    logger.fatal('startup_failed', { message: error.message });
    process.exit(1);
  });
}

module.exports = { handleRequest, start };
