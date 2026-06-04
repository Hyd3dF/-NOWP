const crypto = require('node:crypto');
const { config } = require('../config');
const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');
const { enforceRateLimit } = require('../rateLimit');
const { verifyDeviceToken } = require('../deviceToken');

const transferLocks = new Map();
const TRANSFER_MAX_PER_MIN = 30;
const TRANSFER_AMOUNT_UPPER_BOUND = 1000000;
const TRANSFER_MIN_CENTS = 1;
const TRANSFER_2FA_TTL_MS = 5 * 60 * 1000;
const TRANSFER_2FA_MAX_FAILED = 5;
const TRANSFER_2FA_TICKET_TTL_MS = 2 * 60 * 1000;

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive number.', {
      code: 'invalid_amount',
    });
  }
  if (amount > TRANSFER_AMOUNT_UPPER_BOUND) {
    throw new HttpError(400, 'amount exceeds the per-transfer ceiling.', {
      code: 'amount_out_of_range',
    });
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new HttpError(400, 'amount can have at most two decimal places.', {
      code: 'invalid_amount_precision',
    });
  }

  const rounded = Math.round(amount * 100) / 100;
  if (rounded * 100 < TRANSFER_MIN_CENTS) {
    throw new HttpError(400, 'amount is below the minimum transfer unit.', {
      code: 'invalid_amount',
    });
  }
  return rounded;
}

function normalizeCurrency(value) {
  const currency = String(value || config.defaultWalletCurrency).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(currency)) {
    throw new HttpError(400, 'currency has an invalid format.', {
      code: 'invalid_currency',
    });
  }

  return currency;
}

function sanitizeNote(value) {
  return String(value || '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function createReferenceId() {
  return `tr_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function requireIdempotencyKey(req, body) {
  const headerValue = req.headers['x-idempotency-key'];
  const raw = String(body.idempotency_key || body.idempotencyKey || headerValue || '').trim();
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(raw)) {
    throw new HttpError(400, 'A valid idempotency key is required.', {
      code: 'idempotency_key_required',
    });
  }
  return raw;
}

function createIdempotentReferenceId(userId, key) {
  const digest = crypto
    .createHash('sha256')
    .update(`${userId}:${key}`)
    .digest('hex')
    .slice(0, 32);
  return `tr_${digest}`;
}

async function requireDeviceTokenForUser(userId, context) {
  if (!context.deviceToken) {
    throw new HttpError(401, 'Device session token is required for transfers.', {
      code: 'device_token_required',
    });
  }

  let verified;
  try {
    verified = verifyDeviceToken(context.deviceToken, context);
  } catch (error) {
    throw new HttpError(401, 'Device session token is invalid.', {
      code: 'device_token_invalid',
    });
  }
  if (verified.userId !== userId) {
    throw new HttpError(401, 'Device session token does not match the user.', {
      code: 'device_token_mismatch',
    });
  }
  const record = await pocketBase.findDeviceTokenByHash(verified.tokenHash);
  if (!record || record.revoked_at) {
    throw new HttpError(401, 'Device session has been revoked.', {
      code: 'device_token_revoked',
    });
  }
  return record;
}

async function sendTransfer(req, res) {
  const token = getBearerToken(req);
  const sender = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);

  const deviceToken = await requireDeviceTokenForUser(sender.id, requestContext);

  const receiverUserId = String(body.receiver_user_id || body.recipient_id || '').trim();
  const amount = parseAmount(body.amount);
  const currency = normalizeCurrency(body.currency);
  const note = sanitizeNote(body.note);
  const idempotencyKey = requireIdempotencyKey(req, body);
  const referenceId = createIdempotentReferenceId(sender.id, idempotencyKey);

  if (!receiverUserId) {
    throw new HttpError(400, 'receiver_user_id is required.', {
      code: 'receiver_required',
    });
  }

  if (receiverUserId === sender.id) {
    throw new HttpError(400, 'You cannot send money to yourself.', {
      code: 'self_transfer_not_allowed',
    });
  }

  await enforceRateLimit({
    scope: 'transfers:send',
    identity: sender.id,
    limit: TRANSFER_MAX_PER_MIN,
    windowMs: 60 * 1000,
  });

  const receiver = await pocketBase.getUserById(receiverUserId);
  if (!receiver) {
    throw new HttpError(404, 'Receiver was not found.', {
      code: 'receiver_not_found',
    });
  }
  const receiverWallets = await pocketBase.getWallets(receiver.id);
  const receiverHasCurrencyWallet = receiverWallets.some(
    (wallet) => normalizeCurrency(wallet.currency) === currency,
  );
  if (!receiverHasCurrencyWallet) {
    throw new HttpError(400, 'Receiver does not have a wallet for this currency.', {
      code: 'receiver_wallet_currency_unavailable',
    });
  }

  const existingTransaction = await pocketBase.findTransactionByReference(referenceId);
  if (existingTransaction) {
    if (
      existingTransaction.sender_user_id !== sender.id ||
      existingTransaction.receiver_user_id !== receiver.id ||
      Number(existingTransaction.amount) !== amount ||
      normalizeCurrency(existingTransaction.currency) !== currency
    ) {
      throw new HttpError(409, 'Idempotency key conflicts with another transfer.', {
        code: 'idempotency_key_conflict',
      });
    }
    sendJson(res, 200, {
      success: true,
      idempotent_replay: true,
      transaction: {
        id: existingTransaction.id,
        sender_id: sender.id,
        receiver_id: receiver.id,
        amount,
        currency,
        type: 'send',
        status: existingTransaction.status || 'completed',
        reference_id: referenceId,
        created_at: existingTransaction.created_at || existingTransaction.created,
      },
    });
    return;
  }

  await pocketBase.verifyUserPin(sender, body.pin);

  if (await isTwoFactorRequiredForTransfer(sender, amount)) {
    const ticket = String(body.two_factor_ticket || '').trim();
    const code = String(body.two_factor_code || '').trim();
    if (!ticket || !code) {
      throw new HttpError(401, 'Two-factor authentication is required for this transfer.', {
        code: 'two_factor_required',
      });
    }
    const verifiedTicket = verifyTransferChallengeTicket(ticket, {
      userId: sender.id,
      amount,
      receiverUserId: receiver.id,
      currency,
    });
    if (!verifiedTicket) {
      throw new HttpError(401, 'Two-factor challenge is invalid or expired.', {
        code: 'two_factor_ticket_invalid',
      });
    }
    const codeHash = hashOtpCode(code, sender.id);
    const consumption = await pocketBase.consumeTwoFactorOtp(sender.id, 'transfer', codeHash);
    if (!consumption.ok) {
      await pocketBase.createAuditLog({
        userId: sender.id,
        action: 'transfers.two_factor_invalid_code',
        ...requestContext,
        metadata: {
          reason: consumption.reason,
          amount,
          currency,
        },
      });
      throw new HttpError(401, 'Two-factor code is invalid.', {
        code: 'two_factor_code_invalid',
      });
    }
  }

  const result = await withTransferLock(
    [sender.id, receiver.id, currency],
    async () => {
      const senderDaily = await pocketBase.getDailyTransferStats(sender.id, 'send');
      const receiverDaily = await pocketBase.getDailyTransferStats(receiver.id, 'receive');
      const senderDailyLimit = Number(sender.daily_send_limit || 100);
      const receiverDailyLimit = Number(receiver.daily_receive_limit || 100);
      const senderDailyCountLimit = Number(sender.daily_send_count_limit || 2);
      const receiverDailyCountLimit = Number(receiver.daily_receive_count_limit || 5);

      if (senderDaily.amount + amount > senderDailyLimit) {
        throw new HttpError(429, 'Daily send amount limit reached.', {
          code: 'daily_send_amount_limit',
        });
      }

      if (senderDaily.count >= senderDailyCountLimit) {
        throw new HttpError(429, 'Daily send count limit reached.', {
          code: 'daily_send_count_limit',
        });
      }

      if (receiverDaily.amount + amount > receiverDailyLimit) {
        throw new HttpError(429, 'Receiver daily amount limit reached.', {
          code: 'daily_receive_amount_limit',
        });
      }

      if (receiverDaily.count >= receiverDailyCountLimit) {
        throw new HttpError(429, 'Receiver daily count limit reached.', {
          code: 'daily_receive_count_limit',
        });
      }

      return pocketBase.applyInternalTransferWithLock({
        senderUserId: sender.id,
        receiverUserId: receiver.id,
        amount,
        currency,
        referenceId,
        note,
      });
    },
  );

  pocketBase.touchDeviceToken(deviceToken.id).catch(() => {});

  await pocketBase.createAuditLog({
    userId: sender.id,
    action: 'transfers.send_completed',
    ...requestContext,
    metadata: {
      transaction_id: result.transaction.id,
      receiver_user_id_hash: hashForAudit(receiver.id),
      amount,
      currency,
      reference_id: referenceId,
    },
  });

  await pocketBase.createAuditLog({
    userId: receiver.id,
    action: 'transfers.receive_completed',
    ...requestContext,
    metadata: {
      transaction_id: result.transaction.id,
      sender_user_id_hash: hashForAudit(sender.id),
      amount,
      currency,
      reference_id: referenceId,
    },
  });

  sendJson(res, 201, {
    success: true,
    transaction: {
      id: result.transaction.id,
      sender_id: sender.id,
      receiver_id: receiver.id,
      amount,
      currency,
      type: 'send',
      status: 'completed',
      reference_id: referenceId,
      created_at: result.transaction.created_at || result.transaction.created,
    },
  });
}

function hashForAudit(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

const HIGH_VALUE_2FA_THRESHOLD = Number(process.env.TRANSFER_2FA_THRESHOLD || 0);
const TWO_FA_CHALLENGE_TTL_MS = 2 * 60 * 1000;

function getTransferTwoFactorSecret() {
  const secret = config.security.transferTwoFactorSecret;
  if (!secret) {
    throw new HttpError(500, 'Transfer two-factor secret is not configured.', {
      code: 'transfer_2fa_secret_missing',
    });
  }
  return secret;
}

function createTransferChallengeTicket({ userId, amount, receiverUserId, currency, expiresAt }) {
  const payload = JSON.stringify({
    userId,
    amount: Number(amount),
    receiverUserId,
    currency,
    expiresAt,
    nonce: crypto.randomBytes(8).toString('hex'),
  });
  const data = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getTransferTwoFactorSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function verifyTransferChallengeTicket(ticket, expected) {
  if (!ticket || typeof ticket !== 'string') return null;
  const dotIndex = ticket.indexOf('.');
  if (dotIndex < 0) return null;
  const data = ticket.slice(0, dotIndex);
  const signature = ticket.slice(dotIndex + 1);
  if (!data || !signature) return null;
  const expectedSignature = crypto
    .createHmac('sha256', getTransferTwoFactorSecret())
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
  if (Number(payload.expiresAt) < Date.now()) return null;
  if (payload.userId !== expected.userId) return null;
  if (Number(payload.amount) !== Number(expected.amount)) return null;
  if (payload.receiverUserId !== expected.receiverUserId) return null;
  if (payload.currency !== expected.currency) return null;
  return payload;
}

function hashOtpCode(code, salt) {
  return crypto
    .createHmac('sha256', getTransferTwoFactorSecret())
    .update(`${salt}::${code}`)
    .digest('hex');
}

async function isTwoFactorRequiredForTransfer(sender, amount) {
  if (Number(amount) >= HIGH_VALUE_2FA_THRESHOLD) return true;
  const settings = await pocketBase.getTwoFactorSettings(sender.id).catch(() => null);
  return Boolean(settings?.enabled && settings?.transfer_required);
}

function generateOtpCode() {
  const max = 1_000_000;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(6, '0');
}

async function startTransferTwoFactorChallenge(req, res) {
  const token = getBearerToken(req);
  const sender = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);

  const receiverUserId = String(body.receiver_user_id || body.recipient_id || '').trim();
  const amount = parseAmount(body.amount);
  const currency = normalizeCurrency(body.currency);

  if (!receiverUserId) {
    throw new HttpError(400, 'receiver_user_id is required.', {
      code: 'receiver_required',
    });
  }
  if (receiverUserId === sender.id) {
    throw new HttpError(400, 'You cannot send money to yourself.', {
      code: 'self_transfer_not_allowed',
    });
  }

  const receiver = await pocketBase.getUserById(receiverUserId);
  if (!receiver) {
    throw new HttpError(404, 'Receiver was not found.', {
      code: 'receiver_not_found',
    });
  }

  if (!(await isTwoFactorRequiredForTransfer(sender, amount))) {
    sendJson(res, 200, {
      success: true,
      two_factor_required: false,
    });
    return;
  }

  const code = generateOtpCode();
  const expiresAtMs = Date.now() + TRANSFER_2FA_TTL_MS;
  const codeHash = hashOtpCode(code, sender.id);

  await pocketBase.issueTwoFactorOtp(sender.id, 'transfer', codeHash, TRANSFER_2FA_TTL_MS, currency);

  const ticket = createTransferChallengeTicket({
    userId: sender.id,
    amount,
    receiverUserId: receiver.id,
    currency,
    expiresAt: expiresAtMs,
  });

  await pocketBase.createAuditLog({
    userId: sender.id,
    action: 'transfers.two_factor_challenge_issued',
    ...requestContext,
    metadata: {
      amount,
      currency,
      receiver_user_id_hash: hashForAudit(receiver.id),
      ticket_expires_at: new Date(expiresAtMs).toISOString(),
    },
  });

  const response = {
    success: true,
    two_factor_required: true,
    ticket,
    expires_at: new Date(expiresAtMs).toISOString(),
  };
  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_OTP_ECHO === 'true') {
    response.dev_otp = code;
  }
  sendJson(res, 200, response);
}

async function withTransferLock(parts, callback) {
  const key = parts.map((part) => String(part || '')).sort().join(':');
  const previous = transferLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const entry = previous.then(() => current);
  transferLocks.set(key, entry);

  try {
    await previous;
    return await callback();
  } finally {
    release();
    if (transferLocks.get(key) === entry) {
      transferLocks.delete(key);
    }
  }
}

module.exports = {
  sendTransfer,
  startTransferTwoFactorChallenge,
};

module.exports.__testables = {
  createIdempotentReferenceId,
  getTransferTwoFactorSecret,
  isTwoFactorRequiredForTransfer,
  requireIdempotencyKey,
};
