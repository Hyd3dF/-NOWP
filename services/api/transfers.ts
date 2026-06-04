import { api, createIdempotencyKey } from './client';

interface SendTransferInput {
  receiverUserId: string;
  amount: number;
  currency: string;
  note?: string;
  pin: string;
  twoFactorTicket?: string;
  twoFactorCode?: string;
  idempotencyKey?: string;
}

interface SendTransferResponse {
  success: boolean;
  transaction: {
    id: string;
    sender_id: string;
    receiver_id: string;
    amount: number;
    currency: string;
    type: 'send';
    status: 'completed' | 'pending' | 'failed' | 'cancelled';
    reference_id: string;
    created_at: string;
  };
}

export async function sendInternalTransfer(input: SendTransferInput) {
  const idempotencyKey = input.idempotencyKey || createIdempotencyKey('tr');
  return api.post<SendTransferResponse>('/transfers/send', {
    receiver_user_id: input.receiverUserId,
    amount: input.amount,
    currency: input.currency,
    note: input.note || '',
    pin: input.pin,
    two_factor_ticket: input.twoFactorTicket,
    two_factor_code: input.twoFactorCode,
    idempotency_key: idempotencyKey,
  }, {
    'X-Idempotency-Key': idempotencyKey,
  });
}

interface TransferTwoFactorChallengeResponse {
  success: boolean;
  two_factor_required: boolean;
  ticket?: string;
  expires_at?: string;
  dev_otp?: string;
}

export async function startTransferTwoFactorChallenge(input: {
  receiverUserId: string;
  amount: number;
  currency: string;
}) {
  return api.post<TransferTwoFactorChallengeResponse>('/transfers/two-factor/challenge', {
    receiver_user_id: input.receiverUserId,
    amount: input.amount,
    currency: input.currency,
  });
}
