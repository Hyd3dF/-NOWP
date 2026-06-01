const crypto = require('node:crypto');
const { config } = require('../config');
const { HttpError, getBearerToken, getRequestContext, parseJsonBody, sendJson } = require('../http');
const { pocketBase } = require('../pocketbase');

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'amount must be a positive number.', {
      code: 'invalid_amount',
    });
  }

  return Math.round(amount * 100) / 100;
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

async function sendTransfer(req, res) {
  const token = getBearerToken(req);
  const sender = await pocketBase.authenticateBearer(token);
  const body = await parseJsonBody(req);
  const requestContext = getRequestContext(req);

  const receiverUserId = String(body.receiver_user_id || body.recipient_id || '').trim();
  const amount = parseAmount(body.amount);
  const currency = normalizeCurrency(body.currency);
  const note = sanitizeNote(body.note);
  const referenceId = createReferenceId();

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

  pocketBase.verifyUserPin(sender, body.pin);

  const receiver = await pocketBase.getUserById(receiverUserId);
  if (!receiver) {
    throw new HttpError(404, 'Receiver was not found.', {
      code: 'receiver_not_found',
    });
  }

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

  const senderWallet = await pocketBase.ensureWallet(sender.id, currency);
  const availableBalance = Number(senderWallet.balance || 0) - Number(senderWallet.locked_balance || 0);
  if (!Number.isFinite(availableBalance) || availableBalance < amount) {
    throw new HttpError(409, 'Insufficient wallet balance.', {
      code: 'insufficient_balance',
    });
  }

  const receiverWallet = await pocketBase.ensureWallet(receiver.id, currency);
  let transaction;

  try {
    await pocketBase.updateWalletForInternalTransfer(senderWallet, -amount);
    await pocketBase.updateWalletForInternalTransfer(receiverWallet, amount);
    transaction = await pocketBase.createInternalTransferTransaction({
      senderUserId: sender.id,
      receiverUserId: receiver.id,
      amount,
      currency,
      referenceId,
      note,
    });
  } catch (error) {
    await pocketBase.createAuditLog({
      userId: sender.id,
      action: 'transfers.send_failed',
      ...requestContext,
      metadata: {
        receiver_user_id_hash: hashForAudit(receiverUserId),
        amount,
        currency,
        reference_id: referenceId,
        reason_code: error.details?.code || 'transfer_failed',
      },
    });
    throw error;
  }

  await pocketBase.createAuditLog({
    userId: sender.id,
    action: 'transfers.send_completed',
    ...requestContext,
    metadata: {
      transaction_id: transaction.id,
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
      transaction_id: transaction.id,
      sender_user_id_hash: hashForAudit(sender.id),
      amount,
      currency,
      reference_id: referenceId,
    },
  });

  sendJson(res, 201, {
    success: true,
    transaction: {
      id: transaction.id,
      sender_id: sender.id,
      receiver_id: receiver.id,
      amount,
      currency,
      type: 'send',
      status: 'completed',
      reference_id: referenceId,
      created_at: transaction.created_at || transaction.created,
    },
  });
}

function hashForAudit(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

module.exports = {
  sendTransfer,
};
