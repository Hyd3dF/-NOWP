import { api } from './client';

interface SendTransferInput {
  receiverUserId: string;
  amount: number;
  currency: string;
  note?: string;
  pin: string;
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
  return api.post<SendTransferResponse>('/transfers/send', {
    receiver_user_id: input.receiverUserId,
    amount: input.amount,
    currency: input.currency,
    note: input.note || '',
    pin: input.pin,
  });
}
