const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const backendRoot = path.resolve(__dirname, '..');
const envPath = process.env.BACKEND_ENV_FILE || path.join(backendRoot, '.env');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex === -1) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnv(envPath);

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function optional(name) {
  return process.env[name] || '';
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function validateNowPaymentsApiUrl(value) {
  const cleanValue = trimTrailingSlash(value || 'https://api.nowpayments.io/v1');
  let url;
  try {
    url = new URL(cleanValue);
  } catch {
    throw new Error('NOWPAYMENTS_API_URL must be a valid URL.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('NOWPAYMENTS_API_URL must use https.');
  }

  if (process.env.NODE_ENV === 'production' && url.hostname !== 'api.nowpayments.io') {
    throw new Error('NOWPAYMENTS_API_URL host is not allowed in production.');
  }

  return cleanValue;
}

const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.BACKEND_HOST || '127.0.0.1',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins: parseList(process.env.CORS_ORIGIN || '*'),
  defaultWalletCurrency: process.env.DEFAULT_WALLET_CURRENCY || 'USD',
  security: {
    localOnly: process.env.BACKEND_LOCAL_ONLY !== 'false',
    publicIngressPaths: parseList(process.env.BACKEND_PUBLIC_INGRESS_PATHS || ''),
    allowUnsignedLedger: process.env.OROYA_LEDGER_ALLOW_UNSIGNED === 'true',
    pinMaxAttempts: numberOrDefault(process.env.OROYA_PIN_MAX_ATTEMPTS, 5),
    pinLockMinutes: numberOrDefault(process.env.OROYA_PIN_LOCK_MINUTES, 15),
    ledgerSecret:
      process.env.OROYA_LEDGER_SECRET ||
      deriveLedgerSecret(`${required('POCKETBASE_SUPERUSER_PASSWORD')}:${required('POCKETBASE_URL')}`),
  },
  deviceSecurity: {
    monthlyRegisterLimit: numberOrDefault(process.env.DEVICE_MONTHLY_REGISTER_LIMIT, 3),
    monthlyLoginAccountLimit: numberOrDefault(process.env.DEVICE_MONTHLY_LOGIN_ACCOUNT_LIMIT, 5),
  },
  admin: {
    notificationToken: optional('OROYA_ADMIN_NOTIFICATION_TOKEN'),
    toolEnabled: process.env.OROYA_ADMIN_TOOL_ENABLED === 'true',
  },
  pocketBase: {
    url: trimTrailingSlash(required('POCKETBASE_URL')),
    superuserEmail: required('POCKETBASE_SUPERUSER_EMAIL'),
    superuserPassword: required('POCKETBASE_SUPERUSER_PASSWORD'),
  },
  nowPayments: {
    apiKey: optional('NOWPAYMENTS_API_KEY'),
    publicKey: optional('NOWPAYMENTS_PUBLIC_KEY'),
    ipnSecretKey: optional('NOWPAYMENTS_IPN_SECRET_KEY'),
    apiUrl: validateNowPaymentsApiUrl(optional('NOWPAYMENTS_API_URL') || 'https://api.nowpayments.io/v1'),
    ipnCallbackUrl: optional('NOWPAYMENTS_IPN_CALLBACK_URL'),
  },
};

validateProductionConfig(config);

function deriveLedgerSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function validateProductionConfig(runtimeConfig) {
  if (process.env.NODE_ENV !== 'production') return;

  const requiredSecrets = [
    ['POCKETBASE_SUPERUSER_PASSWORD', runtimeConfig.pocketBase.superuserPassword],
    ['OROYA_LEDGER_SECRET', process.env.OROYA_LEDGER_SECRET],
  ];

  for (const [name, value] of requiredSecrets) {
    if (!value || value === 'change-me' || String(value).length < 32) {
      throw new Error(`${name} must be a strong production secret.`);
    }
  }

  if (!runtimeConfig.security.localOnly && runtimeConfig.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot be * when BACKEND_LOCAL_ONLY=false in production.');
  }
}

module.exports = { config, envPath };
