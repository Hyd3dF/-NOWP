const { pocketBase } = require('../pocketbase');

const USERS_COLLECTION_ID = '_pb_users_auth_';

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

  const updated = await pocketBase.adminRequest(`/api/collections/${encodeURIComponent(collection.id)}`, {
    method: 'PATCH',
    body: {
      indexes: [...indexes, ...missingIndexes],
    },
  });

  console.log(`Updated indexes ${collectionName}: added ${missingIndexes.length}`);
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

  await ensureCollection('device_sessions', [
    relationField('user_id', USERS_COLLECTION_ID, { required: true, cascadeDelete: true }),
    textField('device_id', { required: true, min: 8, max: 140 }),
    textField('device_platform', { max: 40 }),
    textField('device_info', { max: 300 }),
    textField('last_ip_address', { max: 80 }),
    dateField('first_seen_at'),
    dateField('last_seen_at'),
    dateField('created_at'),
    dateField('updated_at'),
  ]);

  await ensureFields('transactions', [
    textField('integrity_version', { max: 16 }),
    textField('integrity_hash', { max: 128 }),
  ]);
  await ensureIndexes('transactions', [
    "CREATE UNIQUE INDEX `idx_transactions_reference_id` ON `transactions` (`reference_id`) WHERE `reference_id` != ''",
  ]);
  await ensureIndexes('payment_intents', [
    "CREATE UNIQUE INDEX `idx_payment_intents_reference_id` ON `payment_intents` (`reference_id`) WHERE `reference_id` != ''",
    "CREATE UNIQUE INDEX `idx_payment_intents_nowpayments_payment_id` ON `payment_intents` (`nowpayments_payment_id`) WHERE `nowpayments_payment_id` != ''",
  ]);

  const signedTransactions = await pocketBase.signUnsignedTransactions();
  console.log(`Signed unsigned transaction records: ${signedTransactions}`);

  await pocketBase.testConnection();
  console.log('PocketBase schema sync completed safely.');
}

main().catch((error) => {
  console.error(`Schema sync failed: ${error.message}`);
  process.exit(1);
});
