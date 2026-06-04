# OROYA — 20 Ajanlı Güvenlik Denetimi (Final Raporu)

**Tarih:** 2026-06-05
**Kapsam:** Backend (Node.js + PocketBase + NOWPayments + Firebase PNV) + Frontend (Expo / RN + Zustand) + Deployment (nginx, systemd, cron) + Test altyapısı
**Yöntem:** 20 adet paralel alt-ajan tarafından statik kod analizi. Kod değiştirilmedi, fix/exploit yazılmadı.
**Çıktı dili:** Türkçe
**Rapor sahibi:** Otomatik analiz sentezi

---

## 1. Yönetici Özeti

Oroya; kripto-cüzdan, anlık transfer, kripto-fiat para yatırma, PIN/2FA korumalı bir fintech uygulamasıdır. Denetim; backend (Node http + PocketBase superuser), frontend (Expo + Zustand), admin tool, deployment artifact'ları ve test altyapısı üzerinde 20 paralel alt-ajan ile yapılmıştır.

**Genel tablo:**
- Kod tabanı **savunma-prensipli bir tasarım** izliyor (HMAC, constant-time compare, fail-closed webhook, allowlist hata sızıntısı, fail-closed PNV, fail-closed CORS).
- Ancak **"kod var ama runtime'da çalışmıyor"** ve **"yapılandırma tek satır hata ile tüm güvenliği kapatıyor"** problemleri yoğun.
- **Çok sayıda operasyonel/tehlike-derinliği zayıflığı** var; production deploy için kapsamlı bir hardening listesi gerekli.

**Kritik seviye bulgular (acilen düzeltilmeli):**
1. **Hardcoded prod değerler** `backend/.env` dosyasında plaintext (PB superuser password, NOWPayments API key + IPN secret).
2. **NODE_ENV gate'i neredeyse tüm üretim güvenlik guard'larını devre dışı bırakıyor**: validateProductionConfig, CORS-`*` guard, admin IP allowlist, IPN private network allow hepsi NODE_ENV=production'a bağlı; NODE_ENV set edilmediyse tüm zincir pasif.
3. **Firebase PNV native modülü repoda YOK** → `services/firebasePnv.ts` her çağrıda `firebase_pnv_native_module_missing` throw ediyor. Backend `TRANSFER_2FA_THRESHOLD=0` (default) ile her transferde PNV istiyor → **prod'da transfer çalışmaz (fail-closed)**. Build artifact / native module eksik.
4. **Test paketi "kanıtlayıcı" değil**: Hardcoded fallback secret `q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^` `isStrongSecret` validator'ından geçiyor; çoğu test `Function.toString()` üzerinde regex match yapıyor; integration test yok; CI/CD yok; lockfile yok.
5. **PB superuser env'de plaintext + firewall/runbook artifact'ı YOK** — repo'dan deploy eden kişi PB'yi default ayarlarla 8090'da internete açabilir.
6. **C-1 /users/me/update** yalnızca bearer token ile çalışıyor, device token veya PIN doğrulaması yok → çalınmış bearer ile telefon değiştirilip transfer 2FA atlatılabilir.

**Karar:** 🟥 **RED** — Production'a çıkmadan önce en az 8-10 hafta arası bir hardening sprint gerekli (aşağıdaki P0 listesi için).

---

## 2. 20 Ajan — Kapsam ve Sorumluluklar

| # | Ajan | Kapsam | Bulgu sayısı |
|---|------|--------|--------------|
| 1 | **Auth & Registration** | `routes/auth.js`, register/login/logout/reset akışı, in-memory `loginAttempts`, email enumeration | ~14 |
| 2 | **JWT / Session & Bearer** | `authenticateBearer`, `revokeBearerTokensForUser`, `getUserTokenRevokedAfter` TOCTOU, PB tokenKey rotation | ~12 |
| 3 | **Device Token & Fingerprint** | `deviceToken.js`, `buildDeviceFingerprint`, TTL, secure compare, header spoof riski | ~13 |
| 4 | **Firebase PNV** | `firebasePnv.js`, JWKS, `verifyFirebasePnvToken`, `phoneNumbersMatch`, native module bağımlılığı | ~15 |
| 5 | **Transfer 2FA & Threshold** | `transfers.js`, `isTwoFactorRequiredForTransfer`, `TRANSFER_2FA_THRESHOLD=0` default, ticket HMAC, `withTransferLock` | ~16 |
| 6 | **Wallet / Ledger / Race** | `applyInternalTransferWithLock` (process-içi Map lock), `reconcileWalletBalance`, `calculateAuthoritativeBalance`, versionless PATCH | ~17 |
| 7 | **Deposit / NOWPayments Webhook** | `payments.js`, `nowpayments.js`, `isWebhookSourceAllowed`, `extractWebhookNonce`, cross-currency underpaid, refund/reversal phantom ledger | ~18 |
| 8 | **Refund & Reversal** | `payments.js` reversal logic, "deposit reversed" bakiye reconcile, "phantom ledger" senaryosu | (Agent 9 kapsamında) |
| 9 | **Webhook / IPN Source Validation** | IP allowlist boş → fail-closed, HMAC, replay, nonce table | (Agent 8 kapsamında) |
| 10 | **Rate Limiting (PB tabanlı)** | `enforceRateLimit` read-PATCH race, local burst, `enforceSecurityRateLimit` | ~12 |
| 11 | **PocketBase Schema & Rules** | `sync-pocketbase-schema.js`, superuser rules tüm collection'larda `null`, users collection'da pin_hash belirsiz | ~14 |
| 12 | **PB Rule / Permission** | `applyInternalTransferWithLock` lock sadece process-içi Map, multi-instance deploy'da bozulur, wallet unique index yok, devices unique, ipn nonce | (Agent 6, 11 kapsamında) |
| 13 | **Secret / Env / Config** | `config.js`, `.env`, `.env.example`, secret rotation, hardcoded fallback, prod validation NODE_ENV gate | **18** |
| 14 | **Frontend API Client** | `services/api/client.ts`, `firebasePnv.ts`, SecureStore, 401 handler, idempotency, cert pinning, timeout | **20** |
| 15 | **Frontend Auth Store** | `stores/authStore.ts`, `change-pin/password`, multi-device revoke, inactivity, biometric, mockData | **20** |
| 16 | **Frontend Transfer/Deposit Flow** | `app/send/confirm.tsx`, `app/deposit/*`, PIN modal, idempotency, screenshot, app switcher | **25** |
| 17 | **Notification / Social API** | `routes/{notifications,friends,chats,adminNotifications,users}.js`, search LIKE enumeration, N+1, per-user rate limit, IDOR | **22** |
| 18 | **Error Handling / 401 / 403** | `http.js`, `server.js` 5xx sanitize, `getErrorCode` 403→auth_failed, PII in audit log, setLevel bug, yarış koşulları | **21** |
| 19 | **Test Reality** | `security.test.js` mock-only, no integration, tautological, no CI, no lockfile, function.toString() testleri | **15** |
| 20 | **Production Deployment** | `deploy/nginx/oroya-backend.conf`, systemd, cron, /health, graceful shutdown, audit purge, NOWPayments prod fail-closed | **32** |

**Toplamda ~300+ bulgu (benzerler dahil).** Bu raporda **en kritik ve kanıtlanmış ~80 bulgu** sentezlenmiştir. Tüm 20 ajanın ham çıktısı ayrı dosyalarda tutulmaktadır.

---

## 3. KRİTİK BULGULAR (P0 — Acil)

### K-1 — Prod secret'ları working-tree'de plaintext
- **Etki:** Tüm kullanıcı verisine (cüzdan, transfer, audit) süperuser yetkisi.
- **Kanıt:** `backend/.env:4` `POCKETBASE_SUPERUSER_PASSWORD="9f!K7@tR3#xL2$Q8&vM5*sN6_Dc1Z4pT0aH7u5#G"`, `.env:7-9` NOWPayments API + IPN secret. `.gitignore` dosyayı yoksayıyor olsa da repoda çalışma ağacında duruyor.
- **Kaynak:** Agent 13 (S-13.1, S-13.2), Agent 19 (S-19.12).
- **Çözüm yönü:** Dosyayı repodan kaldır, .gitignore doğrula, PB'den rotate et, NOWPayments panelinden rotate et, gerekirse sızıntı taraması.

### K-2 — NODE_ENV gate tüm prod güvenlik zincirini atlar
- **Etki:** Operatör deploy sırasında `NODE_ENV=production` set etmeyi unutursa validateProductionConfig, CORS-`*` guard, admin IP allowlist, IPN private network allow hepsi pasif kalır.
- **Kanıt:**
  - `config.js:167` `if (process.env.NODE_ENV !== 'production') return;` → tüm prod validation atlanır.
  - `payments.js:93-95` IP allowlist boşsa prod'da tüm webhook reject; ama `NODE_ENV !== 'production'` ise private IP'lerden imzalı webhook kabul.
  - `adminNotifications.js:37` prod-only IP allowlist.
  - `.env`'de `NODE_ENV` set edilmemiş.
- **Kaynak:** Agent 13 (S-13.3, S-13.5, S-13.14), Agent 20 (S-20.31, S-20.24).
- **Çözüm yönü:** `validateProductionConfig` her zaman çalışsın; `BACKEND_DEPLOYMENT=production` zorunlu flag eklensin; ya da startup'ta `NODE_ENV` default `production` yapan bootstrap.

### K-3 — Firebase PNV native modülü repoda YOK
- **Etki:** `TRANSFER_2FA_THRESHOLD=0` default + native modül eksik → prod'da her transfer denemesi `firebase_pnv_native_module_missing` throw eder; transfer tamamlanamaz (fail-closed, ama kullanılamaz).
- **Kanıt:**
  - `services/firebasePnv.ts:10-14` `if (!module?.getVerifiedPhoneNumber) throw new Error('firebase_pnv_native_module_missing');`
  - `app.json` plugins listesinde native modül yok.
  - Backend `transfers.js:399` `Number(amount) >= 0` her zaman true → PNV her zaman istenir.
- **Kaynak:** Agent 4 (PNV), Agent 5 (Threshold), Agent 16 (S-16.11, **High**), Agent 14 (S-14.14).
- **Çözüm yönü:** Native modül kaynağı + `app.json` plugin + EAS build config; veya fallback (SMS OTP) veya feature flag ile PNV kapatılabilir yap.

### K-4 — Tautological test paketi
- **Etki:** "Tests pass" iddiası gerçek güvenliği kanıtlamıyor; CI yok; lockfile yok → CVE taraması tekrarlanabilir değil; hardcoded test secret üretim-doğrulamasını geçiyor → geliştirici bu string'i `.env`'e koyarsa sunucu sessizce ayağa kalkar.
- **Kanıt:**
  - `test/security.test.js:13-19` hardcoded `q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^` 4 secret için aynı fallback.
  - `test/security.test.js:1536-1609` aynı string "strong örnek" olarak `validateProductionConfig`'i geçiyor.
  - `applyInternalTransferWithLock` sadece `typeof === 'function'` testi (`test/security.test.js:495-498`).
  - `reconcileWalletBalance`, `calculateAuthoritativeBalance`, `verifyDeviceToken`, `buildDeviceFingerprint` davranışsal testi yok.
  - Çoğu test `Function.prototype.toString()` + regex match.
  - `package.json:13` sadece `node test/security.test.js`; mocha/jest/supertest YOK.
  - `backend/package-lock.json` YOK.
  - `.github/**/*`, `.gitlab-ci*` YOK.
- **Kaynak:** Agent 19 (S-19.1, S-19.2, S-19.3, S-19.4, S-19.5, S-19.6, S-19.7, S-19.8).
- **Çözüm yönü:** Integration test fixture, CI pipeline, lockfile, davranışsal testler, test fallback secret'larını `crypto.randomBytes(32)` ile üret.

### K-5 — PB superuser env'de plaintext + firewall/runbook artifact'ı YOK
- **Etki:** Operatör repo'dan deploy ederken PB'yi default ayarlarla 8090'da internete açabilir → tüm DB'ye public erişim.
- **Kanıt:** `pocketbase.js:49-79` superuser auth; systemd `EnvironmentFile=/etc/oroya/backend.env` mode/vault bilgisi yok; deploy artifact'ında firewall, PB systemd unit, backup planı, KMS yok.
- **Kaynak:** Agent 13 (S-13.1), Agent 20 (S-20.9, S-20.25).
- **Çözüm yönü:** PB systemd unit (User=oroya, --bind=127.0.0.1:8090), env file 0600, nginx `allow 127.0.0.1; deny all;`, RUNBOOK.md.

### K-6 — /users/me/update bearer-only, device token + PIN yok
- **Etki:** Çalınmış bearer token ile telefon değiştirilip transfer 2FA atlatılabilir.
- **Kanıt:** `routes/users.js:48-80` (`updateMe`) sadece `await pocketBase.authenticateBearer(token)`; device token veya PIN doğrulaması YOK.
- **Kaynak:** Agent 1.
- **Çözüm yönü:** `/users/me/update` en azından `verifySecurityPin` veya cihaz token doğrulaması + 2FA zorunlu kıl.

### K-7 — S-15.4 Change password tüm session'ları revoke etmiyor
- **Etki:** Şifre değiştirildiğinde diğer cihazdaki oturumlar hâlâ geçerli → hesap ele geçirilmiş cihaz hâlâ yetkili.
- **Kanıt:** `app/profile/change-password.tsx:50-55` `await changePassword(...) + await invalidateSession()`; backend'de `/auth/revoke-all-sessions` çağrılmıyor.
- **Kaynak:** Agent 15.

### K-8 — NOWPayments IPN fail-closed prod'da tüm webhook'ları reject eder (operasyonel)
- **Etki:** NOWPAYMENTS_IPN_ALLOWED_IPS env set edilmediyse prod'da tüm IPN'ler 403 → para yatırma işlemi tamamlanamaz, kullanıcı parayı kaybeder.
- **Kanıt:** `payments.js:90-95` `if (process.env.NODE_ENV === 'production') return false;` (boş listeyse).
- **Kaynak:** Agent 13 (S-13.4), Agent 20 (S-20.31).
- **Çözüm yönü:** NOWPayments'in gerçek egress IP listesini `.env.example`'a yorum olarak ekle; default boşsa uyarı; ya da allowlist'ten düşürüp sadece HMAC kontrolüne güven.

---

## 4. YÜKSEK BULGULAR (P1)

### Frontend Tarafı

#### F-H1 — Cert pinning yok (S-14.11)
- **Risk:** Compromised CA veya kurumsal MITM ile bearer + PIN header'a girebilir.
- **Kanıt:** `services/api/client.ts:129` `fetch(url, {...})` RN default; pinning kodu yok; app.json'da ATS exception tanımsız.
- **Çözüm yönü:** `react-native-ssl-pinning` veya SPKI hash pinning.

#### F-H2 — Token refresh mekanizması yok (S-14.6)
- **Risk:** Token expire = logout; hassas işlem ortasında expire olursa transfer yarım kalır.
- **Kanıt:** `services/api/client.ts:143-151` 401 → invalidateSession; refresh path yok.

#### F-H3 — Idempotency-Key sadece 2 POST'ta (S-14.8)
- **Risk:** Network retry → `change-pin`/`change-password`/`friends/request`/`chats/open` iki kez çalışabilir.
- **Kanıt:** `client.ts:301-303` `createIdempotencyKey` sadece `POST /transfers/send` ve `POST /payments/create-deposit`'ta.

#### F-H4 — Request timeout / AbortController yok (S-14.12)
- **Risk:** Yavaş/HTTP'de takılı istek UI'ı kilitler, pending state sızıntısı.
- **Kanıt:** `client.ts:127-133` `fetch(url, {...})` signal yok.

#### F-H5 — Service-katmanı input validation eksik (S-14.9)
- **Risk:** `amount` negatif/NaN/Infinity, `currency` whitelist dışı, `pin` format kontrolü yok.
- **Kanıt:** `services/api/transfers.ts:29-43`.

#### F-H6 — Amount input: çoklu ondalık noktası kabul (S-16.5)
- **Risk:** `1.2.3` sessizce `1.2`'ye kırpılır; receipt'te görünen ile server'a giden farklı.
- **Kanıt:** `app/send/index.tsx:178` `val.replace(/[^0-9.]/g, '')`.

#### F-H7 — Idempotency retry double-charge riski (S-16.9)
- **Risk:** Network drop sonrası retry yeni key → server ilk isteği işlemişse double-charge.
- **Kanıt:** `app/send/confirm.tsx:86-115` her PIN submit'inde `createIdempotencyKey('tr')`.

#### F-H8 — App backgrounding: biometricsEnabled=false ise lock overlay yok (S-16.19)
- **Risk:** App switcher snapshot'ı PIN dots'u yakalar.
- **Kanıt:** `app/_layout.tsx:14-63` AppState listener yalnızca `biometricsEnabled=true` ise `setIsAppLocked(true)`.

#### F-H9 — FLAG_SECURE / expo-screen-capture yok (S-16.20)
- **Risk:** PIN modal, 2FA modal, deposit address screenshot alınabilir.
- **Kanıt:** `app.json` Android permissions'ta yok; `_layout.tsx`'te `usePreventScreenshots()` import yok.

#### F-H10 — PIN 4 hane + blacklist yok (S-15.2, S-16.1)
- **Risk:** 0000, 1234, 1111 kabul; 10.000 olasılık offline brute-force'a açık.
- **Kanıt:** `utils/validation.ts:13` `/^\d{4}$/`; blacklist YOK.

#### F-H11 — Password policy yalnızca uzunluk (S-15.3)
- **Risk:** "password", "12345678" kabul; finansal uygulama için yetersiz.
- **Kanıt:** `utils/validation.ts:22` `password.length >= 8`.

#### F-H12 — Multi-device session invalidation yok (S-15.5)
- **Risk:** Aynı hesap birden fazla cihazda eşzamanlı açık.
- **Kanıt:** `stores/authStore.ts:221-237` login → push/revoke mekanizması yok.

### Backend Tarafı

#### B-H1 — Device fingerprint attacker-controlled header'lardan (Agent 3)
- **Risk:** Token çalınırsa aynı header'larla replay.
- **Kanıt:** `deviceToken.js:34-44` `buildDeviceFingerprint` X-Oroya-Device-Id, X-Oroya-Client-Platform, User-Agent → SHA256.

#### B-H2 — TOCTOU: `getUserTokenRevokedAfter` check-then-use (Agent 2)
- **Risk:** Revoke kontrolü ile kullanım arasında race; revoke edilmiş token ile request kabul.
- **Kanıt:** `pocketbase.js` authenticateBearer → revokeAfter lookup → token check ayrı çağrılar.

#### B-H3 — `applyInternalTransferWithLock` process-içi Map lock (Agent 6)
- **Risk:** Multi-instance deploy'da lock işe yaramaz → double-spend.
- **Kanıt:** `pocketbase.js:1554-1640` Map tabanlı lock.

#### B-H4 — `reconcileWalletBalance` versionless PATCH (Agent 6)
- **Risk:** In-flight transfer'ı eziltebilir; bakiye yanlış hesaplanabilir.
- **Kanıt:** `pocketbase.js:1372-1406` PATCH'te version kontrolü yok.

#### B-H5 — `enforceRateLimit` read-PATCH race (Agent 10)
- **Risk:** Aynı anda 100 istek aynı count'u okur, hepsi geçer, sonra hepsi 1 yazar.
- **Kanıt:** `rateLimit.js:30-132` PB PATCH-based sayaç, optimistic lock yok.

#### B-H6 — `device_security` counters read-PATCH race (Agent 3)
- **Kanıt:** `pocketbase.js:168-263` increment per-attempt, race window.

#### B-H7 — `login_user_ids` PATCH race (Agent 1)
- **Kanıt:** PB increment aynı pattern; concurrent login attempt'lerinde sayaç atlanır.

#### B-H8 — Cross-currency webhook unit mismatch (Agent 7)
- **Risk:** `paidCheckValue` BTC/EUR ile USD kıyaslıyor; non-stablecoin deposit'ler yanlışlıkla "underpaid" sayılır → kullanıcı parayı kaybeder.
- **Kanıt:** `payments.js:497-517`.

#### B-H9 — Phantom ledger on refund after spend (Agent 7+9)
- **Risk:** Kullanıcı deposit'i harcadıktan sonra refund gelirse `calculateAuthoritativeBalance` negative throw eder, reversal tx ledger'da var ama wallet reconcile başarısız → phantom ledger entry.
- **Kanıt:** `pocketbase.js:1408-1472` `calculateAuthoritativeBalance` 422/throw.

#### B-H10 — Kullanıcı LIKE enumeration (Agent 17, S-17.1)
- **Risk:** `~` LIKE joker `%`/`_` kaçışsız → tüm username tabanı 20'şerli sayfalarla enumerate edilebilir.
- **Kanıt:** `pocketbase.js:2007-2013` `escapeFilterValue` sadece `\` ve `"` kaçırıyor.

#### B-H11 — Per-user/per-route rate limit friends/chats/notifications'da yok (S-17.2)
- **Risk:** Tek IP'den 600/dk friend request/accept spam.
- **Kanıt:** `server.js:163-168` sadece global IP-based 600 POST/dk; route-specific scope YOK.

#### B-H12 — Audit log'a PII (username) düz metin (S-18.3)
- **Risk:** GDPR/KVKK ihlali; log aggregator sızıntısı.
- **Kanıt:** `auth.js:199-211` `username: input.username` (email hash'li, username değil).

#### B-H13 — 403 business code → logout tetikler (S-18.2)
- **Risk:** `chats.js:25` 403 (arkadaşlık kabul edilmemiş) → frontend `getErrorCode` `auth_failed` fallback → `invalidateSession` → kullanıcı + PIN + biyometrik flag silinir. DoS potansiyeli (auth'lı saldırgan kurbanı zorla logout ettirebilir).
- **Kanıt:** `client.ts:206-239` + `chats.js:25`.

#### B-H14 — CORS default `*` + `.env`'de explicit `*` (S-13.7)
- **Risk:** `BACKEND_LOCAL_ONLY=false` + `NODE_ENV=production` set edilmezse wildcard gerçekten açık.
- **Kanıt:** `.env:6` `CORS_ORIGIN=*`; `config.js:198-200` sadece prod'da fail.

#### B-H15 — Test sabit secret literal'leri kodda (S-13.6, S-19.1)
- **Risk:** Test fixture'ı olarak kullanılan string prod validator'ı geçiyor; repoda görünür.
- **Kanıt:** `test/security.test.js:13-19`, `config.js:207-216` `isStrongSecret`.

### Deployment & Operasyon

#### D-H1 — /health public değil, monitoring kırık (S-20.7)
- **Risk:** LB / health probe çalışmaz → sahte pozitif "up".
- **Kanıt:** `server.js:138-146` `enforceIngressPolicy` /health'i kapsıyor; `BACKEND_PUBLIC_INGRESS_PATHS` listesinde yok.

#### D-H2 — /health PB bağlantısını kontrol etmiyor (S-20.21)
- **Kanıt:** `server.js:192-199` sadece process ayağa mı diye bakıyor; `pocketBase.testConnection()` çağrılmıyor.

#### D-H3 — SIGTERM/SIGINT handler yok (S-20.8)
- **Risk:** systemd SIGTERM gönderdiğinde Node default'unda process hemen ölür → in-flight request, PB admin call, `reconcileWalletBalance` PATCH yarıda kalır.
- **Kanıt:** `server.js:209-235` startup catch var ama shutdown handler yok.

#### D-H4 — `isStrongSecret` entropy kontrolü zayıf (S-20.10)
- **Kanıt:** `config.js:207-216` sadece length≥32 + 2 sınıf + basit blacklist; "Password1234Password1234Password1234xx" geçer.

#### D-H5 — Audit purge: dryRun yok + self-audit yok (S-20.11)
- **Risk:** Saldırgan PB admin şifresini ele geçirirse, izleri silmek için tek yapması gereken purge job'ı beklemek.

#### D-H6 — Aynı reconcile job iki mekanizmayla (S-20.14)
- **Risk:** cron + systemd timer → 5 dk'da iki paralel run; PB unique constraint kaldırılırsa çift credit.
- **Kanıt:** `deploy/cron/oroya-reconcile.cron` + `deploy/systemd/oroya-reconcile.timer` aynı script.

#### D-H7 — HSTS preload direktif yok (S-20.1)
- **Kanıt:** `nginx:28` `max-age=63072000; includeSubDomains` (preload yok).

#### D-H8 — NPM pre-start hook + audit yok (S-20.22)
- **Kanıt:** `package.json:6-15` start direkt server.js, check sadece syntax.

---

## 5. ORTA SEVİYE BULGULAR (P2 — Önemli ama acil değil)

### Frontend (S-14, S-15, S-16)

| ID | Bulgu | Kanıt |
|----|-------|-------|
| F-M1 | `device_id` logout'ta SİLİNMİYOR (S-14.3) | `authStore.ts:132-139` |
| F-M2 | Device fingerprint self-asserted (S-14.4) | `client.ts:88-100` |
| F-M3 | 401 handler device_token'ı silmiyor (S-14.7) | `client.ts:152-157` + `authStore.ts:203` |
| F-M4 | `device_token` her response'ta capture (S-14.16) | `client.ts:198-204` |
| F-M5 | PNV token client-side check sadece length>=40 (S-16.3) | `confirm.tsx:118-121` |
| F-M6 | 2FA ticket `expires_at` client-side kontrolü yok (S-16.4) | `confirm.tsx:99-105` |
| F-M7 | `pendingPin`/`pendingIdempotencyKey` state cleanup yok (S-16.2) | `confirm.tsx:43-44, 99-105` |
| F-M8 | Amount input decimal basamak sınırı yok (S-16.6) | `validation.ts:17-20` |
| F-M9 | Amount input scientific notation regex sonrası sızıntı (S-16.7) | `send/index.tsx:178-186` |
| F-M10 | Inactivity auto-logout yok (S-15.9) | `_layout.tsx:44-62` |
| F-M11 | Logout'ta in-flight request iptal yok (S-15.7) | `authStore.ts:285-304` |
| F-M12 | `loginWithBiometrics` hata SecureStore temizlemiyor (S-15.10) | `authStore.ts:359-375` |
| F-M13 | PNV state store'da tutulmuyor (S-15.6) | `authStore.ts:59-84` |
| F-M14 | Verify-PIN client-side throttle yok (S-15.1) | `change-pin.tsx:40-58` |
| F-M15 | Note/memo backend'e raw geçiyor (S-16.16) | `send/index.tsx:194-202` |
| F-M16 | Deposit clipboard'a adres yazılıyor (S-16.13) | `deposit/result.tsx:64-68` |
| F-M17 | Self-transfer UI guard yok (S-16.15) | `send/index.tsx:48-55` |
| F-M18 | 1.2s unlock penceresi (S-16.21) | `_layout.tsx:55-58` |
| F-M19 | Modal onRequestClose PinPad state temizlemiyor (S-16.22) | `confirm.tsx:226-248` |
| F-M20 | `getOrCreateDeviceId` read-then-write race (S-14.17) | `client.ts:251-263` |
| F-M21 | `setItemAsync` options inconsistency (S-14.5b) | `authStore.ts:178` |
| F-M22 | Signup'ta PNV alınmıyor (S-15.12) | `signup.tsx:323` |

### Backend (S-17, S-18)

| ID | Bulgu | Kanıt |
|----|-------|-------|
| B-M1 | Notification/friend N+1 (S-17.3) | `pocketbase.js:2035-2048` per-record `getUserById` |
| B-M2 | Admin throttle anahtarı `socket.remoteAddress` (S-17.4) | `adminNotifications.js:144` vs `getClientIp` |
| B-M3 | `friends.js` `user_id` body'den kabul (S-17.5) | `friends.js:82-95` IDOR zemini |
| B-M4 | 5xx `error.message` log'a sızar (S-18.4) | `server.js:215` |
| B-M5 | InvalidateSession ↔ login yarışı (S-18.5) | `authStore.ts:203 ↔ 221` |
| B-M6 | `device_token_revoked` sonrası Bearer silinmiyor (S-18.19) | `client.ts:152-157` |
| B-M7 | `clearStoredSession` PIN+biyometrik de siler (S-18.20) | `authStore.ts:132-139` |
| B-M8 | `schema_sync_mode` argv match → boş secret (S-13.11) | `config.js:46-68` |
| B-M9 | IPN secret rotasyonu yok (S-13.12) | `webhookSignature.js` |
| B-M10 | 2FA max attempts runtime'da her istekte okunuyor (S-13.10) | `pocketbase.js:797` |
| B-M11 | `markNotificationRead` `:` içeren ID'leri no-op kabul (S-17.7) | `pocketbase.js:2432-2454` |
| B-M12 | 8 MB body + derinlik limiti yok (S-17.8) | `http.js:12` |
| B-M13 | `getBearerToken` loglanan `error.message` (S-17.22) | `server.js:213-217` |
| B-M14 | InflightSession ↔ PNV senkron eksik | çeşitli |

### Deployment (S-20)

| ID | Bulgu | Kanıt |
|----|-------|-------|
| D-M1 | Cipher suite modern değil (S-20.2) | nginx `HIGH:!aNULL:!MD5` |
| D-M2 | OCSP stapling + session cache yok (S-20.3) | nginx |
| D-M3 | Nginx rate limit yok (S-20.4) | sadece Node tarafında |
| D-M4 | Slowloris timeout'ları default (S-20.5) | nginx |
| D-M5 | WebSocket upgrade header yok (S-20.6) | nginx (gelecek için) |
| D-M6 | PROTECTED_ACTIONS listesi yetersiz (S-20.12) | `purge-audit-logs.js:7-17` |
| D-M7 | Retention minimum clamp yok (S-20.13) | `purge-audit-logs.js:5-6` |
| D-M8 | systemd hardening yok (S-20.16) | reconcile.service |
| D-M9 | perPage=50 stale intent paging (S-20.15) | `pocketbase.js:764-772` |
| D-M10 | Statik admin UI bilgi sızıntısı (S-20.20) | `admin/notifications.html` |
| D-M11 | ACME http-01 kırılabilir (S-20.23) | nginx port 80 redirect |
| D-M12 | CORS default `*` (S-20.24) | `config.js:118-120` |
| D-M13 | Rate limiter PB bağımlılığı (S-20.27) | `rateLimit.js:127-130` |
| D-M14 | Reconcile sweep başlangıç log yok (S-20.28) | `reconcile-pending-deposits.js` |
| D-M15 | .env.example placeholder'lar default (S-20.29) | `.env.example:8, 27-29` |

---

## 6. DÜŞÜK / BİLGİ SEVİYESİ (P3 — İyileştirme)

| ID | Bulgu | Dosya |
|----|-------|-------|
| L-1 | logger.setLevel BUG (no-op) (S-13.13, S-18.1, S-18.8, S-20.30) | `logger.js:33-37` |
| L-2 | NOWPayments timeout runtime'da okunuyor (S-13.15) | `nowpayments.js:19` |
| L-3 | Firebase JWKS URL hardcoded (S-13.9) | `config.js:140` (bilgi) |
| L-4 | Login guard NODE_ENV (S-13.14) | `adminNotifications.js:37-41` |
| L-5 | URL concat (S-14.19) | `client.ts:122` (bilgi) |
| L-6 | Forgot password akışı sadece Alert (S-15.8) | `login.tsx:153-163` |
| L-7 | Self-transfer UI guard yok (S-16.15) | `send/index.tsx:48-55` |
| L-8 | AppState `lastUnlockAtRef` 1.2s pencere (S-16.21) | `_layout.tsx:55-58` |
| L-9 | Modal onRequestClose state temizlemiyor (S-16.22) | `confirm.tsx:226-248` |
| L-10 | `/notifications/*` DELETE endpoint yok (S-17.6) | `server.js:60-61` |
| L-11 | `/friends` telefon dönüyor (S-17.10) | `pocketbase.js:2195` |
| L-12 | `/users/search` yok, sadece `/friends/search` (S-17.11) | `server.js` |
| L-13 | `demo: true` her zaman set (S-17.12) | `pocketbase.js:2770` |
| L-14 | Sentry / error reporting yok (S-18.7) | tüm repo |
| L-15 | RandomizedDelaySec yok (S-20.17) | `reconcile.timer` |
| L-16 | Cron MAILTO/log mode tanımsız (S-20.18) | `oroya-reconcile.cron` |
| L-17 | 5xx oranı alert yok (S-18.21) | `server.js:213` |
| L-18 | Token expire vs revoke UI ayrımı yok (S-18.6) | `client.ts:231` |
| L-19 | `/health` public değil (S-20.7) | `server.js:138-199` |
| L-20 | Buton `disabled` prop yok (S-16.10) | `confirm.tsx:217-221` |
| L-21 | `payment_url` kullanılmıyor (S-16.12) | `depositStore.ts:8` |
| L-22 | Currency hardcoded (S-16.8) | `confirm.tsx:61` |
| L-23 | `delete require.cache` singleton leak (S-19.15) | test |
| L-24 | IPv6-mapped form test edilmiyor (S-19.14) | `http.js:108-158` |
| L-25 | `deposit` clean up balance stale (S-16.18) | `confirm.tsx:70-74` |

---

## 7. KANITLANMIŞ TEMİZ ALANLAR (Pozitif bulgular)

Aşağıdaki noktalar statik analiz ile **güvenli** olarak doğrulanmıştır; bunlar raporun "güven tarafı"dır:

### Backend (temiz)
- ✅ **HMAC-SHA256** transaction `integrity_hash` + sign-verify (constant-time equal)
- ✅ **TimingSafeEqual** PB signature, admin token, password hash karşılaştırmalarında
- ✅ **Stack trace response'a sızmıyor** (`getSafeErrorResponse`, `http.js:160-175`)
- ✅ **PB internal hata sızıntısı allowlist** ile süzülüyor (`pocketbase.js:41-44`, `http.js:14-21`)
- ✅ **CORS preflight** doğru: origin whitelist, preflight 204/403, credentials yok (`server.js:77-126`)
- ✅ **POST invalid JSON → 400** (`http.js:55-59`)
- ✅ **GET'te body okunmuyor** (`server.js:155-207`)
- ✅ **MAX_BODY 8MB + MAX_HEADER 512** (`http.js:12-13`)
- ✅ **IP spoofing (X-Forwarded-For) trusted-proxy kontrollü** (`http.js:108-120`); admin throttle `socket.remoteAddress` (S-17.4 notu ayrı)
- ✅ **10 paralel 401 → tek logout** (module-level dedup, `client.ts:241-249`)
- ✅ **401 sonrası otomatik retry yok / sonsuz loop yok** (`client.ts:121-163`)
- ✅ **Network error logout tetiklemiyor** (`client.ts:128-136`)
- ✅ **5xx otomatik logout yok** (`client.ts:206-239`)
- ✅ **IDOR / cross-user read**: tüm route'larda `userId` filtreli tek savaşçı; `/users/me` self-only; friend/chat/notification cross-user erişim yok (Agent 17)
- ✅ **Admin tool brute-force koruması**: constantTimeEqual + IP-keyed fail map + 8/10dk lockout + 30/dk rate limit + prod IP allowlist (Agent 17, S-17.14)
- ✅ **Body parser DoS sınırı** (`http.js:32-64`)
- ✅ **Kod içi secret sızıntısı yok**: `console.log`/`logger` ile secret/password/token dökümü YOK (Agent 13, S-13.18)
- ✅ **Firebase PEM private key YOK** (sadece public JWKS, `firebasePnv.js:5-144`) (Agent 13, S-13.16)
- ✅ **Sentry SDK YOK** (bilgi) (Agent 13, S-13.17)
- ✅ **Sentry / error reporting** operasyonel görünürlük (bilgi, S-18.7)
- ✅ **PB unique-constraint claim** crash recovery idempotency (S-20.32)
- ✅ **systemd `User=oroya`**, `TimeoutStartSec=120`, `Wants=network-online.target`

### Frontend (temiz)
- ✅ **HTTPS production enforced**, dev HTTP OK (`client.ts:62-66`)
- ✅ **Device ID crypto.randomUUID + SecureStore** (`client.ts:251-263`)
- ✅ **Token WHEN_UNLOCKED_THIS_DEVICE_ONLY** (`client.ts:24-26`)
- ✅ **Error code sanitize**: regex `^[a-z0-9_:-]{1,64}$` ile filter (`client.ts:220-228`)
- ✅ **Authorization override scrub** (`client.ts:101`)
- ✅ **Cleartext password/PIN/token console.log YOK** (S-15.15)
- ✅ **AsyncStorage kullanılmıyor**, sadece SecureStore (S-15.17)
- ✅ **Mock data import edilmiyor**, prod'a sızmıyor (S-15.13/14)
- ✅ **Password input secureTextEntry** (S-15.16)
- ✅ **Splash + auth hydration** (`_layout.tsx:14-25`, `index.tsx:14-26`)
- ✅ **Biometric + token doğrulama** (`_layout.tsx:31-89`)
- ✅ **RN `<Text>` → XSS vektörü yok** (S-17.17, S-15.20)
- ✅ **Optimistic update YOK** (güvenli, `confirm.tsx:70-74`)

---

## 8. POCKETBASE'E ÖZGÜ BULGULAR

PB'nin superuser ile çalıştırılması ve `null` rules yapısı düşünüldüğünde:

| ID | Bulgu | Detay |
|----|-------|-------|
| PB-1 | Tüm collection rules `null` | Herkes her şeyi okuyabilir; auth'u handler'da userId filtresi sağlıyor (kırılgan) |
| PB-2 | `users` built-in `_pb_users_auth_` collection; `pin_hash` schema sync'te users'a eklenmiyor görünüyor | `pocketbase.js:275` set ediyor ama schema'da belirsiz — runtime'da patlayabilir |
| PB-3 | `wallets(user_id, currency)` unique index yok | Duplicate wallet riski (`sync-pocketbase-schema.js:549-551`) |
| PB-4 | `device_security` collection unique constraints | `pocketbase.js:168-263` |
| PB-5 | `payment_intents` `claimPaymentIntentCredit` HTTP 409 | Crash recovery idempotency (iyi) |
| PB-6 | `webhook_nonces` replay koruması var | `payments.js:90-95` extract/record nonce |
| PB-7 | `loginAttempts` in-memory Map | Restart → reset; multi-instance'da bozulur (Agent 1) |
| PB-8 | `applyInternalTransferWithLock` lock process-içi Map | Multi-instance deploy'da bozulur (B-H3) |
| PB-9 | `reconcileWalletBalance` versionless PATCH | In-flight ezilme (B-H4) |
| PB-10 | LIKE joker kaçışsız (S-17.1) | `escapeFilterValue` sadece `\` ve `"` |
| PB-11 | N+1 friend/notification list | Per-record `getUserById` (S-17.3) |
| PB-12 | PB erişimi superuser → tüm DB | env'de plaintext (K-1, K-5) |

---

## 9. PNV / SMS / 2FA AKIŞI BULGULARI

| ID | Bulgu | Risk |
|----|-------|------|
| PNV-1 | Native modül repoda YOK → her 2FA throw (K-3) | **Kritik** |
| PNV-2 | `TRANSFER_2FA_THRESHOLD=0` default → her transferde PNV (Agent 5) | Yüksek (kullanılamaz ürün) |
| PNV-3 | `verifyFirebasePnvToken` `phoneNumbersMatch` E.164 normalize (Agent 4) | Bilgi (iyi) |
| PNV-4 | JWKS cache TTL | Bilgi |
| PNV-5 | `OROYA_2FA_MAX_FAILED_ATTEMPTS` runtime'da her istekte okunuyor (S-13.10) | Orta |
| PNV-6 | `isTwoFactorRequiredForTransfer` `Number(amount) >= 0` her zaman true (Agent 5) | Yüksek (config hatası) |
| PNV-7 | `withTransferLock` 2FA ticket süresi? | Bilgi |
| PNV-8 | Client PNV token check sadece `length >= 40` (S-16.3) | Orta |
| PNV-9 | `expires_at` client-side ignore (S-16.4) | Düşük |
| PNV-10 | `pendingPin` cleanup eksik (S-16.2) | Orta |
| PNV-11 | `app/send/confirm.tsx:147` PNV her transfer runtime'da alınıyor | Orta (state'siz) |
| PNV-12 | Signup'ta PNV alınmıyor (S-15.12) | Bilgi (fonksiyonel) |

---

## 10. TEST KALİTESİ BULGULARI (Agent 19)

| ID | Bulgu | Risk |
|----|-------|------|
| T-1 | Hardcoded fallback secret `q9K#mP2!vL8$wR3&jT6*yF1@eN4%hX7^` `isStrongSecret`'ı geçer (S-19.1) | **Kritik** |
| T-2 | Testler gerçek backend ayağa kaldırmıyor (S-19.2) | Yüksek |
| T-3 | Testler `Function.toString()` + regex match (S-19.3) | Yüksek |
| T-4 | CI/CD config yok (S-19.4) | Yüksek |
| T-5 | `backend/package-lock.json` yok (S-19.5) | Orta |
| T-6 | Prod validator testi tautological (S-19.6) | Orta |
| T-7 | `applyInternalTransferWithLock` yalnız typeof testi (S-19.7) | Orta |
| T-8 | `updateWalletBalanceOptimistic` mock'lu (S-19.8) | Orta |
| T-9 | 100-paralel burst sync mock (S-19.9) | Düşük |
| T-10 | `BACKEND_LOCAL_ONLY=true` + `corsOrigin=*` test yok (S-19.10) | Düşük |
| T-11 | Tek test dosyası (S-19.11) | Bilgi |
| T-12 | `test:pb` `test`'e bağlı değil (S-19.13) | Bilgi |
| T-13 | `getClientIp` IPv6-mapped form test yok (S-19.14) | Bilgi |
| T-14 | `delete require.cache` singleton leak (S-19.15) | Bilgi |

**Sonuç:** Test paketi **varlık (existence)** ve **metin (string)** testi ağırlıklı; **davranışsal** ve **entegrasyon** testi çok zayıf. "Production-ready" iddiası kanıtlanmamış.

---

## 11. PRODUCTION DEPLOYMENT BULGULARI (Agent 20)

| ID | Bulgu | Risk |
|----|-------|------|
| DEP-1 | HSTS preload direktif yok (S-20.1) | Yüksek |
| DEP-2 | Cipher suite modern değil (S-20.2) | Orta |
| DEP-3 | OCSP stapling + session cache yok (S-20.3) | Orta |
| DEP-4 | Nginx rate limit yok (S-20.4) | Orta |
| DEP-5 | Slowloris timeout'ları default (S-20.5) | Orta |
| DEP-6 | WebSocket upgrade header yok (S-20.6) | Orta (gelecek) |
| DEP-7 | /health public değil (S-20.7) | Yüksek |
| DEP-8 | SIGTERM handler yok (S-20.8) | Yüksek |
| DEP-9 | PB superuser env'de plaintext + hardening eksik (S-20.9) | **Kritik** |
| DEP-10 | `isStrongSecret` entropy zayıf (S-20.10) | Yüksek |
| DEP-11 | Audit purge: dryRun + self-audit yok (S-20.11) | Yüksek |
| DEP-12 | PROTECTED_ACTIONS listesi yetersiz (S-20.12) | Orta |
| DEP-13 | Retention minimum clamp yok (S-20.13) | Orta |
| DEP-14 | Aynı job iki mekanizmayla (S-20.14) | Yüksek |
| DEP-15 | perPage=50 stale paging (S-20.15) | Orta |
| DEP-16 | systemd hardening yok (S-20.16) | Orta |
| DEP-17 | RandomizedDelaySec yok (S-20.17) | Düşük |
| DEP-18 | Cron MAILTO/log mode tanımsız (S-20.18) | Düşük |
| DEP-19 | Logrotate config yok (S-20.19) | Orta |
| DEP-20 | Statik admin UI bilgi sızıntısı (S-20.20) | Orta |
| DEP-21 | /health PB erişimini kontrol etmiyor (S-20.21) | Yüksek |
| DEP-22 | Pre-start hook + audit yok (S-20.22) | Yüksek |
| DEP-23 | ACME http-01 kırılabilir (S-20.23) | Orta |
| DEP-24 | CORS default `*` (S-20.24) | Orta |
| DEP-25 | PB backup/firewall/encryption planı YOK (S-20.25) | **Kritik** |
| DEP-26 | JSON API'de CSP yok (S-20.26) | Orta (düşük) |
| DEP-27 | Rate limiter PB bağımlılığı (S-20.27) | Orta |
| DEP-28 | Sweep başlangıç log yok (S-20.28) | Düşük |
| DEP-29 | .env.example placeholder'lar (S-20.29) | Orta |
| DEP-30 | setLevel no-op bug (S-20.30) | Bilgi |
| DEP-31 | NOWPayments prod'da fail-closed (S-20.31) | Yüksek |
| DEP-32 | Reconcile idempotent (S-20.32) | Temiz |

---

## 12. RED / YELLOW / GREEN KARARI

### 🟥 RED — Production'a çıkmaya hazır değil

**Neden:**
1. **Hardcoded prod secret'lar** repoda (K-1): rotate edilmediyse PB ve NOWPayments panelinden iptal.
2. **NODE_ENV gate'i** tüm prod guard'larını tek satır hata ile atar (K-2).
3. **PNV native modülü** repoda yok → her transfer fail (K-3).
4. **C-1 /users/me/update** bearer-only → telefon değiştirilip 2FA atlatma (K-6).
5. **Change password** diğer cihazları revoke etmiyor (K-7).
6. **Test paketi** tautological, integration yok, CI yok, lockfile yok (K-4, T-1..14).
7. **PB firewall/runbook/backup** artifact'ı yok (K-5, DEP-25).
8. **/health monitoring kırık** + graceful shutdown yok (DEP-7, DEP-8, DEP-21).
9. **Reconcile çift run** → çift credit riski (DEP-14).
10. **Çok sayıda P1 race condition + IDOR zemini** (B-H1..15).
11. **NOWPayments IP allowlist boş** → prod'da tüm webhook reject (K-8).

### Önerilen Sıralı Yol Haritası

**Aşama 0 — Acil rotasyon (1 hafta):**
- PB superuser password rotate, NOWPayments key+IPN secret rotate, sızıntı taraması.
- `.env` repodan kaldır, CI'da `gitleaks`.
- `NODE_ENV=production` deploy pipeline'a zorunlu kıl, `validateProductionConfig` her zaman çalışsın.

**Aşama 1 — P0 fix (2-3 hafta):**
- K-3 (PNV native modül): Build artifact + plugin + EAS config.
- K-6 (/users/me/update): device token + PIN + 2FA zorunlu.
- K-7 (change password): revoke-all-sessions backend + frontend.
- K-8 (NOWPayments): IP allowlist default + IP listesi `.env.example`'a yorum.
- B-H1..15 (race/IDOR): `applyInternalTransferWithLock` → PB claim-based; `reconcileWalletBalance` versioned PATCH; `enforceRateLimit` retry/backoff; `escapeFilterValue` LIKE joker.
- DEP-7, DEP-8, DEP-21, DEP-25, DEP-14 (deployment hardening): /health public + PB check + graceful shutdown + backup runbook + reconcile tek mekanizma.

**Aşama 2 — Test altyapısı (2-3 hafta):**
- T-1..14: Integration test fixture (gerçek PB + gerçek Node http server), CI/CD, lockfile, davranışsal testler, `crypto.randomBytes` ile test secret, `Function.toString` testlerini kaldır.
- `applyInternalTransferWithLock` concurrent test, `reconcileWalletBalance` branch test, `verifyDeviceToken` fingerprint test.

**Aşama 3 — P1+P2 hardening (3-4 hafta):**
- Frontend: cert pinning, token refresh, idempotency default, input validation, screenshot/screen capture, PIN policy blacklist, multi-device revoke.
- Backend: PB rules düzeltme (en azından users/wallets/audit için), N+1 fix, audit PII (username hash), `findStaleIntentsWithClaimButNoTransaction` paging.
- Deployment: HSTS preload, OCSP, nginx rate limit, systemd hardening, audit purge self-audit.

**Aşama 4 — Gözlem + yeni feature flag mimarisi (1-2 hafta):**
- Sentry/GlitchTip entegrasyonu (sensitive field mask).
- Feature flag: PNV kapatılabilir, IP allowlist default, NODE_ENV-gate'siz prod validation.
- Runbook: PB backup, secret rotation, incident response, runbook test (game day).

**Toplam: 8-12 hafta** sonra YELLOW'a geçiş mümkün. GREEN için ayrıca 1-2 ay "production shadowing" (canlı trafiği gözlemleyerek, gerçek saldırı yüzeyini ölçerek).

---

## EK-A: 20 Ajan Kapsam Matrisi (özet)

| Yüzey | Ajanlar |
|-------|---------|
| Backend Auth | 1, 2 |
| Device / 2FA / PNV | 3, 4, 5 |
| Wallet / Transfer / Race | 6, 10 |
| Deposit / Webhook / Refund | 7, 8, 9 |
| PocketBase | 11, 12, 17 |
| Frontend API + Store | 14, 15 |
| Frontend Flow | 16 |
| Error Handling | 18 |
| Test | 19 |
| Secret / Config | 13 |
| Deployment | 20 |

## EK-B: Kanıtlanmış Temiz Alanlar (özet)

- HMAC, constant-time, fail-closed webhook, fail-closed PNV, fail-closed CORS, CORS preflight, IDOR kontrolleri, XSS RN `<Text>`, X-Forwarded-For trusted-proxy, body parser DoS, GET'te body okunmama, MAX_BODY/HEADER, secret log sızıntısı yok, Firebase PEM yok, Sentry yok (bilgi), HTTPS prod enforced, SecureStore WHEN_UNLOCKED_THIS_DEVICE_ONLY, Authorization override scrub, AsyncStorage yok, mock data import yok, secureTextEntry, splash+hydration, biometric, optimistic update yok, IDOR/cross-user read.

## EK-C: Bilinmeyi sürdüren, kanıtlanmamış şüpheler

- PB users collection `pin_hash` schema durumu (PB-2) — runtime'da patlayabilir, schema sync'te belirsiz.
- `applyInternalTransferWithLock` lock gerçek multi-instance davranışı — Map lock fail eder; kanıtlanmış ama production test'i yok.
- Reconcile çift-run → çift credit (DEP-14) — PB unique constraint koruması var ama kaldırılırsa bozulur.
- Cross-currency unit mismatch (B-H8) — kod açıkça bug; gerçek para kaybı senaryosu deployment'a bağlı.
- `applyInternalTransferWithLock` HMAC doğrulaması + ledger sign → gerçek double-spend test fixture'ı ile kanıtlanmamış.
- `extractWebhookNonce` race → concurrent webhook aynı nonce ile iki kez kabul senaryosu test edilmemiş.

---

**Sonuç:** Oroya, **kod kalitesi ve savunma-prensibi açısından yukarıda** (HMAC, timing-safe, fail-closed, allowlist, IDOR-free) **bir fintech uygulaması**. **Ancak operasyonel, yapılandırma ve test altyapısı açısından prod'a hazır değil.** P0 düzeltmeleri olmadan production'a deploy edilmemelidir.
