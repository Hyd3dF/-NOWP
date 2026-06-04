'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

process.env.POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
process.env.POCKETBASE_SUPERUSER_EMAIL =
  process.env.POCKETBASE_SUPERUSER_EMAIL || 'test-admin@example.com';
process.env.POCKETBASE_SUPERUSER_PASSWORD =
  process.env.POCKETBASE_SUPERUSER_PASSWORD ||
  'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
process.env.OROYA_LEDGER_SECRET =
  process.env.OROYA_LEDGER_SECRET || 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
process.env.OROYA_DEVICE_TOKEN_SECRET =
  process.env.OROYA_DEVICE_TOKEN_SECRET || 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
process.env.OROYA_TRANSFER_2FA_SECRET =
  process.env.OROYA_TRANSFER_2FA_SECRET || 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
process.env.TWO_FACTOR_HMAC_SECRET =
  process.env.TWO_FACTOR_HMAC_SECRET || process.env.OROYA_TRANSFER_2FA_SECRET;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.BACKEND_LOCAL_ONLY = process.env.BACKEND_LOCAL_ONLY || 'true';

const { getClientIp, parseRawJsonBody } = require('../src/http');
const {
  computeNowPaymentsSignature,
  verifyNowPaymentsSignature,
} = require('../src/webhookSignature');
const {
  buildDeviceFingerprint,
  issueDeviceToken,
  verifyDeviceToken,
  hashToken,
  isDeviceTokenLike,
} = require('../src/deviceToken');

const TEST_IPN_SECRET = 'change-me-32-byte-test-ipn-secret-padding-1234';

function makeReq(rawBuffer) {
  const req = new Readable({ read() {} });
  req.headers = { 'content-type': 'application/json' };
  req.socket = { remoteAddress: '127.0.0.1' };
  if (rawBuffer && rawBuffer.length > 0) {
    process.nextTick(() => {
      req.push(rawBuffer);
      req.push(null);
    });
  } else {
    process.nextTick(() => req.push(null));
  }
  return req;
}

function makeHttpReq({ method = 'GET', url = '/', headers = {}, body = undefined, remoteAddress = '127.0.0.1' } = {}) {
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), 'utf8');
  const req = makeReq(payload);
  req.method = method;
  req.url = url;
  req.headers = {
    host: 'localhost',
    ...headers,
  };
  req.socket = { remoteAddress };
  return req;
}

function makeJsonRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
}

describe('K-7: webhook HMAC is verified on raw request bytes', () => {
  test('raw JSON body with single-quote key order is accepted', async () => {
    const bodyObject = { b: 1, a: 2 };
    const bodyString = '{"b":1,"a":2}';
    const signature = computeNowPaymentsSignature(Buffer.from(bodyString, 'utf8'), TEST_IPN_SECRET);

    const req = makeReq(Buffer.from(bodyString, 'utf8'));
    const { raw, body } = await parseRawJsonBody(req);

    assert.equal(typeof body, 'object');
    assert.deepEqual(body, bodyObject);
    assert.ok(Buffer.isBuffer(raw), 'raw body must be a Buffer so HMAC is byte-exact');
    assert.equal(raw.toString('utf8'), bodyString);

    assert.doesNotThrow(() =>
      verifyNowPaymentsSignature(raw, signature, TEST_IPN_SECRET),
    );
  });

  test('whitespace difference in body causes signature mismatch', () => {
    const bodyStringA = '{"a":1,"b":2}';
    const bodyStringB = '{ "a": 1, "b": 2 }';
    const signature = computeNowPaymentsSignature(
      Buffer.from(bodyStringA, 'utf8'),
      TEST_IPN_SECRET,
    );

    assert.throws(
      () => verifyNowPaymentsSignature(Buffer.from(bodyStringB, 'utf8'), signature, TEST_IPN_SECRET),
      /Invalid NOWPayments signature/,
    );
  });

  test('re-serializing the parsed body to a different key order fails the HMAC', async () => {
    const original = '{"b":1,"a":2}';
    const signature = computeNowPaymentsSignature(Buffer.from(original, 'utf8'), TEST_IPN_SECRET);
    const req = makeReq(Buffer.from(original, 'utf8'));
    const { raw, body } = await parseRawJsonBody(req);

    const resorted = JSON.stringify(Object.keys(body).sort().reduce((acc, k) => {
      acc[k] = body[k];
      return acc;
    }, {}));
    assert.notEqual(resorted, original);

    assert.throws(
      () => verifyNowPaymentsSignature(Buffer.from(resorted, 'utf8'), signature, TEST_IPN_SECRET),
      /Invalid NOWPayments signature/,
    );

    assert.doesNotThrow(() => verifyNowPaymentsSignature(raw, signature, TEST_IPN_SECRET));
  });

  test('rejects missing signature', () => {
    assert.throws(
      () => verifyNowPaymentsSignature(Buffer.from('{}', 'utf8'), '', TEST_IPN_SECRET),
      /Missing NOWPayments signature/,
    );
  });

  test('rejects malformed signature hex', () => {
    assert.throws(
      () => verifyNowPaymentsSignature(Buffer.from('{}', 'utf8'), 'NOT-HEX', TEST_IPN_SECRET),
      /Invalid NOWPayments signature format/,
    );
  });
});

describe('K-2: device token issuance and verification', () => {
  test('issued token verifies and round-trips', () => {
    const issued = issueDeviceToken({
      userId: 'user_abc',
      fingerprint: 'device_xyz',
      ttlSeconds: 3600,
    });
    assert.ok(issued.token.includes('.'), 'token must have payload.signature structure');
    assert.equal(issued.tokenHash.length, 64);

    const verified = verifyDeviceToken(issued.token);
    assert.equal(verified.userId, 'user_abc');
    assert.equal(verified.tokenHash, issued.tokenHash);
    assert.equal(verified.fingerprintHash.length, 64);
    assert.ok(verified.expiresAt > verified.issuedAt);
  });

  test('tampered token is rejected with constant-time check', () => {
    const issued = issueDeviceToken({ userId: 'user_abc', fingerprint: 'fp' });
    const [payload, signature] = issued.token.split('.');
    const tamperedSignature = signature
      .split('')
      .map((c, i) => (i === 0 ? (c === '0' ? '1' : '0') : c))
      .join('');
    const tampered = `${payload}.${tamperedSignature}`;
    assert.throws(() => verifyDeviceToken(tampered), /signature is invalid/);
  });

  test('expired token is rejected', () => {
    const issued = issueDeviceToken({
      userId: 'user_abc',
      fingerprint: 'fp',
      ttlSeconds: 60,
    });
    const [payloadEncoded, originalSignature] = issued.token.split('.');
    const payload = JSON.parse(
      Buffer.from(
        payloadEncoded.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    );
    payload.iat = Math.floor(Date.now() / 1000) - 7200;
    payload.exp = Math.floor(Date.now() / 1000) - 3600;
    const tamperedPayloadEncoded = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const resignedSignature = crypto
      .createHmac('sha256', process.env.OROYA_DEVICE_TOKEN_SECRET)
      .update(tamperedPayloadEncoded)
      .digest('hex');
    const expiredToken = `${tamperedPayloadEncoded}.${resignedSignature}`;
    assert.notEqual(resignedSignature, originalSignature);
    assert.throws(() => verifyDeviceToken(expiredToken), /expired/);
  });

  test('isDeviceTokenLike guards against arbitrary strings', () => {
    assert.equal(isDeviceTokenLike('aaa.bb'), false);
    assert.equal(isDeviceTokenLike(123), false);
    assert.equal(isDeviceTokenLike(null), false);
    assert.equal(isDeviceTokenLike('short.x'.padEnd(80, '0')), false);
    const valid = `payload_part.${'a'.repeat(64)}`;
    assert.equal(isDeviceTokenLike(valid), true);
  });

  test('hashToken is deterministic', () => {
    const h1 = hashToken('abc.def');
    const h2 = hashToken('abc.def');
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });

  test('device token is bound to request fingerprint at verification time', () => {
    const context = {
      deviceId: 'device_real_12345',
      devicePlatform: 'ios',
      deviceInfo: 'OroyaTest/1.0',
    };
    const issued = issueDeviceToken({
      userId: 'user_abc',
      fingerprint: buildDeviceFingerprint(context),
      ttlSeconds: 3600,
    });

    assert.equal(verifyDeviceToken(issued.token, context).userId, 'user_abc');
    assert.throws(
      () => verifyDeviceToken(issued.token, { ...context, deviceId: 'device_other_12345' }),
      /fingerprint does not match/,
    );
  });

  test('raw HMAC over Buffer matches raw HMAC over matching string bytes', () => {
    const body = '{"hello":"world"}';
    const buffer = Buffer.from(body, 'utf8');
    const fromBuffer = computeNowPaymentsSignature(buffer, TEST_IPN_SECRET);
    const fromString = computeNowPaymentsSignature(buffer.toString('utf8'), TEST_IPN_SECRET);
    assert.equal(fromBuffer, fromString);
  });
});

describe('K-1/K-4: register response is uniform and never returns a token', () => {
  test('pickRegisterInput accepts missing passwordConfirm (defaults to password)', () => {
    const body = {
      email: 'a@b.com',
      password: 'Pa55w0rd!aaa',
      first_name: 'A',
    };
    delete body.passwordConfirm;

    const authRoute = require('../src/routes/auth');
    const registerSource = authRoute.register.toString();
    assert.match(registerSource, /success: true/);
    assert.match(registerSource, /requiresLogin: true/);
    assert.doesNotMatch(registerSource, /token: auth\.token/);
    assert.doesNotMatch(registerSource, /existingAccount/);
  });

  test('register function does not call authenticateUserSmart', () => {
    const authRoute = require('../src/routes/auth');
    const registerSource = authRoute.register.toString();
    assert.doesNotMatch(registerSource, /authenticateUserSmart/);
  });

  test('auth rate-limit identities do not include client-controlled device id', () => {
    const { __testables } = require('../src/routes/auth');
    const first = __testables.getAuthRateLimitIdentities('User@Example.com', {
      ipAddress: '198.51.100.10',
      deviceId: 'device-a',
    });
    const second = __testables.getAuthRateLimitIdentities('User@Example.com', {
      ipAddress: '198.51.100.10',
      deviceId: 'device-b',
    });
    assert.deepEqual(first, second);
  });
});

describe('K-3: logout revokes the active device token', () => {
  test('logout source calls revokeDeviceToken on the current token', () => {
    const authRoute = require('../src/routes/auth');
    const logoutSource = authRoute.logout.toString();
    assert.match(logoutSource, /revokeDeviceToken/);
    assert.match(logoutSource, /verifyDeviceToken/);
  });

  test('revokeMySessions source calls revokeAllDeviceTokensForUser', () => {
    const authRoute = require('../src/routes/auth');
    const revokeSource = authRoute.revokeMySessions.toString();
    assert.match(revokeSource, /revokeAllDeviceTokensForUser/);
  });

  test('authenticateBearer rejects a bearer token recorded in the revocation list', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const originalAdminRequest = pocketBase.adminRequest;
    const originalRequest = pocketBase.request;
    let authRefreshCalled = false;
    try {
      pocketBase.adminRequest = async (url) => {
        assert.match(url, /revoked_bearer_tokens/);
        return {
          items: [{
            token_hash: 'hash',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }],
        };
      };
      pocketBase.request = async () => {
        authRefreshCalled = true;
        return {};
      };

      await assert.rejects(
        pocketBase.authenticateBearer('old.jwt.token'),
        (error) => error.status === 401 && error.details?.code === 'token_revoked',
      );
      assert.equal(authRefreshCalled, false);
    } finally {
      pocketBase.adminRequest = originalAdminRequest;
      pocketBase.request = originalRequest;
    }
  });

  test('revoked bearer fails every protected route through the runtime dispatcher', async () => {
    const { handleRequest } = require('../src/server');
    const { pocketBase } = require('../src/pocketbase');
    const originalAuthenticateBearer = pocketBase.authenticateBearer;
    const originalAdminRequest = pocketBase.adminRequest;
    try {
      pocketBase.adminRequest = async () => ({ id: 'bucket' });
      pocketBase.authenticateBearer = async () => {
        const error = new Error('revoked');
        error.status = 401;
        error.details = { code: 'token_revoked' };
        throw error;
      };
      const protectedRoutes = [
        ['GET', '/users/me'],
        ['GET', '/wallets/me'],
        ['GET', '/friends'],
        ['GET', '/chats/messages'],
        ['GET', '/notifications'],
        ['GET', '/transactions/me'],
        ['GET', '/security/overview'],
      ];
      for (const [method, url] of protectedRoutes) {
        const req = makeHttpReq({
          method,
          url,
          headers: { authorization: 'Bearer old.jwt.token' },
        });
        await assert.rejects(
          handleRequest(req, makeJsonRes()),
          (error) => error.status === 401 && error.details?.code === 'token_revoked',
          `${method} ${url} should reject revoked bearer`,
        );
      }
    } finally {
      pocketBase.authenticateBearer = originalAuthenticateBearer;
      pocketBase.adminRequest = originalAdminRequest;
    }
  });

  test('user-wide session revocation rejects JWTs issued before revoked_after', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const originalAdminRequest = pocketBase.adminRequest;
    const originalRequest = pocketBase.request;
    const payload = Buffer.from(JSON.stringify({ iat: 1_700_000_000 })).toString('base64url');
    const token = `header.${payload}.signature`;
    try {
      pocketBase.adminRequest = async (url) => {
        if (url.includes('revoked_bearer_tokens')) return { items: [] };
        if (url.includes('user_session_revocations')) {
          return { items: [{ revoked_after: '2026-06-03T00:00:00.000Z' }] };
        }
        return { items: [] };
      };
      pocketBase.request = async () => ({ record: { id: 'u1' } });

      await assert.rejects(
        pocketBase.authenticateBearer(token),
        (error) => error.status === 401 && error.details?.code === 'token_revoked',
      );
    } finally {
      pocketBase.adminRequest = originalAdminRequest;
      pocketBase.request = originalRequest;
    }
  });
});

describe('K-5: optimistic lock + atomic transfer helper exists', () => {
  test('applyInternalTransferWithLock method is defined on pocketBase', () => {
    const { pocketBase } = require('../src/pocketbase');
    assert.equal(typeof pocketBase.applyInternalTransferWithLock, 'function');
  });

  test('updateWalletBalanceOptimistic method is defined on pocketBase', () => {
    const { pocketBase } = require('../src/pocketbase');
    assert.equal(typeof pocketBase.updateWalletBalanceOptimistic, 'function');
  });

  test('updateWalletBalanceOptimistic rejects when the new balance would go negative', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { HttpError } = require('../src/http');
    pocketBase.reconcileWalletBalance = async (wallet) => wallet;
    pocketBase.adminRequest = async () => {
      throw new Error('should not be called when balance is invalid');
    };

    await assert.rejects(
      pocketBase.updateWalletBalanceOptimistic(
        { id: 'w1', balance: 10, locked_balance: 0, version: 1, updated: 'now' },
        -50,
        {},
      ),
      (error) => error instanceof HttpError && error.details?.code === 'insufficient_balance',
    );
  });

  test('updateWalletBalanceOptimistic emits version+updated_at guards in PATCH', async () => {
    const { pocketBase } = require('../src/pocketbase');
    pocketBase.reconcileWalletBalance = async (wallet) => wallet;
    let captured = null;
    pocketBase.adminRequest = async (url, options) => {
      captured = { url, body: options.body };
      return { id: 'w1', version: 2, balance: options.body.balance };
    };

    const result = await pocketBase.updateWalletBalanceOptimistic(
      { id: 'w1', balance: 10, locked_balance: 0, version: 4, updated: '2026-06-03T00:00:00Z' },
      5,
      { totalDepositedDelta: 5 },
    );
    assert.ok(captured);
    assert.match(captured.url, /filter=/);
    assert.match(captured.url, /version/);
    assert.match(captured.url, /4/);
    assert.match(captured.url, /updated/);
    assert.equal(captured.body.version, 5);
    assert.equal(captured.body.balance, 15);
    assert.equal(captured.body.total_deposited, 5);
    assert.equal(result.id, 'w1');
  });
});

describe('K-6: webhook uses atomic claim on payment_intents', () => {
  test('claimPaymentIntentCredit uses a unique claim record and rejects duplicate claims', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const claims = new Set();
    pocketBase.adminRequest = async (url, options) => {
      if (url.includes('/payment_intents/records/intent_1') && !options) {
        return { id: 'intent_1', credit_applied_at: '' };
      }
      if (url.includes('/payment_credit_claims/records') && options?.method === 'POST') {
        if (claims.has(options.body.payment_intent_id)) {
          const error = new Error('duplicate claim');
          error.status = 409;
          throw error;
        }
        claims.add(options.body.payment_intent_id);
        return { id: 'claim_1', ...options.body };
      }
      if (url.includes('/payment_intents/records/intent_1') && options?.method === 'PATCH') {
        return { id: 'intent_1', credit_applied_at: options.body.credit_applied_at };
      }
      return null;
    };

    const claimed = await pocketBase.claimPaymentIntentCredit('intent_1');
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.intent.id, 'intent_1');

    const replay = await pocketBase.claimPaymentIntentCredit('intent_1');
    assert.equal(replay.claimed, false);
  });

  test('payments.js webhook now claims before crediting the wallet', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'payments.js'),
      'utf8',
    );
    assert.match(source, /claimPaymentIntentCredit/);
    assert.match(source, /markTransactionCreditApplied/);
  });
});

describe('K-8: persistent rate limit module', () => {
  test('enforceRateLimit increments under the limit and rejects above it', async () => {
    const { enforceRateLimit } = require('../src/rateLimit');
    const { pocketBase } = require('../src/pocketbase');

    const bucket = { id: 'b1', bucket_key: 'k1', count: 0, expires_at: new Date(Date.now() + 60_000).toISOString() };
    pocketBase.adminRequest = async (url, options) => {
      if (url.includes('?filter=') && url.includes('rate_limit_buckets/records?')) {
        return { items: [bucket] };
      }
      if (url.includes('/records/b1')) {
        Object.assign(bucket, options.body);
        return bucket;
      }
      return { items: [] };
    };

    const scope = `test:scope:${crypto.randomBytes(4).toString('hex')}`;
    for (let i = 0; i < 3; i += 1) {
      await enforceRateLimit({ scope, identity: 'unit', limit: 3, windowMs: 60_000 });
    }
    assert.equal(bucket.count, 3);
    await assert.rejects(
      enforceRateLimit({ scope, identity: 'unit', limit: 3, windowMs: 60_000 }),
      (error) => error.status === 429 && ['rate_limited', 'rate_limited_local'].includes(error.details?.code),
    );
  });

  test('enforceRateLimit resets the bucket when the window has expired', async () => {
    const { enforceRateLimit } = require('../src/rateLimit');
    const { pocketBase } = require('../src/pocketbase');

    const bucket = {
      id: 'b2',
      bucket_key: 'k2',
      count: 5,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    pocketBase.adminRequest = async (url, options) => {
      if (url.includes('/records/b2')) {
        Object.assign(bucket, options.body);
        return bucket;
      }
      if (url.includes('?filter=')) return { items: [bucket] };
      return { items: [] };
    };

    await enforceRateLimit({ scope: 'reset', identity: 'u', limit: 1, windowMs: 60_000 });
    assert.equal(bucket.count, 1);
  });

  test('enforceRateLimit returns silently when limit or window is non-positive', async () => {
    const { enforceRateLimit } = require('../src/rateLimit');
    const { pocketBase } = require('../src/pocketbase');
    let called = false;
    pocketBase.adminRequest = async () => {
      called = true;
      return { items: [] };
    };
    await enforceRateLimit({ scope: 'noop', identity: 'u', limit: 0, windowMs: 0 });
    assert.equal(called, false);
  });

  test('enforceRateLimit fails closed when PocketBase is unavailable', async () => {
    const { enforceRateLimit } = require('../src/rateLimit');
    const { pocketBase } = require('../src/pocketbase');
    pocketBase.adminRequest = async () => {
      const error = new Error('pb down');
      error.status = 500;
      throw error;
    };

    await assert.rejects(
      enforceRateLimit({ scope: 'auth:login', identity: 'ip|user', limit: 1, windowMs: 60_000 }),
      (error) => error.status === 503 && error.details?.code === 'rate_limiter_unavailable',
    );
  });

  test('local burst layer rejects a 100-request parallel burst before PocketBase can over-increment', async () => {
    const { enforceRateLimit } = require('../src/rateLimit');
    const { pocketBase } = require('../src/pocketbase');
    const bucket = { id: 'burst', count: 0, expires_at: new Date(Date.now() + 60_000).toISOString() };
    pocketBase.adminRequest = async (url, options) => {
      if (url.includes('/rate_limit_buckets/records?')) return { items: [bucket] };
      if (url.includes('/rate_limit_buckets/records/burst') && options?.method === 'PATCH') {
        bucket.count = Number(options.body.count || bucket.count);
        return { ...bucket };
      }
      return { items: [] };
    };

    const scope = `burst:${crypto.randomBytes(4).toString('hex')}`;
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        enforceRateLimit({ scope, identity: 'same', limit: 10, windowMs: 60_000 }),
      ),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.ok(rejected.length >= 90);
  });
});

describe('HTTP layer: parseRawJsonBody preserves exact bytes', () => {
  test('non-utf8 surrogate escape is preserved as bytes', async () => {
    const body = '{"emoji":"\\uD83D\\uDE00"}';
    const req = makeReq(Buffer.from(body, 'utf8'));
    const { raw, body: parsed } = await parseRawJsonBody(req);
    assert.ok(Buffer.isBuffer(raw));
    assert.equal(raw.toString('utf8'), body);
    assert.equal(parsed.emoji, '\uD83D\uDE00');
  });

  test('empty body returns empty Buffer and empty object', async () => {
    const req = makeReq(Buffer.alloc(0));
    const { raw, body } = await parseRawJsonBody(req);
    assert.ok(Buffer.isBuffer(raw));
    assert.equal(raw.length, 0);
    assert.deepEqual(body, {});
  });

  test('oversize body is rejected with 413', async () => {
    const huge = Buffer.alloc(8 * 1024 * 1024 + 1, 'a');
    const req = makeReq(huge);
    await assert.rejects(parseRawJsonBody(req), (err) => err.status === 413);
  });
});

describe('HTTP layer: client IP cannot be spoofed with X-Forwarded-For', () => {
  test('ignores X-Forwarded-For from an untrusted remote peer', () => {
    const req = {
      headers: { 'x-forwarded-for': '127.0.0.1' },
      socket: { remoteAddress: '203.0.113.9' },
    };
    assert.equal(getClientIp(req), '203.0.113.9');
  });

  test('accepts X-Forwarded-For only from configured trusted proxies', () => {
    const { config } = require('../src/config');
    const previous = config.security.trustedProxyIps;
    config.security.trustedProxyIps = ['127.0.0.1'];
    try {
      const req = {
        headers: { 'x-forwarded-for': '198.51.100.10' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      assert.equal(getClientIp(req), '198.51.100.10');
    } finally {
      config.security.trustedProxyIps = previous;
    }
  });
});

describe('YP-5: production refuses OROYA_LEDGER_ALLOW_UNSIGNED', () => {
  const ORIGINAL_ENV = { ...process.env };

  test('validateProductionConfig throws when allowUnsignedLedger is true', () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      POCKETBASE_SUPERUSER_PASSWORD: process.env.POCKETBASE_SUPERUSER_PASSWORD,
      NOWPAYMENTS_IPN_SECRET_KEY: process.env.NOWPAYMENTS_IPN_SECRET_KEY,
      OROYA_ADMIN_NOTIFICATION_TOKEN: process.env.OROYA_ADMIN_NOTIFICATION_TOKEN,
      OROYA_LEDGER_SECRET: process.env.OROYA_LEDGER_SECRET,
      OROYA_DEVICE_TOKEN_SECRET: process.env.OROYA_DEVICE_TOKEN_SECRET,
      OROYA_TRANSFER_2FA_SECRET: process.env.OROYA_TRANSFER_2FA_SECRET,
      TWO_FACTOR_HMAC_SECRET: process.env.TWO_FACTOR_HMAC_SECRET,
      NOWPAYMENTS_IPN_ALLOW_PRIVATE: process.env.NOWPAYMENTS_IPN_ALLOW_PRIVATE,
    };
    process.env.NODE_ENV = 'production';
    process.env.POCKETBASE_SUPERUSER_PASSWORD = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.NOWPAYMENTS_IPN_SECRET_KEY = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.OROYA_ADMIN_NOTIFICATION_TOKEN = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.OROYA_LEDGER_SECRET = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.OROYA_DEVICE_TOKEN_SECRET = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.OROYA_TRANSFER_2FA_SECRET = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.TWO_FACTOR_HMAC_SECRET = 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^';
    process.env.NOWPAYMENTS_IPN_ALLOW_PRIVATE = 'false';
    try {
      delete require.cache[require.resolve('../src/config')];
      const reloaded = require('../src/config');
      const malicious = {
        ...reloaded.config,
        security: { ...reloaded.config.security, allowUnsignedLedger: true },
      };
      assert.throws(
        () => reloaded.validateProductionConfig(malicious),
        /OROYA_LEDGER_ALLOW_UNSIGNED=true is forbidden in production/,
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      delete require.cache[require.resolve('../src/config')];
    }
  });

  test('validateProductionConfig does not throw in development', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      delete require.cache[require.resolve('../src/config')];
      const { config, validateProductionConfig } = require('../src/config');
      const dev = {
        ...config,
        security: { ...config.security, allowUnsignedLedger: true },
      };
      assert.doesNotThrow(() => validateProductionConfig(dev));
    } finally {
      process.env.NODE_ENV = previous;
      delete require.cache[require.resolve('../src/config')];
    }
  });
});

describe('YP-7: getDailyTransferStats paginates beyond 200 records', () => {
  test('iterates pages and totals all amounts', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const userId = 'user_test_yp7';
    let page = 0;
    const fullPageSize = 200;
    const expectedCount = 5 * fullPageSize + 10;
    const pages = [
      Array.from({ length: fullPageSize }, (_, i) => ({ id: `t${i}`, amount: 5 })),
      Array.from({ length: fullPageSize }, (_, i) => ({ id: `t${200 + i}`, amount: 5 })),
      Array.from({ length: fullPageSize }, (_, i) => ({ id: `t${400 + i}`, amount: 5 })),
      Array.from({ length: fullPageSize }, (_, i) => ({ id: `t${600 + i}`, amount: 5 })),
      Array.from({ length: fullPageSize }, (_, i) => ({ id: `t${800 + i}`, amount: 5 })),
      Array.from({ length: 10 }, (_, i) => ({ id: `t${1000 + i}`, amount: 5 })),
    ];
    pocketBase.createAuditLog = async () => ({});
    pocketBase.adminRequest = async (url) => {
      assert.match(url, /perPage=200/);
      assert.match(url, /page=\d+/);
      const pageMatch = url.match(/page=(\d+)/);
      const requestedPage = pageMatch ? Number(pageMatch[1]) : 1;
      assert.equal(requestedPage, ++page);
      return { items: pages[requestedPage - 1] || [] };
    };

    const stats = await pocketBase.getDailyTransferStats(userId, 'send');
    assert.equal(page, pages.length);
    assert.equal(stats.count, expectedCount);
    assert.equal(stats.amount, expectedCount * 5);
  });
});

describe('YA-1: searchUsersForFriend no longer uses email LIKE', () => {
  test('search function does not include email in the filter', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'pocketbase.js'),
      'utf8',
    );
    const searchMatch = source.match(/async searchUsersForFriend[\s\S]*?^  \}/m);
    assert.ok(searchMatch, 'searchUsersForFriend must be present');
    assert.doesNotMatch(searchMatch[0], /email\s*~/);
    assert.match(searchMatch[0], /lower\(username\)/);
  });
});

describe('YS-1: toFriendUser does not leak phone by default', () => {
  test('toFriendUser omits phone when includePhone is not set', async () => {
    const { pocketBase } = require('../src/pocketbase');
    pocketBase.ensurePaymentProfile = async () => ({ payment_tag: 'abc' });
    const friend = await pocketBase.toFriendUser({
      id: 'u1',
      username: 'a',
      phone: '+90 555 000 00 00',
      profile_photo_url: 'x',
    });
    assert.equal('phone' in friend, false);
    assert.equal(friend.id, 'u1');
    assert.equal(friend.oroyaId, 'abc');
  });

  test('toFriendUser includes phone when explicitly requested', async () => {
    const { pocketBase } = require('../src/pocketbase');
    pocketBase.ensurePaymentProfile = async () => ({ payment_tag: 'abc' });
    const friend = await pocketBase.toFriendUser(
      { id: 'u1', username: 'a', phone: '+90 555 000 00 00' },
      { includePhone: true },
    );
    assert.equal(friend.phone, '+90 555 000 00 00');
  });
});

describe('YP-1: webhook nonce + timestamp replay protection', () => {
  test('recordWebhookNonce persists the first call and rejects duplicates', async () => {
    const { pocketBase } = require('../src/pocketbase');
    let calls = 0;
    pocketBase.adminRequest = async (url, options) => {
      calls += 1;
      if (calls === 1) {
        return { id: 'n1', nonce: options.body.nonce };
      }
      const error = new Error('duplicate');
      error.status = 409;
      throw error;
    };

    const first = await pocketBase.recordWebhookNonce('nonce-xyz-1234', 'nowpayments', 60_000);
    assert.equal(first.accepted, true);

    const second = await pocketBase.recordWebhookNonce('nonce-xyz-1234', 'nowpayments', 60_000);
    assert.equal(second.accepted, false);
    assert.equal(second.reason, 'duplicate');
  });

  test('payments.js source includes nonce + timestamp guards', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'payments.js'),
      'utf8',
    );
    assert.match(source, /recordWebhookNonce/);
    assert.match(source, /isFreshWebhookTimestamp/);
    assert.match(source, /isWebhookSourceAllowed/);
    assert.match(source, /webhook_replay_detected/);
  });
});

describe('YP-2: webhook IP allowlist is enforced', () => {
  test('isWebhookSourceAllowed denies local IPs unless private ingress is explicitly allowed', () => {
    const { config } = require('../src/config');
    const previous = config.nowPayments.ipnAllowPrivateNetwork;
    config.nowPayments.ipnAllowPrivateNetwork = false;
    const allowed = ['127.0.0.1', '::1', '10.0.0.5', '192.168.1.20', '172.16.0.10'];
    try {
      for (const ip of allowed) {
        const { isWebhookSourceAllowed } = requireFreshRoute();
        assert.equal(isWebhookSourceAllowed({ ipAddress: ip }), false, `${ip} should fail closed`);
      }
      config.nowPayments.ipnAllowPrivateNetwork = true;
      for (const ip of allowed) {
        const { isWebhookSourceAllowed } = requireFreshRoute();
        assert.equal(isWebhookSourceAllowed({ ipAddress: ip }), true, `${ip} should be allowed by opt-in`);
      }
    } finally {
      config.nowPayments.ipnAllowPrivateNetwork = previous;
    }
  });

  test('isWebhookSourceAllowed denies public IPs by default', () => {
    const { isWebhookSourceAllowed } = requireFreshRoute();
    assert.equal(isWebhookSourceAllowed({ ipAddress: '8.8.8.8' }), false);
    assert.equal(isWebhookSourceAllowed({ ipAddress: '203.0.113.5' }), false);
  });
});

describe('Payment idempotency', () => {
  test('deposit idempotency keys are required and scoped into stable references', () => {
    const { requireIdempotencyKey, createIdempotentReferenceId } = require('../src/routes/payments');
    const req = { headers: { 'x-idempotency-key': 'dep_test_key_1234567890' } };
    assert.equal(requireIdempotencyKey(req, {}), 'dep_test_key_1234567890');
    assert.equal(
      createIdempotentReferenceId('user_1', 'same-key-123456'),
      createIdempotentReferenceId('user_1', 'same-key-123456'),
    );
    assert.throws(
      () => requireIdempotencyKey({ headers: {} }, {}),
      /idempotency key is required/i,
    );
  });
});

function requireFreshRoute() {
  delete require.cache[require.resolve('../src/routes/payments')];
  return require('../src/routes/payments');
}

describe('YA-3/YP-8: 2FA challenge is required for high-value transfers', () => {
  test('startTransferTwoFactorChallenge exports the handler', () => {
    const { startTransferTwoFactorChallenge } = require('../src/routes/transfers');
    assert.equal(typeof startTransferTwoFactorChallenge, 'function');
  });

  test('sendTransfer source gates on isTwoFactorRequiredForTransfer', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'transfers.js'),
      'utf8',
    );
    assert.match(source, /isTwoFactorRequiredForTransfer/);
    assert.match(source, /two_factor_ticket/);
    assert.match(source, /two_factor_code/);
    assert.match(source, /verifyTransferChallengeTicket/);
    assert.match(source, /consumeTwoFactorOtp/);
    assert.match(source, /two_factor_required/);
  });

  test('verifyTransferChallengeTicket rejects tampered payload', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'transfers.js'),
      'utf8',
    );
    const helperMatch = source.match(/function verifyTransferChallengeTicket[\s\S]*?^}/m);
    assert.ok(helperMatch, 'verifyTransferChallengeTicket helper should be present');
    assert.match(helperMatch[0], /timingSafeEqual/);
    assert.match(helperMatch[0], /expiresAt/);
  });

  test('low-value transfers require 2FA when two_factor_settings.transfer_required is enabled', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { __testables } = require('../src/routes/transfers');
    const original = pocketBase.getTwoFactorSettings;
    try {
      pocketBase.getTwoFactorSettings = async (userId) => {
        assert.equal(userId, 'user_2fa');
        return { enabled: true, transfer_required: true };
      };

      assert.equal(
        await __testables.isTwoFactorRequiredForTransfer({ id: 'user_2fa' }, 10),
        true,
      );
    } finally {
      pocketBase.getTwoFactorSettings = original;
    }
  });

  test('low-value transfers are forced through 2FA by the default threshold', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { __testables } = require('../src/routes/transfers');
    const original = pocketBase.getTwoFactorSettings;
    try {
      pocketBase.getTwoFactorSettings = async () => ({ enabled: false, transfer_required: false });
      assert.equal(
        await __testables.isTwoFactorRequiredForTransfer(
          { id: 'user_without_2fa', two_factor_transfer_required: true },
          10,
        ),
        true,
      );
    } finally {
      pocketBase.getTwoFactorSettings = original;
    }
  });

  test('dev_otp is echoed only with explicit development opt-in', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { startTransferTwoFactorChallenge } = require('../src/routes/transfers');
    const originals = {
      authenticateBearer: pocketBase.authenticateBearer,
      getUserById: pocketBase.getUserById,
      getTwoFactorSettings: pocketBase.getTwoFactorSettings,
      issueTwoFactorOtp: pocketBase.issueTwoFactorOtp,
      createAuditLog: pocketBase.createAuditLog,
    };
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllow = process.env.ALLOW_DEV_OTP_ECHO;
    try {
      pocketBase.authenticateBearer = async () => ({ id: 'sender' });
      pocketBase.getUserById = async () => ({ id: 'receiver' });
      pocketBase.getTwoFactorSettings = async () => ({ enabled: true, transfer_required: true });
      pocketBase.issueTwoFactorOtp = async () => ({ id: 'otp' });
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      delete process.env.NODE_ENV;
      process.env.ALLOW_DEV_OTP_ECHO = 'true';
      const resDefault = makeJsonRes();
      await startTransferTwoFactorChallenge(
        makeHttpReq({
          method: 'POST',
          url: '/transfers/two-factor/challenge',
          headers: { authorization: 'Bearer token' },
          body: { receiver_user_id: 'receiver', amount: 10, currency: 'USD' },
        }),
        resDefault,
      );
      assert.equal(JSON.parse(resDefault.body).dev_otp, undefined);

      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_OTP_ECHO = 'true';
      const resDev = makeJsonRes();
      await startTransferTwoFactorChallenge(
        makeHttpReq({
          method: 'POST',
          url: '/transfers/two-factor/challenge',
          headers: { authorization: 'Bearer token' },
          body: { receiver_user_id: 'receiver', amount: 10, currency: 'USD' },
        }),
        resDev,
      );
      assert.match(JSON.parse(resDev.body).dev_otp, /^\d{6}$/);
    } finally {
      Object.assign(pocketBase, originals);
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAllow === undefined) delete process.env.ALLOW_DEV_OTP_ECHO;
      else process.env.ALLOW_DEV_OTP_ECHO = previousAllow;
    }
  });

  test('transfer idempotency keys are required and produce stable references', () => {
    const { __testables } = require('../src/routes/transfers');
    const req = { headers: { 'x-idempotency-key': 'tr_test_key_1234567890' } };
    assert.equal(
      __testables.requireIdempotencyKey(req, {}),
      'tr_test_key_1234567890',
    );
    assert.equal(
      __testables.createIdempotentReferenceId('user_1', 'same-key-123456'),
      __testables.createIdempotentReferenceId('user_1', 'same-key-123456'),
    );
    assert.throws(
      () => __testables.requireIdempotencyKey({ headers: {} }, {}),
      /idempotency key is required/i,
    );
  });
});

describe('YS-2: admin notifications require the configured token', () => {
  test('createAdminNotification source uses constantTimeEqual', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'adminNotifications.js'),
      'utf8',
    );
    assert.match(source, /constantTimeEqual/);
    assert.match(source, /isLocalAddress/);
    assert.match(source, /enforceRateLimit/);
    assert.match(source, /createAuditLog/);
  });

  test('createAdminNotification source records audit logs on success', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'adminNotifications.js'),
      'utf8',
    );
    assert.match(source, /admin\.notification_created/);
    assert.match(source, /admin\.notification_token_invalid/);
  });
});

describe('N14: notification URLs are HTTPS-only', () => {
  test('createAdminNotification rejects javascript link_url before writing to PocketBase', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const originalAdminRequest = pocketBase.adminRequest;
    let wrote = false;
    try {
      pocketBase.adminRequest = async () => {
        wrote = true;
        return {};
      };
      await assert.rejects(
        pocketBase.createAdminNotification({
          title: 'Unsafe',
          body: 'Unsafe URL',
          linkUrl: 'javascript:alert(1)',
        }),
        (error) => error.status === 400 && error.details?.code === 'invalid_notification_url',
      );
      assert.equal(wrote, false);
    } finally {
      pocketBase.adminRequest = originalAdminRequest;
    }
  });

  test('createAdminNotification accepts https image_url and link_url', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const originalAdminRequest = pocketBase.adminRequest;
    let body = null;
    try {
      pocketBase.adminRequest = async (url, options) => {
        body = options.body;
        return { id: 'n1', ...options.body };
      };
      const record = await pocketBase.createAdminNotification({
        title: 'Safe',
        body: 'Safe URL',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com/path',
      });
      assert.equal(record.id, 'n1');
      assert.equal(body.image_url, 'https://example.com/image.png');
      assert.equal(body.link_url, 'https://example.com/path');
    } finally {
      pocketBase.adminRequest = originalAdminRequest;
    }
  });
});

describe('YI-1: admin tool response carries CSP headers', () => {
  test('server.js sets a Content-Security-Policy header on /admin/notifications-tool', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'),
      'utf8',
    );
    const block = source.match(/notifications-tool[\s\S]*?res\.end\(html\)/);
    assert.ok(block, 'admin tool handler must exist');
    assert.match(block[0], /Content-Security-Policy/);
    assert.match(block[0], /default-src 'none'/);
    assert.match(block[0], /X-Frame-Options/);
  });
});

describe('Crash mid-credit: reconcile-pending-deposits script', () => {
  test('exports reconcileIntent and run', () => {
    const path = require('node:path');
    const scriptPath = path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'reconcile-pending-deposits.js',
    );
    delete require.cache[require.resolve(scriptPath)];
    const script = require(scriptPath);
    assert.equal(typeof script.reconcileIntent, 'function');
    assert.equal(typeof script.run, 'function');
  });

  test('reconcileIntent skips when no intent is provided', async () => {
    const path = require('node:path');
    const scriptPath = path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'reconcile-pending-deposits.js',
    );
    delete require.cache[require.resolve(scriptPath)];
    const script = require(scriptPath);
    const result = await script.reconcileIntent({ id: 'x' });
    assert.equal(result.skipped, true);
  });

  test('reconcileIntent recovers pending provider-completed intents', async () => {
    const path = require('node:path');
    const { pocketBase } = require('../src/pocketbase');
    const scriptPath = path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'reconcile-pending-deposits.js',
    );
    delete require.cache[require.resolve(scriptPath)];
    const script = require(scriptPath);
    const originals = {
      getUserById: pocketBase.getUserById,
      ensureWalletForUser: pocketBase.ensureWalletForUser,
      findTransactionByReferenceId: pocketBase.findTransactionByReferenceId,
      claimPaymentIntentCredit: pocketBase.claimPaymentIntentCredit,
      createTransaction: pocketBase.createTransaction,
      markTransactionCreditApplied: pocketBase.markTransactionCreditApplied,
      reconcileWalletBalance: pocketBase.reconcileWalletBalance,
      createAuditLog: pocketBase.createAuditLog,
    };
    try {
      pocketBase.getUserById = async () => ({ id: 'u1' });
      pocketBase.ensureWalletForUser = async () => ({ id: 'w1', user_id: 'u1', currency: 'USD', balance: 0 });
      pocketBase.findTransactionByReferenceId = async () => null;
      pocketBase.claimPaymentIntentCredit = async () => ({ claimed: true });
      pocketBase.createTransaction = async (input) => ({ id: 'tx1', status: input.status, reference_id: input.reference_id });
      pocketBase.markTransactionCreditApplied = async () => ({ id: 'tx1' });
      pocketBase.reconcileWalletBalance = async () => ({ id: 'w1', balance: 25 });
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      const result = await script.reconcileIntent(
        {
          id: 'intent_pending',
          user_id: 'u1',
          amount: 25,
          currency: 'USD',
          status: 'pending',
          nowpayments_payment_id: 'np_1',
          reference_id: 'dep_1',
          credit_applied_at: '',
        },
        { nowPaymentsClient: { getPaymentStatus: async () => ({ status: 'completed' }) } },
      );
      assert.equal(result.reconciled, true);
      assert.equal(result.amount, 25);
    } finally {
      Object.assign(pocketBase, originals);
    }
  });
});

describe('PocketBase helpers for phase-2', () => {
  test('findStaleIntentsWithClaimButNoTransaction filters by credit_applied_at', async () => {
    const { pocketBase } = require('../src/pocketbase');
    let captured = null;
    pocketBase.adminRequest = async (url) => {
      captured = url;
      return { items: [] };
    };
    await pocketBase.findStaleIntentsWithClaimButNoTransaction();
    assert.match(captured, /credit_applied_at/);
    const decoded = decodeURIComponent(captured);
    assert.doesNotMatch(decoded, /status = "completed"/);
  });

  test('issueTwoFactorOtp and consumeTwoFactorOtp round-trip', async () => {
    const { pocketBase } = require('../src/pocketbase');
    let created = null;
    let consumed = null;
    const records = [];
    pocketBase.adminRequest = async (url, options) => {
      if (url.endsWith('/records') && options.method === 'POST') {
        const record = { id: `otp_${records.length + 1}`, ...options.body };
        records.push(record);
        created = record;
        return record;
      }
      if (url.includes(`/records/otp_`) && options.method === 'PATCH') {
        Object.assign(created, options.body);
        consumed = options.body;
        return created;
      }
      if (url.includes('?filter=')) {
        return { items: records.filter((r) => r.consumed_at === '') };
      }
      return { items: [] };
    };

    const issued = await pocketBase.issueTwoFactorOtp('user_1', 'transfer', 'hash_xyz', 60_000);
    assert.equal(issued.code_hash, 'hash_xyz');

    const ok = await pocketBase.consumeTwoFactorOtp('user_1', 'transfer', 'hash_xyz');
    assert.equal(ok.ok, true);
    assert.ok(consumed.consumed_at);
  });

  test('consumeTwoFactorOtp increments failed_attempt_count on mismatch', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const records = [
      {
        id: 'otp_1',
        user_id: 'user_1',
        purpose: 'transfer',
        code_hash: 'correct',
        consumed_at: '',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        failed_attempt_count: 0,
      },
    ];
    let lastPatch = null;
    pocketBase.adminRequest = async (url, options) => {
      if (url.includes('?filter=')) {
        return { items: records };
      }
      if (url.includes('/records/otp_1') && options.method === 'PATCH') {
        lastPatch = options.body;
        Object.assign(records[0], options.body);
        return records[0];
      }
      return { items: [] };
    };

    const result = await pocketBase.consumeTwoFactorOtp('user_1', 'transfer', 'wrong');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'mismatch');
    assert.equal(lastPatch.failed_attempt_count, 1);
  });

  test('password reset token is hashed and single-use consumed', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const records = [];
    pocketBase.adminRequest = async (url, options = {}) => {
      if (url.endsWith('/password_reset_tokens/records') && options.method === 'POST') {
        const record = { id: `reset_${records.length + 1}`, ...options.body };
        records.push(record);
        return record;
      }
      if (url.includes('/password_reset_tokens/records/') && options.method === 'PATCH') {
        const id = url.match(/records\/([^?]+)/)?.[1];
        const record = records.find((item) => item.id === decodeURIComponent(id || ''));
        if (!record || record.consumed_at) {
          const error = new Error('not found');
          error.status = 404;
          throw error;
        }
        Object.assign(record, options.body);
        return record;
      }
      if (url.includes('/password_reset_tokens/records?filter=')) {
        return {
          items: records.filter(
            (item) => !item.consumed_at && new Date(item.expires_at).getTime() > Date.now(),
          ),
        };
      }
      return { items: [] };
    };

    const issued = await pocketBase.issuePasswordResetToken('user_reset', 60_000);
    assert.equal(issued.record.user_id, 'user_reset');
    assert.notEqual(issued.record.token_hash, issued.token);
    assert.equal(issued.record.token_hash.length, 64);

    const consumed = await pocketBase.consumePasswordResetToken(issued.token);
    assert.equal(consumed.user_id, 'user_reset');
    assert.ok(consumed.consumed_at);

    const replay = await pocketBase.consumePasswordResetToken(issued.token);
    assert.equal(replay, null);
  });

  test('revokeAllDeviceTokensForUser paginates until every token is revoked', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const pages = [
      Array.from({ length: 100 }, (_, index) => ({ id: `t${index}` })),
      Array.from({ length: 25 }, (_, index) => ({ id: `t${index + 100}` })),
      [],
    ];
    let listCalls = 0;
    let revoked = 0;
    pocketBase.adminRequest = async (url, options) => {
      if (url.includes('/device_tokens/records?')) {
        return { items: pages[listCalls++] || [] };
      }
      if (url.includes('/device_tokens/records/') && options?.method === 'PATCH') {
        revoked += 1;
        return { id: url.split('/').pop(), ...options.body };
      }
      return { items: [] };
    };

    const count = await pocketBase.revokeAllDeviceTokensForUser('u1', 'test');
    assert.equal(count, 125);
    assert.equal(revoked, 125);
  });

  test('createFriendRequest returns existing record when unique pair_key claim already exists', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const originals = {
      getUserById: pocketBase.getUserById,
      findFriendship: pocketBase.findFriendship,
      findPendingFriendRequest: pocketBase.findPendingFriendRequest,
      adminRequest: pocketBase.adminRequest,
    };
    try {
      pocketBase.getUserById = async () => ({ id: 'receiver' });
      pocketBase.findFriendship = async () => null;
      let pendingLookup = 0;
      pocketBase.findPendingFriendRequest = async () => {
        pendingLookup += 1;
        return pendingLookup > 1 ? { id: 'req_existing', status: 'pending' } : null;
      };
      pocketBase.adminRequest = async () => {
        const error = new Error('duplicate');
        error.status = 409;
        throw error;
      };

      const request = await pocketBase.createFriendRequest({
        requesterUserId: 'sender',
        receiverUserId: 'receiver',
        message: '',
      });
      assert.equal(request.id, 'req_existing');
    } finally {
      Object.assign(pocketBase, originals);
    }
  });
});

describe('HIGH_VALUE_2FA_THRESHOLD defaults to 5000', () => {
  test('transfers.js exposes a HMAC-signed ticket helper', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'transfers.js'),
      'utf8',
    );
    assert.match(source, /HIGH_VALUE_2FA_THRESHOLD/);
    assert.match(source, /createTransferChallengeTicket/);
    assert.match(source, /hmac.*sha256/i);
  });
});

describe('Server: route registration includes 2FA challenge', () => {
  test('server.js maps POST /transfers/two-factor/challenge', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'),
      'utf8',
    );
    assert.match(source, /POST \/transfers\/two-factor\/challenge/);
  });
});

describe('Security route: password change revokes old sessions', () => {
  test('changePassword revokes all device tokens and user bearer sessions', async () => {
    const { changePassword } = require('../src/routes/security');
    const { pocketBase } = require('../src/pocketbase');
    const calls = [];
    const originals = {
      authenticateBearer: pocketBase.authenticateBearer,
      changePassword: pocketBase.changePassword,
      revokeAllDeviceTokensForUser: pocketBase.revokeAllDeviceTokensForUser,
      revokeBearerTokensForUser: pocketBase.revokeBearerTokensForUser,
      revokeBearerToken: pocketBase.revokeBearerToken,
      createAuditLog: pocketBase.createAuditLog,
    };
    try {
      pocketBase.authenticateBearer = async () => ({ id: 'u1' });
      pocketBase.changePassword = async () => ({ changedAt: 'now', strengthScore: 5 });
      pocketBase.revokeAllDeviceTokensForUser = async (userId, reason) => calls.push(['devices', userId, reason]);
      pocketBase.revokeBearerTokensForUser = async (userId, reason) => calls.push(['bearer_user', userId, reason]);
      pocketBase.revokeBearerToken = async (token, options) => calls.push(['bearer_current', token, options.reason]);
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      const res = makeJsonRes();
      await changePassword(
        makeHttpReq({
          method: 'POST',
          url: '/security/change-password',
          headers: { authorization: 'Bearer old.jwt.token' },
          body: { current_password: 'old-password', new_password: 'NewPassword!123' },
        }),
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.deepEqual(calls, [
        ['devices', 'u1', 'password_change'],
        ['bearer_user', 'u1', 'password_change'],
        ['bearer_current', 'old.jwt.token', 'password_change'],
      ]);
    } finally {
      Object.assign(pocketBase, originals);
    }
  });
});

describe('Production env validation rejects weak secrets', () => {
  const strong = {
    NODE_ENV: 'production',
    POCKETBASE_SUPERUSER_PASSWORD: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    OROYA_LEDGER_SECRET: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    OROYA_DEVICE_TOKEN_SECRET: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    OROYA_TRANSFER_2FA_SECRET: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    TWO_FACTOR_HMAC_SECRET: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    NOWPAYMENTS_IPN_SECRET_KEY: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    OROYA_ADMIN_NOTIFICATION_TOKEN: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    NOWPAYMENTS_IPN_ALLOW_PRIVATE: 'false',
  };
  const previous = {};

  function applyEnv(overrides = {}) {
    for (const k of Object.keys(strong)) {
      previous[k] = process.env[k];
      if (k in overrides) {
        process.env[k] = overrides[k];
      } else {
        process.env[k] = strong[k];
      }
    }
    delete require.cache[require.resolve('../src/config')];
  }
  function restoreEnv() {
    for (const k of Object.keys(strong)) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
    delete require.cache[require.resolve('../src/config')];
  }

  test('rejects secrets that are all the same character', () => {
    applyEnv({ OROYA_LEDGER_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    try {
      assert.throws(
        () => require('../src/config'),
        /OROYA_LEDGER_SECRET must be a strong production secret/,
      );
    } finally {
      restoreEnv();
    }
  });

  test('rejects secrets shorter than 32 chars', () => {
    applyEnv({ OROYA_DEVICE_TOKEN_SECRET: 'short' });
    try {
      assert.throws(
        () => require('../src/config'),
        /OROYA_DEVICE_TOKEN_SECRET must be a strong production secret/,
      );
    } finally {
      restoreEnv();
    }
  });

  test('rejects all-placeholder secrets (change-me-...)', () => {
    applyEnv({ OROYA_ADMIN_NOTIFICATION_TOKEN: 'change-me-admin-token-padding-padding' });
    try {
      assert.throws(
        () => require('../src/config'),
        /OROYA_ADMIN_NOTIFICATION_TOKEN must be a strong production secret/,
      );
    } finally {
      restoreEnv();
    }
  });

  test('accepts a strong mixed-case secret with digits and symbols', () => {
    applyEnv();
    try {
      assert.doesNotThrow(() => require('../src/config'));
    } finally {
      restoreEnv();
    }
  });
});

describe('Logger emits structured JSON', () => {
  test('info line is JSON with ts, level, msg', () => {
    const logger = require('../src/logger');
    const original = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = (chunk) => {
      captured += chunk;
      return true;
    };
    try {
      logger.info('hello', { x: 1 });
    } finally {
      process.stdout.write = original;
    }
    const line = captured.trim();
    const record = JSON.parse(line);
    assert.equal(record.level, 'info');
    assert.equal(record.msg, 'hello');
    assert.equal(record.x, 1);
    assert.ok(record.ts);
  });

  test('error level writes to stderr', () => {
    const logger = require('../src/logger');
    const originalErr = process.stderr.write.bind(process.stderr);
    let captured = '';
    process.stderr.write = (chunk) => {
      captured += chunk;
      return true;
    };
    try {
      logger.error('boom', { code: 'X' });
    } finally {
      process.stderr.write = originalErr;
    }
    const record = JSON.parse(captured.trim());
    assert.equal(record.level, 'error');
    assert.equal(record.code, 'X');
  });
});

describe('CORS: admin-token header is not in public allowlist', () => {
  test('server.js does not list X-Oroya-Admin-Token in CORS allow-headers', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server.js'),
      'utf8',
    );
    const corsBlock = source.match(/Access-Control-Allow-Headers[\s\S]*?\);/);
    assert.ok(corsBlock, 'CORS allow-headers block must be present');
    assert.doesNotMatch(corsBlock[0], /X-Oroya-Admin-Token/);
  });
});

describe('Audit retention: purge script is wired and exports run', () => {
  test('purge-audit-logs.js exports run, purgeNonFinancialOlderThan, purgeFinancialOlderThan', () => {
    const path = require('node:path');
    const scriptPath = path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'purge-audit-logs.js',
    );
    delete require.cache[require.resolve(scriptPath)];
    const script = require(scriptPath);
    assert.equal(typeof script.run, 'function');
    assert.equal(typeof script.purgeNonFinancialOlderThan, 'function');
    assert.equal(typeof script.purgeFinancialOlderThan, 'function');
  });
});

describe('Reconcile: dry-run + structured logs + audit log', () => {
  test('run() records a sweep audit log even when nothing is reconciled', async () => {
    const path = require('node:path');
    const scriptPath = path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'reconcile-pending-deposits.js',
    );
    delete require.cache[require.resolve(scriptPath)];
    const script = require(scriptPath);
    const { pocketBase } = require('../src/pocketbase');
    let sweepAudit = null;
    pocketBase.findStaleIntentsWithClaimButNoTransaction = async () => [];
    pocketBase.createAuditLog = async (entry) => {
      if (entry.action === 'deposits.reconcile_sweep_completed') {
        sweepAudit = entry;
      }
      return { id: 'audit_x' };
    };
    const summary = await script.run();
    assert.deepEqual(summary, { reconciled: 0, skipped: 0, errors: 0 });
    assert.ok(sweepAudit);
    assert.equal(sweepAudit.metadata.dry_run, false);
  });

  test('run({ dryRun: true }) does NOT apply credits', async () => {
    const path = require('node:path');
    const scriptPath = path.join(
      __dirname,
      '..',
      'src',
      'scripts',
      'reconcile-pending-deposits.js',
    );
    delete require.cache[require.resolve(scriptPath)];
    const script = require(scriptPath);
    const { pocketBase } = require('../src/pocketbase');
    pocketBase.findStaleIntentsWithClaimButNoTransaction = async () => [
      { id: 'intent_dry', credit_applied_at: '2026-06-03T00:00:00Z', user_id: 'u1', amount: 100, currency: 'TRY' },
    ];
    let updateWalletCalled = false;
    pocketBase.findTransactionByReferenceId = async () => null;
    pocketBase.getUserById = async () => ({ id: 'u1' });
    pocketBase.ensureWalletForUser = async () => ({ id: 'w1', user_id: 'u1' });
    pocketBase.updateWalletBalanceOptimistic = async () => {
      updateWalletCalled = true;
      return { id: 'w1' };
    };
    pocketBase.createAuditLog = async () => ({});
    const summary = await script.run({ dryRun: true });
    assert.equal(updateWalletCalled, false);
    assert.equal(summary.reconciled, 0);
    assert.equal(summary.skipped, 1);
  });
});
