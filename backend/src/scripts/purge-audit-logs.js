#!/usr/bin/env node
const { pocketBase } = require('../pocketbase');
const logger = require('../logger');

const DEFAULT_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS || 90);
const FINANCIAL_RETENTION_DAYS = Number(process.env.AUDIT_LOG_FINANCIAL_RETENTION_DAYS || 365);
const PROTECTED_ACTIONS = [
  'transfers.send_completed',
  'transfers.receive_completed',
  'deposits.crash_recovery_completed',
  'payments.webhook_replay_rejected',
  'payments.webhook_stale_timestamp',
  'payments.webhook_source_rejected',
  'wallets.balance_tamper_corrected',
  'wallets.transaction_tamper_detected',
  'wallets.negative_ledger_detected',
];

function cutoffIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function deletePage(filter) {
  const encoded = encodeURIComponent(filter);
  const listed = await pocketBase.adminRequest(
    `/api/collections/audit_logs/records?filter=${encoded}&perPage=500&fields=id,action`,
  );
  const items = listed.items || [];
  if (!items.length) return 0;
  for (const item of items) {
    await pocketBase
      .adminRequest(`/api/collections/audit_logs/records/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      })
      .catch(() => {});
  }
  return items.length;
}

async function purgeNonFinancialOlderThan(days) {
  const cutoff = cutoffIso(days);
  const protectedFilter = PROTECTED_ACTIONS.map((action) => `action != "${action}"`).join(' && ');
  const filter = `created_at < "${cutoff}" && ${protectedFilter}`;
  let total = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const deleted = await deletePage(filter);
    total += deleted;
    if (deleted < 500) break;
  }
  return total;
}

async function purgeFinancialOlderThan(days) {
  const cutoff = cutoffIso(days);
  const financialFilter = PROTECTED_ACTIONS.map((action) => `action = "${action}"`).join(' || ');
  const filter = `created_at < "${cutoff}" && (${financialFilter})`;
  let total = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const deleted = await deletePage(filter);
    total += deleted;
    if (deleted < 500) break;
  }
  return total;
}

async function run() {
  logger.info('audit_retention_start', {
    non_financial_days: DEFAULT_RETENTION_DAYS,
    financial_days: FINANCIAL_RETENTION_DAYS,
  });
  const nonFinancial = await purgeNonFinancialOlderThan(DEFAULT_RETENTION_DAYS);
  const financial = await purgeFinancialOlderThan(FINANCIAL_RETENTION_DAYS);
  logger.info('audit_retention_done', { non_financial_deleted: nonFinancial, financial_deleted: financial });
}

if (require.main === module) {
  run().catch((error) => {
    logger.fatal('audit_retention_failed', { message: error.message });
    process.exit(1);
  });
}

module.exports = { run, purgeNonFinancialOlderThan, purgeFinancialOlderThan };
