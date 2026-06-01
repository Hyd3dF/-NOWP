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

  await pocketBase.testConnection();
  console.log('PocketBase schema sync completed safely.');
}

main().catch((error) => {
  console.error(`Schema sync failed: ${error.message}`);
  process.exit(1);
});
