const crypto = require('node:crypto');
const { config } = require('./config');
const { HttpError } = require('./http');

const DEFAULT_JWKS_URL = 'https://fpnv.googleapis.com/v1beta/jwks';
const JWKS_CACHE_MS = 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 4096;

let jwksCache = {
  fetchedAt: 0,
  keys: new Map(),
};

function base64UrlDecode(input) {
  const padded = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, 'base64');
}

function parseJwt(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    throw new HttpError(401, 'Firebase phone verification token is invalid.', {
      code: 'firebase_pnv_token_invalid',
    });
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new HttpError(401, 'Firebase phone verification token is malformed.', {
      code: 'firebase_pnv_token_invalid',
    });
  }

  try {
    return {
      header: JSON.parse(base64UrlDecode(parts[0]).toString('utf8')),
      payload: JSON.parse(base64UrlDecode(parts[1]).toString('utf8')),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: base64UrlDecode(parts[2]),
    };
  } catch {
    throw new HttpError(401, 'Firebase phone verification token is unreadable.', {
      code: 'firebase_pnv_token_invalid',
    });
  }
}

async function verifyFirebasePnvToken(token) {
  const projectNumber = config.firebase?.pnvProjectNumber || '';
  if (!projectNumber) {
    throw new HttpError(500, 'Firebase Phone Number Verification is not configured.', {
      code: 'firebase_pnv_not_configured',
    });
  }

  const parsed = parseJwt(token);
  assertFirebasePnvHeader(parsed.header);
  assertFirebasePnvClaims(parsed.payload);

  const publicKey = await getPublicKey(parsed.header.kid);
  const derSignature = joseToDerSignature(parsed.signature);
  const ok = crypto.verify(
    'sha256',
    Buffer.from(parsed.signingInput),
    publicKey,
    derSignature,
  );

  if (!ok) {
    throw new HttpError(401, 'Firebase phone verification token signature is invalid.', {
      code: 'firebase_pnv_token_invalid',
    });
  }

  const phoneNumber = normalizePhoneNumber(parsed.payload.sub);
  if (!phoneNumber) {
    throw new HttpError(401, 'Firebase phone verification token is missing a phone number.', {
      code: 'firebase_pnv_phone_missing',
    });
  }

  return {
    phoneNumber,
    subject: phoneNumber,
    issuer: parsed.payload.iss,
    audience: parsed.payload.aud,
    expiresAt: Number(parsed.payload.exp || 0),
    issuedAt: Number(parsed.payload.iat || 0),
  };
}

function assertFirebasePnvHeader(header) {
  if (header?.typ !== 'JWT' || header?.alg !== 'ES256' || !header?.kid) {
    throw new HttpError(401, 'Firebase phone verification token header is invalid.', {
      code: 'firebase_pnv_token_invalid',
    });
  }
}

function assertFirebasePnvClaims(payload) {
  const projectNumber = config.firebase?.pnvProjectNumber || '';
  const projectId = config.firebase?.pnvProjectId || '';
  const issuer = `https://fpnv.googleapis.com/projects/${projectNumber}`;
  const allowedAudiences = new Set([
    issuer,
    ...(projectId ? [`https://fpnv.googleapis.com/projects/${projectId}`] : []),
  ]);

  if (payload?.iss !== issuer) {
    throw new HttpError(401, 'Firebase phone verification token issuer is invalid.', {
      code: 'firebase_pnv_token_invalid',
    });
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.some((audience) => allowedAudiences.has(String(audience || '')))) {
    throw new HttpError(401, 'Firebase phone verification token audience is invalid.', {
      code: 'firebase_pnv_token_invalid',
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const leeway = 60;
  if (!Number(payload.exp) || Number(payload.exp) <= now - leeway) {
    throw new HttpError(401, 'Firebase phone verification token has expired.', {
      code: 'firebase_pnv_token_expired',
    });
  }
  if (Number(payload.nbf || 0) > now + leeway || Number(payload.iat || 0) > now + leeway) {
    throw new HttpError(401, 'Firebase phone verification token issue time is invalid.', {
      code: 'firebase_pnv_token_invalid',
    });
  }
}

async function getPublicKey(kid) {
  const keys = await getJwks();
  const jwk = keys.get(kid);
  if (!jwk) {
    throw new HttpError(401, 'Firebase phone verification token key is unknown.', {
      code: 'firebase_pnv_token_invalid',
    });
  }
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache.keys.size && now - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }

  const url = config.firebase?.pnvJwksUrl || DEFAULT_JWKS_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new HttpError(503, 'Firebase PNV key service is unavailable.', {
      code: error.name === 'AbortError' ? 'firebase_pnv_jwks_timeout' : 'firebase_pnv_jwks_unavailable',
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new HttpError(503, 'Firebase PNV key service rejected the request.', {
      code: 'firebase_pnv_jwks_unavailable',
    });
  }

  const body = await response.json();
  const keys = new Map();
  for (const key of body.keys || []) {
    if (key.kid && key.kty === 'EC' && key.crv === 'P-256') {
      keys.set(key.kid, key);
    }
  }
  if (!keys.size) {
    throw new HttpError(503, 'Firebase PNV key service returned no usable keys.', {
      code: 'firebase_pnv_jwks_unavailable',
    });
  }
  jwksCache = { fetchedAt: now, keys };
  return jwksCache.keys;
}

function joseToDerSignature(signature) {
  if (!Buffer.isBuffer(signature) || signature.length !== 64) {
    throw new HttpError(401, 'Firebase phone verification token signature is malformed.', {
      code: 'firebase_pnv_token_invalid',
    });
  }
  const r = trimInteger(signature.subarray(0, 32));
  const s = trimInteger(signature.subarray(32));
  return Buffer.concat([
    Buffer.from([0x30, 4 + r.length + s.length, 0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
  ]);
}

function trimInteger(input) {
  let value = Buffer.from(input);
  while (value.length > 1 && value[0] === 0) {
    value = value.subarray(1);
  }
  if (value[0] & 0x80) {
    value = Buffer.concat([Buffer.from([0]), value]);
  }
  return value;
}

function normalizePhoneNumber(value) {
  const clean = String(value || '').replace(/[^\d+]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(clean)) return '';
  return clean;
}

function phoneNumbersMatch(a, b) {
  const left = normalizePhoneNumber(a);
  const right = normalizePhoneNumber(b);
  return Boolean(left && right && left === right);
}

function __setJwksForTests(keys) {
  jwksCache = {
    fetchedAt: Date.now(),
    keys: new Map(keys.map((key) => [key.kid, key])),
  };
}

module.exports = {
  DEFAULT_JWKS_URL,
  __setJwksForTests,
  joseToDerSignature,
  normalizePhoneNumber,
  phoneNumbersMatch,
  verifyFirebasePnvToken,
};
