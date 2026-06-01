export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s-()]/g, ''));
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isValidAmount(amount: string): boolean {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 50000;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}
