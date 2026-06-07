function normalizePhoneNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let clean = raw.replace(/[^\d+]/g, '');
  if (clean.startsWith('00')) {
    clean = `+${clean.slice(2)}`;
  }
  if (clean.startsWith('+')) {
    return isE164Phone(clean) ? clean : '';
  }

  const digits = clean.replace(/\D/g, '');
  if (/^05\d{9}$/.test(digits)) {
    return `+90${digits.slice(1)}`;
  }
  if (/^5\d{9}$/.test(digits)) {
    return `+90${digits}`;
  }
  if (/^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }

  return '';
}

function isE164Phone(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value || ''));
}

module.exports = {
  isE164Phone,
  normalizePhoneNumber,
};
