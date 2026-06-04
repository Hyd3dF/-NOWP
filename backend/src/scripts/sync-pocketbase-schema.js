const { pocketBase } = require('../pocketbase');

const USERS_COLLECTION_ID = '_pb_users_auth_';

function urlField(name, options = {}) {
  return {
    name,
    type: 'url',
    required: Boolean(options.required),
    hidden: false,
    system: false,
    presentable: false,
    exceptDomains: [],
    onlyDomains: [],
  };
}

function textField(name, options = {}) {
  return {
    name,
    type: 'text',
    required: Boolean(options.required),
    hidden: false,
    system: false,
    min: options.min || 0,
    max: options.max || 0,
    pattern: options.pattern || '',
    autogeneratePattern: '',
    primaryKey: false,
    presentable: false,
  };
}

function dateField(name, required = false) {
  return {
    name,
    type: 'date',
    required,
    hidden: false,
    system: false,
    min: '',
    max: '',
    presentable: false,
  };
}

function jsonField(name, maxSize = 4000) {
  return {
    name,
    type: 'json',
    required: false,
    hidden: false,
    system: false,
    maxSize,
    presentable: false,
  };
}

function boolField(name, required = false) {
  return {
    name,
    type: 'bool',
    required,
    hidden: false,
    system: false,
    presentable: false,
  };
}

function numberField(name, options = {}) {
  return {
    name,
    type: 'number',
    required: Boolean(options.required),
    hidden: false,
    system: false,
    min: options.min ?? null,
    max: options.max ?? null,
    onlyInt: Boolean(options.onlyInt),
    presentable: false,
  };
}

function relationField(name, collectionId, options = {}) {
  return {
    name,
    type: 'relation',
    required: Boolean(options.required),
    hidden: false,
    system: false,
    collectionId,
    cascadeDelete: Boolean(options.cascadeDelete),
    minSelect: 0,
    maxSelect: 1,
    presentable: false,
  };
}

async function getCollection(name) {
  try {
    return await pocketBase.adminRequest(`/api/collections/${encodeURIComponent(name)}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function ensureCollection(name, fields) {
  const existing = await getCollection(name);
  if (existing) return existing;

  const collection = await pocketBase.adminRequest('/api/collections', {
    method: 'POST',
    body: {
      name,
      type: 'base',
      fields,
      indexes: [],
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  });
  console.log(`Created collection: ${name}`);
  return collection;
}

async function ensureFields(collectionName, requiredFields) {
  const collection = await getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionName}`);
  }

  const fields = collection.fields || collection.schema || [];
  const existingNames = new Set(fields.map((field) => field.name));
  const missingFields = requiredFields.filter((field) => !existingNames.has(field.name));
  if (!missingFields.length) {
    console.log(`Collection already up to date: ${collectionName}`);
    return collection;
  }

  const updated = await pocketBase.adminRequest(`/api/collections/${encodeURIComponent(collection.id)}`, {
    method: 'PATCH',
    body: {
      fields: [...fields, ...missingFields],
    },
  });

  console.log(
    `Updated collection ${collectionName}: added ${missingFields.map((field) => field.name).join(', ')}`,
  );
  return updated;
}

async function ensureIndexes(collectionName, requiredIndexes) {
  const collection = await getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionName}`);
  }

  const indexes = collection.indexes || [];
  const existingIndexNames = new Set(indexes.map(getIndexName).filter(Boolean));
  const missingIndexes = requiredIndexes.filter((index) => {
    const indexName = getIndexName(index);
    return indexName ? !existingIndexNames.has(indexName) : !indexes.includes(index);
  });
  if (!missingIndexes.length) {
    console.log(`Indexes already up to date: ${collectionName}`);
    return collection;
  }

  let current = collection;
  let currentIndexes = indexes;
  let added = 0;
  for (const index of missingIndexes) {
    try {
      current = await pocketBase.adminRequest(`/api/collections/${encodeURIComponent(collection.id)}`, {
        method: 'PATCH',
        body: {
          indexes: [...currentIndexes, index],
        },
      });
      currentIndexes = current.indexes || [...currentIndexes, index];
      added += 1;
    } catch (error) {
      console.warn(`Skipped index ${collectionName}.${getIndexName(index) || 'unnamed'}: ${error.message}`);
    }
  }

  if (added) {
    console.log(`Updated indexes ${collectionName}: added ${added}`);
  } else {
    console.log(`No indexes added for ${collectionName}`);
  }
  return current;
}

async function ensureRules(collectionName, rules) {
  const collection = await getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionName}`);
  }

  const patch = {};
  for (const [key, value] of Object.entries(rules)) {
    if ((collection[key] ?? null) !== value) {
      patch[key] = value;
    }
  }

  if (!Object.keys(patch).length) {
    console.log(`Rules already up to date: ${collectionName}`);
    return collection;
  }

  const updated = await pocketBase.adminRequest(`/api/collections/${encodeURIComponent(collection.id)}`, {
    method: 'PATCH',
    body: patch,
  });
  console.log(`Updated rules ${collectionName}: ${Object.keys(patch).join(', ')}`);
  return updated;
}

function getIndexName(indexSql) {
  const match = String(indexSql || '').match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+`?([a-zA-Z0-9_:-]+)`?/i);
  return match?.[1] || '';
}

async function main() {
  const friendships = await getCollection('friendships');
  if (!friendships) {
    throw new Error('Collection not found: friendships');
  }

  await ensureFields('friend_requests', [
    textField('pair_key', { max: 80 }),
  ]);

  await ensureIndexes('friend_requests', [
    "CREATE UNIQUE INDEX `idx_friend_requests_pair_key` ON `friend_requests` (`pair_key`) WHERE `pair_key` != ''",
  ]);

  await ensureIndexes('friendships', [
    "CREATE UNIQUE INDEX `idx_friendships_pair` ON `friendships` (`user_a_id`, `user_b_id`)",
  ]);

  const chatThreads = await ensureCollection('chat_threads', [
    relationField('friendship_id', friendships.id),
    relationField('user_a_id', USERS_COLLECTION_ID, { required: true }),
    relationField('user_b_id', USERS_COLLECTION_ID, { required: true }),
    textField('last_message', { max: 1000 }),
    dateField('last_message_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('chat_messages', [
    relationField('thread_id', chatThreads.id, { required: true, cascadeDelete: true }),
    relationField('sender_user_id', USERS_COLLECTION_ID, { required: true }),
    relationField('receiver_user_id', USERS_COLLECTION_ID, { required: true }),
    textField('message', { required: true, min: 1, max: 2000 }),
    textField('status', { required: true, max: 24 }),
    textField('message_type', { max: 40 }),
    jsonField('metadata', 4000),
    dateField('created_at'),
    dateField('delivered_at'),
    dateField('read_at'),
  ]);

  await ensureFields('chat_messages', [
    textField('message_type', { max: 40 }),
    jsonField('metadata', 4000),
    dateField('delivered_at'),
    dateField('read_at'),
  ]);

  const notifications = await ensureCollection('notifications', [
    textField('title', { required: true, min: 1, max: 120 }),
    textField('body', { required: true, min: 1, max: 1000 }),
    textField('type', { max: 40 }),
    textField('image_url', { max: 500 }),
    textField('icon', { max: 60 }),
    textField('link_url', { max: 500 }),
    textField('audience', { required: true, max: 40 }),
    textField('status', { required: true, max: 40 }),
    jsonField('metadata', 4000),
    dateField('published_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('notification_reads', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    relationField('notification_id', notifications.id, { required: true, cascadeDelete: true }),
    dateField('read_at'),
    dateField('created_at'),
  ]);

  await ensureFields('notifications', [
    textField('image_url', { max: 500 }),
    textField('icon', { max: 60 }),
    textField('link_url', { max: 500 }),
    jsonField('metadata', 4000),
    dateField('published_at'),
  ]);

  await ensureCollection('biometric_locks', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('device_id', { required: true, min: 8, max: 140 }),
    boolField('enabled', true),
    textField('device_platform', { max: 40 }),
    textField('device_info', { max: 300 }),
    dateField('last_verified_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('two_factor_settings', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    boolField('enabled', true),
    textField('method', { required: true, max: 40 }),
    boolField('transfer_required', true),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('security_pins', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('pin_hash', { required: true, max: 220 }),
    numberField('failed_attempt_count', { onlyInt: true, min: 0 }),
    dateField('locked_until'),
    dateField('changed_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('password_credentials', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    dateField('changed_at'),
    numberField('strength_score', { onlyInt: true, min: 0, max: 5 }),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('password_reset_tokens', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('token_hash', { required: true, min: 32, max: 128 }),
    dateField('requested_at'),
    dateField('expires_at'),
    dateField('consumed_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureIndexes('password_reset_tokens', [
    'CREATE UNIQUE INDEX `idx_password_reset_tokens_hash` ON `password_reset_tokens` (`token_hash`)',
    'CREATE INDEX `idx_password_reset_tokens_user_expires` ON `password_reset_tokens` (`user_id`, `expires_at`)',
  ]);

  await ensureCollection('webhook_nonces', [
    textField('nonce', { required: true, min: 8, max: 200 }),
    textField('source', { required: true, max: 40 }),
    dateField('received_at'),
    dateField('expires_at'),
  ]);

  await ensureIndexes('webhook_nonces', [
    'CREATE UNIQUE INDEX `idx_webhook_nonces_nonce` ON `webhook_nonces` (`nonce`)',
    "CREATE INDEX `idx_webhook_nonces_expires` ON `webhook_nonces` (`expires_at`)",
  ]);

  await ensureCollection('two_factor_otps', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('code_hash', { required: true, max: 220 }),
    textField('purpose', { required: true, max: 40 }),
    dateField('expires_at'),
    numberField('failed_attempt_count', { onlyInt: true, min: 0 }),
    dateField('last_attempt_at'),
    dateField('consumed_at'),
    textField('context', { max: 500 }),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureIndexes('two_factor_otps', [
    "CREATE INDEX `idx_two_factor_otps_user_purpose` ON `two_factor_otps` (`user_id`, `purpose`, `expires_at`)",
  ]);

  await ensureCollection('device_sessions', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('device_id', { required: true, min: 8, max: 140 }),
    textField('device_platform', { max: 40 }),
    textField('device_info', { max: 300 }),
    textField('last_ip_address', { max: 80 }),
    textField('token_hash', { max: 128 }),
    dateField('first_seen_at'),
    dateField('last_seen_at'),
    dateField('revoked_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('device_tokens', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('token_hash', { required: true, min: 32, max: 128 }),
    textField('device_fingerprint', { required: true, min: 8, max: 140 }),
    textField('device_platform', { max: 40 }),
    textField('device_info', { max: 300 }),
    textField('last_ip_address', { max: 80 }),
    textField('user_agent', { max: 300 }),
    dateField('issued_at'),
    dateField('last_seen_at'),
    dateField('expires_at'),
    dateField('revoked_at'),
    textField('revoked_reason', { max: 80 }),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureIndexes('device_tokens', [
    'CREATE UNIQUE INDEX `idx_device_tokens_token_hash` ON `device_tokens` (`token_hash`)',
  ]);

  await ensureCollection('revoked_bearer_tokens', [
    textField('token_hash', { required: true, min: 32, max: 128 }),
    relationField('user_id', USERS_COLLECTION_ID, { cascadeDelete: true }),
    textField('reason', { max: 80 }),
    dateField('revoked_at'),
    dateField('expires_at'),
    dateField('created_at'),
  ]);

  await ensureIndexes('revoked_bearer_tokens', [
    'CREATE UNIQUE INDEX `idx_revoked_bearer_tokens_hash` ON `revoked_bearer_tokens` (`token_hash`)',
    "CREATE INDEX `idx_revoked_bearer_tokens_expires` ON `revoked_bearer_tokens` (`expires_at`)",
  ]);

  await ensureCollection('user_session_revocations', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    dateField('revoked_after'),
    textField('reason', { max: 80 }),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureIndexes('user_session_revocations', [
    'CREATE UNIQUE INDEX `idx_user_session_revocations_user` ON `user_session_revocations` (`user_id`)',
  ]);

  const paymentIntents = await getCollection('payment_intents');
  if (!paymentIntents) {
    throw new Error('Collection not found: payment_intents');
  }

  await ensureCollection('payment_credit_claims', [
    relationField('payment_intent_id', paymentIntents.id, { required: true, cascadeDelete: true }),
    dateField('claimed_at'),
    dateField('created_at'),
  ]);

  await ensureIndexes('payment_credit_claims', [
    'CREATE UNIQUE INDEX `idx_payment_credit_claims_intent` ON `payment_credit_claims` (`payment_intent_id`)',
  ]);

  await ensureCollection('rate_limit_buckets', [
    textField('bucket_key', { required: true, min: 8, max: 200 }),
    textField('scope', { required: true, max: 40 }),
    dateField('window_start'),
    numberField('count', { onlyInt: true, min: 0 }),
    dateField('expires_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureIndexes('rate_limit_buckets', [
    'CREATE UNIQUE INDEX `idx_rate_limit_buckets_key` ON `rate_limit_buckets` (`bucket_key`)',
    "CREATE INDEX `idx_rate_limit_buckets_expires` ON `rate_limit_buckets` (`expires_at`)",
  ]);

  await ensureCollection('device_security', [
    textField('device_id', { required: true, min: 8, max: 140 }),
    textField('device_platform', { max: 40 }),
    textField('device_info', { max: 300 }),
    textField('week_key', { max: 16 }),
    numberField('account_create_count_week', { onlyInt: true, min: 0 }),
    numberField('login_count_week', { onlyInt: true, min: 0 }),
    jsonField('login_user_ids', 4000),
    relationField('last_user_id', USERS_COLLECTION_ID),
    textField('last_ip_address', { max: 80 }),
    dateField('first_seen_at'),
    dateField('last_seen_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);
  await ensureFields('device_security', [
    textField('device_id', { required: true, min: 8, max: 140 }),
    textField('device_platform', { max: 40 }),
    textField('device_info', { max: 300 }),
    textField('week_key', { max: 16 }),
    numberField('account_create_count_week', { onlyInt: true, min: 0 }),
    numberField('login_count_week', { onlyInt: true, min: 0 }),
    jsonField('login_user_ids', 4000),
    relationField('last_user_id', USERS_COLLECTION_ID),
    textField('last_ip_address', { max: 80 }),
    dateField('first_seen_at'),
    dateField('last_seen_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureCollection('audit_logs', [
    relationField('user_id', USERS_COLLECTION_ID),
    textField('action', { required: true, max: 120 }),
    textField('ip_address', { max: 80 }),
    textField('device_info', { max: 300 }),
    jsonField('metadata', 8000),
    dateField('created_at'),
  ]);
  await ensureFields('audit_logs', [
    relationField('user_id', USERS_COLLECTION_ID),
    textField('action', { required: true, max: 120 }),
    textField('ip_address', { max: 80 }),
    textField('device_info', { max: 300 }),
    jsonField('metadata', 8000),
    dateField('created_at'),
  ]);

  await ensureCollection('payment_profiles', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('payment_tag', { required: true, min: 3, max: 24 }),
    textField('display_name', { max: 120 }),
    textField('qr_payload', { max: 1000 }),
    boolField('is_active'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);
  await ensureFields('payment_profiles', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('payment_tag', { required: true, min: 3, max: 24 }),
    textField('display_name', { max: 120 }),
    textField('qr_payload', { max: 1000 }),
    boolField('is_active'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureFields('wallets', [
    numberField('version', { onlyInt: true, min: 0 }),
  ]);

  await ensureFields('payment_intents', [
    dateField('credit_applied_at'),
  ]);

  await ensureFields('transactions', [
    dateField('credit_applied_at'),
  ]);

  await ensureFields('transactions', [
    textField('integrity_version', { max: 16 }),
    textField('integrity_hash', { max: 128 }),
  ]);
  await ensureIndexes('transactions', [
    "CREATE UNIQUE INDEX `idx_transactions_reference_id` ON `transactions` (`reference_id`) WHERE `reference_id` != ''",
    'CREATE INDEX `idx_transactions_sender_created` ON `transactions` (`sender_user_id`, `created_at`)',
    'CREATE INDEX `idx_transactions_receiver_created` ON `transactions` (`receiver_user_id`, `created_at`)',
    'CREATE INDEX `idx_transactions_user_currency_status` ON `transactions` (`user_id`, `currency`, `status`)',
  ]);
  await ensureIndexes('payment_intents', [
    "CREATE UNIQUE INDEX `idx_payment_intents_reference_id` ON `payment_intents` (`reference_id`) WHERE `reference_id` != ''",
    "CREATE UNIQUE INDEX `idx_payment_intents_nowpayments_payment_id` ON `payment_intents` (`nowpayments_payment_id`) WHERE `nowpayments_payment_id` != ''",
    'CREATE INDEX `idx_payment_intents_user_status` ON `payment_intents` (`user_id`, `status`)',
  ]);
  await ensureIndexes('device_tokens', [
    'CREATE UNIQUE INDEX `idx_device_tokens_token_hash` ON `device_tokens` (`token_hash`)',
    'CREATE INDEX `idx_device_tokens_user_revoked` ON `device_tokens` (`user_id`, `revoked_at`)',
    'CREATE INDEX `idx_device_tokens_user_fingerprint` ON `device_tokens` (`user_id`, `device_fingerprint`)',
  ]);
  await ensureIndexes('device_security', [
    'CREATE INDEX `idx_device_security_device_id` ON `device_security` (`device_id`)',
    'CREATE INDEX `idx_device_security_week` ON `device_security` (`week_key`)',
  ]);
  await ensureIndexes('audit_logs', [
    'CREATE INDEX `idx_audit_logs_action_created` ON `audit_logs` (`action`, `created_at`)',
    'CREATE INDEX `idx_audit_logs_user_created` ON `audit_logs` (`user_id`, `created_at`)',
  ]);
  await ensureIndexes('payment_profiles', [
    "CREATE UNIQUE INDEX `idx_payment_profiles_tag` ON `payment_profiles` (`payment_tag`) WHERE `payment_tag` != ''",
    'CREATE INDEX `idx_payment_profiles_user` ON `payment_profiles` (`user_id`)',
  ]);
  await ensureIndexes('users', [
    "CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`) WHERE `username` != ''",
    "CREATE UNIQUE INDEX `idx_users_phone` ON `users` (`phone`) WHERE `phone` != ''",
  ]);

  const superuserOnlyRules = {
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };
  for (const collectionName of [
    'users',
    'wallets',
    'transactions',
    'payment_intents',
    'notifications',
    'notification_reads',
    'biometric_locks',
    'two_factor_settings',
    'security_pins',
    'password_credentials',
    'password_reset_tokens',
    'webhook_nonces',
    'two_factor_otps',
    'device_sessions',
    'device_tokens',
    'device_security',
    'audit_logs',
    'payment_profiles',
    'payment_credit_claims',
    'rate_limit_buckets',
  ]) {
    await ensureRules(collectionName, superuserOnlyRules);
  }

  if (process.env.OROYA_SCHEMA_SIGN_UNSIGNED_TRANSACTIONS === 'true') {
    const signedTransactions = await pocketBase.signUnsignedTransactions();
    console.log(`Signed unsigned transaction records: ${signedTransactions}`);
  } else {
    console.log('Skipped signing unsigned transaction records.');
  }

  await pocketBase.testConnection();
  console.log('PocketBase schema sync completed safely.');
}

main().catch((error) => {
  console.error(`Schema sync failed: ${error.message}`);
  process.exit(1);
});
