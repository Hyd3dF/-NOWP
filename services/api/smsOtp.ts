import { api } from './client';

export type SmsOtpPurpose = 'deposit' | 'transfer';

interface MoneySmsOtpInput {
  purpose: SmsOtpPurpose;
  amount: number;
  currency: string;
  network?: string;
  receiverUserId?: string;
}

interface SmsOtpStartResponse {
  success: boolean;
  purpose: SmsOtpPurpose;
  provider?: 'firebase_auth' | 'twilio' | 'dev';
  phone?: string;
  expires_at: string;
  dev_otp?: string;
}

interface SmsOtpVerifyResponse {
  success: boolean;
  sms_otp_ticket: string;
  expires_at: string;
}

function toBody(input: MoneySmsOtpInput, code?: string, firebaseIdToken?: string) {
  return {
    purpose: input.purpose,
    amount: input.amount,
    currency: input.currency,
    network: input.network,
    receiver_user_id: input.receiverUserId,
    code,
    firebase_id_token: firebaseIdToken,
  };
}

export function startMoneySmsOtp(input: MoneySmsOtpInput) {
  return api.post<SmsOtpStartResponse>('/security/sms-otp/start', toBody(input));
}

export function verifyMoneySmsOtp(input: MoneySmsOtpInput & { code?: string; firebaseIdToken?: string }) {
  return api.post<SmsOtpVerifyResponse>(
    '/security/sms-otp/verify',
    toBody(input, input.code, input.firebaseIdToken),
  );
}
