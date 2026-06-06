class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const net = require('node:net');
const { config } = require('./config');

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_HEADER_CHARS = 512;
const PUBLIC_DETAIL_KEYS = new Set([
  'code',
  'field',
  'min_amount',
  'currency',
  'network',
  'external_ingress_denied',
  'request_id',
]);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let byteLength = 0;
    let rejected = false;

    req.on('data', (chunk) => {
      if (rejected) return;
      raw += chunk;
      byteLength += chunk.length;
      if (byteLength > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy();
        reject(new HttpError(413, 'Request body is too large.', {
          code: 'request_body_too_large',
        }));
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function parseRawJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    let rejected = false;

    req.on('data', (chunk) => {
      if (rejected) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      byteLength += buffer.length;
      if (byteLength > MAX_BODY_BYTES) {
        rejected = true;
        req.destroy();
        reject(new HttpError(413, 'Request body is too large.', {
          code: 'request_body_too_large',
        }));
      }
    });

    req.on('end', () => {
      const rawBuffer = byteLength ? Buffer.concat(chunks, byteLength) : Buffer.alloc(0);
      if (rawBuffer.length === 0) {
        resolve({ raw: rawBuffer, body: {} });
        return;
      }

      try {
        resolve({ raw: rawBuffer, body: JSON.parse(rawBuffer.toString('utf8')) });
      } catch {
        reject(new HttpError(400, 'Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getClientIp(req) {
  const remoteAddress = normalizeIp(req.socket.remoteAddress || '');
  if (isTrustedProxy(remoteAddress)) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(firstOrEmpty(forwardedFor)).split(',')[0];
    const forwardedIp = normalizeIp(sanitizeHeaderValue(firstForwarded, 80));
    if (isValidIp(forwardedIp)) return forwardedIp;
  }

  return remoteAddress;
}

function getRequestContext(req) {
  return {
    ipAddress: getClientIp(req),
    deviceInfo: sanitizeHeaderValue(req.headers['user-agent'], 300),
    deviceId: sanitizeHeaderValue(req.headers['x-oroya-device-id'], MAX_HEADER_CHARS),
    devicePlatform: sanitizeHeaderValue(req.headers['x-oroya-client-platform'], 40),
    deviceToken: sanitizeHeaderValue(req.headers['x-oroya-device-token'], 1024),
  };
}

function sanitizeHeaderValue(value, maxLength) {
  return String(firstOrEmpty(value))
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function firstOrEmpty(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function normalizeIp(value) {
  const clean = sanitizeHeaderValue(value, 80);
  if (clean.startsWith('::ffff:')) return clean.slice('::ffff:'.length);
  return clean;
}

function isValidIp(value) {
  return net.isIP(value) !== 0;
}

function isTrustedProxy(remoteAddress) {
  const configured = (config.security.trustedProxyIps || []).map((item) => normalizeIp(item)).filter(Boolean);
  return configured.includes(remoteAddress);
}

function getSafeErrorResponse(error) {
  const status = error.status && error.status >= 400 ? error.status : 500;
  const isServerError = status >= 500;
  const message = isServerError ? 'Internal server error.' : error.message;
  const details = isServerError ? undefined : getPublicDetails(error.details);
  const serverDetails = isServerError ? getPublicDetails(error.details) : undefined;
  const requestId = details?.request_id || serverDetails?.request_id;
  const code = details?.code || serverDetails?.code;

  return {
    status,
    body: {
      success: false,
      error: message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
      ...(requestId ? { request_id: requestId } : {}),
    },
  };
}

function getPublicDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;

  const output = {};
  for (const [key, value] of Object.entries(details)) {
    if (!PUBLIC_DETAIL_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') continue;
    output[key] = value;
  }

  return Object.keys(output).length ? output : undefined;
}

module.exports = {
  HttpError,
  getBearerToken,
  getClientIp,
  getRequestContext,
  getSafeErrorResponse,
  parseJsonBody,
  parseRawJsonBody,
  sendJson,
};
