import { api } from './client';

export interface SecurityOverview {
  biometricLock: {
    enabled: boolean;
    devicePlatform: string;
    updatedAt: string;
  };
  twoFactor: {
    enabled: boolean;
    method: string;
    transferRequired: boolean;
    updatedAt: string;
  };
  pin: {
    configured: boolean;
  };
  password: {
    changedAt: string;
    strengthScore: number;
  };
  devices: Array<{
    id: string;
    platform: string;
    info: string;
    lastSeenAt: string;
    isCurrent: boolean;
  }>;
}

export async function fetchSecurityOverview() {
  const response = await api.get<{ success: boolean; security: SecurityOverview }>('/security/overview');
  return response.security;
}

export async function updateBiometricLock(enabled: boolean) {
  const response = await api.post<{ success: boolean; biometricLock: SecurityOverview['biometricLock'] }>(
    '/security/biometric-lock',
    { enabled },
  );
  return response.biometricLock;
}

export async function updateTwoFactor(enabled: boolean) {
  const response = await api.post<{ success: boolean; twoFactor: SecurityOverview['twoFactor'] }>(
    '/security/two-factor',
    { enabled },
  );
  return response.twoFactor;
}

export async function changeSecurityPin(currentPin: string, newPin: string) {
  const response = await api.post<{ success: boolean; changedAt: string }>('/security/change-pin', {
    current_pin: currentPin,
    new_pin: newPin,
  });
  return response;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await api.post<{ success: boolean; changedAt: string; strengthScore: number }>(
    '/security/change-password',
    {
      current_password: currentPassword,
      new_password: newPassword,
    },
  );
  return response;
}
