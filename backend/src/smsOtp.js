const crypto = require('node:crypto');
const { config } = require('./config');
const { HttpError } = require('./http');
const { pocketBase } = require('./pocketbase');
const { enforceRateLimit } = require('./rateLimit');
const {
  phoneNumbersMatch,
  verifyFirebaseAuthIdToken,
} = require('./firebaseAuth');

const DEFAULT_OTP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_OTP_TICKET_TTL_MS = 5 * 60 * 1000;
const DEFAULT_OTP_RATE_LIMIT = 5;
const DEFAULT_OTP_RATE_WINDOW_MS = 5 * 60 * 1000;

function canonicalMoneyOtpContext(input) {
  const purpose = normalizePurpose(input.purpose);
  if (purpose === 'deposit') {
    return [
      'deposit',
      normalizeAmount(input.amount),
      normalizeCurrency(input.currency || 'usd').toLowerCase(),
      normalizeNetwork(input.network || input.pay_currency || input.currency),
    ].join(':');
  }
  return [
    'transfer',
    normalizeAmount(input.amount),
    normalizeCurrency(input.currency || config.defaultWalletCurrency),
    String(input.receiverUserId || input.receiver_user_id || input.recipient_id || '').trim(),
  ].join(':');
}

async function startSmsOtp({ user, purpose, context, requestContext }) {
  const normalizedPurpose = normalizePurpose(purpose);
  if (!user?.id) {
    throw new HttpError(401, 'Authentication is required.', { code: 'auth_required' });
  }
  const phone = String(user.phone || '').trim();
  if (!phone) {
    throw new HttpError(400, 'A phone number is required for SMS verification.', {
      code: 'sms_phone_missing',
    });
  }
  const normalizedPhone = phone.replace(/\s+/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    throw new HttpError(400, 'Phone number must be in international format.', {
      code: 'sms_phone_invalid',
    });
  }
  const provider = getSmsProvider();
  assertSmsProviderConfigured(provider);

  await enforceRateLimit({
    scope: `sms-otp:${normalizedPurpose}`,
    identity: user.id,
    limit: getOtpRateLimit(),
    windowMs: getOtpRateWindowMs(),
  });

  if (provider === 'firebase_auth') {
    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'security.firebase_sms_otp_started',
      ...requestContext,
      metadata: {
        purpose: normalizedPurpose,
        provider,
      },
    }).catch(() => {});
    return {
      success: true,
      provider,
      purpose: normalizedPurpose,
      phone: normalizedPhone,
      expires_at: new Date(Date.now() + getOtpTtlMs()).toISOString(),
      sms_otp_challenge: createSmsOtpChallenge({
        userId: user.id,
        purpose: normalizedPurpose,
        context,
        phone: normalizedPhone,
        expiresAt: Date.now() + getOtpTtlMs(),
      }),
    };
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode({ userId: user.id, purpose: normalizedPurpose, context, code });
  const record = await pocketBase.issueTwoFactorOtp(
    user.id,
    normalizedPurpose,
    codeHash,
    getOtpTtlMs(),
    context,
  );

  const smsResult = await sendSms(
    normalizedPhone,
    `Your Oroya verification code is ${code}. It expires in 5 minutes.`,
  );
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.sms_otp_sent',
    ...requestContext,
    metadata: {
      purpose: normalizedPurpose,
      otp_id: record.id,
      provider: smsResult.provider,
      delivered: Boolean(smsResult.sent),
    },
  }).catch(() => {});

  return {
    success: true,
    purpose: normalizedPurpose,
    expires_at: record.expires_at,
    ...(smsResult.devCode ? { dev_otp: smsResult.devCode } : {}),
  };
}

async function verifySmsOtp({
  user,
  purpose,
  context,
  code,
  firebaseIdToken,
  smsOtpChallenge,
  requestContext,
}) {
  const normalizedPurpose = normalizePurpose(purpose);
  if (!user?.id) {
    throw new HttpError(401, 'Authentication is required.', { code: 'auth_required' });
  }
  if (firebaseIdToken) {
    return verifyFirebaseSmsOtp({
      user,
      purpose: normalizedPurpose,
      context,
      firebaseIdToken,
      smsOtpChallenge,
      requestContext,
    });
  }
  const provider = getSmsProvider();
  if (provider === 'dev' && process.env.NODE_ENV === 'test') {
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new HttpError(400, 'SMS verification code must be 6 digits.', {
        code: 'sms_otp_format',
      });
    }
    const codeHash = hashOtpCode({
      userId: user.id,
      purpose: normalizedPurpose,
      context,
      code: cleanCode,
    });
    const consumed = await pocketBase.consumeTwoFactorOtp(user.id, normalizedPurpose, codeHash, context);
    if (!consumed.ok) {
      await pocketBase.createAuditLog({
        userId: user.id,
        action: 'security.sms_otp_failed',
        ...requestContext,
        metadata: {
          purpose: normalizedPurpose,
          reason: consumed.reason || 'unknown',
        },
      }).catch(() => {});
      throw new HttpError(401, 'SMS verification failed.', {
        code: consumed.reason === 'locked' ? 'sms_otp_locked' : 'sms_otp_invalid',
      });
    }

    const ticket = createSmsOtpTicket({
      userId: user.id,
      purpose: normalizedPurpose,
      context,
      otpId: consumed.record.id,
      expiresAt: Date.now() + getOtpTicketTtlMs(),
    });
    return {
      success: true,
      sms_otp_ticket: ticket,
      expires_at: new Date(Date.now() + getOtpTicketTtlMs()).toISOString(),
    };
  }

  throw new HttpError(400, 'Firebase verification token is required.', {
    code: 'firebase_auth_token_missing',
  });
}

async function verifyFirebaseSmsOtp({
  user,
  purpose,
  context,
  firebaseIdToken,
  smsOtpChallenge,
  requestContext,
}) {
  const challenge = verifySmsOtpChallenge(smsOtpChallenge, {
    userId: user.id,
    purpose,
    context,
    phone: user.phone,
  });
  if (!challenge) {
    throw new HttpError(401, 'SMS verification must be started again.', {
      code: 'sms_otp_challenge_invalid',
    });
  }
  const verified = await verifyFirebaseAuthIdToken(firebaseIdToken);
  if (!phoneNumbersMatch(verified.phoneNumber, user.phone)) {
    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'security.firebase_sms_phone_mismatch',
      ...requestContext,
      metadata: {
        purpose,
      },
    }).catch(() => {});
    throw new HttpError(401, 'Firebase verified phone number does not match this account.', {
      code: 'firebase_auth_phone_mismatch',
    });
  }
  const accepted = await pocketBase.recordWebhookNonce(
    `sms_otp_challenge:${challenge.nonce}`,
    'sms_otp_challenge',
    getOtpTtlMs(),
  );
  if (!accepted.accepted) {
    throw new HttpError(401, 'SMS verification must be started again.', {
      code: 'sms_otp_challenge_used',
    });
  }
  const ticket = createSmsOtpTicket({
    userId: user.id,
    purpose,
    context,
    otpId: `firebase_auth:${verified.uid}:${verified.issuedAt}`,
    expiresAt: Date.now() + getOtpTicketTtlMs(),
  });
  await pocketBase.createAuditLog({
    userId: user.id,
    action: 'security.firebase_sms_otp_verified',
    ...requestContext,
    metadata: {
      purpose,
    },
  }).catch(() => {});
  return {
    success: true,
    sms_otp_ticket: ticket,
    expires_at: new Date(Date.now() + getOtpTicketTtlMs()).toISOString(),
  };
}

async function verifyAndConsumeSmsOtpTicket({ ticket, userId, purpose, context }) {
  const payload = verifySmsOtpTicket(ticket, { userId, purpose, context });
  if (!payload) {
    throw new HttpError(401, 'SMS verification is required.', {
      code: 'sms_otp_required',
    });
  }
  const accepted = await pocketBase.recordWebhookNonce(
    `sms_otp_ticket:${payload.nonce}`,
    'sms_otp_ticket',
    getOtpTicketTtlMs(),
  );
  if (!accepted.accepted) {
    throw new HttpError(401, 'SMS verification was already used.', {
      code: 'sms_otp_ticket_used',
    });
  }
  return payload;
}

function createSmsOtpTicket({ userId, purpose, context, otpId, expiresAt }) {
  const payload = {
    userId,
    purpose: normalizePurpose(purpose),
    contextHash: hashContext(context),
    otpId,
    expiresAt,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getOtpSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function createSmsOtpChallenge({ userId, purpose, context, phone, expiresAt }) {
  const payload = {
    userId,
    purpose: normalizePurpose(purpose),
    contextHash: hashContext(context),
    phoneHash: hashPhone(phone),
    expiresAt,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getOtpSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function verifySmsOtpChallenge(challenge, expected) {
  const raw = String(challenge || '');
  if (!raw) {
    throw new HttpError(401, 'SMS verification must be started again.', {
      code: 'sms_otp_challenge_required',
    });
  }
  const dotIndex = raw.indexOf('.');
  if (dotIndex < 0) return null;
  const data = raw.slice(0, dotIndex);
  const signature = raw.slice(dotIndex + 1);
  const expectedSignature = crypto
    .createHmac('sha256', getOtpSecret())
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.userId !== expected.userId) return null;
  if (payload.purpose !== normalizePurpose(expected.purpose)) return null;
  if (payload.contextHash !== hashContext(expected.context)) return null;
  if (payload.phoneHash !== hashPhone(expected.phone)) return null;
  if (Number(payload.expiresAt) < Date.now()) return null;
  if (!/^[a-f0-9]{32}$/.test(String(payload.nonce || ''))) return null;
  return payload;
}

function verifySmsOtpTicket(ticket, expected) {
  const raw = String(ticket || '');
  const dotIndex = raw.indexOf('.');
  if (dotIndex < 0) return null;
  const data = raw.slice(0, dotIndex);
  const signature = raw.slice(dotIndex + 1);
  const expectedSignature = crypto
    .createHmac('sha256', getOtpSecret())
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.userId !== expected.userId) return null;
  if (payload.purpose !== normalizePurpose(expected.purpose)) return null;
  if (payload.contextHash !== hashContext(expected.context)) return null;
  if (Number(payload.expiresAt) < Date.now()) return null;
  return payload;
}

function hashOtpCode({ userId, purpose, context, code }) {
  return crypto
    .createHmac('sha256', getOtpSecret())
    .update(`${userId}:${normalizePurpose(purpose)}:${hashContext(context)}:${code}`)
    .digest('hex');
}

function hashContext(context) {
  return crypto.createHash('sha256').update(String(context || '')).digest('hex');
}

function hashPhone(phone) {
  return crypto.createHash('sha256').update(String(phone || '').replace(/\s+/g, '')).digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

async function sendSms(phone, message) {
  const provider = getSmsProvider();
  if (provider === 'twilio') {
    return sendTwilioSms(phone, message);
  }
  if (provider === 'dev' && process.env.NODE_ENV !== 'production' && process.env.SMS_OTP_DEV_ECHO === 'true') {
    const match = message.match(/\b(\d{6})\b/);
    return { provider: 'dev', sent: true, devCode: match?.[1] || '' };
  }
  throw new HttpError(503, 'SMS provider is not configured.', {
    code: 'sms_provider_not_configured',
  });
}

function assertSmsProviderConfigured(provider = getSmsProvider()) {
  if (provider === 'firebase_auth') {
    if (config.firebase?.authProjectId) return;
    throw new HttpError(503, 'Firebase Auth is not configured.', {
      code: 'firebase_auth_not_configured',
    });
  }
  if (provider === 'dev' && process.env.NODE_ENV === 'test') {
    return;
  }
  throw new HttpError(503, 'SMS provider is not configured.', {
    code: 'sms_provider_not_configured',
  });
}

function getSmsProvider() {
  const provider = String(process.env.SMS_PROVIDER || config.sms?.provider || 'firebase_auth').trim().toLowerCase();
  if (process.env.NODE_ENV === 'test' && provider === 'dev') {
    return 'dev';
  }
  return 'firebase_auth';
}

async function sendTwilioSms(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_FROM_NUMBER || '';
  if (!accountSid || !authToken || !from) {
    throw new HttpError(503, 'SMS provider is not configured.', {
      code: 'sms_provider_not_configured',
    });
  }
  const params = new URLSearchParams({ To: phone, From: from, Body: message });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );
  if (!response.ok) {
    throw new HttpError(503, 'SMS provider rejected the request.', {
      code: 'sms_provider_unavailable',
    });
  }
  return { provider: 'twilio', sent: true };
}

function normalizePurpose(value) {
  const purpose = String(value || '').trim().toLowerCase();
  if (purpose !== 'deposit' && purpose !== 'transfer') {
    throw new HttpError(400, 'Invalid SMS OTP purpose.', { code: 'sms_otp_purpose_invalid' });
  }
  return purpose;
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive number.', { code: 'invalid_amount' });
  }
  return String(Math.round(amount * 100) / 100);
}

function normalizeCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(currency)) {
    throw new HttpError(400, 'currency has an invalid format.', { code: 'invalid_currency' });
  }
  return currency;
}

function normalizeNetwork(value) {
  const network = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_:-]{2,32}$/.test(network)) {
    throw new HttpError(400, 'network has an invalid format.', { code: 'invalid_network' });
  }
  return network;
}

function getOtpSecret() {
  return config.security.transferTwoFactorSecret;
}

function getPositiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getOtpTtlMs() {
  return getPositiveNumber('SMS_OTP_TTL_MS', DEFAULT_OTP_TTL_MS);
}

function getOtpTicketTtlMs() {
  return getPositiveNumber('SMS_OTP_TICKET_TTL_MS', DEFAULT_OTP_TICKET_TTL_MS);
}

function getOtpRateLimit() {
  return getPositiveNumber(
    'SMS_OTP_MAX_PER_WINDOW',
    getPositiveNumber('SMS_OTP_MAX_PER_10_MIN', DEFAULT_OTP_RATE_LIMIT),
  );
}

function getOtpRateWindowMs() {
  return getPositiveNumber('SMS_OTP_WINDOW_MS', DEFAULT_OTP_RATE_WINDOW_MS);
}

module.exports = {
  canonicalMoneyOtpContext,
  startSmsOtp,
  verifySmsOtp,
  verifyAndConsumeSmsOtpTicket,
  createSmsOtpTicket,
  createSmsOtpChallenge,
  verifySmsOtpChallenge,
  verifySmsOtpTicket,
  hashOtpCode,
  getOtpRateLimit,
  getOtpRateWindowMs,
};
