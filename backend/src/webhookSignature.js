const crypto = require('node:crypto');

function computeNowPaymentsSignature(rawBody, secret) {
  if (!secret) {
    throw new Error('NOWPayments IPN secret is not configured.');
  }

  return crypto
    .createHmac('sha512', String(secret).trim())
    .update(rawBody)
    .digest('hex');
}

function verifyNowPaymentsSignature(rawBody, receivedSignature, secret) {
  if (!secret) {
    const error = new Error('NOWPayments IPN secret is not configured.');
    error.code = 'ipn_secret_missing';
    throw error;
  }

  if (!receivedSignature) {
    const error = new Error('Missing NOWPayments signature.');
    error.code = 'signature_missing';
    throw error;
  }

  const expectedSignature = computeNowPaymentsSignature(rawBody, secret);
  const expected = Buffer.from(expectedSignature, 'hex');
  const receivedValue = String(receivedSignature).trim();
  if (!/^[a-f0-9]+$/i.test(receivedValue)) {
    const error = new Error('Invalid NOWPayments signature format.');
    error.code = 'signature_format';
    throw error;
  }

  const received = Buffer.from(receivedValue, 'hex');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    const error = new Error('Invalid NOWPayments signature.');
    error.code = 'signature_mismatch';
    throw error;
  }

  return true;
}

module.exports = {
  computeNowPaymentsSignature,
  verifyNowPaymentsSignature,
};
