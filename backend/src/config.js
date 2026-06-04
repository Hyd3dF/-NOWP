const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const envPath = process.env.BACKEND_ENV_FILE || path.join(backendRoot, '.env');
const projectEnvPath = path.join(projectRoot, '.env');

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

loadEnv(projectEnvPath);
loadEnv(envPath);

const isSchemaSyncMode =
  process.argv.some((arg) => String(arg).includes('sync-pocketbase-schema')) &&
  process.env.OROYA_SCHEMA_SIGN_UNSIGNED_TRANSACTIONS !== 'true';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredAny(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  throw new Error(`Missing required environment variable: ${names.join(' or ')}`);
}

function requiredRuntime(name) {
  if (isSchemaSyncMode) return '';
  return required(name);
}

function requiredAnyRuntime(names) {
  if (isSchemaSyncMode) return '';
  return requiredAny(names);
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
    ledgerSecret: requiredRuntime('OROYA_LEDGER_SECRET'),
    deviceTokenSecret: requiredRuntime('OROYA_DEVICE_TOKEN_SECRET'),
    transferTwoFactorSecret: requiredAnyRuntime(['TWO_FACTOR_HMAC_SECRET', 'OROYA_TRANSFER_2FA_SECRET']),
    deviceTokenTtlSeconds: numberOrDefault(process.env.OROYA_DEVICE_TOKEN_TTL_SECONDS, 14 * 24 * 60 * 60),
    trustedProxyIps: parseList(process.env.OROYA_TRUSTED_PROXY_IPS || ''),
  },
  deviceSecurity: {
    monthlyRegisterLimit: numberOrDefault(process.env.DEVICE_MONTHLY_REGISTER_LIMIT, 3),
    monthlyLoginAccountLimit: numberOrDefault(process.env.DEVICE_MONTHLY_LOGIN_ACCOUNT_LIMIT, 5),
  },
  firebase: {
    pnvProjectNumber: optional('FIREBASE_PNV_PROJECT_NUMBER'),
    pnvProjectId: optional('FIREBASE_PNV_PROJECT_ID'),
    pnvJwksUrl: optional('FIREBASE_PNV_JWKS_URL') || 'https://fpnv.googleapis.com/v1beta/jwks',
  },
  admin: {
    notificationToken: optional('OROYA_ADMIN_NOTIFICATION_TOKEN'),
    notificationTokenHashes: parseList(process.env.OROYA_ADMIN_NOTIFICATION_TOKEN_SHA256 || ''),
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
    ipnMaxAgeSeconds: numberOrDefault(process.env.NOWPAYMENTS_IPN_MAX_AGE_SECONDS, 300),
    ipnAllowPrivateNetwork: process.env.NOWPAYMENTS_IPN_ALLOW_PRIVATE === 'true',
    ipnAllowedIps: parseList(process.env.NOWPAYMENTS_IPN_ALLOWED_IPS || ''),
  },
};

validateProductionConfig(config);

function validateProductionConfig(runtimeConfig) {
  if (process.env.NODE_ENV !== 'production') return;

  const requiredSecrets = [
    ['POCKETBASE_SUPERUSER_PASSWORD', runtimeConfig.pocketBase.superuserPassword],
    ['OROYA_LEDGER_SECRET', process.env.OROYA_LEDGER_SECRET],
    ['OROYA_DEVICE_TOKEN_SECRET', process.env.OROYA_DEVICE_TOKEN_SECRET],
    ['TWO_FACTOR_HMAC_SECRET', runtimeConfig.security.transferTwoFactorSecret],
    ['NOWPAYMENTS_IPN_SECRET_KEY', runtimeConfig.nowPayments.ipnSecretKey],
  ];

  for (const [name, value] of requiredSecrets) {
    if (!isStrongSecret(value)) {
      throw new Error(
        `${name} must be a strong production secret (>=32 chars, mixed types, not a placeholder).`,
      );
    }
  }

  if (
    !isStrongSecret(runtimeConfig.admin.notificationToken) &&
    !hasValidSha256Hash(runtimeConfig.admin.notificationTokenHashes)
  ) {
    throw new Error(
      'OROYA_ADMIN_NOTIFICATION_TOKEN must be a strong production secret or OROYA_ADMIN_NOTIFICATION_TOKEN_SHA256 must contain a valid SHA-256 hash.',
    );
  }

  if (runtimeConfig.security.allowUnsignedLedger) {
    throw new Error('OROYA_LEDGER_ALLOW_UNSIGNED=true is forbidden in production.');
  }

  if (!runtimeConfig.security.localOnly && runtimeConfig.corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot be * when BACKEND_LOCAL_ONLY=false in production.');
  }

  if (runtimeConfig.nowPayments.ipnAllowPrivateNetwork) {
    throw new Error('NOWPAYMENTS_IPN_ALLOW_PRIVATE=true is forbidden in production.');
  }

  if (!runtimeConfig.nowPayments.ipnAllowedIps.length) {
    throw new Error(
      'NOWPAYMENTS_IPN_ALLOWED_IPS must list your trusted webhook ingress/proxy IPs in production.',
    );
  }
}

function isStrongSecret(value) {
  if (value === undefined || value === null) return false;
  const str = String(value);
  if (str.length < 32) return false;
  if (/^change-?me/i.test(str)) return false;
  if (/^(.)\1+$/.test(str)) return false;
  if (/^(password|secret|admin|test|dev|oroya)/i.test(str)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(str));
  return classes.length >= 2;
}

function hasValidSha256Hash(values) {
  return Array.isArray(values) && values.some((value) => /^[a-f0-9]{64}$/i.test(String(value || '')));
}

module.exports = { config, envPath, validateProductionConfig };
