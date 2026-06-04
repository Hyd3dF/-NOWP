const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..', '..');
const envPath = process.env.BACKEND_ENV_FILE || path.join(backendRoot, '.env');

const REQUIRED_LOCAL_SECRETS = [
  'OROYA_LEDGER_SECRET',
  'OROYA_DEVICE_TOKEN_SECRET',
  'TWO_FACTOR_HMAC_SECRET',
];

function parseEnv(content) {
  const result = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) result.set(match[1], true);
  }
  return result;
}

function createSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

function ensureLocalSecrets() {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const keys = parseEnv(existing);
  const missing = REQUIRED_LOCAL_SECRETS.filter((key) => !process.env[key] && !keys.has(key));
  if (!missing.length) {
    console.log('Local backend secrets already configured.');
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to auto-generate missing secrets when NODE_ENV=production.');
  }

  const lines = [];
  if (existing && !existing.endsWith('\n')) lines.push('');
  lines.push('# Auto-generated local cryptographic secrets. Do not commit real .env files.');
  for (const key of missing) {
    lines.push(`${key}=${createSecret()}`);
  }

  fs.appendFileSync(envPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  console.log(`Generated ${missing.length} missing local backend secret(s) in backend/.env.`);
}

if (require.main === module) {
  ensureLocalSecrets();
}

module.exports = { ensureLocalSecrets };
