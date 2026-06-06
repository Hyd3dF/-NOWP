const crypto = require('node:crypto');
const { config } = require('./config');
const { HttpError } = require('./http');

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MAX_TOKEN_LENGTH = 4096;
const DEFAULT_CERT_CACHE_MS = 60 * 60 * 1000;

let certCache = {
  fetchedAt: 0,
  expiresAt: 0,
  certs: new Map(),
};

function base64UrlDecode(input) {
  const padded = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, 'base64');
}

function parseJwt(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    throw new HttpError(401, 'Firebase auth token is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new HttpError(401, 'Firebase auth token is malformed.', {
      code: 'firebase_auth_token_invalid',
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
    throw new HttpError(401, 'Firebase auth token is unreadable.', {
      code: 'firebase_auth_token_invalid',
    });
  }
}

async function verifyFirebaseAuthIdToken(token) {
  const projectId = config.firebase?.authProjectId || '';
  if (!projectId) {
    throw new HttpError(500, 'Firebase Auth is not configured.', {
      code: 'firebase_auth_not_configured',
    });
  }

  const parsed = parseJwt(token);
  assertHeader(parsed.header);
  assertClaims(parsed.payload, projectId);

  const cert = await getCertificate(parsed.header.kid);
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parsed.signingInput),
    cert,
    parsed.signature,
  );
  if (!ok) {
    throw new HttpError(401, 'Firebase auth token signature is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }

  const phoneNumber = normalizePhoneNumber(parsed.payload.phone_number);
  if (!phoneNumber) {
    throw new HttpError(401, 'Firebase auth token is missing a verified phone number.', {
      code: 'firebase_auth_phone_missing',
    });
  }

  return {
    uid: String(parsed.payload.sub),
    phoneNumber,
    issuedAt: Number(parsed.payload.iat || 0),
    expiresAt: Number(parsed.payload.exp || 0),
  };
}

function assertHeader(header) {
  if (header?.alg !== 'RS256' || !header?.kid) {
    throw new HttpError(401, 'Firebase auth token header is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }
}

function assertClaims(payload, projectId) {
  const issuer = `https://securetoken.google.com/${projectId}`;
  if (payload?.iss !== issuer) {
    throw new HttpError(401, 'Firebase auth token issuer is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }
  if (payload?.aud !== projectId) {
    throw new HttpError(401, 'Firebase auth token audience is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }
  if (!payload?.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new HttpError(401, 'Firebase auth token subject is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }
  const now = Math.floor(Date.now() / 1000);
  const leeway = 60;
  if (!Number(payload.exp) || Number(payload.exp) <= now - leeway) {
    throw new HttpError(401, 'Firebase auth token has expired.', {
      code: 'firebase_auth_token_expired',
    });
  }
  if (!Number(payload.iat) || Number(payload.iat) > now + leeway) {
    throw new HttpError(401, 'Firebase auth token issue time is invalid.', {
      code: 'firebase_auth_token_invalid',
    });
  }
  const authTime = Number(payload.auth_time || 0);
  if (!authTime || authTime > now + leeway || authTime < now - 10 * 60) {
    throw new HttpError(401, 'Firebase phone verification is too old.', {
      code: 'firebase_auth_token_expired',
    });
  }
}

async function getCertificate(kid) {
  const certs = await getCertificates();
  const cert = certs.get(kid);
  if (!cert) {
    throw new HttpError(401, 'Firebase auth token key is unknown.', {
      code: 'firebase_auth_token_invalid',
    });
  }
  return cert;
}

async function getCertificates() {
  const now = Date.now();
  if (certCache.certs.size && now < certCache.expiresAt) {
    return certCache.certs;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(FIREBASE_CERTS_URL, { signal: controller.signal });
  } catch (error) {
    throw new HttpError(503, 'Firebase Auth certificate service is unavailable.', {
      code: error.name === 'AbortError' ? 'firebase_auth_certs_timeout' : 'firebase_auth_certs_unavailable',
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new HttpError(503, 'Firebase Auth certificate service rejected the request.', {
      code: 'firebase_auth_certs_unavailable',
    });
  }

  const body = await response.json();
  const certs = new Map();
  for (const [keyId, certificate] of Object.entries(body || {})) {
    if (keyId && typeof certificate === 'string' && certificate.includes('BEGIN CERTIFICATE')) {
      certs.set(keyId, certificate);
    }
  }
  if (!certs.size) {
    throw new HttpError(503, 'Firebase Auth certificate service returned no usable keys.', {
      code: 'firebase_auth_certs_unavailable',
    });
  }

  const maxAge = parseMaxAge(response.headers.get('cache-control'));
  certCache = {
    fetchedAt: now,
    expiresAt: now + maxAge,
    certs,
  };
  return certs;
}

function parseMaxAge(value) {
  const match = String(value || '').match(/max-age=(\d+)/i);
  if (!match) return DEFAULT_CERT_CACHE_MS;
  return Math.max(60_000, Number(match[1]) * 1000);
}

function normalizePhoneNumber(value) {
  const clean = String(value || '').replace(/[^\d+]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(clean)) return '';
  return clean;
}

function phoneNumbersMatch(left, right) {
  const a = normalizePhoneNumber(left);
  const b = normalizePhoneNumber(right);
  return Boolean(a && b && a === b);
}

function __setCertificatesForTests(certs) {
  certCache = {
    fetchedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_CERT_CACHE_MS,
    certs: new Map(certs),
  };
}

module.exports = {
  FIREBASE_CERTS_URL,
  __setCertificatesForTests,
  normalizePhoneNumber,
  phoneNumbersMatch,
  verifyFirebaseAuthIdToken,
};
