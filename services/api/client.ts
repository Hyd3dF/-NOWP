import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

const localApiUrl = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  web: 'http://localhost:4000',
  default: 'http://localhost:4000',
});

const DEVICE_ID_KEY = 'oroya_device_id';
const DEVICE_TOKEN_KEY = 'oroya_device_token';
let unauthorizedHandler: (() => Promise<void> | void) | null = null;
let unauthorizedInFlight: Promise<void> | null = null;

const SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

export class ApiError extends Error {
  code: string;
  status?: number;
  requestId?: string;

  constructor(code: string, status?: number, requestId?: string) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export function setUnauthorizedHandler(handler: (() => Promise<void> | void) | null) {
  unauthorizedHandler = handler;
}

function getExpoLanApiUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    '';
  const host = String(hostUri).split(':')[0];

  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return '';
  }

  return `http://${host}:4000`;
}

function resolveBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_OROYA_API_URL?.trim();
  const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

  if (!isDevelopment) {
    if (!envUrl || !/^https:\/\//i.test(envUrl)) {
      throw new Error('EXPO_PUBLIC_OROYA_API_URL must be an HTTPS URL in production builds.');
    }
    return envUrl;
  }

  const expoLanUrl = getExpoLanApiUrl();

  if (
    envUrl &&
    !(Platform.OS !== 'web' && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(envUrl))
  ) {
    return envUrl;
  }

  return expoLanUrl || localApiUrl || 'http://localhost:4000';
}

class OroyaApiClient {
  private baseUrl = resolveBaseUrl().replace(/\/+$/, '');

  getBaseUrl() {
    return this.baseUrl;
  }

  private async getHeaders(options: RequestOptions): Promise<Record<string, string>> {
    const deviceId = await getOrCreateDeviceId();
    const deviceToken = await getDeviceToken();
    const headers: Record<string, string> = {
      ...options.headers,
      'Content-Type': 'application/json',
      'X-Oroya-Device-Id': deviceId,
      'X-Oroya-Client-Platform': Platform.OS,
      'X-Oroya-App-Version': Constants.expoConfig?.version || 'unknown',
    };
    if (deviceToken) {
      headers['X-Oroya-Device-Token'] = deviceToken;
    }
    delete headers.Authorization;

    if (options.skipAuth) return headers;

    try {
      const token = await SecureStore.getItemAsync('oroya_token');
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      console.warn('Failed to retrieve auth token from secure store');
    }

    if (!headers.Authorization) {
      throw new ApiError('auth_required', 401);
    }

    return headers;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';
    const headers = await this.getHeaders(options);
    const body = options.body ? JSON.stringify(options.body) : undefined;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
      });
    } catch {
      throw new ApiError('connection_failed');
    }

    const text = await response.text();
    const data = parseJsonResponse(text);

    if (!response.ok) {
      const errorCode = getErrorCode(response.status, data);
      if (
        !options.skipAuth &&
        isSessionAuthFailure(response.status, errorCode) &&
        errorCode !== 'device_token_required' &&
        errorCode !== 'device_token_invalid' &&
        errorCode !== 'device_token_revoked'
      ) {
        await notifyUnauthorized();
      }
      if (
        errorCode === 'device_token_revoked' ||
        errorCode === 'device_token_invalid'
      ) {
        await setDeviceToken(null);
      }
      throw new ApiError(errorCode, response.status, getRequestId(data));
    }

    captureDeviceToken(data);
    return data as T;
  }

  get<T>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  post<T>(endpoint: string, body?: unknown, headers?: Record<string, string>, skipAuth = false) {
    return this.request<T>(endpoint, { method: 'POST', body, headers, skipAuth });
  }

  put<T>(endpoint: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'PUT', body, headers });
  }

  patch<T>(endpoint: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'PATCH', body, headers });
  }

  delete<T>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }
}

export const api = new OroyaApiClient();

function parseJsonResponse(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('invalid_response');
  }
}

function captureDeviceToken(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const token = (data as { device_token?: unknown }).device_token;
  if (typeof token === 'string' && token.length > 0) {
    void setDeviceToken(token);
  }
}

function getErrorCode(status: number, data: unknown) {
  const serverCode =
    data && typeof data === 'object' && 'code' in data ? String((data as { code?: unknown }).code) : '';
  const detailCode =
    data &&
    typeof data === 'object' &&
    'details' in data &&
    (data as { details?: unknown }).details &&
    typeof (data as { details?: unknown }).details === 'object' &&
    'code' in ((data as { details?: Record<string, unknown> }).details || {})
      ? String((data as { details?: { code?: unknown } }).details?.code)
      : '';

  const safeCode = serverCode || detailCode;
  if (safeCode && /^[a-z0-9_:-]{1,64}$/i.test(safeCode)) {
    return safeCode;
  }

  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 409) return 'account_conflict';
  if (status === 422) return 'validation_failed';
  if (status >= 500) return 'server_unavailable';
  return 'request_failed';
}

function isSessionAuthFailure(status: number, errorCode: string) {
  if (status !== 401 && status !== 403) return false;
  return (
    errorCode === 'auth_failed' ||
    errorCode === 'auth_required' ||
    errorCode === 'token_revoked' ||
    errorCode === 'token_invalid_iat'
  );
}

async function notifyUnauthorized() {
  if (!unauthorizedHandler) return;
  if (!unauthorizedInFlight) {
    unauthorizedInFlight = Promise.resolve(unauthorizedHandler()).finally(() => {
      unauthorizedInFlight = null;
    });
  }
  await unauthorizedInFlight;
}

async function getOrCreateDeviceId() {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;

    const random = getRandomId();
    const deviceId = `device_${random}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId, SECURE_STORE_OPTIONS);
    return deviceId;
  } catch {
    throw new ApiError('device_identity_unavailable', 500);
  }
}

async function getDeviceToken(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export async function setDeviceToken(token: string | null) {
  try {
    if (token) {
      await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token, SECURE_STORE_OPTIONS);
    } else {
      await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
    }
  } catch {
    console.warn('Failed to persist device token');
  }
}

function getRandomId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Secure random generator is unavailable.');
}

export function createIdempotencyKey(prefix = 'req') {
  return `${prefix}_${getRandomId()}`.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
}

function getRequestId(data: unknown) {
  if (!data || typeof data !== 'object') return '';
  const topLevel = 'request_id' in data ? String((data as { request_id?: unknown }).request_id || '') : '';
  const details =
    'details' in data &&
    (data as { details?: unknown }).details &&
    typeof (data as { details?: unknown }).details === 'object'
      ? (data as { details?: { request_id?: unknown } }).details
      : null;
  const nested = details?.request_id ? String(details.request_id) : '';
  const value = topLevel || nested;
  return /^[a-f0-9]{8,32}$/i.test(value) ? value : '';
}
