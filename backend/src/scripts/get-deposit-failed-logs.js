const { pocketBase } = require('../pocketbase');

async function main() {
  const users = await pocketBase.adminRequest('/api/collections/users/records?sort=-created_at&perPage=3');
  for (const user of users.items) {
    const pin = await pocketBase.adminRequest(`/api/collections/security_pins/records?filter=user_id="${user.id}"`).catch(() => null);
    console.log(`User: ${user.email} (${user.id})`);
    console.log(`  PIN Hash in user table: ${user.pin_hash ? 'YES' : 'NO'}`);
    console.log(`  Security Pins records count: ${pin?.items?.length || 0}`);
    if (pin?.items?.[0]) {
      console.log(`  Failed attempts: ${pin.items[0].failed_attempt_count}`);
      console.log(`  Locked until: ${pin.items[0].locked_until}`);
    }
  }
}

main().catch(console.error);
