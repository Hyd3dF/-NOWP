const fs = require('node:fs');
const path = require('node:path');

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

const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  corsOrigins: parseList(process.env.CORS_ORIGIN || '*'),
  defaultWalletCurrency: process.env.DEFAULT_WALLET_CURRENCY || 'USD',
  deviceSecurity: {
    monthlyRegisterLimit: numberOrDefault(process.env.DEVICE_MONTHLY_REGISTER_LIMIT, 3),
    monthlyLoginAccountLimit: numberOrDefault(process.env.DEVICE_MONTHLY_LOGIN_ACCOUNT_LIMIT, 5),
  },
  admin: {
    notificationToken: optional('OROYA_ADMIN_NOTIFICATION_TOKEN'),
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
    apiUrl: trimTrailingSlash(optional('NOWPAYMENTS_API_URL') || 'https://api.nowpayments.io/v1'),
    ipnCallbackUrl: optional('NOWPAYMENTS_IPN_CALLBACK_URL'),
  },
};

module.exports = { config, envPath };
