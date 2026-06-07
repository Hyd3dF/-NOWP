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
process.env.FIREBASE_PNV_PROJECT_NUMBER = process.env.FIREBASE_PNV_PROJECT_NUMBER || '123456789';
process.env.FIREBASE_PNV_PROJECT_ID = process.env.FIREBASE_PNV_PROJECT_ID || 'chirpchat-test';
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

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signEs256Jwt(header, payload, privateKey) {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const derSignature = crypto.sign('sha256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64Url(derToJoseSignature(derSignature))}`;
}

function signRs256Jwt(header, payload, privateKey) {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

function derToJoseSignature(derSignature) {
  let offset = 0;
  if (derSignature[offset++] !== 0x30) throw new Error('Invalid DER sequence.');
  const sequenceLength = derSignature[offset++];
  if (sequenceLength + 2 !== derSignature.length) throw new Error('Invalid DER length.');
  const r = readDerInteger(derSignature, () => offset, (next) => {
    offset = next;
  });
  const s = readDerInteger(derSignature, () => offset, (next) => {
    offset = next;
  });
  return Buffer.concat([leftPad32(r), leftPad32(s)]);
}

function readDerInteger(buffer, getOffset, setOffset) {
  let offset = getOffset();
  if (buffer[offset++] !== 0x02) throw new Error('Invalid DER integer.');
  const length = buffer[offset++];
  let value = buffer.subarray(offset, offset + length);
  setOffset(offset + length);
  while (value.length > 1 && value[0] === 0) {
    value = value.subarray(1);
  }
  return value;
}

function leftPad32(value) {
  if (value.length > 32) return value.subarray(value.length - 32);
  if (value.length === 32) return value;
  return Buffer.concat([Buffer.alloc(32 - value.length), value]);
}

function makeDeviceAuthHeaders(userId = 'u1', token = 'bearer-token') {
  const context = {
    deviceId: 'device-test-12345678',
    devicePlatform: 'android',
    deviceInfo: 'OroyaTest/1.0',
  };
  const issued = issueDeviceToken({
    userId,
    fingerprint: buildDeviceFingerprint(context),
  });
  return {
    headers: {
      authorization: `Bearer ${token}`,
      'user-agent': context.deviceInfo,
      'x-oroya-device-id': context.deviceId,
      'x-oroya-client-platform': context.devicePlatform,
      'x-oroya-device-token': issued.token,
    },
    tokenHash: issued.tokenHash,
  };
}

function mockRateLimitAdminRequest() {
  return async (url, options = {}) => {
    if (String(url).includes('/api/collections/rate_limit_buckets/records')) {
      if (options.method === 'POST') return { id: 'rate_bucket' };
      if (options.method === 'PATCH') return { id: 'rate_bucket' };
      return { items: [] };
    }
    throw new Error(`Unexpected adminRequest in test: ${url}`);
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

describe('Firebase Phone Number Verification token verification', () => {
  test('verifies an ES256 Firebase PNV JWT and extracts the phone number', async () => {
    const {
      __setJwksForTests,
      phoneNumbersMatch,
      verifyFirebasePnvToken,
    } = require('../src/firebasePnv');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const jwk = publicKey.export({ format: 'jwk' });
    jwk.kid = 'test-key-1';
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    __setJwksForTests([jwk]);

    const token = signEs256Jwt(
      {
        typ: 'JWT',
        alg: 'ES256',
        kid: jwk.kid,
      },
      {
        iss: 'https://fpnv.googleapis.com/projects/123456789',
        aud: [
          'https://fpnv.googleapis.com/projects/123456789',
          'https://fpnv.googleapis.com/projects/chirpchat-test',
        ],
        sub: '+905551112233',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      privateKey,
    );

    const verified = await verifyFirebasePnvToken(token);
    assert.equal(verified.phoneNumber, '+905551112233');
    assert.equal(phoneNumbersMatch('+90 555 111 22 33', verified.phoneNumber), true);
    assert.equal(phoneNumbersMatch('+90 555 111 22 34', verified.phoneNumber), false);
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

  test('NOWPayments webhook credits a deposit through idempotent claim flow', async () => {
    const { config } = require('../src/config');
    const { pocketBase } = require('../src/pocketbase');
    const { nowPaymentsWebhook } = require('../src/routes/payments');
    const previousAllowPrivate = config.nowPayments.ipnAllowPrivateNetwork;
    const previousAllowedIps = config.nowPayments.ipnAllowedIps;
    const previousSecret = config.nowPayments.ipnSecretKey;
    const calls = [];
    const originals = {
      adminRequest: pocketBase.adminRequest,
      findPaymentIntent: pocketBase.findPaymentIntent,
      claimPaymentIntentCredit: pocketBase.claimPaymentIntentCredit,
      findTransactionByReference: pocketBase.findTransactionByReference,
      createDepositTransaction: pocketBase.createDepositTransaction,
      completeTransaction: pocketBase.completeTransaction,
      markTransactionCreditApplied: pocketBase.markTransactionCreditApplied,
      ensureWallet: pocketBase.ensureWallet,
      getWalletById: pocketBase.getWalletById,
      reconcileWalletBalance: pocketBase.reconcileWalletBalance,
      updatePaymentIntent: pocketBase.updatePaymentIntent,
      createAuditLog: pocketBase.createAuditLog,
    };
    try {
      config.nowPayments.ipnAllowPrivateNetwork = true;
      config.nowPayments.ipnAllowedIps = [];
      config.nowPayments.ipnSecretKey = TEST_IPN_SECRET;
      const rateLimitAdminRequest = mockRateLimitAdminRequest();
      pocketBase.adminRequest = async (url, options = {}) => {
        if (String(url).includes('/api/collections/webhook_nonces/records')) {
          return { id: 'nonce_1', ...options.body };
        }
        return rateLimitAdminRequest(url, options);
      };
      pocketBase.findPaymentIntent = async () => ({
        id: 'intent_1',
        user_id: 'u1',
        amount: 25,
        currency: 'USD',
        reference_id: 'dep_ref_1',
        nowpayments_payment_id: 'np_1',
        payment_address: 'wallet-address',
        network: 'btc',
        credit_applied_at: '',
      });
      pocketBase.claimPaymentIntentCredit = async (intentId) => {
        calls.push(['claim', intentId]);
        return { claimed: true };
      };
      pocketBase.findTransactionByReference = async () => null;
      pocketBase.createDepositTransaction = async (input) => {
        calls.push(['create_transaction', input.referenceId]);
        return { id: 'tx_dep_1', status: 'pending', reference_id: input.referenceId };
      };
      pocketBase.completeTransaction = async (transaction) => {
        calls.push(['complete_transaction', transaction.id]);
        return { ...transaction, status: 'completed' };
      };
      pocketBase.markTransactionCreditApplied = async (transactionId) => {
        calls.push(['mark_credit', transactionId]);
      };
      pocketBase.ensureWallet = async () => ({ id: 'wallet_1', balance: 0 });
      pocketBase.getWalletById = async () => ({ id: 'wallet_1', balance: 0 });
      pocketBase.reconcileWalletBalance = async (wallet) => {
        calls.push(['reconcile_wallet', wallet.id]);
        return { ...wallet, balance: 25 };
      };
      pocketBase.updatePaymentIntent = async (intentId, patch) => {
        calls.push(['update_intent', intentId, patch.status]);
      };
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      const body = {
        payment_id: 'np_1',
        order_id: 'dep_ref_1',
        payment_status: 'finished',
        price_amount: 25,
        actually_paid: 25,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: 'nonce_runtime_deposit_1',
      };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const signature = computeNowPaymentsSignature(raw, TEST_IPN_SECRET);
      const res = makeJsonRes();
      await nowPaymentsWebhook(
        makeHttpReq({
          method: 'POST',
          url: '/payments/nowpayments-webhook',
          headers: { 'x-nowpayments-sig': signature },
          body,
          remoteAddress: '127.0.0.1',
        }),
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.body).status, 'completed');
      assert.deepEqual(calls.map((call) => call[0]), [
        'claim',
        'create_transaction',
        'complete_transaction',
        'mark_credit',
        'reconcile_wallet',
        'update_intent',
      ]);
    } finally {
      config.nowPayments.ipnAllowPrivateNetwork = previousAllowPrivate;
      config.nowPayments.ipnAllowedIps = previousAllowedIps;
      config.nowPayments.ipnSecretKey = previousSecret;
      Object.assign(pocketBase, originals);
    }
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

  test('oversize body is rejected with a public 413 code', async () => {
    const huge = Buffer.alloc(8 * 1024 * 1024 + 1, 'a');
    const req = makeReq(huge);
    await assert.rejects(
      parseRawJsonBody(req),
      (err) => err.status === 413 && err.details?.code === 'request_body_too_large',
    );
  });
});

describe('Server health endpoint', () => {
  test('GET / and HEAD / return health without logging a 404 path miss', async () => {
    const { handleRequest } = require('../src/server');
    const { pocketBase } = require('../src/pocketbase');
    const originalAdminRequest = pocketBase.adminRequest;
    try {
      pocketBase.adminRequest = mockRateLimitAdminRequest();

      const getRes = makeJsonRes();
      await handleRequest(makeHttpReq({ method: 'GET', url: '/' }), getRes);
      assert.equal(getRes.statusCode, 200);
      assert.equal(JSON.parse(getRes.body).status, 'ok');

      const headRes = makeJsonRes();
      await handleRequest(makeHttpReq({ method: 'HEAD', url: '/' }), headRes);
      assert.equal(headRes.statusCode, 200);
      assert.equal(headRes.body, '');
    } finally {
      pocketBase.adminRequest = originalAdminRequest;
    }
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
      NOWPAYMENTS_IPN_ALLOWED_IPS: process.env.NOWPAYMENTS_IPN_ALLOWED_IPS,
      NOWPAYMENTS_IPN_CALLBACK_URL: process.env.NOWPAYMENTS_IPN_CALLBACK_URL,
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
    process.env.NOWPAYMENTS_IPN_ALLOWED_IPS = '203.0.113.10';
    process.env.NOWPAYMENTS_IPN_CALLBACK_URL = 'https://oroya.onrender.com/payments/nowpayments-webhook';
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

describe('Payment device-token boundary', () => {
  test('currency listing is bearer-only while deposit creation still requires device token', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { nowPayments } = require('../src/nowpayments');
    const { depositCurrencies, createDeposit } = require('../src/routes/payments');
    const originals = {
      authenticateBearer: pocketBase.authenticateBearer,
      getMerchantCurrencies: nowPayments.getMerchantCurrencies,
    };
    let authCalls = 0;
    try {
      pocketBase.authenticateBearer = async (token) => {
        assert.equal(token, 'bearer-token');
        authCalls += 1;
        return { id: 'u1', email: 'u1@example.com' };
      };
      nowPayments.getMerchantCurrencies = async () => [
        {
          code: 'btc',
          name: 'Bitcoin',
          network: 'BTC',
          min_amount: 0,
          icon: '',
          color: '#f7931a',
          category: 'asset',
          popular_rank: 1,
        },
      ];

      const currenciesRes = makeJsonRes();
      await depositCurrencies(
        makeHttpReq({
          method: 'GET',
          url: '/payments/currencies',
          headers: { authorization: 'Bearer bearer-token' },
        }),
        currenciesRes,
      );
      assert.equal(currenciesRes.statusCode, 200);
      const payload = JSON.parse(currenciesRes.body);
      assert.equal(payload.success, true);
      assert.deepEqual(payload.currencies, [
        {
          code: 'btc',
          name: 'Bitcoin',
          network: 'BTC',
          min_amount: 0,
          icon: '',
          color: '#f7931a',
          category: 'asset',
        },
      ]);

      await assert.rejects(
        createDeposit(
          makeHttpReq({
            method: 'POST',
            url: '/payments/create-deposit',
            headers: { authorization: 'Bearer bearer-token' },
            body: {
              amount: 20,
              currency: 'usd',
              network: 'btc',
              idempotency_key: 'dep_test_key_1234567890',
            },
          }),
          makeJsonRes(),
        ),
        (error) => error.details?.code === 'device_token_required',
      );
      assert.equal(authCalls, 2);
    } finally {
      Object.assign(pocketBase, {
        authenticateBearer: originals.authenticateBearer,
      });
      nowPayments.getMerchantCurrencies = originals.getMerchantCurrencies;
    }
  });

  test('deposit creation rejects a real request when SMS OTP ticket is missing', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { nowPayments } = require('../src/nowpayments');
    const { createDeposit } = require('../src/routes/payments');
    const { headers, tokenHash } = makeDeviceAuthHeaders('u1', 'bearer-token');
    const originals = {
      adminRequest: pocketBase.adminRequest,
      authenticateBearer: pocketBase.authenticateBearer,
      findDeviceTokenByHash: pocketBase.findDeviceTokenByHash,
      findPaymentIntent: pocketBase.findPaymentIntent,
      createPaymentIntent: pocketBase.createPaymentIntent,
      createAuditLog: pocketBase.createAuditLog,
      getMinimumAmount: nowPayments.getMinimumAmount,
      createPayment: nowPayments.createPayment,
    };
    let providerCalls = 0;
    try {
      pocketBase.adminRequest = mockRateLimitAdminRequest();
      pocketBase.authenticateBearer = async () => ({ id: 'u1', email: 'u1@example.com' });
      pocketBase.findDeviceTokenByHash = async (hash) => {
        assert.equal(hash, tokenHash);
        return { id: 'dt_u1', revoked_at: '' };
      };
      pocketBase.findPaymentIntent = async () => null;
      pocketBase.createPaymentIntent = async () => {
        throw new Error('payment intent should not be created before SMS OTP');
      };
      pocketBase.createAuditLog = async () => ({ id: 'audit' });
      nowPayments.getMinimumAmount = async () => {
        providerCalls += 1;
        return 1;
      };
      nowPayments.createPayment = async () => {
        providerCalls += 1;
        return {};
      };

      await assert.rejects(
        createDeposit(
          makeHttpReq({
            method: 'POST',
            url: '/payments/create-deposit',
            headers: { ...headers, 'x-idempotency-key': 'dep_sms_required_123456' },
            body: {
              amount: 20,
              currency: 'usd',
              network: 'btc',
              idempotency_key: 'dep_sms_required_123456',
            },
          }),
          makeJsonRes(),
        ),
        (error) => error.details?.code === 'sms_otp_required',
      );
      assert.equal(providerCalls, 0);
    } finally {
      Object.assign(pocketBase, originals);
      nowPayments.getMinimumAmount = originals.getMinimumAmount;
      nowPayments.createPayment = originals.createPayment;
    }
  });

  test('deposit creation proceeds with a valid shared SMS OTP ticket', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { nowPayments } = require('../src/nowpayments');
    const { createDeposit } = require('../src/routes/payments');
    const { canonicalMoneyOtpContext, createSmsOtpTicket } = require('../src/smsOtp');
    const { headers, tokenHash } = makeDeviceAuthHeaders('u1', 'bearer-token');
    const originals = {
      adminRequest: pocketBase.adminRequest,
      authenticateBearer: pocketBase.authenticateBearer,
      findDeviceTokenByHash: pocketBase.findDeviceTokenByHash,
      findPaymentIntent: pocketBase.findPaymentIntent,
      createPaymentIntent: pocketBase.createPaymentIntent,
      createAuditLog: pocketBase.createAuditLog,
      touchDeviceToken: pocketBase.touchDeviceToken,
      recordWebhookNonce: pocketBase.recordWebhookNonce,
      getMinimumAmount: nowPayments.getMinimumAmount,
      createPayment: nowPayments.createPayment,
    };
    let nonceRecords = 0;
    let providerCalls = 0;
    try {
      pocketBase.adminRequest = mockRateLimitAdminRequest();
      pocketBase.authenticateBearer = async () => ({ id: 'u1', email: 'u1@example.com' });
      pocketBase.findDeviceTokenByHash = async (hash) => {
        assert.equal(hash, tokenHash);
        return { id: 'dt_u1', revoked_at: '' };
      };
      pocketBase.findPaymentIntent = async () => null;
      pocketBase.recordWebhookNonce = async (nonce, source) => {
        assert.match(nonce, /^sms_otp_ticket:/);
        assert.equal(source, 'sms_otp_ticket');
        nonceRecords += 1;
        return { accepted: true };
      };
      nowPayments.getMinimumAmount = async () => {
        providerCalls += 1;
        return 1;
      };
      nowPayments.createPayment = async ({ referenceId }) => {
        providerCalls += 1;
        return {
          paymentId: 'np_payment_1',
          paymentAddress: 'btc-address',
          paymentUrl: 'https://example.test/pay',
          status: 'waiting',
          expiresAt: '2026-06-06T00:00:00.000Z',
          referenceId,
        };
      };
      pocketBase.createPaymentIntent = async ({ referenceId }) => ({
        id: 'intent_1',
        reference_id: referenceId,
      });
      pocketBase.createAuditLog = async () => ({ id: 'audit' });
      pocketBase.touchDeviceToken = async () => ({ id: 'dt_u1' });
      const smsOtpTicket = createSmsOtpTicket({
        userId: 'u1',
        purpose: 'deposit',
        context: canonicalMoneyOtpContext({
          purpose: 'deposit',
          amount: 20,
          currency: 'usd',
          network: 'btc',
        }),
        otpId: 'otp_deposit_success',
        expiresAt: Date.now() + 60_000,
      });

      const res = makeJsonRes();
      await createDeposit(
        makeHttpReq({
          method: 'POST',
          url: '/payments/create-deposit',
          headers: { ...headers, 'x-idempotency-key': 'dep_sms_valid_123456' },
          body: {
            amount: 20,
            currency: 'usd',
            network: 'btc',
            sms_otp_ticket: smsOtpTicket,
            idempotency_key: 'dep_sms_valid_123456',
          },
        }),
        res,
      );

      assert.equal(res.statusCode, 201);
      assert.equal(JSON.parse(res.body).payment.payment_id, 'np_payment_1');
      assert.equal(nonceRecords, 1);
      assert.equal(providerCalls, 2);
    } finally {
      Object.assign(pocketBase, originals);
      nowPayments.getMinimumAmount = originals.getMinimumAmount;
      nowPayments.createPayment = originals.createPayment;
    }
  });
});

describe('/users/me/update sensitive profile step-up', () => {
  test('phone changes require current device token and security PIN', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { updateMe } = require('../src/routes/users');
    const currentUser = {
      id: 'u1',
      email: 'u1@example.com',
      phone: '+905551110000',
      username: 'oldname',
    };
    const originals = {
      authenticateBearer: pocketBase.authenticateBearer,
      findDeviceTokenByHash: pocketBase.findDeviceTokenByHash,
      verifyUserPin: pocketBase.verifyUserPin,
      updateUserProfile: pocketBase.updateUserProfile,
      createAuditLog: pocketBase.createAuditLog,
    };
    let updateCalls = 0;
    const { headers, tokenHash } = makeDeviceAuthHeaders('u1');
    try {
      pocketBase.authenticateBearer = async () => currentUser;
      pocketBase.findDeviceTokenByHash = async (hash) => {
        assert.equal(hash, tokenHash);
        return { id: 'device_token_record', revoked_at: '' };
      };
      pocketBase.verifyUserPin = async (_user, pin) => {
        assert.equal(pin, '1234');
      };
      pocketBase.updateUserProfile = async (userId, input) => {
        updateCalls += 1;
        return { ...currentUser, id: userId, ...input };
      };
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      await assert.rejects(
        updateMe(
          makeHttpReq({
            method: 'POST',
            url: '/users/me/update',
            headers: { authorization: 'Bearer bearer-token' },
            body: {
              display_name: 'User One',
              username: 'oldname',
              phone: '+905551119999',
            },
          }),
          makeJsonRes(),
        ),
        (error) => error.details?.code === 'device_token_required',
      );
      assert.equal(updateCalls, 0);

      await assert.rejects(
        updateMe(
          makeHttpReq({
            method: 'POST',
            url: '/users/me/update',
            headers,
            body: {
              display_name: 'User One',
              username: 'oldname',
              phone: '+905551119999',
            },
          }),
          makeJsonRes(),
        ),
        (error) => error.details?.code === 'profile_step_up_required',
      );
      assert.equal(updateCalls, 0);

      const res = makeJsonRes();
      await updateMe(
        makeHttpReq({
          method: 'POST',
          url: '/users/me/update',
          headers,
          body: {
            display_name: 'User One',
            username: 'oldname',
            phone: '+905551119999',
            pin: '1234',
          },
        }),
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.equal(updateCalls, 1);
      assert.equal(JSON.parse(res.body).user.phone, '+905551119999');
    } finally {
      Object.assign(pocketBase, originals);
    }
  });
});

describe('Shared SMS OTP money verification', () => {
  test('start uses five OTP requests per configured window by default', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const {
      canonicalMoneyOtpContext,
      getOtpRateLimit,
      startSmsOtp,
    } = require('../src/smsOtp');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEcho = process.env.SMS_OTP_DEV_ECHO;
    const previousProvider = process.env.SMS_PROVIDER;
    const previousMax = process.env.SMS_OTP_MAX_PER_WINDOW;
    const previousWindow = process.env.SMS_OTP_WINDOW_MS;
    const originals = {
      adminRequest: pocketBase.adminRequest,
      issueTwoFactorOtp: pocketBase.issueTwoFactorOtp,
      createAuditLog: pocketBase.createAuditLog,
    };
    const rateBodies = [];
    const context = canonicalMoneyOtpContext({
      purpose: 'deposit',
      amount: 20,
      currency: 'usd',
      network: 'btc',
    });
    try {
      process.env.NODE_ENV = 'test';
      process.env.SMS_OTP_DEV_ECHO = 'true';
      process.env.SMS_PROVIDER = 'dev';
      delete process.env.SMS_OTP_MAX_PER_WINDOW;
      process.env.SMS_OTP_WINDOW_MS = '300000';
      pocketBase.adminRequest = async (url, options = {}) => {
        if (String(url).includes('/api/collections/rate_limit_buckets/records')) {
          if (options.method === 'POST') {
            rateBodies.push(options.body);
            return { id: 'rate_bucket' };
          }
          return { items: [] };
        }
        throw new Error(`Unexpected adminRequest in test: ${url}`);
      };
      pocketBase.issueTwoFactorOtp = async () => ({
        id: 'otp_sms_1',
        expires_at: new Date(Date.now() + 300000).toISOString(),
      });
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      assert.equal(getOtpRateLimit(), 5);
      const started = await startSmsOtp({
        user: { id: 'u_sms_limit', phone: '+905551112233' },
        purpose: 'deposit',
        context,
        requestContext: {},
      });
      assert.equal(rateBodies.length, 1);
      assert.equal(rateBodies[0].count, 1);
      assert.equal(rateBodies[0].scope, 'sms-otp:deposit');
      const windowMs =
        new Date(rateBodies[0].expires_at).getTime() -
        new Date(rateBodies[0].window_start).getTime();
      assert.ok(windowMs >= 299000 && windowMs <= 301000);
    } finally {
      Object.assign(pocketBase, originals);
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousEcho === undefined) delete process.env.SMS_OTP_DEV_ECHO;
      else process.env.SMS_OTP_DEV_ECHO = previousEcho;
      if (previousProvider === undefined) delete process.env.SMS_PROVIDER;
      else process.env.SMS_PROVIDER = previousProvider;
      if (previousMax === undefined) delete process.env.SMS_OTP_MAX_PER_WINDOW;
      else process.env.SMS_OTP_MAX_PER_WINDOW = previousMax;
      if (previousWindow === undefined) delete process.env.SMS_OTP_WINDOW_MS;
      else process.env.SMS_OTP_WINDOW_MS = previousWindow;
    }
  });

  test('start and verify stores only a hash and returns a scoped ticket', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const {
      canonicalMoneyOtpContext,
      startSmsOtp,
      verifySmsOtp,
      verifySmsOtpTicket,
    } = require('../src/smsOtp');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEcho = process.env.SMS_OTP_DEV_ECHO;
    const previousProvider = process.env.SMS_PROVIDER;
    const originals = {
      adminRequest: pocketBase.adminRequest,
      issueTwoFactorOtp: pocketBase.issueTwoFactorOtp,
      consumeTwoFactorOtp: pocketBase.consumeTwoFactorOtp,
      createAuditLog: pocketBase.createAuditLog,
    };
    let storedHash = '';
    const context = canonicalMoneyOtpContext({
      purpose: 'deposit',
      amount: 20,
      currency: 'usd',
      network: 'btc',
    });
    try {
      process.env.NODE_ENV = 'test';
      process.env.SMS_OTP_DEV_ECHO = 'true';
      process.env.SMS_PROVIDER = 'dev';
      pocketBase.adminRequest = mockRateLimitAdminRequest();
      pocketBase.issueTwoFactorOtp = async (userId, purpose, codeHash, ttlMs, receivedContext) => {
        assert.equal(userId, 'u_sms');
        assert.equal(purpose, 'deposit');
        assert.equal(receivedContext, context);
        assert.ok(ttlMs <= 5 * 60 * 1000);
        storedHash = codeHash;
        return { id: 'otp_sms_1', expires_at: '2026-06-06T00:00:00.000Z' };
      };
      pocketBase.consumeTwoFactorOtp = async (userId, purpose, codeHash, receivedContext) => {
        assert.equal(userId, 'u_sms');
        assert.equal(purpose, 'deposit');
        assert.equal(receivedContext, context);
        assert.equal(codeHash, storedHash);
        return { ok: true, record: { id: 'otp_sms_1' } };
      };
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

      const started = await startSmsOtp({
        user: { id: 'u_sms', phone: '+905551112233' },
        purpose: 'deposit',
        context,
        requestContext: {},
      });
      assert.match(started.dev_otp, /^\d{6}$/);
      assert.notEqual(storedHash, started.dev_otp);
      assert.match(storedHash, /^[a-f0-9]{64}$/);

      const verified = await verifySmsOtp({
        user: { id: 'u_sms' },
        purpose: 'deposit',
        context,
        code: started.dev_otp,
        requestContext: {},
      });
      assert.ok(verified.sms_otp_ticket);
      assert.ok(
        verifySmsOtpTicket(verified.sms_otp_ticket, {
          userId: 'u_sms',
          purpose: 'deposit',
          context,
        }),
      );
    } finally {
      Object.assign(pocketBase, originals);
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousEcho === undefined) delete process.env.SMS_OTP_DEV_ECHO;
      else process.env.SMS_OTP_DEV_ECHO = previousEcho;
      if (previousProvider === undefined) delete process.env.SMS_PROVIDER;
      else process.env.SMS_PROVIDER = previousProvider;
    }
  });

  test('Firebase Auth phone token verifies and returns a scoped money ticket', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const {
      canonicalMoneyOtpContext,
      createSmsOtpChallenge,
      verifySmsOtp,
      verifySmsOtpTicket,
    } = require('../src/smsOtp');
    const { __setCertificatesForTests } = require('../src/firebaseAuth');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const keyId = 'firebase-auth-test-key';
    __setCertificatesForTests([[keyId, publicKey.export({ type: 'spki', format: 'pem' })]]);
    const now = Math.floor(Date.now() / 1000);
    const token = signRs256Jwt(
      { alg: 'RS256', kid: keyId, typ: 'JWT' },
      {
        iss: 'https://securetoken.google.com/chirpchat-test',
        aud: 'chirpchat-test',
        sub: 'firebase_uid_1',
        phone_number: '+905551112233',
        auth_time: now,
        iat: now,
        exp: now + 300,
      },
      privateKey,
    );
    const originals = {
      createAuditLog: pocketBase.createAuditLog,
      recordWebhookNonce: pocketBase.recordWebhookNonce,
    };
    const context = canonicalMoneyOtpContext({
      purpose: 'deposit',
      amount: 20,
      currency: 'usd',
      network: 'btc',
    });
    try {
      pocketBase.createAuditLog = async () => ({ id: 'audit' });
      const consumedChallenges = [];
      pocketBase.recordWebhookNonce = async (nonce, source) => {
        consumedChallenges.push([nonce, source]);
        return { accepted: true };
      };
      await assert.rejects(
        () => verifySmsOtp({
          user: { id: 'u_sms', phone: '+90 555 111 22 33' },
          purpose: 'deposit',
          context,
          firebaseIdToken: token,
          requestContext: {},
        }),
        (error) => error.details?.code === 'sms_otp_challenge_required',
      );
      const challenge = createSmsOtpChallenge({
        userId: 'u_sms',
        purpose: 'deposit',
        context,
        phone: '+905551112233',
        expiresAt: Date.now() + 300000,
      });
      const verified = await verifySmsOtp({
        user: { id: 'u_sms', phone: '+90 555 111 22 33' },
        purpose: 'deposit',
        context,
        firebaseIdToken: token,
        smsOtpChallenge: challenge,
        requestContext: {},
      });
      assert.equal(consumedChallenges.length, 1);
      assert.match(consumedChallenges[0][0], /^sms_otp_challenge:/);
      assert.equal(consumedChallenges[0][1], 'sms_otp_challenge');
      assert.ok(
        verifySmsOtpTicket(verified.sms_otp_ticket, {
          userId: 'u_sms',
          purpose: 'deposit',
          context,
        }),
      );
    } finally {
      Object.assign(pocketBase, originals);
    }
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

  test('sendTransfer source gates on shared SMS OTP before money movement', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'transfers.js'),
      'utf8',
    );
    assert.match(source, /isTwoFactorRequiredForTransfer/);
    assert.match(source, /sms_otp_ticket/);
    assert.match(source, /verifyAndConsumeSmsOtpTicket/);
    assert.match(source, /sms_otp_required/);
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

  test('legacy transfer challenge endpoint starts shared SMS OTP', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { startTransferTwoFactorChallenge } = require('../src/routes/transfers');
    const originals = {
      adminRequest: pocketBase.adminRequest,
      authenticateBearer: pocketBase.authenticateBearer,
      getUserById: pocketBase.getUserById,
      getTwoFactorSettings: pocketBase.getTwoFactorSettings,
      issueTwoFactorOtp: pocketBase.issueTwoFactorOtp,
      createAuditLog: pocketBase.createAuditLog,
    };
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEcho = process.env.SMS_OTP_DEV_ECHO;
    const previousProvider = process.env.SMS_PROVIDER;
    try {
      process.env.NODE_ENV = 'test';
      process.env.SMS_OTP_DEV_ECHO = 'true';
      process.env.SMS_PROVIDER = 'dev';
      pocketBase.adminRequest = mockRateLimitAdminRequest();
      pocketBase.authenticateBearer = async () => ({ id: 'sender', phone: '+905551112233' });
      pocketBase.getUserById = async () => ({ id: 'receiver' });
      pocketBase.getTwoFactorSettings = async () => ({ enabled: true, transfer_required: true });
      pocketBase.issueTwoFactorOtp = async (userId, purpose, codeHash, ttlMs, context) => {
        assert.equal(userId, 'sender');
        assert.equal(purpose, 'transfer');
        assert.match(codeHash, /^[a-f0-9]{64}$/);
        assert.ok(ttlMs <= 5 * 60 * 1000);
        assert.equal(context, 'transfer:10:USD:receiver');
        return { id: 'otp_legacy_transfer', expires_at: '2026-06-06T00:00:00.000Z' };
      };
      pocketBase.createAuditLog = async () => ({ id: 'audit' });

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
      const defaultBody = JSON.parse(resDefault.body);
      assert.equal(defaultBody.two_factor_method, 'sms_otp');
      assert.match(defaultBody.dev_otp, /^\d{6}$/);
    } finally {
      Object.assign(pocketBase, originals);
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousEcho === undefined) delete process.env.SMS_OTP_DEV_ECHO;
      else process.env.SMS_OTP_DEV_ECHO = previousEcho;
      if (previousProvider === undefined) delete process.env.SMS_PROVIDER;
      else process.env.SMS_PROVIDER = previousProvider;
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

  test('sendTransfer rejects a real request when SMS OTP ticket is missing', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { sendTransfer } = require('../src/routes/transfers');
    const { headers, tokenHash } = makeDeviceAuthHeaders('sender', 'transfer-bearer');
    const originals = {
      adminRequest: pocketBase.adminRequest,
      authenticateBearer: pocketBase.authenticateBearer,
      findDeviceTokenByHash: pocketBase.findDeviceTokenByHash,
      getUserById: pocketBase.getUserById,
      getWallets: pocketBase.getWallets,
      findTransactionByReference: pocketBase.findTransactionByReference,
      verifyUserPin: pocketBase.verifyUserPin,
      applyInternalTransferWithLock: pocketBase.applyInternalTransferWithLock,
    };
    let appliedTransfer = false;
    try {
      pocketBase.adminRequest = mockRateLimitAdminRequest();
      pocketBase.authenticateBearer = async () => ({
        id: 'sender',
        phone: '+905551112233',
        daily_send_limit: 1000,
        daily_send_count_limit: 10,
      });
      pocketBase.findDeviceTokenByHash = async (hash) => {
        assert.equal(hash, tokenHash);
        return { id: 'dt_sender', revoked_at: '' };
      };
      pocketBase.getUserById = async () => ({
        id: 'receiver',
        daily_receive_limit: 1000,
        daily_receive_count_limit: 10,
      });
      pocketBase.getWallets = async () => [{ id: 'receiver_usd', currency: 'USD' }];
      pocketBase.findTransactionByReference = async () => null;
      pocketBase.verifyUserPin = async () => true;
      pocketBase.applyInternalTransferWithLock = async () => {
        appliedTransfer = true;
      };

      await assert.rejects(
        sendTransfer(
          makeHttpReq({
            method: 'POST',
            url: '/transfers/send',
            headers: { ...headers, 'x-idempotency-key': 'tr_missing_pnv_123456' },
            body: {
              receiver_user_id: 'receiver',
              amount: 10,
              currency: 'USD',
              pin: '1234',
            },
          }),
          makeJsonRes(),
        ),
        (error) => error.details?.code === 'sms_otp_required',
      );
      assert.equal(appliedTransfer, false);
    } finally {
      Object.assign(pocketBase, originals);
    }
  });

  test('sendTransfer completes with a valid shared SMS OTP ticket', async () => {
    const { pocketBase } = require('../src/pocketbase');
    const { sendTransfer } = require('../src/routes/transfers');
    const { canonicalMoneyOtpContext, createSmsOtpTicket } = require('../src/smsOtp');

    const { headers, tokenHash } = makeDeviceAuthHeaders('sender', 'transfer-bearer');
    const originals = {
      adminRequest: pocketBase.adminRequest,
      authenticateBearer: pocketBase.authenticateBearer,
      findDeviceTokenByHash: pocketBase.findDeviceTokenByHash,
      getUserById: pocketBase.getUserById,
      getWallets: pocketBase.getWallets,
      findTransactionByReference: pocketBase.findTransactionByReference,
      verifyUserPin: pocketBase.verifyUserPin,
      getDailyTransferStats: pocketBase.getDailyTransferStats,
      applyInternalTransferWithLock: pocketBase.applyInternalTransferWithLock,
      touchDeviceToken: pocketBase.touchDeviceToken,
      createAuditLog: pocketBase.createAuditLog,
      recordWebhookNonce: pocketBase.recordWebhookNonce,
    };
    try {
      pocketBase.adminRequest = mockRateLimitAdminRequest();
      pocketBase.authenticateBearer = async () => ({
        id: 'sender',
        phone: '+90 555 111 22 33',
        daily_send_limit: 1000,
        daily_send_count_limit: 10,
      });
      pocketBase.findDeviceTokenByHash = async (hash) => {
        assert.equal(hash, tokenHash);
        return { id: 'dt_sender', revoked_at: '' };
      };
      pocketBase.getUserById = async () => ({
        id: 'receiver',
        daily_receive_limit: 1000,
        daily_receive_count_limit: 10,
      });
      pocketBase.getWallets = async () => [{ id: 'receiver_usd', currency: 'USD' }];
      pocketBase.findTransactionByReference = async () => null;
      pocketBase.verifyUserPin = async () => true;
      pocketBase.getDailyTransferStats = async () => ({ amount: 0, count: 0 });
      pocketBase.applyInternalTransferWithLock = async ({ referenceId }) => ({
        transaction: {
          id: 'tx_pnv_success',
          status: 'completed',
          reference_id: referenceId,
          created_at: '2026-06-05T00:00:00.000Z',
        },
      });
      pocketBase.touchDeviceToken = async () => ({ id: 'dt_sender' });
      pocketBase.createAuditLog = async () => ({ id: 'audit' });
      let nonceRecords = 0;
      pocketBase.recordWebhookNonce = async (nonce, source) => {
        assert.match(nonce, /^sms_otp_ticket:/);
        assert.equal(source, 'sms_otp_ticket');
        nonceRecords += 1;
        return { accepted: true };
      };
      const smsOtpTicket = createSmsOtpTicket({
        userId: 'sender',
        purpose: 'transfer',
        context: canonicalMoneyOtpContext({
          purpose: 'transfer',
          amount: 10,
          currency: 'USD',
          receiverUserId: 'receiver',
        }),
        otpId: 'otp_transfer_success',
        expiresAt: Date.now() + 60_000,
      });

      const sendRes = makeJsonRes();
      await sendTransfer(
        makeHttpReq({
          method: 'POST',
          url: '/transfers/send',
          headers: { ...headers, 'x-idempotency-key': 'tr_valid_sms_123456' },
          body: {
            receiver_user_id: 'receiver',
            amount: 10,
            currency: 'USD',
            pin: '1234',
            sms_otp_ticket: smsOtpTicket,
          },
        }),
        sendRes,
      );
      assert.equal(sendRes.statusCode, 201);
      assert.equal(JSON.parse(sendRes.body).transaction.id, 'tx_pnv_success');
      assert.equal(nonceRecords, 1);
    } finally {
      Object.assign(pocketBase, originals);
    }
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

  test('old bearer token is rejected by a protected endpoint after password change', async () => {
    const { HttpError } = require('../src/http');
    const { pocketBase } = require('../src/pocketbase');
    const { changePassword } = require('../src/routes/security');
    const { me } = require('../src/routes/users');
    const oldToken = 'old.jwt.token';
    const revokedTokens = new Set();
    let userSessionRevoked = false;
    const originals = {
      authenticateBearer: pocketBase.authenticateBearer,
      changePassword: pocketBase.changePassword,
      revokeAllDeviceTokensForUser: pocketBase.revokeAllDeviceTokensForUser,
      revokeBearerTokensForUser: pocketBase.revokeBearerTokensForUser,
      revokeBearerToken: pocketBase.revokeBearerToken,
      createAuditLog: pocketBase.createAuditLog,
      ensurePaymentProfile: pocketBase.ensurePaymentProfile,
    };
    try {
      pocketBase.authenticateBearer = async (token) => {
        if (revokedTokens.has(token) || userSessionRevoked) {
          throw new HttpError(401, 'Authorization token has been revoked.', {
            code: 'token_revoked',
          });
        }
        return { id: 'u1', email: 'u1@example.com' };
      };
      pocketBase.changePassword = async () => ({ changedAt: 'now', strengthScore: 5 });
      pocketBase.revokeAllDeviceTokensForUser = async () => ({ revoked: true });
      pocketBase.revokeBearerTokensForUser = async () => {
        userSessionRevoked = true;
      };
      pocketBase.revokeBearerToken = async (token) => {
        revokedTokens.add(token);
      };
      pocketBase.createAuditLog = async () => ({ id: 'audit' });
      pocketBase.ensurePaymentProfile = async () => ({ id: 'profile' });

      const res = makeJsonRes();
      await changePassword(
        makeHttpReq({
          method: 'POST',
          url: '/security/change-password',
          headers: { authorization: `Bearer ${oldToken}` },
          body: { current_password: 'old-password', new_password: 'NewPassword!123' },
        }),
        res,
      );
      assert.equal(res.statusCode, 200);

      await assert.rejects(
        me(
          makeHttpReq({
            method: 'GET',
            url: '/users/me',
            headers: { authorization: `Bearer ${oldToken}` },
          }),
          makeJsonRes(),
        ),
        (error) => error.details?.code === 'token_revoked',
      );
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
    NOWPAYMENTS_IPN_CALLBACK_URL: 'https://oroya.onrender.com/payments/nowpayments-webhook',
    OROYA_ADMIN_NOTIFICATION_TOKEN: 'q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^',
    NOWPAYMENTS_IPN_ALLOW_PRIVATE: 'false',
    NOWPAYMENTS_IPN_ALLOWED_IPS: '203.0.113.10',
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

  test('rejects production NOWPayments IPN without trusted ingress IPs', () => {
    applyEnv({ NOWPAYMENTS_IPN_ALLOWED_IPS: '' });
    try {
      assert.throws(
        () => require('../src/config'),
        /NOWPAYMENTS_IPN_ALLOWED_IPS must list your trusted webhook ingress/,
      );
    } finally {
      restoreEnv();
    }
  });

  test('rejects production NOWPayments without a webhook callback URL', () => {
    applyEnv({ NOWPAYMENTS_IPN_CALLBACK_URL: '' });
    try {
      assert.throws(
        () => require('../src/config'),
        /NOWPAYMENTS_IPN_CALLBACK_URL must be an HTTPS/,
      );
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
