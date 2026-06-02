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

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive number.');
  }
  return amount;
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

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortObject(value[key]);
        return result;
      }, {});
  }

  return value;
}

function verifyNowPaymentsSignature(body, receivedSignature) {
  if (!config.nowPayments.ipnSecretKey) {
    throw new HttpError(500, 'NOWPayments IPN secret is not configured.');
  }

  if (!receivedSignature) {
    throw new HttpError(401, 'Missing NOWPayments signature.');
  }

  const sortedBody = JSON.stringify(sortObject(body));
  const expectedSignature = crypto
    .createHmac('sha512', config.nowPayments.ipnSecretKey.trim())
    .update(sortedBody)
    .digest('hex');

  const expected = Buffer.from(expectedSignature, 'hex');
  const receivedValue = String(receivedSignature).trim();
  if (!/^[a-f0-9]+$/i.test(receivedValue)) {
    throw new HttpError(401, 'Invalid NOWPayments signature.');
  }

  const received = Buffer.from(receivedValue, 'hex');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new HttpError(401, 'Invalid NOWPayments signature.');
  }
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

async function createDeposit(req, res) {
  const token = getBearerToken(req);
  const user = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);

  const amount = parseAmount(body.amount);
  const currency = normalizeCode(body.currency, 'currency');
  const network = normalizeCode(body.network, 'network');
  const referenceId = createReferenceId(user.id);

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
  await pocketBase.authenticateBearer(token);

  const currencies = await nowPayments.getMerchantCurrencies();
  sendJson(res, 200, {
    success: true,
    currencies: currencies.map(({ popular_rank, ...currency }) => currency),
  });
}

async function nowPaymentsWebhook(req, res) {
  const { body } = await parseRawJsonBody(req);
  const requestContext = getRequestContext(req);
  const signature = req.headers['x-nowpayments-sig'];

  verifyNowPaymentsSignature(body, signature);

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

  const existingTransaction = await pocketBase.findTransactionByReference(transactionReference);

  await pocketBase.updatePaymentIntent(intent.id, {
    status,
    nowpayments_payment_id: paymentId || intent.nowpayments_payment_id,
  });

  if (existingTransaction?.status === 'completed') {
    await pocketBase.createAuditLog({
      userId: intent.user_id,
      action: 'payments.webhook_duplicate',
      ...requestContext,
      metadata: {
        payment_intent_id: intent.id,
        transaction_id: existingTransaction.id,
        nowpayments_payment_id: paymentId,
        reference_id: transactionReference,
        status,
      },
    });

    sendJson(res, 200, { success: true, received: true, duplicate: true });
    return;
  }

  if (isSuccessfulDepositStatus(status)) {
    const providerPriceAmount = Number(body.price_amount || 0);
    if (providerPriceAmount && providerPriceAmount + 0.000001 < Number(intent.amount || 0)) {
      await pocketBase.createAuditLog({
        userId: intent.user_id,
        action: 'payments.webhook_underpaid_not_credited',
        ...requestContext,
        metadata: {
          payment_intent_id: intent.id,
          nowpayments_payment_id: paymentId,
          reference_id: transactionReference,
          intent_amount: Number(intent.amount || 0),
          provider_price_amount: providerPriceAmount,
        },
      });
      sendJson(res, 200, { success: true, received: true, status: 'underpaid_not_credited' });
      return;
    }

    const amount = Number(intent.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'Payment intent amount is invalid.');
    }

    let transaction;
    try {
      transaction = existingTransaction || (await pocketBase.createDepositTransaction({
        userId: intent.user_id,
        amount,
        currency: intent.currency,
        status: 'pending',
        providerPaymentId: paymentId || intent.nowpayments_payment_id,
        walletAddress: intent.payment_address,
        network: intent.network,
        referenceId: transactionReference,
        note: `NOWPayments deposit ${providerStatus}`,
      }));
    } catch (error) {
      const duplicate = await pocketBase.findTransactionByReference(transactionReference);
      if (duplicate) {
        await pocketBase.createAuditLog({
          userId: intent.user_id,
          action: 'payments.webhook_duplicate',
          ...requestContext,
          metadata: {
            payment_intent_id: intent.id,
            transaction_id: duplicate.id,
            nowpayments_payment_id: paymentId,
            reference_id: transactionReference,
            status,
          },
        });
        sendJson(res, 200, { success: true, received: true, duplicate: true });
        return;
      }
      throw error;
    }

    const wallet = await pocketBase.ensureWallet(intent.user_id, intent.currency);
    const updatedWallet = await pocketBase.updateWalletBalance(wallet, amount);

    await pocketBase.updatePaymentIntent(intent.id, {
      status: 'completed',
    });
    await pocketBase.completeTransaction(transaction);

    await pocketBase.createAuditLog({
      userId: intent.user_id,
      action: 'payments.webhook_deposit_completed',
      ...requestContext,
      metadata: {
        payment_intent_id: intent.id,
        transaction_id: transaction.id,
        wallet_id: updatedWallet.id,
        amount,
        currency: intent.currency,
        nowpayments_payment_id: paymentId,
        reference_id: transactionReference,
        provider_status: providerStatus,
      },
    });

    sendJson(res, 200, { success: true, received: true, status: 'completed' });
    return;
  }

  if (isTerminalFailureStatus(status)) {
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
  createDeposit,
  depositCurrencies,
  nowPaymentsWebhook,
};
