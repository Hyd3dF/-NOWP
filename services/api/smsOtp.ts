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
  provider: 'firebase_auth' | 'dev';
  phone?: string;
  expires_at: string;
  sms_otp_challenge?: string;
  dev_otp?: string;
  metadata?: {
    sent?: boolean;
    delivery_provider?: 'dev';
  };
}

interface SmsOtpVerifyResponse {
  success: boolean;
  sms_otp_ticket: string;
  expires_at: string;
}

function toBody(
  input: MoneySmsOtpInput,
  code?: string,
  firebaseIdToken?: string,
  smsOtpChallenge?: string,
) {
  return {
    purpose: input.purpose,
    amount: input.amount,
    currency: input.currency,
    network: input.network,
    receiver_user_id: input.receiverUserId,
    code,
    firebase_id_token: firebaseIdToken,
    sms_otp_challenge: smsOtpChallenge,
  };
}

export function startMoneySmsOtp(input: MoneySmsOtpInput) {
  return api.post<SmsOtpStartResponse>('/security/sms-otp/start', toBody(input));
}

export function verifyMoneySmsOtp(
  input: MoneySmsOtpInput & {
    code?: string;
    firebaseIdToken?: string;
    smsOtpChallenge?: string;
  },
) {
  return api.post<SmsOtpVerifyResponse>(
    '/security/sms-otp/verify',
    toBody(input, input.code, input.firebaseIdToken, input.smsOtpChallenge),
  );
}
