#!/usr/bin/env node
const path = require('node:path');
const { pocketBase } = require('../pocketbase');
const { config } = require('../config');
const { nowPayments } = require('../nowpayments');
const logger = require('../logger');

const DRY_RUN = process.env.RECONCILE_DRY_RUN === 'true';

async function reconcileIntent(intent, options = {}) {
  const intentId = intent.id;
  const claimedAt = intent.credit_applied_at;
  let providerStatus = '';
  if (!claimedAt) {
    if (!intent.nowpayments_payment_id) {
      return { skipped: true, reason: 'not_claimed' };
    }
    const provider = await getProviderStatus(intent, options);
    providerStatus = provider.status;
    if (!isProviderCompleted(provider.status)) {
      return { skipped: true, reason: 'provider_not_completed', provider_status: provider.status };
    }
  }

  const referenceId = intent.reference_id || intent.order_id || `dep_${intentId}`;
  const user = await pocketBase.getUserById(intent.user_id).catch(() => null);
  if (!user) {
    return { skipped: true, reason: 'user_missing' };
  }

  const amount = Number(intent.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { skipped: true, reason: 'invalid_amount' };
  }

  const currency = String(intent.currency || config.defaultWalletCurrency || 'TRY').toUpperCase();
  const wallet = await pocketBase.ensureWalletForUser(user, currency).catch(() => null);
  if (!wallet) {
    return { skipped: true, reason: 'wallet_missing' };
  }

  const existing = await pocketBase.findTransactionByReferenceId(referenceId).catch(() => null);
  if (existing && existing.credit_applied_at && existing.status === 'completed') {
    await pocketBase.reconcileWalletBalance(wallet, 'deposits.reconcile_already_applied').catch(() => null);
    return { skipped: true, reason: 'already_applied', transactionId: existing.id };
  }

  if (options.dryRun || DRY_RUN) {
    return { skipped: true, reason: 'dry_run', would_credit: amount, provider_status: providerStatus };
  }

  if (!claimedAt) {
    const claim = await pocketBase.claimPaymentIntentCredit(intentId);
    if (!claim.claimed) {
      return { skipped: true, reason: 'already_claimed' };
    }
  }

  let transaction = existing
    ? existing
    : await pocketBase.createTransaction({
        user_id: intent.user_id,
        type: 'deposit',
        amount,
        currency,
        status: 'completed',
        reference_id: referenceId,
        metadata: { source: 'reconcile_job', intent_id: intentId },
      });

  if (transaction.status !== 'completed') {
    transaction = await pocketBase.completeTransaction(transaction);
  }
  await pocketBase.markTransactionCreditApplied(transaction.id);

  const credited = await pocketBase.reconcileWalletBalance(
    wallet,
    'deposits.crash_recovery_completed',
  );

  await pocketBase.createAuditLog({
    userId: intent.user_id,
    action: 'deposits.crash_recovery_completed',
    metadata: {
      intent_id: intentId,
      transaction_id: transaction.id,
      wallet_id: credited?.id,
      amount,
      currency,
      reference_id: referenceId,
    },
  }).catch(() => {});

  return {
    reconciled: true,
    transactionId: transaction.id,
    walletId: credited?.id,
    amount,
  };
}

async function getProviderStatus(intent, options = {}) {
  if (options.providerStatus) return { status: options.providerStatus };
  if (options.nowPaymentsClient?.getPaymentStatus) {
    return options.nowPaymentsClient.getPaymentStatus(intent.nowpayments_payment_id);
  }
  return nowPayments.getPaymentStatus(intent.nowpayments_payment_id);
}

function isProviderCompleted(status) {
  return ['completed', 'finished', 'confirmed'].includes(String(status || '').toLowerCase());
}

async function run(options = {}) {
  const startedAt = new Date().toISOString();
  const dryRun = options.dryRun || DRY_RUN;
  logger.info('reconcile_start', { dry_run: dryRun, started_at: startedAt });
  const intents = await pocketBase.findStaleIntentsWithClaimButNoTransaction();
  logger.info('reconcile_stale_intents_detected', { count: intents.length });

  const summary = { reconciled: 0, skipped: 0, errors: 0 };
  for (const intent of intents) {
    try {
      const result = await reconcileIntent(intent, options);
      if (result.reconciled) {
        summary.reconciled += 1;
        logger.info('reconcile_intent_completed', {
          intent_id: intent.id,
          transaction_id: result.transactionId,
          amount: result.amount,
        });
      } else {
        summary.skipped += 1;
        logger.warn('reconcile_intent_skipped', { intent_id: intent.id, reason: result.reason });
      }
    } catch (error) {
      summary.errors += 1;
      logger.error('reconcile_intent_failed', { intent_id: intent.id, message: error.message });
    }
  }

  await pocketBase
    .createAuditLog({
      action: 'deposits.reconcile_sweep_completed',
      metadata: {
        dry_run: dryRun,
        reconciled: summary.reconciled,
        skipped: summary.skipped,
        errors: summary.errors,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      },
    })
    .catch(() => {});

  logger.info('reconcile_done', { summary });
  return summary;
}

if (require.main === module) {
  run().then((summary) => {
    process.exit(summary.errors > 0 ? 1 : 0);
  }).catch((error) => {
    logger.fatal('reconcile_aborted', { message: error.message });
    process.exit(1);
  });
}

module.exports = { reconcileIntent, run, isProviderCompleted };
