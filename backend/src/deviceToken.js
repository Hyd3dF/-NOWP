const crypto = require('node:crypto');
const { config } = require('./config');
const { HttpError } = require('./http');

const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_SECONDS = config.security.deviceTokenTtlSeconds || 14 * 24 * 60 * 60;

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input) {
  const padded = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, 'base64');
}

function getDeviceTokenSecret() {
  return config.security.deviceTokenSecret;
}

function signPayload(payload) {
  return crypto.createHmac('sha256', getDeviceTokenSecret()).update(payload).digest('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildDeviceFingerprint(context = {}) {
  const explicit = String(context.deviceId || '').trim();
  const platform = String(context.devicePlatform || '').trim().toLowerCase();
  const userAgent = String(context.deviceInfo || '').trim();
  const material = [
    explicit.length >= 8 ? explicit : 'missing-device-id',
    platform || 'unknown-platform',
    userAgent || 'unknown-user-agent',
  ].join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
}

function normalizeFingerprintHash(fingerprint) {
  const value = String(fingerprint || '');
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  return crypto.createHash('sha256').update(value).digest('hex');
}

function issueDeviceToken({ userId, fingerprint, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if (!userId || !fingerprint) {
    throw new HttpError(500, 'Cannot issue device token without user and fingerprint.');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.max(60, Number(ttlSeconds) || DEFAULT_TTL_SECONDS);

  const payload = {
    v: TOKEN_VERSION,
    sub: String(userId),
    fp: normalizeFingerprintHash(fingerprint),
    iat: issuedAt,
    exp: expiresAt,
    jti: crypto.randomBytes(16).toString('hex'),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  const token = `${encodedPayload}.${signature}`;

  return {
    token,
    tokenHash: hashToken(token),
    payload,
    issuedAt,
    expiresAt,
  };
}

function verifyDeviceToken(token, context = null) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) {
    throw new HttpError(401, 'Device token is missing.', { code: 'device_token_invalid' });
  }

  const [encodedPayload, signature] = token.split('.', 2);
  if (!encodedPayload || !signature) {
    throw new HttpError(401, 'Device token is malformed.', { code: 'device_token_invalid' });
  }

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const providedBuffer = Buffer.from(String(signature), 'hex');
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new HttpError(401, 'Device token signature is invalid.', {
      code: 'device_token_invalid',
    });
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    throw new HttpError(401, 'Device token payload is unreadable.', {
      code: 'device_token_invalid',
    });
  }

  if (payload.v !== TOKEN_VERSION) {
    throw new HttpError(401, 'Device token version is unsupported.', {
      code: 'device_token_invalid',
    });
  }

  if (!payload.sub || !payload.fp || !payload.exp) {
    throw new HttpError(401, 'Device token is missing required claims.', {
      code: 'device_token_invalid',
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload.exp) <= now) {
    throw new HttpError(401, 'Device token has expired.', { code: 'device_token_expired' });
  }

  const verified = {
    userId: String(payload.sub),
    fingerprintHash: String(payload.fp),
    tokenHash: hashToken(token),
    issuedAt: Number(payload.iat),
    expiresAt: Number(payload.exp),
    jti: String(payload.jti || ''),
  };

  if (context) {
    const requestFingerprintHash = buildDeviceFingerprint(context);
    const expectedBuffer = Buffer.from(verified.fingerprintHash, 'hex');
    const actualBuffer = Buffer.from(requestFingerprintHash, 'hex');
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new HttpError(401, 'Device token fingerprint does not match this request.', {
        code: 'device_token_fingerprint_mismatch',
      });
    }
  }

  return verified;
}

function isDeviceTokenLike(value) {
  if (typeof value !== 'string') return false;
  return /^[A-Za-z0-9_-]{8,}\.[a-f0-9]{64}$/.test(value);
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  TOKEN_VERSION,
  base64UrlDecode,
  base64UrlEncode,
  buildDeviceFingerprint,
  hashToken,
  isDeviceTokenLike,
  normalizeFingerprintHash,
  issueDeviceToken,
  verifyDeviceToken,
};
