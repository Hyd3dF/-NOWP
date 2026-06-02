const crypto = require('node:crypto');
const { config } = require('./config');
const { HttpError } = require('./http');

const LEVEL_ONE_LIMITS = {
  account_level: 1,
  verification_status: 'unverified',
  daily_send_limit: 100,
  daily_receive_limit: 100,
  daily_send_count: 0,
  daily_receive_count: 0,
};

class PocketBaseClient {
  constructor() {
    this.baseUrl = config.pocketBase.url;
    this.superuserToken = null;
  }

  async request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : options.rawBody,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const message = data?.message || `PocketBase request failed with ${response.status}`;
      throw new HttpError(response.status, message, data?.data || data);
    }

    return data;
  }

  async getSuperuserToken() {
    if (this.superuserToken) return this.superuserToken;

    const auth = await this.request('/api/collections/_superusers/auth-with-password', {
      method: 'POST',
      body: {
        identity: config.pocketBase.superuserEmail,
        password: config.pocketBase.superuserPassword,
      },
    });

    this.superuserToken = auth.token;
    return this.superuserToken;
  }

  async adminRequest(path, options = {}) {
    const token = await this.getSuperuserToken();

    try {
      return await this.request(path, { ...options, token });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        this.superuserToken = null;
        return this.request(path, {
          ...options,
          token: await this.getSuperuserToken(),
        });
      }
      throw error;
    }
  }

  async testConnection() {
    const health = await this.request('/api/health');
    const collections = await this.adminRequest('/api/collections?perPage=1');

    return {
      healthy: health?.code === 200,
      collectionsReachable: Array.isArray(collections?.items),
    };
  }

  async findUserByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;

    const filter = encodeURIComponent(`email = "${escapeFilterValue(normalizedEmail)}"`);
    const result = await this.adminRequest(
      `/api/collections/users/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async findUserByUsername(username) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return null;

    const filter = encodeURIComponent(`username = "${escapeFilterValue(cleanUsername)}"`);
    const result = await this.adminRequest(
      `/api/collections/users/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async authenticateUserSmart(identity, password) {
    const cleanIdentity = String(identity || '').trim();
    const attempts = Array.from(new Set([
      cleanIdentity,
      cleanIdentity.toLowerCase(),
    ].filter(Boolean)));

    if (cleanIdentity.includes('@')) {
      const user = await this.findUserByEmail(cleanIdentity);
      if (user?.email) attempts.push(user.email);
    } else {
      const user = await this.findUserByUsername(cleanIdentity);
      if (user?.email) attempts.push(user.email);
      if (user?.username) attempts.push(user.username);
    }

    let lastError;
    for (const attempt of Array.from(new Set(attempts))) {
      try {
        return await this.authenticateUser(attempt, password);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new HttpError(401, 'Invalid credentials.');
  }

  async assertEmailAvailable(email) {
    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new HttpError(409, 'Email already exists. Please log in.', {
        code: 'email_already_exists',
      });
    }
  }

  async assertUsernameAvailable(username) {
    if (!username) return;
    const existing = await this.findUserByUsername(username);
    if (existing) {
      throw new HttpError(409, 'Username already exists.', {
        code: 'username_already_exists',
      });
    }
  }

  async getDeviceSecurity(deviceId) {
    const filter = encodeURIComponent(`device_id = "${escapeFilterValue(deviceId)}"`);
    const result = await this.adminRequest(
      `/api/collections/device_security/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async ensureDeviceSecurity(context, userId = '') {
    const now = new Date().toISOString();
    const deviceId = getStableDeviceId(context);
    const periodKey = getMonthKey(new Date());
    const existing = await this.getDeviceSecurity(deviceId);

    if (!existing) {
      return this.adminRequest('/api/collections/device_security/records', {
        method: 'POST',
        body: {
          device_id: deviceId,
          device_platform: context.devicePlatform || '',
          device_info: context.deviceInfo || '',
          week_key: periodKey,
          account_create_count_week: 0,
          login_count_week: 0,
          login_user_ids: [],
          last_user_id: userId || '',
          last_ip_address: context.ipAddress || '',
          first_seen_at: now,
          last_seen_at: now,
          created_at: now,
          updated_at: now,
        },
      });
    }

    const resetPeriodCounters = existing.week_key !== periodKey;
    const patch = {
      device_platform: context.devicePlatform || existing.device_platform || '',
      device_info: context.deviceInfo || existing.device_info || '',
      week_key: periodKey,
      account_create_count_week: resetPeriodCounters
        ? 0
        : Number(existing.account_create_count_week || 0),
      login_count_week: resetPeriodCounters ? 0 : Number(existing.login_count_week || 0),
      login_user_ids: resetPeriodCounters ? [] : normalizeIdList(existing.login_user_ids),
      last_user_id: userId || existing.last_user_id || '',
      last_ip_address: context.ipAddress || existing.last_ip_address || '',
      last_seen_at: now,
      updated_at: now,
    };

    return this.adminRequest(`/api/collections/device_security/records/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      body: patch,
    });
  }

  async assertDeviceCanRegister(context) {
    const device = await this.ensureDeviceSecurity(context);
    if (Number(device.account_create_count_week || 0) >= config.deviceSecurity.monthlyRegisterLimit) {
      throw new HttpError(429, 'This device reached the monthly account creation limit.', {
        code: 'monthly_device_register_limit',
      });
    }
    return device;
  }

  async assertDeviceCanLogin(context, userId = '') {
    const device = await this.ensureDeviceSecurity(context);
    const loginUserIds = normalizeIdList(device.login_user_ids);
    const isKnownAccount = userId && loginUserIds.includes(userId);
    if (
      userId &&
      !isKnownAccount &&
      loginUserIds.length >= config.deviceSecurity.monthlyLoginAccountLimit
    ) {
      throw new HttpError(429, 'This device reached the monthly account login limit.', {
        code: 'monthly_device_login_account_limit',
      });
    }
    return device;
  }

  async recordDeviceUsage(context, { userId, accountCreated = false, loggedIn = false }) {
    const device = await this.ensureDeviceSecurity(context, userId);
    const loginUserIds = normalizeIdList(device.login_user_ids);
    if (loggedIn && userId && !loginUserIds.includes(userId)) {
      loginUserIds.push(userId);
    }

    return this.adminRequest(`/api/collections/device_security/records/${encodeURIComponent(device.id)}`, {
      method: 'PATCH',
      body: {
        account_create_count_week:
          Number(device.account_create_count_week || 0) + (accountCreated ? 1 : 0),
        login_count_week: Number(device.login_count_week || 0) + (loggedIn ? 1 : 0),
        login_user_ids: loginUserIds,
        last_user_id: userId || device.last_user_id || '',
        last_ip_address: context.ipAddress || device.last_ip_address || '',
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  }

  async createUser(input) {
    const now = new Date().toISOString();
    const body = {
      email: input.email,
      password: input.password,
      passwordConfirm: input.passwordConfirm || input.password,
      first_name: input.first_name || '',
      last_name: input.last_name || '',
      username: input.username || '',
      phone: input.phone || '',
      pin_hash: input.pin ? hashSecret(input.pin) : '',
      date_of_birth: input.date_of_birth || '',
      profile_photo_url: input.profile_photo_url || '',
      ...LEVEL_ONE_LIMITS,
      created_at: now,
      updated_at: now,
    };

    if (!input.profile_photo_base64) {
      const user = await this.adminRequest('/api/collections/users/records', {
        method: 'POST',
        body,
      });
      return this.withUserFileUrls(user);
    }

    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      formData.append(key, String(value));
    }

    const mimeType = input.profile_photo_mime || 'image/jpeg';
    const fileName = sanitizeFileName(input.profile_photo_name || 'profile-photo.jpg');
    const fileBuffer = Buffer.from(input.profile_photo_base64, 'base64');
    formData.append('profile_photo_file', new Blob([fileBuffer], { type: mimeType }), fileName);

    const token = await this.getSuperuserToken();
    const response = await fetch(`${this.baseUrl}/api/collections/users/records`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new HttpError(response.status, data?.message || 'Failed to create user.', data?.data || data);
    }
    return this.withUserFileUrls(data);
  }

  async updateUser(userId, patch) {
    return this.adminRequest(`/api/collections/users/records/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: {
        ...patch,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async updateUserProfile(userId, input) {
    const [firstName, ...lastNameParts] = String(input.displayName || '').trim().split(/\s+/);
    const body = {
      first_name: firstName || '',
      last_name: lastNameParts.join(' '),
      username: input.username || '',
      phone: input.phone || '',
      updated_at: new Date().toISOString(),
    };

    if (!input.profile_photo_base64) {
      const user = await this.updateUser(userId, body);
      return this.withUserFileUrls(user);
    }

    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      formData.append(key, String(value));
    }

    const mimeType = input.profile_photo_mime || 'image/jpeg';
    const fileName = sanitizeFileName(input.profile_photo_name || 'profile-photo.jpg');
    const fileBuffer = Buffer.from(input.profile_photo_base64, 'base64');
    formData.append('profile_photo_file', new Blob([fileBuffer], { type: mimeType }), fileName);

    const token = await this.getSuperuserToken();
    const response = await fetch(`${this.baseUrl}/api/collections/users/records/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new HttpError(response.status, data?.message || 'Failed to update user.', data?.data || data);
    }
    return this.withUserFileUrls(data);
  }

  async authenticateUser(identity, password) {
    const auth = await this.request('/api/collections/users/auth-with-password', {
      method: 'POST',
      body: { identity, password },
    });
    return {
      ...auth,
      record: this.withUserFileUrls(auth.record),
    };
  }

  async verifyUserPin(user, pin) {
    const pinRecord = await this.getSecurityPin(user.id).catch(() => null);
    const storedPinHash = pinRecord?.pin_hash || user?.pin_hash || '';
    const now = new Date();

    if (!storedPinHash) {
      throw new HttpError(403, 'Security PIN is not configured.', {
        code: 'pin_not_configured',
      });
    }

    if (pinRecord?.locked_until) {
      const lockedUntil = new Date(pinRecord.locked_until);
      if (Number.isFinite(lockedUntil.getTime()) && lockedUntil > now) {
        throw new HttpError(429, 'Security PIN is temporarily locked.', {
          code: 'pin_temporarily_locked',
        });
      }
    }

    if (!/^\d{4}$/.test(String(pin || '')) || !verifySecret(pin, storedPinHash)) {
      if (pinRecord) {
        const failedAttemptCount = Number(pinRecord.failed_attempt_count || 0) + 1;
        const shouldLock = failedAttemptCount >= config.security.pinMaxAttempts;
        const lockedUntil = shouldLock
          ? new Date(now.getTime() + config.security.pinLockMinutes * 60 * 1000).toISOString()
          : pinRecord.locked_until || '';
        await this.adminRequest(`/api/collections/security_pins/records/${encodeURIComponent(pinRecord.id)}`, {
          method: 'PATCH',
          body: {
            failed_attempt_count: failedAttemptCount,
            locked_until: lockedUntil,
            updated_at: now.toISOString(),
          },
        }).catch(() => {});
      }
      throw new HttpError(401, 'Invalid security PIN.', {
        code: 'invalid_pin',
      });
    }

    if (pinRecord && Number(pinRecord.failed_attempt_count || 0) > 0) {
      await this.adminRequest(`/api/collections/security_pins/records/${encodeURIComponent(pinRecord.id)}`, {
        method: 'PATCH',
        body: {
          failed_attempt_count: 0,
          locked_until: '',
          updated_at: now.toISOString(),
        },
      }).catch(() => {});
    }
  }

  async getSecurityPin(userId) {
    const filter = encodeURIComponent(`user_id = "${escapeFilterValue(userId)}"`);
    const result = await this.adminRequest(
      `/api/collections/security_pins/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async ensureSecurityPin(user) {
    const existing = await this.getSecurityPin(user.id).catch(() => null);
    if (existing || !user.pin_hash) return existing;

    const now = new Date().toISOString();
    return this.adminRequest('/api/collections/security_pins/records', {
      method: 'POST',
      body: {
        user_id: user.id,
        pin_hash: user.pin_hash,
        failed_attempt_count: 0,
        locked_until: '',
        changed_at: user.updated_at || user.created_at || now,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async changeSecurityPin(user, currentPin, newPin) {
    if (!/^\d{4}$/.test(String(newPin || ''))) {
      throw new HttpError(400, 'New PIN must be 4 digits.', {
        code: 'invalid_new_pin',
      });
    }

    await this.verifyUserPin(user, currentPin);
    const now = new Date().toISOString();
    const pinHash = hashSecret(newPin);
    const existing = await this.ensureSecurityPin(user);

    if (existing) {
      await this.adminRequest(`/api/collections/security_pins/records/${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body: {
          pin_hash: pinHash,
          failed_attempt_count: 0,
          locked_until: '',
          changed_at: now,
          updated_at: now,
        },
      });
    } else {
      await this.adminRequest('/api/collections/security_pins/records', {
        method: 'POST',
        body: {
          user_id: user.id,
          pin_hash: pinHash,
          failed_attempt_count: 0,
          locked_until: '',
          changed_at: now,
          created_at: now,
          updated_at: now,
        },
      });
    }

    await this.updateUser(user.id, { pin_hash: pinHash });
    return { changedAt: now };
  }

  async getTwoFactorSettings(userId) {
    const filter = encodeURIComponent(`user_id = "${escapeFilterValue(userId)}"`);
    const result = await this.adminRequest(
      `/api/collections/two_factor_settings/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async upsertTwoFactorSettings(userId, enabled) {
    const existing = await this.getTwoFactorSettings(userId).catch(() => null);
    const now = new Date().toISOString();
    const body = {
      enabled: Boolean(enabled),
      method: 'app_otp',
      transfer_required: Boolean(enabled),
      updated_at: now,
    };

    if (existing) {
      return this.adminRequest(`/api/collections/two_factor_settings/records/${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body,
      });
    }

    return this.adminRequest('/api/collections/two_factor_settings/records', {
      method: 'POST',
      body: {
        user_id: userId,
        ...body,
        created_at: now,
      },
    });
  }

  async getBiometricLock(userId, context) {
    const deviceId = getStableDeviceId(context);
    const filter = encodeURIComponent(
      `user_id = "${escapeFilterValue(userId)}" && device_id = "${escapeFilterValue(deviceId)}"`,
    );
    const result = await this.adminRequest(
      `/api/collections/biometric_locks/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async upsertBiometricLock(userId, context, enabled) {
    const existing = await this.getBiometricLock(userId, context).catch(() => null);
    const now = new Date().toISOString();
    const body = {
      enabled: Boolean(enabled),
      device_platform: context.devicePlatform || '',
      device_info: context.deviceInfo || '',
      last_verified_at: enabled ? now : existing?.last_verified_at || '',
      updated_at: now,
    };

    if (existing) {
      return this.adminRequest(`/api/collections/biometric_locks/records/${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body,
      });
    }

    return this.adminRequest('/api/collections/biometric_locks/records', {
      method: 'POST',
      body: {
        user_id: userId,
        device_id: getStableDeviceId(context),
        ...body,
        created_at: now,
      },
    });
  }

  async upsertDeviceSession(userId, context) {
    if (!userId) return null;
    const deviceId = getStableDeviceId(context);
    const filter = encodeURIComponent(
      `user_id = "${escapeFilterValue(userId)}" && device_id = "${escapeFilterValue(deviceId)}"`,
    );
    const now = new Date().toISOString();
    try {
      const result = await this.adminRequest(
        `/api/collections/device_sessions/records?filter=${filter}&perPage=1`,
      );
      const existing = result.items?.[0];
      const body = {
        device_platform: context.devicePlatform || '',
        device_info: context.deviceInfo || '',
        last_ip_address: context.ipAddress || '',
        last_seen_at: now,
        updated_at: now,
      };
      if (existing) {
        return this.adminRequest(`/api/collections/device_sessions/records/${encodeURIComponent(existing.id)}`, {
          method: 'PATCH',
          body,
        });
      }

      return this.adminRequest('/api/collections/device_sessions/records', {
        method: 'POST',
        body: {
          user_id: userId,
          device_id: deviceId,
          ...body,
          first_seen_at: now,
          created_at: now,
        },
      });
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async listDeviceSessions(userId) {
    const filter = encodeURIComponent(`user_id = "${escapeFilterValue(userId)}"`);
    const result = await this.adminRequest(
      `/api/collections/device_sessions/records?filter=${filter}&sort=-last_seen_at&perPage=50`,
    );
    return result.items || [];
  }

  async changePassword(user, currentPassword, newPassword) {
    if (String(newPassword || '').length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.', {
        code: 'weak_password',
      });
    }

    await this.authenticateUserSmart(user.email || user.username, currentPassword);
    await this.adminRequest(`/api/collections/users/records/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: {
        password: newPassword,
        passwordConfirm: newPassword,
        updated_at: new Date().toISOString(),
      },
    });

    const now = new Date().toISOString();
    const score = getPasswordStrengthScore(newPassword);
    const existing = await this.getPasswordCredential(user.id).catch(() => null);
    if (existing) {
      await this.adminRequest(`/api/collections/password_credentials/records/${encodeURIComponent(existing.id)}`, {
        method: 'PATCH',
        body: {
          changed_at: now,
          strength_score: score,
          updated_at: now,
        },
      });
    } else {
      await this.adminRequest('/api/collections/password_credentials/records', {
        method: 'POST',
        body: {
          user_id: user.id,
          changed_at: now,
          strength_score: score,
          created_at: now,
          updated_at: now,
        },
      });
    }

    return { changedAt: now, strengthScore: score };
  }

  async getPasswordCredential(userId) {
    const filter = encodeURIComponent(`user_id = "${escapeFilterValue(userId)}"`);
    const result = await this.adminRequest(
      `/api/collections/password_credentials/records?filter=${filter}&perPage=1`,
    );
    return result.items?.[0] || null;
  }

  async getSecurityOverview(user, context) {
    await Promise.all([
      this.ensureSecurityPin(user).catch(() => null),
      this.upsertDeviceSession(user.id, context).catch(() => null),
    ]);

    const [biometric, twoFactor, devices, passwordCredential] = await Promise.all([
      this.getBiometricLock(user.id, context).catch(() => null),
      this.getTwoFactorSettings(user.id).catch(() => null),
      this.listDeviceSessions(user.id).catch(() => []),
      this.getPasswordCredential(user.id).catch(() => null),
    ]);

    return {
      biometricLock: {
        enabled: Boolean(biometric?.enabled),
        devicePlatform: biometric?.device_platform || context.devicePlatform || '',
        updatedAt: biometric?.updated_at || '',
      },
      twoFactor: {
        enabled: Boolean(twoFactor?.enabled),
        method: twoFactor?.method || 'app_otp',
        transferRequired: Boolean(twoFactor?.transfer_required),
        updatedAt: twoFactor?.updated_at || '',
      },
      pin: {
        configured: Boolean(user.pin_hash),
      },
      password: {
        changedAt: passwordCredential?.changed_at || '',
        strengthScore: Number(passwordCredential?.strength_score || 0),
      },
      devices: devices.map((device) => ({
        id: device.id,
        platform: device.device_platform || '',
        info: device.device_info || '',
        lastSeenAt: device.last_seen_at || '',
        isCurrent: device.device_id === getStableDeviceId(context),
      })),
    };
  }

  async authenticateBearer(token) {
    if (!token) {
      throw new HttpError(401, 'Authorization token is required.');
    }

    const auth = await this.request('/api/collections/users/auth-refresh', {
      method: 'POST',
      token,
    });

    return this.withUserFileUrls(auth.record);
  }

  async createWallet(userId, currency = config.defaultWalletCurrency) {
    const now = new Date().toISOString();
    return this.adminRequest('/api/collections/wallets/records', {
      method: 'POST',
      body: {
        user_id: userId,
        currency,
        balance: 0,
        locked_balance: 0,
        total_deposited: 0,
        total_withdrawn: 0,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async getWallets(userId) {
    const filter = encodeURIComponent(`user_id = "${userId}"`);
    const result = await this.adminRequest(
      `/api/collections/wallets/records?filter=${filter}&sort=currency&perPage=50`,
    );
    const wallets = result.items || [];
    const reconciled = [];
    for (const wallet of wallets) {
      reconciled.push(await this.reconcileWalletBalance(wallet, 'wallets.get'));
    }
    return reconciled;
  }

  async ensureDefaultWallet(userId) {
    const wallets = await this.getWallets(userId);
    const existing = wallets.find((wallet) => wallet.currency === config.defaultWalletCurrency);
    if (existing) return existing;
    return this.createWallet(userId);
  }

  async getPaymentProfile(userId) {
    const filter = encodeURIComponent(`user_id = "${escapeFilterValue(userId)}"`);
    const result = await this.adminRequest(
      `/api/collections/payment_profiles/records?filter=${filter}&perPage=1`,
    );

    return result.items?.[0] || null;
  }

  async ensurePaymentProfile(user) {
    const existing = await this.getPaymentProfile(user.id);
    if (existing) return existing;

    const now = new Date().toISOString();
    const paymentTag = await this.generateUniquePaymentTag(user);
    const displayName = getDisplayName(user);
    const qrPayload = JSON.stringify({
      type: 'oroya-payment-profile',
      version: 1,
      payment_tag: paymentTag,
      display_name: displayName,
    });

    return this.adminRequest('/api/collections/payment_profiles/records', {
      method: 'POST',
      body: {
        user_id: user.id,
        payment_tag: paymentTag,
        display_name: displayName,
        qr_payload: qrPayload,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async generateUniquePaymentTag(user) {
    const base = sanitizePaymentTag(user.username || getDisplayName(user) || user.id);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = crypto.randomBytes(2).toString('hex');
      const candidate = `${base}${suffix}`.slice(0, 24);
      const filter = encodeURIComponent(`payment_tag = "${escapeFilterValue(candidate)}"`);
      const result = await this.adminRequest(
        `/api/collections/payment_profiles/records?filter=${filter}&perPage=1`,
      );
      if (!result.items?.length) return candidate;
    }

    return `oroya${crypto.randomBytes(8).toString('hex')}`;
  }

  async ensureWallet(userId, currency) {
    const normalizedCurrency = normalizeCurrency(currency);
    const wallets = await this.getWallets(userId);
    const existing = wallets.find(
      (wallet) => normalizeCurrency(wallet.currency) === normalizedCurrency,
    );
    if (existing) return existing;
    return this.createWallet(userId, normalizedCurrency);
  }

  async updateWalletBalance(wallet, amountDelta) {
    const trustedWallet = await this.reconcileWalletBalance(wallet, 'wallets.deposit_before_update');
    const currentBalance = Number(trustedWallet.balance || 0);
    const currentDeposited = Number(wallet.total_deposited || 0);

    return this.adminRequest(`/api/collections/wallets/records/${encodeURIComponent(wallet.id)}`, {
      method: 'PATCH',
      body: {
        balance: roundMoney(currentBalance + amountDelta),
        total_deposited: currentDeposited + amountDelta,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async updateWalletForInternalTransfer(wallet, amountDelta) {
    const trustedWallet = await this.reconcileWalletBalance(wallet, 'wallets.transfer_before_update');
    const currentBalance = Number(trustedWallet.balance || 0);
    const nextBalance = roundMoney(currentBalance + amountDelta);

    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      throw new HttpError(409, 'Insufficient wallet balance.', {
        code: 'insufficient_balance',
      });
    }

    return this.adminRequest(`/api/collections/wallets/records/${encodeURIComponent(wallet.id)}`, {
      method: 'PATCH',
      body: {
        balance: nextBalance,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async reconcileWalletBalance(wallet, reason = 'wallets.reconcile') {
    if (!wallet?.id || !wallet.user_id) return wallet;

    const expected = await this.calculateAuthoritativeBalance(wallet.user_id, wallet.currency);
    const current = roundMoney(Number(wallet.balance || 0));
    const locked = roundMoney(Number(wallet.locked_balance || 0));
    if (current === expected && locked >= 0) return wallet;

    const corrected = await this.adminRequest(`/api/collections/wallets/records/${encodeURIComponent(wallet.id)}`, {
      method: 'PATCH',
      body: {
        balance: expected,
        locked_balance: Math.max(0, locked),
        updated_at: new Date().toISOString(),
      },
    });

    await this.createAuditLog({
      userId: wallet.user_id,
      action: 'wallets.balance_tamper_corrected',
      metadata: {
        wallet_id: wallet.id,
        currency: wallet.currency,
        previous_balance: current,
        corrected_balance: expected,
        reason,
      },
    }).catch(() => {});

    return corrected;
  }

  async calculateAuthoritativeBalance(userId, currency) {
    const normalizedCurrency = normalizeCurrency(currency);
    const filter = encodeURIComponent(
      `currency = "${escapeFilterValue(normalizedCurrency)}" && status = "completed" && (user_id = "${escapeFilterValue(userId)}" || sender_user_id = "${escapeFilterValue(userId)}" || receiver_user_id = "${escapeFilterValue(userId)}")`,
    );
    const result = await this.adminRequest(
      `/api/collections/transactions/records?filter=${filter}&sort=created_at&perPage=500`,
    );

    let balance = 0;
    for (const transaction of result.items || []) {
      if (!this.isTransactionIntegrityTrusted(transaction)) {
        await this.createAuditLog({
          userId,
          action: 'wallets.transaction_tamper_detected',
          metadata: {
            transaction_id: transaction.id,
            reference_id: transaction.reference_id || '',
            currency: transaction.currency || '',
          },
        }).catch(() => {});
        continue;
      }

      const amount = roundMoney(Number(transaction.amount || 0));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      if (transaction.type === 'deposit' && transaction.user_id === userId) {
        balance = roundMoney(balance + amount);
      } else if (transaction.type === 'send' && transaction.sender_user_id === userId) {
        balance = roundMoney(balance - amount);
      } else if (transaction.type === 'send' && transaction.receiver_user_id === userId) {
        balance = roundMoney(balance + amount);
      } else if (transaction.type === 'withdrawal' && transaction.user_id === userId) {
        balance = roundMoney(balance - amount);
      }
    }

    const roundedBalance = roundMoney(balance);
    if (roundedBalance < 0) {
      await this.createAuditLog({
        userId,
        action: 'wallets.negative_ledger_detected',
        metadata: {
          currency: normalizedCurrency,
          calculated_balance: roundedBalance,
        },
      }).catch(() => {});
      throw new HttpError(409, 'Wallet ledger integrity violation.', {
        code: 'wallet_ledger_integrity_violation',
      });
    }

    return roundedBalance;
  }

  async getDailyTransferStats(userId, direction) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const userField = direction === 'receive' ? 'receiver_user_id' : 'sender_user_id';
    const filter = encodeURIComponent(
      `${userField} = "${escapeFilterValue(userId)}" && type = "send" && status = "completed" && created_at >= "${start.toISOString()}"`,
    );
    const result = await this.adminRequest(
      `/api/collections/transactions/records?filter=${filter}&perPage=200`,
    );
    const items = result.items || [];

    return {
      count: items.length,
      amount: items.reduce((total, transaction) => total + Number(transaction.amount || 0), 0),
    };
  }

  async createInternalTransferTransaction(input) {
    const now = new Date().toISOString();

    return this.createTransactionRecord({
      user_id: input.senderUserId,
      type: 'send',
      amount: input.amount,
      currency: input.currency,
      status: 'completed',
      provider: 'oroya',
      sender_user_id: input.senderUserId,
      receiver_user_id: input.receiverUserId,
      reference_id: input.referenceId,
      note: input.note || '',
      created_at: now,
      completed_at: now,
      updated_at: now,
    });
  }

  async createAuditLog({ userId, action, ipAddress, deviceInfo, metadata }) {
    const safeMetadata = sanitizeMetadata(metadata || {});

    return this.adminRequest('/api/collections/audit_logs/records', {
      method: 'POST',
      body: {
        user_id: userId || '',
        action,
        ip_address: String(ipAddress || '').slice(0, 80),
        device_info: sanitizeLogString(deviceInfo || '', 300),
        metadata: safeMetadata,
        created_at: new Date().toISOString(),
      },
    });
  }

  async createPaymentIntent(input) {
    const now = new Date().toISOString();

    return this.adminRequest('/api/collections/payment_intents/records', {
      method: 'POST',
      body: {
        user_id: input.userId,
        amount: input.amount,
        currency: input.currency,
        network: input.network,
        reference_id: input.referenceId,
        nowpayments_payment_id: input.nowPaymentsPaymentId,
        payment_address: input.paymentAddress || '',
        payment_url: input.paymentUrl || '',
        status: input.status,
        expires_at: input.expiresAt || '',
        created_at: now,
        updated_at: now,
      },
    });
  }

  async findPaymentIntent({ paymentId, referenceId }) {
    const filters = [];
    if (paymentId) filters.push(`nowpayments_payment_id = "${escapeFilterValue(paymentId)}"`);
    if (referenceId) filters.push(`reference_id = "${escapeFilterValue(referenceId)}"`);

    if (!filters.length) {
      throw new HttpError(400, 'payment_id or reference_id is required.');
    }

    const filter = encodeURIComponent(filters.join(' || '));
    const result = await this.adminRequest(
      `/api/collections/payment_intents/records?filter=${filter}&perPage=1`,
    );

    return result.items?.[0] || null;
  }

  async updatePaymentIntent(intentId, patch) {
    return this.adminRequest(
      `/api/collections/payment_intents/records/${encodeURIComponent(intentId)}`,
      {
        method: 'PATCH',
        body: {
          ...patch,
          updated_at: new Date().toISOString(),
        },
      },
    );
  }

  async findTransactionByReference(referenceId) {
    const filter = encodeURIComponent(`reference_id = "${escapeFilterValue(referenceId)}"`);
    const result = await this.adminRequest(
      `/api/collections/transactions/records?filter=${filter}&perPage=1`,
    );

    return result.items?.[0] || null;
  }

  async createDepositTransaction(input) {
    const now = new Date().toISOString();

    return this.createTransactionRecord({
      user_id: input.userId,
      type: 'deposit',
      amount: input.amount,
      currency: input.currency,
      status: input.status || 'pending',
      provider: 'nowpayments',
      provider_payment_id: input.providerPaymentId,
      wallet_address: input.walletAddress || '',
      network: input.network || '',
      reference_id: input.referenceId,
      note: input.note || '',
      created_at: now,
      completed_at: input.completedAt || '',
      updated_at: now,
    });
  }

  async createTransactionRecord(body) {
    const signedBody = signTransactionBody(body);
    try {
      return await this.adminRequest('/api/collections/transactions/records', {
        method: 'POST',
        body: signedBody,
      });
    } catch (error) {
      if (!isUnknownFieldError(error, ['integrity_hash', 'integrity_version'])) throw error;
      if (!config.security.allowUnsignedLedger) {
        throw new HttpError(500, 'Transaction integrity fields are missing.', {
          code: 'transaction_integrity_schema_missing',
        });
      }
      return this.adminRequest('/api/collections/transactions/records', {
        method: 'POST',
        body,
      });
    }
  }

  async completeTransaction(transaction) {
    const patch = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const signedBody = signTransactionBody({ ...transaction, ...patch });
    try {
      return await this.adminRequest(
        `/api/collections/transactions/records/${encodeURIComponent(transaction.id)}`,
        {
          method: 'PATCH',
          body: {
            ...patch,
            integrity_version: signedBody.integrity_version,
            integrity_hash: signedBody.integrity_hash,
          },
        },
      );
    } catch (error) {
      if (!isUnknownFieldError(error, ['integrity_hash', 'integrity_version'])) throw error;
      if (!config.security.allowUnsignedLedger) {
        throw new HttpError(500, 'Transaction integrity fields are missing.', {
          code: 'transaction_integrity_schema_missing',
        });
      }
      return this.adminRequest(
        `/api/collections/transactions/records/${encodeURIComponent(transaction.id)}`,
        {
          method: 'PATCH',
          body: patch,
        },
      );
    }
  }

  isTransactionIntegrityTrusted(transaction) {
    if (!transaction.integrity_hash) return config.security.allowUnsignedLedger;
    const expected = getTransactionSignature(transaction);
    const actual = String(transaction.integrity_hash || '');
    if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  async getTransactionsForUser(userId) {
    const filter = encodeURIComponent(
      `user_id = "${escapeFilterValue(userId)}" || sender_user_id = "${escapeFilterValue(userId)}" || receiver_user_id = "${escapeFilterValue(userId)}"`,
    );
    const result = await this.adminRequest(
      `/api/collections/transactions/records?filter=${filter}&sort=-created_at&perPage=100`,
    );

    const mapped = [];
    for (const transaction of result.items || []) {
      const isReceiver = transaction.type === 'send' && transaction.receiver_user_id === userId;
      const sender = transaction.sender_user_id ? await this.getUserById(transaction.sender_user_id) : null;
      const receiver = transaction.receiver_user_id ? await this.getUserById(transaction.receiver_user_id) : null;

      mapped.push({
        id: transaction.id,
        user_id: transaction.user_id || '',
        sender_id: transaction.sender_user_id || '',
        receiver_id: transaction.receiver_user_id || '',
        sender_name: sender ? getDisplayName(sender) : '',
        receiver_name: receiver ? getDisplayName(receiver) : '',
        sender_avatar: sender?.profile_photo_url || '',
        receiver_avatar: receiver?.profile_photo_url || '',
        amount: Number(transaction.amount || 0),
        currency: transaction.currency || config.defaultWalletCurrency,
        type: isReceiver ? 'receive' : transaction.type || 'deposit',
        status: transaction.status || 'pending',
        provider: transaction.provider || '',
        provider_payment_id: transaction.provider_payment_id || '',
        provider_payout_id: transaction.provider_payout_id || '',
        wallet_address: transaction.wallet_address || '',
        network: transaction.network || '',
        note: transaction.note || '',
        reference_id: transaction.reference_id || transaction.id,
        created_at: transaction.created_at || transaction.created || '',
        completed_at: transaction.completed_at || '',
        updated_at: transaction.updated_at || transaction.updated || '',
      });
    }

    return mapped;
  }

  async signUnsignedTransactions(limit = 500) {
    const result = await this.adminRequest(
      `/api/collections/transactions/records?sort=created_at&perPage=${limit}`,
    );
    let signed = 0;

    for (const transaction of result.items || []) {
      if (transaction.integrity_hash) continue;
      const signedBody = signTransactionBody(transaction);
      await this.adminRequest(
        `/api/collections/transactions/records/${encodeURIComponent(transaction.id)}`,
        {
          method: 'PATCH',
          body: {
            integrity_version: signedBody.integrity_version,
            integrity_hash: signedBody.integrity_hash,
            updated_at: transaction.updated_at || transaction.updated || new Date().toISOString(),
          },
        },
      );
      signed += 1;
    }

    return signed;
  }

  async getUserById(userId) {
    try {
      const user = await this.adminRequest(`/api/collections/users/records/${encodeURIComponent(userId)}`);
      return this.withUserFileUrls(user);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  withUserFileUrls(user) {
    if (!user) return user;
    const profilePhotoUrl = user.profile_photo_url || getRecordFileUrl(this.baseUrl, 'users', user, 'profile_photo_file');
    const selfiePhotoUrl = user.selfie_photo_url || getRecordFileUrl(this.baseUrl, 'users', user, 'selfie_photo_file');
    return {
      ...user,
      profile_photo_url: profilePhotoUrl,
      selfie_photo_url: selfiePhotoUrl,
    };
  }

  async findPaymentProfileByTag(paymentTag) {
    const filter = encodeURIComponent(
      `payment_tag = "${escapeFilterValue(sanitizePaymentTag(paymentTag))}" && is_active = true`,
    );
    const result = await this.adminRequest(
      `/api/collections/payment_profiles/records?filter=${filter}&perPage=1`,
    );

    return result.items?.[0] || null;
  }

  async searchUsersForFriend(query, currentUserId) {
    const cleanQuery = String(query || '').trim();
    if (cleanQuery.length < 3) return [];

    const normalizedTag = sanitizePaymentTag(cleanQuery.replace(/^#|@/g, ''));
    const filters = [
      `username ~ "${escapeFilterValue(cleanQuery.replace(/^@/, ''))}"`,
      `email ~ "${escapeFilterValue(cleanQuery)}"`,
    ];

    if (normalizedTag.length >= 3) {
      const profile = await this.findPaymentProfileByTag(normalizedTag);
      if (profile?.user_id && profile.user_id !== currentUserId) {
        const user = await this.getUserById(profile.user_id);
        return user ? [await this.toFriendUser(user)] : [];
      }
    }

    const filter = encodeURIComponent(`(${filters.join(' || ')}) && id != "${escapeFilterValue(currentUserId)}"`);
    const result = await this.adminRequest(
      `/api/collections/users/records?filter=${filter}&perPage=20&sort=username`,
    );

    const users = result.items || [];
    return Promise.all(users.map((user) => this.toFriendUser(user)));
  }

  async toFriendUser(user) {
    const profile = await this.ensurePaymentProfile(user);
    return {
      id: user.id,
      displayName: getDisplayName(user),
      username: user.username || '',
      phone: user.phone || '',
      avatarUrl: user.profile_photo_url || getRecordFileUrl(this.baseUrl, 'users', user, 'profile_photo_file'),
      oroyaId: profile.payment_tag,
    };
  }

  async listFriendRequests(userId) {
    const filter = encodeURIComponent(
      `requester_user_id = "${escapeFilterValue(userId)}" || receiver_user_id = "${escapeFilterValue(userId)}"`,
    );
    const result = await this.adminRequest(
      `/api/collections/friend_requests/records?filter=${filter}&sort=-created_at&perPage=100`,
    );

    const requests = [];
    for (const request of result.items || []) {
      const otherUserId = request.requester_user_id === userId
        ? request.receiver_user_id
        : request.requester_user_id;
      const otherUser = await this.getUserById(otherUserId);
      requests.push({
        id: request.id,
        requesterUserId: request.requester_user_id,
        receiverUserId: request.receiver_user_id,
        direction: request.requester_user_id === userId ? 'outgoing' : 'incoming',
        status: request.status,
        createdAt: request.created_at || request.created,
        respondedAt: request.responded_at || '',
        user: otherUser ? await this.toFriendUser(otherUser) : null,
      });
    }

    return requests.filter((request) => request.user);
  }

  async findFriendship(userId, friendUserId) {
    const [userAId, userBId] = sortUserPair(userId, friendUserId);
    const filter = encodeURIComponent(
      `user_a_id = "${escapeFilterValue(userAId)}" && user_b_id = "${escapeFilterValue(userBId)}"`,
    );
    const result = await this.adminRequest(
      `/api/collections/friendships/records?filter=${filter}&perPage=1`,
    );

    return result.items?.[0] || null;
  }

  async findPendingFriendRequest(userId, friendUserId) {
    const filter = encodeURIComponent(
      `status = "pending" && ((requester_user_id = "${escapeFilterValue(userId)}" && receiver_user_id = "${escapeFilterValue(friendUserId)}") || (requester_user_id = "${escapeFilterValue(friendUserId)}" && receiver_user_id = "${escapeFilterValue(userId)}"))`,
    );
    const result = await this.adminRequest(
      `/api/collections/friend_requests/records?filter=${filter}&perPage=1`,
    );

    return result.items?.[0] || null;
  }

  async createFriendRequest({ requesterUserId, receiverUserId, message }) {
    if (requesterUserId === receiverUserId) {
      throw new HttpError(400, 'You cannot add yourself as a friend.');
    }

    const receiver = await this.getUserById(receiverUserId);
    if (!receiver) {
      throw new HttpError(404, 'User not found.');
    }

    const friendship = await this.findFriendship(requesterUserId, receiverUserId);
    if (friendship?.status === 'accepted') {
      throw new HttpError(409, 'This user is already your friend.');
    }

    const pending = await this.findPendingFriendRequest(requesterUserId, receiverUserId);
    if (pending) return pending;

    const now = new Date().toISOString();
    return this.adminRequest('/api/collections/friend_requests/records', {
      method: 'POST',
      body: {
        requester_user_id: requesterUserId,
        receiver_user_id: receiverUserId,
        status: 'pending',
        message: message || '',
        created_at: now,
        updated_at: now,
      },
    });
  }

  async acceptFriendRequest(requestId, currentUserId) {
    const request = await this.adminRequest(
      `/api/collections/friend_requests/records/${encodeURIComponent(requestId)}`,
    );

    if (request.receiver_user_id !== currentUserId) {
      throw new HttpError(403, 'Only the receiver can accept this request.');
    }

    if (request.status !== 'pending') {
      throw new HttpError(409, 'This request is no longer pending.');
    }

    const now = new Date().toISOString();
    await this.adminRequest(`/api/collections/friend_requests/records/${encodeURIComponent(request.id)}`, {
      method: 'PATCH',
      body: {
        status: 'accepted',
        responded_at: now,
        updated_at: now,
      },
    });

    const [userAId, userBId] = sortUserPair(request.requester_user_id, request.receiver_user_id);
    const existing = await this.findFriendship(userAId, userBId);
    const friendship = existing || await this.adminRequest('/api/collections/friendships/records', {
      method: 'POST',
      body: {
        user_a_id: userAId,
        user_b_id: userBId,
        request_id: request.id,
        status: 'accepted',
        created_at: now,
        updated_at: now,
      },
    });

    const thread = await this.ensureChatThread(friendship);
    return { friendship, thread };
  }

  async listFriends(userId) {
    const filter = encodeURIComponent(
      `status = "accepted" && (user_a_id = "${escapeFilterValue(userId)}" || user_b_id = "${escapeFilterValue(userId)}")`,
    );
    const result = await this.adminRequest(
      `/api/collections/friendships/records?filter=${filter}&sort=-created_at&perPage=100`,
    );

    const friends = [];
    for (const friendship of result.items || []) {
      const friendUserId = friendship.user_a_id === userId ? friendship.user_b_id : friendship.user_a_id;
      const friendUser = await this.getUserById(friendUserId);
      if (!friendUser) continue;
      const thread = await this.ensureChatThread(friendship);
      friends.push({
        id: friendship.id,
        userId,
        friendId: friendUserId,
        status: friendship.status,
        createdAt: friendship.created_at || friendship.created,
        threadId: thread.id,
        user: await this.toFriendUser(friendUser),
      });
    }

    return friends;
  }

  async ensureChatThread(friendship) {
    const [userAId, userBId] = sortUserPair(friendship.user_a_id, friendship.user_b_id);
    const filter = encodeURIComponent(
      `user_a_id = "${escapeFilterValue(userAId)}" && user_b_id = "${escapeFilterValue(userBId)}"`,
    );
    const result = await this.adminRequest(
      `/api/collections/chat_threads/records?filter=${filter}&perPage=1`,
    );
    if (result.items?.[0]) return result.items[0];

    const now = new Date().toISOString();
    return this.adminRequest('/api/collections/chat_threads/records', {
      method: 'POST',
      body: {
        friendship_id: friendship.id,
        user_a_id: userAId,
        user_b_id: userBId,
        last_message: '',
        last_message_at: '',
        created_at: now,
        updated_at: now,
      },
    });
  }

  async getChatThreadForUser(threadId, userId) {
    const thread = await this.adminRequest(
      `/api/collections/chat_threads/records/${encodeURIComponent(threadId)}`,
    );
    if (thread.user_a_id !== userId && thread.user_b_id !== userId) {
      throw new HttpError(403, 'You do not have access to this chat.');
    }
    return thread;
  }

  async listChatMessages(threadId, userId) {
    await this.getChatThreadForUser(threadId, userId);
    const filter = encodeURIComponent(`thread_id = "${escapeFilterValue(threadId)}"`);
    const result = await this.adminRequest(
      `/api/collections/chat_messages/records?filter=${filter}&sort=created_at&perPage=100`,
    );

    const now = new Date().toISOString();
    const messages = [];
    for (const message of result.items || []) {
      let readAt = message.read_at || '';
      let status = message.status;
      if (message.receiver_user_id === userId && !readAt) {
        readAt = now;
        status = 'read';
        await this.adminRequest(`/api/collections/chat_messages/records/${encodeURIComponent(message.id)}`, {
          method: 'PATCH',
          body: {
            status,
            read_at: readAt,
          },
        });
      }

      const sender = await this.getUserById(message.sender_user_id);
      const receiver = await this.getUserById(message.receiver_user_id);
      messages.push({
        id: message.id,
        threadId: message.thread_id,
        senderUserId: message.sender_user_id,
        receiverUserId: message.receiver_user_id,
        message: message.message,
        messageType: normalizeChatMessageType(message.message_type),
        metadata: normalizeChatMetadata(message.metadata),
        status,
        createdAt: message.created_at || message.created,
        deliveredAt: message.delivered_at || '',
        readAt,
        senderAvatar: sender?.profile_photo_url || '',
        receiverAvatar: receiver?.profile_photo_url || '',
      });
    }

    return messages;
  }

  async createChatMessage({ threadId, senderUserId, message, messageType = 'text', metadata = {} }) {
    const thread = await this.getChatThreadForUser(threadId, senderUserId);
    const receiverUserId = thread.user_a_id === senderUserId ? thread.user_b_id : thread.user_a_id;
    const friendship = await this.findFriendship(senderUserId, receiverUserId);
    if (!friendship || friendship.status !== 'accepted') {
      throw new HttpError(403, 'You can only message accepted friends.');
    }

    const cleanType = normalizeChatMessageType(messageType);
    const cleanMetadata = normalizeChatMetadata(metadata);
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) {
      throw new HttpError(400, 'Message is required.');
    }
    if (cleanMessage.length > 1000) {
      throw new HttpError(400, 'Message is too long.');
    }
    validateChatMessagePayload(cleanType, cleanMessage, cleanMetadata);

    const now = new Date().toISOString();
    const record = await this.adminRequest('/api/collections/chat_messages/records', {
      method: 'POST',
      body: {
        thread_id: thread.id,
        sender_user_id: senderUserId,
        receiver_user_id: receiverUserId,
        message: cleanMessage,
        message_type: cleanType,
        metadata: cleanMetadata,
        status: 'delivered',
        created_at: now,
        delivered_at: now,
        read_at: '',
      },
    });

    await this.adminRequest(`/api/collections/chat_threads/records/${encodeURIComponent(thread.id)}`, {
      method: 'PATCH',
      body: {
        last_message: getChatThreadPreview(cleanType, cleanMessage, cleanMetadata),
        last_message_at: now,
        updated_at: now,
      },
    });

    return {
      id: record.id,
      threadId: record.thread_id,
      senderUserId: record.sender_user_id,
      receiverUserId: record.receiver_user_id,
      message: record.message,
      messageType: cleanType,
      metadata: cleanMetadata,
      status: record.status,
      createdAt: record.created_at || record.created,
      deliveredAt: record.delivered_at || '',
      readAt: record.read_at || '',
    };
  }

  async listNotifications(userId) {
    const items = [];
    const requests = await this.listFriendRequests(userId);
    for (const request of requests) {
      if (request.direction === 'incoming' && request.status === 'pending') {
        items.push({
          id: `friend_request:${request.id}`,
          type: 'friend_request',
          title: 'New friend request',
          body: `${request.user.displayName} wants to connect with you.`,
          imageUrl: request.user.avatarUrl || '',
          icon: 'person-add-outline',
          linkUrl: '',
          referenceCollection: 'friend_requests',
          referenceId: request.id,
          isRead: false,
          createdAt: request.createdAt,
          readAt: '',
          metadata: {
            requesterUserId: request.requesterUserId,
            username: request.user.username,
            oroyaId: request.user.oroyaId || '',
          },
        });
      }

      if (request.direction === 'outgoing' && request.status === 'accepted') {
        items.push({
          id: `friend_accept:${request.id}`,
          type: 'friend_accept',
          title: 'Friend request accepted',
          body: `${request.user.displayName} is now your friend.`,
          imageUrl: request.user.avatarUrl || '',
          icon: 'checkmark-circle-outline',
          linkUrl: '',
          referenceCollection: 'friend_requests',
          referenceId: request.id,
          isRead: true,
          createdAt: request.respondedAt || request.createdAt,
          readAt: request.respondedAt || '',
          metadata: {
            friendUserId: request.receiverUserId,
            username: request.user.username,
            oroyaId: request.user.oroyaId || '',
          },
        });
      }
    }

    try {
      const notifications = await this.adminRequest(
        '/api/collections/notifications/records?filter=' +
          encodeURIComponent('status = "published" && audience = "all"') +
          '&sort=-published_at,-created_at&perPage=100',
      );
      const reads = await this.getNotificationReads(userId);
      for (const notification of notifications.items || []) {
        const read = reads.get(notification.id);
        items.push({
          id: notification.id,
          type: notification.type || 'system',
          title: notification.title || 'Oroya',
          body: notification.body || '',
          imageUrl: notification.image_url || '',
          icon: notification.icon || 'notifications-outline',
          linkUrl: notification.link_url || '',
          referenceCollection: 'notifications',
          referenceId: notification.id,
          isRead: Boolean(read),
          createdAt: notification.published_at || notification.created_at || notification.created || '',
          readAt: read?.read_at || '',
          metadata: sanitizeMetadata(notification.metadata || {}),
        });
      }
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    return items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async getNotificationReads(userId) {
    const filter = encodeURIComponent(`user_id = "${escapeFilterValue(userId)}"`);
    const result = await this.adminRequest(
      `/api/collections/notification_reads/records?filter=${filter}&perPage=200`,
    );
    return new Map((result.items || []).map((item) => [item.notification_id, item]));
  }

  async markNotificationRead(userId, notificationId) {
    if (!notificationId || String(notificationId).includes(':')) return null;

    const filter = encodeURIComponent(
      `user_id = "${escapeFilterValue(userId)}" && notification_id = "${escapeFilterValue(notificationId)}"`,
    );
    const existing = await this.adminRequest(
      `/api/collections/notification_reads/records?filter=${filter}&perPage=1`,
    );
    if (existing.items?.[0]) return existing.items[0];

    const now = new Date().toISOString();
    return this.adminRequest('/api/collections/notification_reads/records', {
      method: 'POST',
      body: {
        user_id: userId,
        notification_id: notificationId,
        read_at: now,
        created_at: now,
      },
    });
  }

  async createAdminNotification(input) {
    const now = new Date().toISOString();
    return this.adminRequest('/api/collections/notifications/records', {
      method: 'POST',
      body: {
        title: sanitizeLogString(input.title, 120),
        body: sanitizeLogString(input.body, 1000),
        type: sanitizeLogString(input.type || 'system', 40),
        image_url: sanitizeLogString(input.imageUrl || '', 500),
        icon: sanitizeLogString(input.icon || 'notifications-outline', 60),
        link_url: sanitizeLogString(input.linkUrl || '', 500),
        audience: 'all',
        status: 'published',
        metadata: sanitizeMetadata(input.metadata || {}),
        published_at: now,
        created_at: now,
        updated_at: now,
      },
    });
  }
}

function hashSecret(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifySecret(value, storedValue) {
  const parts = String(storedValue || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, salt, storedHash] = parts;
  if (!/^[a-f0-9]+$/i.test(storedHash)) return false;

  const hash = crypto.scryptSync(String(value), salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

function sanitizeMetadata(metadata) {
  return redactMetadataValue(metadata, 0);
}

function redactMetadataValue(value, depth) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    if (depth >= 3) return '[truncated]';
    return value.slice(0, 20).map((item) => redactMetadataValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 3) return '[truncated]';
    const output = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, 50)) {
      output[key] = isSensitiveKey(key)
        ? '[redacted]'
        : redactMetadataValue(nestedValue, depth + 1);
    }
    return output;
  }

  if (typeof value === 'string') return sanitizeLogString(value, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  return String(value).slice(0, 100);
}

function isSensitiveKey(key) {
  const normalized = String(key);
  if (/_hash$/i.test(normalized) && !/password|passcode|pin|secret|token|credential/i.test(normalized)) {
    return false;
  }

  return /password|passcode|pin|secret|token|authorization|api[_-]?key|signature|credential/i
    .test(normalized);
}

function sanitizeLogString(value, maxLength) {
  return String(value)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeUser(record) {
  if (!record) return null;
  const profilePhotoUrl =
    record.profile_photo_url ||
    getRecordFileUrl(config.pocketBase.url, 'users', record, 'profile_photo_file');
  const selfiePhotoUrl =
    record.selfie_photo_url ||
    getRecordFileUrl(config.pocketBase.url, 'users', record, 'selfie_photo_file');

  const {
    pin_hash: _pinHash,
    tokenKey: _tokenKey,
    token: _token,
    password: _password,
    passwordConfirm: _passwordConfirm,
    verified: _verified,
    emailVisibility: _emailVisibility,
    ...safe
  } = record;

  return {
    ...safe,
    profile_photo_url: profilePhotoUrl,
    selfie_photo_url: selfiePhotoUrl,
  };
}

function normalizeCurrency(currency) {
  return String(currency || config.defaultWalletCurrency).trim().toUpperCase();
}

function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function signTransactionBody(body) {
  return {
    ...body,
    integrity_version: 'v1',
    integrity_hash: getTransactionSignature(body),
  };
}

function getTransactionSignature(transaction) {
  const payload = {
    user_id: transaction.user_id || '',
    type: transaction.type || '',
    amount: roundMoney(transaction.amount || 0),
    currency: normalizeCurrency(transaction.currency),
    status: transaction.status || '',
    provider: transaction.provider || '',
    provider_payment_id: transaction.provider_payment_id || '',
    provider_payout_id: transaction.provider_payout_id || '',
    sender_user_id: transaction.sender_user_id || '',
    receiver_user_id: transaction.receiver_user_id || '',
    reference_id: transaction.reference_id || '',
    created_at: transaction.created_at || transaction.created || '',
    completed_at: transaction.completed_at || '',
  };

  return crypto
    .createHmac('sha256', config.security.ledgerSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function isUnknownFieldError(error, fieldNames) {
  const text = JSON.stringify(error?.details || error?.data || error || {});
  return fieldNames.some((fieldName) => text.includes(fieldName));
}

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'profile-photo.jpg';
}

function sanitizePaymentTag(value) {
  const clean = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18);
  return clean.length >= 3 ? clean : `oro${clean}`;
}

function getDisplayName(user) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.name ||
    user.username ||
    user.email ||
    'Oroya User'
  );
}

function getRecordFileUrl(baseUrl, collectionName, record, fieldName) {
  const fileName = Array.isArray(record?.[fieldName]) ? record[fieldName][0] : record?.[fieldName];
  if (!fileName || !record?.id) return '';
  const collection = record.collectionId || record.collectionName || collectionName;
  return `${baseUrl}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(record.id)}/${encodeURIComponent(fileName)}`;
}

function sortUserPair(userId, friendUserId) {
  return [String(userId), String(friendUserId)].sort();
}

function getStableDeviceId(context) {
  const explicit = String(context?.deviceId || '').trim();
  if (explicit.length >= 8) {
    return `explicit_${crypto.createHash('sha256').update(explicit).digest('hex')}`;
  }

  const fallback = `${context?.ipAddress || ''}|${context?.deviceInfo || ''}`;
  return `fallback_${crypto.createHash('sha256').update(fallback).digest('hex')}`;
}

function getWeekKey(date) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return `${current.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

function getMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeIdList(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeChatMessageType(value) {
  const type = String(value || 'text').trim().toLowerCase();
  return ['text', 'money_gift', 'system'].includes(type) ? type : 'text';
}

function normalizeChatMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return {
    ...(value.amount !== undefined ? { amount: Number(value.amount) } : {}),
    ...(value.currency ? { currency: String(value.currency).trim().toUpperCase().slice(0, 12) } : {}),
    ...(value.title ? { title: sanitizeLogString(value.title, 80) } : {}),
    ...(value.subtitle ? { subtitle: sanitizeLogString(value.subtitle, 140) } : {}),
    ...(value.status ? { status: sanitizeLogString(value.status, 40) } : {}),
    demo: true,
  };
}

function validateChatMessagePayload(type, message, metadata) {
  if (type === 'text') return;
  if (type !== 'money_gift') {
    throw new HttpError(400, 'Unsupported chat message type.');
  }

  const amount = Number(metadata.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    throw new HttpError(400, 'Gift amount is invalid.');
  }

  if (!/^[A-Z0-9]{2,12}$/.test(String(metadata.currency || 'USD'))) {
    throw new HttpError(400, 'Gift currency is invalid.');
  }

  if (message.length > 180) {
    throw new HttpError(400, 'Gift message is too long.');
  }
}

function getChatThreadPreview(type, message, metadata) {
  if (type === 'money_gift') {
    const amount = Number(metadata.amount || 0).toFixed(2);
    const currency = metadata.currency || config.defaultWalletCurrency;
    return `Gift ${amount} ${currency}`;
  }

  return message.slice(0, 1000);
}

function getPasswordStrengthScore(password) {
  const value = String(password || '');
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;
  return Math.min(score, 5);
}

const pocketBase = new PocketBaseClient();

module.exports = {
  LEVEL_ONE_LIMITS,
  pocketBase,
  sanitizeUser,
};
