const crypto = require('node:crypto');
const { config } = require('../config');
const {
  HttpError,
  getBearerToken,
  getRequestContext,
  parseJsonBody,
  parseRawJsonBody,
  sendJson,
} = require('../http');
const { nowPayments } = require('../nowpayments');
const { pocketBase } = require('../pocketbase');
const { enforceRateLimit } = require('../rateLimit');
const { verifyDeviceToken } = require('../deviceToken');
const { verifyNowPaymentsSignature } = require('../webhookSignature');

const DEPOSIT_MAX_PER_MIN = 10;
const WEBHOOK_MAX_PER_MIN = 120;
const WEBHOOK_NONCE_TTL_MS = 24 * 60 * 60 * 1000;
const AMOUNT_UPPER_BOUND = 1_000_000;
const DEPOSIT_MIN_CENTS = 1;

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive number.', {
      code: 'invalid_amount',
    });
  }
  if (amount > AMOUNT_UPPER_BOUND) {
    throw new HttpError(400, 'amount exceeds the per-deposit ceiling.', {
      code: 'amount_out_of_range',
    });
  }
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new HttpError(400, 'amount can have at most two decimal places.', {
      code: 'invalid_amount_precision',
    });
  }
  const rounded = Math.round(amount * 100) / 100;
  if (rounded * 100 < DEPOSIT_MIN_CENTS) {
    throw new HttpError(400, 'amount is below the minimum deposit unit.', {
      code: 'invalid_amount',
    });
  }
  return rounded;
}

function normalizeCode(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required.`);
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9_:-]{2,32}$/.test(normalized)) {
    throw new HttpError(400, `${field} has an invalid format.`);
  }

  return normalized;
}

function createReferenceId(userId) {
  const random = crypto.randomBytes(8).toString('hex');
  return `dep_${userId}_${Date.now()}_${random}`;
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
  return `dep_${digest}`;
}

function isWebhookSourceAllowed(context) {
  const ip = String(context.ipAddress || '').trim();
  if (!ip) return false;
  if (config.nowPayments.ipnAllowedIps.length) {
    return config.nowPayments.ipnAllowedIps.includes(ip);
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (!config.nowPayments.ipnAllowPrivateNetwork) return false;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

function isFreshWebhookTimestamp(timestamp, maxAgeSeconds) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const drift = Math.abs(nowSeconds - ts);
  return drift <= Number(maxAgeSeconds);
}

async function extractWebhookNonce(body, signature) {
  const fromBody = body.nonce || body.idempotency_key || body.idempotencyKey;
  if (typeof fromBody === 'string' && fromBody.length >= 8) {
    return fromBody.slice(0, 200);
  }
  if (typeof signature === 'string' && signature.length >= 8) {
    return signature.slice(0, 200);
  }
  return null;
}

function mapWebhookStatus(status) {
  const normalized = String(status || '').toLowerCase();
  const statusMap = {
    waiting: 'waiting',
    confirming: 'confirming',
    confirmed: 'confirmed',
    sending: 'confirmed',
    finished: 'completed',
    completed: 'completed',
    failed: 'failed',
    expired: 'expired',
    partially_paid: 'partially_paid',
    refunded: 'refunded',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };

  return statusMap[normalized] || 'pending';
}

function isSuccessfulDepositStatus(status) {
  return status === 'completed';
}

function isTerminalFailureStatus(status) {
  return ['failed', 'expired', 'partially_paid', 'refunded', 'cancelled'].includes(status);
}

function getWebhookPaymentId(body) {
  return body.payment_id ? String(body.payment_id) : '';
}

function getWebhookReferenceId(body) {
  return body.order_id ? String(body.order_id) : '';
}

async function requireDeviceTokenForUser(userId, context) {
  if (!context.deviceToken) {
    throw new HttpError(401, 'Device session token is required.', {
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

async function createDeposit(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);

  const deviceToken = await requireDeviceTokenForUser(user.id, requestContext);

  await enforceRateLimit({
    scope: 'payments:deposit',
    identity: user.id,
    limit: DEPOSIT_MAX_PER_MIN,
    windowMs: 60 * 1000,
  });

  const amount = parseAmount(body.amount);
  const currency = normalizeCode(body.currency, 'currency');
  const network = normalizeCode(body.network, 'network');
  const idempotencyKey = requireIdempotencyKey(req, body);
  const referenceId = createIdempotentReferenceId(user.id, idempotencyKey);

  const existingIntent = await pocketBase.findPaymentIntent({ referenceId }).catch(() => null);
  if (existingIntent) {
    if (
      existingIntent.user_id !== user.id ||
      Number(existingIntent.amount) !== amount ||
      String(existingIntent.currency || '').toLowerCase() !== currency ||
      String(existingIntent.network || '').toLowerCase() !== network
    ) {
      throw new HttpError(409, 'Idempotency key conflicts with another deposit.', {
        code: 'idempotency_key_conflict',
      });
    }
    sendJson(res, 200, {
      success: true,
      idempotent_replay: true,
      payment: {
        id: existingIntent.id,
        reference_id: existingIntent.reference_id,
        payment_id: existingIntent.nowpayments_payment_id,
        payment_address: existingIntent.payment_address,
        payment_url: existingIntent.payment_url,
        status: existingIntent.status,
        amount: Number(existingIntent.amount || amount),
        currency: existingIntent.currency,
        network: existingIntent.network,
        expires_at: existingIntent.expires_at,
      },
    });
    return;
  }

  try {
    const minimumAmount = await nowPayments.getMinimumAmount({
      currencyFrom: currency,
      currencyTo: network,
    });

    if (minimumAmount && amount < minimumAmount) {
      throw new HttpError(
        400,
        `Minimum deposit amount for ${network.toUpperCase()} is ${minimumAmount.toFixed(2)} ${currency.toUpperCase()}.`,
        {
          code: 'minimum_deposit_amount',
          min_amount: minimumAmount,
          currency,
          network,
        },
      );
    }

    const payment = await nowPayments.createPayment({
      amount,
      currency,
      network,
      referenceId,
    });

    if (!payment.paymentId) {
      throw new HttpError(502, 'Payment provider did not return a payment id.');
    }

    const intent = await pocketBase.createPaymentIntent({
      userId: user.id,
      amount,
      currency,
      network,
      referenceId,
      nowPaymentsPaymentId: payment.paymentId,
      paymentAddress: payment.paymentAddress,
      paymentUrl: payment.paymentUrl,
      status: payment.status,
      expiresAt: payment.expiresAt,
    });

    pocketBase.touchDeviceToken(deviceToken.id).catch(() => {});

    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'payments.create_deposit',
      ...requestContext,
      metadata: {
        amount,
        currency,
        network,
        reference_id: referenceId,
        nowpayments_payment_id: payment.paymentId,
        payment_intent_id: intent.id,
        status: payment.status,
      },
    });

    sendJson(res, 201, {
      success: true,
      payment: {
        id: intent.id,
        reference_id: referenceId,
        payment_id: payment.paymentId,
        payment_address: payment.paymentAddress,
        payment_url: payment.paymentUrl,
        status: payment.status,
        amount,
        currency,
        network,
        expires_at: payment.expiresAt,
      },
    });
  } catch (error) {
    const providerErrorCode = getCreateDepositErrorCode(error);
    await pocketBase.createAuditLog({
      userId: user.id,
      action: 'payments.create_deposit_failed',
      ...requestContext,
      metadata: {
        amount,
        currency,
        network,
        reference_id: referenceId,
        reason_code: error.details?.code || providerErrorCode || 'provider_error',
      },
    });
    if (!error.details?.code) {
      if (providerErrorCode === 'deposit_currency_unavailable') {
        throw new HttpError(400, 'Selected crypto network is not available right now.', {
          code: providerErrorCode,
          currency,
          network,
        });
      }

      throw new HttpError(503, 'Deposit provider is temporarily unavailable.', {
        code: 'deposit_provider_unavailable',
      });
    }
    throw error;
  }
}

function getCreateDepositErrorCode(error) {
  if (error.status >= 400 && error.status < 500) {
    return 'deposit_currency_unavailable';
  }

  return 'deposit_provider_unavailable';
}

async function depositCurrencies(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const requestContext = getRequestContext(req);
  await requireDeviceTokenForUser(user.id, requestContext);

  const currencies = await nowPayments.getMerchantCurrencies();
  sendJson(res, 200, {
    success: true,
    currencies: currencies.map(({ popular_rank, ...currency }) => currency),
  });
}

async function nowPaymentsWebhook(req, res) {
  const { raw, body } = await parseRawJsonBody(req);
  const requestContext = getRequestContext(req);
  const signature = req.headers['x-nowpayments-sig'];

  if (!isWebhookSourceAllowed(requestContext)) {
    await pocketBase.createAuditLog({
      action: 'payments.webhook_source_rejected',
      ...requestContext,
      metadata: {
        ip_address: requestContext.ipAddress || '',
      },
    }).catch(() => {});
    throw new HttpError(403, 'Webhook source is not allowed.', {
      code: 'webhook_source_denied',
    });
  }

  try {
    verifyNowPaymentsSignature(raw, signature, config.nowPayments.ipnSecretKey);
  } catch (error) {
    if (error.code === 'ipn_secret_missing') {
      throw new HttpError(500, 'NOWPayments IPN secret is not configured.');
    }
    if (error.code === 'signature_missing' || error.code === 'signature_format') {
      throw new HttpError(401, error.message);
    }
    throw new HttpError(401, 'Invalid NOWPayments signature.');
  }

  const timestampCandidate = Number(body.timestamp || body.created_at || body.updated_at || 0);
  if (timestampCandidate && !isFreshWebhookTimestamp(timestampCandidate, config.nowPayments.ipnMaxAgeSeconds)) {
    await pocketBase.createAuditLog({
      action: 'payments.webhook_stale_timestamp',
      ...requestContext,
      metadata: {
        timestamp: timestampCandidate,
        max_age_seconds: config.nowPayments.ipnMaxAgeSeconds,
      },
    }).catch(() => {});
    throw new HttpError(401, 'Webhook timestamp is outside the allowed window.', {
      code: 'webhook_timestamp_expired',
    });
  }

  const nonce = await extractWebhookNonce(body, signature);
  if (nonce) {
    const recorded = await pocketBase
      .recordWebhookNonce(nonce, 'nowpayments', WEBHOOK_NONCE_TTL_MS)
      .catch((error) => {
        if (error.status === 409) {
          return { accepted: false, reason: 'duplicate' };
        }
        throw error;
      });
    if (!recorded.accepted) {
      await pocketBase.createAuditLog({
        action: 'payments.webhook_replay_rejected',
        ...requestContext,
        metadata: {
          nonce_prefix: nonce.slice(0, 12),
          reason: recorded.reason || 'unknown',
        },
      }).catch(() => {});
      throw new HttpError(409, 'Webhook replay detected.', {
        code: 'webhook_replay_detected',
      });
    }
  }

  await enforceRateLimit({
    scope: 'payments:webhook',
    identity: requestContext.ipAddress || 'unknown',
    limit: WEBHOOK_MAX_PER_MIN,
    windowMs: 60 * 1000,
  });

  const paymentId = getWebhookPaymentId(body);
  const referenceId = getWebhookReferenceId(body);
  const providerStatus = String(body.payment_status || body.status || '').toLowerCase();
  const status = mapWebhookStatus(providerStatus);

  if (!paymentId && !referenceId) {
    throw new HttpError(400, 'Webhook payment_id or order_id is required.');
  }

  const intent = await pocketBase.findPaymentIntent({ paymentId, referenceId });
  if (!intent) {
    await pocketBase.createAuditLog({
      action: 'payments.webhook_unknown_intent',
      ...requestContext,
      metadata: {
        nowpayments_payment_id: paymentId,
        reference_id: referenceId,
        provider_status: providerStatus,
      },
    });
    sendJson(res, 202, { success: true, received: true });
    return;
  }

  const transactionReference = intent.reference_id || referenceId || `dep_${paymentId}`;
  if (paymentId && intent.nowpayments_payment_id && paymentId !== intent.nowpayments_payment_id) {
    throw new HttpError(400, 'Webhook payment_id does not match the payment intent.');
  }

  if (referenceId && intent.reference_id && referenceId !== intent.reference_id) {
    throw new HttpError(400, 'Webhook order_id does not match the payment intent.');
  }

  if (isSuccessfulDepositStatus(status)) {
    if (intent.credit_applied_at) {
      await pocketBase.createAuditLog({
        userId: intent.user_id,
        action: 'payments.webhook_duplicate',
        ...requestContext,
        metadata: {
          payment_intent_id: intent.id,
          nowpayments_payment_id: paymentId,
          reference_id: transactionReference,
          status,
        },
      });
      sendJson(res, 200, { success: true, received: true, duplicate: true });
      return;
    }

    const providerPriceAmount = Number(body.price_amount || 0);
    const providerActuallyPaid = Number(body.actually_paid || 0);
    const intentAmount = Number(intent.amount || 0);
    const paidCheckValue = providerActuallyPaid > 0 ? providerActuallyPaid : providerPriceAmount;
    if (paidCheckValue > 0 && paidCheckValue + 0.000001 < intentAmount) {
      await pocketBase.createAuditLog({
        userId: intent.user_id,
        action: 'payments.webhook_underpaid_not_credited',
        ...requestContext,
        metadata: {
          payment_intent_id: intent.id,
          nowpayments_payment_id: paymentId,
          reference_id: transactionReference,
          intent_amount: intentAmount,
          provider_price_amount: providerPriceAmount,
          provider_actually_paid: providerActuallyPaid,
        },
      });
      sendJson(res, 200, { success: true, received: true, status: 'underpaid_not_credited' });
      return;
    }

    if (!Number.isFinite(intentAmount) || intentAmount <= 0) {
      throw new HttpError(400, 'Payment intent amount is invalid.');
    }

    const claim = await pocketBase.claimPaymentIntentCredit(intent.id);
    if (!claim.claimed) {
      await pocketBase.createAuditLog({
        userId: intent.user_id,
        action: 'payments.webhook_duplicate',
        ...requestContext,
        metadata: {
          payment_intent_id: intent.id,
          nowpayments_payment_id: paymentId,
          reference_id: transactionReference,
          status,
        },
      });
      sendJson(res, 200, { success: true, received: true, duplicate: true });
      return;
    }

    let transaction;
    try {
      transaction = await pocketBase.findTransactionByReference(transactionReference);
      if (!transaction) {
        transaction = await pocketBase.createDepositTransaction({
          userId: intent.user_id,
          amount: intentAmount,
          currency: intent.currency,
          status: 'pending',
          providerPaymentId: paymentId || intent.nowpayments_payment_id,
          walletAddress: intent.payment_address,
          network: intent.network,
          referenceId: transactionReference,
          note: `NOWPayments deposit ${providerStatus}`,
        });
      }
    } catch (error) {
      const duplicate = await pocketBase.findTransactionByReference(transactionReference);
      if (duplicate) {
        transaction = duplicate;
      } else {
        throw error;
      }
    }

    const completedTransaction = await pocketBase.completeTransaction(transaction);
    await pocketBase.markTransactionCreditApplied(completedTransaction.id);

    const wallet = await pocketBase.ensureWallet(intent.user_id, intent.currency);
    const refreshedWallet = await pocketBase.getWalletById(wallet.id) || wallet;
    const updatedWallet = await pocketBase.reconcileWalletBalance(
      refreshedWallet,
      'payments.webhook_deposit_completed',
    );

    await pocketBase.updatePaymentIntent(intent.id, {
      status: 'completed',
    });

    await pocketBase.createAuditLog({
      userId: intent.user_id,
      action: 'payments.webhook_deposit_completed',
      ...requestContext,
      metadata: {
        payment_intent_id: intent.id,
        transaction_id: completedTransaction.id,
        wallet_id: updatedWallet.id,
        amount: intentAmount,
        currency: intent.currency,
        nowpayments_payment_id: paymentId,
        reference_id: transactionReference,
        provider_status: providerStatus,
      },
    });

    sendJson(res, 200, { success: true, received: true, status: 'completed' });
    return;
  }

  await pocketBase.updatePaymentIntent(intent.id, {
    status,
    nowpayments_payment_id: paymentId || intent.nowpayments_payment_id,
  });

  if (isTerminalFailureStatus(status)) {
    let reversalTransaction = null;
    if (intent.credit_applied_at) {
      const reversalReference = `rev_${transactionReference}_${status}`.slice(0, 120);
      reversalTransaction = await pocketBase.findTransactionByReference(reversalReference);
      if (!reversalTransaction) {
        reversalTransaction = await pocketBase.createDepositReversalTransaction({
          userId: intent.user_id,
          amount: Number(intent.amount || 0),
          currency: intent.currency,
          network: intent.network,
          providerPaymentId: paymentId || intent.nowpayments_payment_id,
          referenceId: reversalReference,
          note: `NOWPayments deposit reversal ${status}`,
        });
      }
      const wallet = await pocketBase.ensureWallet(intent.user_id, intent.currency);
      const refreshedWallet = await pocketBase.getWalletById(wallet.id) || wallet;
      await pocketBase.reconcileWalletBalance(
        refreshedWallet,
        'payments.webhook_deposit_reversed',
      );
    }

    await pocketBase.createAuditLog({
      userId: intent.user_id,
      action: 'payments.webhook_deposit_not_completed',
      ...requestContext,
      metadata: {
        payment_intent_id: intent.id,
        nowpayments_payment_id: paymentId,
        reference_id: transactionReference,
        provider_status: providerStatus,
        status,
        reversal_transaction_id: reversalTransaction?.id || '',
      },
    });

    sendJson(res, 200, { success: true, received: true, status });
    return;
  }

  await pocketBase.createAuditLog({
    userId: intent.user_id,
    action: 'payments.webhook_deposit_status_updated',
    ...requestContext,
    metadata: {
      payment_intent_id: intent.id,
      nowpayments_payment_id: paymentId,
      reference_id: transactionReference,
      provider_status: providerStatus,
      status,
    },
  });

  sendJson(res, 200, { success: true, received: true, status });
}

module.exports = {
  createIdempotentReferenceId,
  createDeposit,
  depositCurrencies,
  nowPaymentsWebhook,
  isWebhookSourceAllowed,
  isFreshWebhookTimestamp,
  requireIdempotencyKey,
};
