# CODEX_FIX_MINIMAX_REPORT.md

Tarih: 2026-06-04

Bu rapor `MINIMAX_SECURITY_LEAK_REPORT.md` içindeki Critical ve High bulgular için yapılan gerçek kod/schema düzeltmelerini özetler. Secret, token, şifre veya `.env` değerleri rapora yazılmadı.

## 1. Kapatılan Critical açıklar

- AUTH-02 / COM-01: Transfer 2FA akışı backend ve frontend arasında çalışır hale getirildi. Transfer challenge endpoint'i frontend tarafından çağrılıyor; transfer submit artık `two_factor_ticket` ile birlikte Firebase Phone Number Verification JWT'sini `firebase_pnv_token` olarak gönderiyor. Backend tokenın Google ES256 imzasını, issuer/audience claim'lerini, son kullanma zamanını ve doğrulanan telefonun sender hesabıyla eşleştiğini kontrol ediyor. Varsayılan transfer 2FA eşiği `0` yapıldı.
- DEV-1: Device token artık request fingerprint'ine bağlı doğrulanıyor. Token claim'indeki fingerprint hash'i, istekteki device id / platform / user-agent fingerprint'i ile timing-safe karşılaştırılıyor.
- FE-02 / COM-03 / SES-01 zinciri: Logout user-wide bearer revocation yazar hale getirildi. Frontend 401 `token_revoked` ve `token_invalid_iat` durumlarında session invalidate ediyor.
- WAL-01 / WAL-02: Transfer wallet update akışı CAS/version filtreleriyle güçlendirildi. Credit failure rollback koşulsuz PATCH yerine version guard ile yapılıyor.
- FE-01: SecureStore kayıtlarında `WHEN_UNLOCKED_THIS_DEVICE_ONLY` kullanıldı; tahmin edilebilir random fallback kaldırıldı.
- COM-02: `friend_request:<id>` gibi colon içeren notification id'leri artık read marker tarafından reddedilmiyor.

## 2. Kapatılan High açıklar

- AUTH-01: Single-use, TTL'li, hash saklayan password reset backend akışı eklendi.
- AUTH-03 / RATE-05: 2FA OTP failed attempt lockout ve security endpoint rate limitleri eklendi.
- AUTH-07: `revokeMySessions` user-wide bearer revocation da yazıyor.
- AUTH-08 / DEV-5 / COM-05: Transfer, deposit currencies ve friends search device-token doğrulaması fingerprint enforcement ile çalışıyor.
- SES-02: Geleceğe alınmış JWT `iat` reddediliyor.
- DEV-2: `revokeAllDeviceTokensForUser` pagination sonsuz döngüye girmemesi için guardlandı.
- PAY-01 / CFG-03: Webhook IP allowlist production'da default allow olmaktan çıkarıldı; private network yalnız explicit opt-in ile kabul ediliyor.
- PAY-06: Daha önce credited deposit için `failed/refunded/cancelled` webhook gelirse idempotent reversal transaction oluşturuluyor ve wallet ledger'dan reconcile ediliyor.
- PAY-07: NOWPayments outbound çağrılarına timeout/abort eklendi.
- WAL-03 / FE-07: Transfer ve deposit için client/backend idempotency key zorunlu hale getirildi.
- WAL-04 / WAL-08: Transfer alıcı adına otomatik yeni currency wallet açmıyor; alıcının ilgili wallet'ı yoksa reddediyor.
- RATE-03 / RATE-07: GET istekleri global limiter kapsamına alındı; local burst bucket sweep eklendi.
- CFG-02 / PB-09: Ledger/device/2FA secret'ları PocketBase superuser şifresinden türetilmiyor. Runtime explicit secret yoksa fail-closed.
- CFG-04: Trusted proxy IP okuması merkezi config üzerinden yapılıyor.
- FE-03 / COM-06: Password change sonrası frontend local session invalidate ediyor ve yeniden login istiyor.
- COM-04: Deposit frontend selected coin provider code'unu ve idempotency key'i backend'e gönderiyor.

## 3. Yanlış pozitif çıkan bulgular

- SES-10: `changePassword` backend tarafında zaten device token, user bearer revocation ve current bearer revoke yapıyordu; frontend invalidate eksikti ve giderildi.
- PAY-13: `payment_credit_claims.payment_intent_id` unique index schema sync'te mevcut doğrulandı.
- PB-14: Schema sync destructive değil; yeni değişiklikler de drop/delete yapmıyor.
- COM-17: Chat authorization server-side 403 davranışı rapordaki gibi zaten korunuyordu; bu turda değiştirilmedi.

## 4. Değiştirilen dosyalar

- `backend/src/config.js`
- `backend/src/deviceToken.js`
- `backend/src/firebasePnv.js`
- `backend/src/http.js`
- `backend/src/nowpayments.js`
- `backend/src/pocketbase.js`
- `backend/src/rateLimit.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/friends.js`
- `backend/src/routes/payments.js`
- `backend/src/routes/security.js`
- `backend/src/routes/transfers.js`
- `backend/src/scripts/sync-pocketbase-schema.js`
- `backend/.env.example`
- `backend/test/security.test.js`
- `services/api/client.ts`
- `services/api/transfers.ts`
- `services/firebasePnv.ts`
- `app/send/confirm.tsx`
- `app/deposit/index.tsx`
- `app/profile/change-password.tsx`
- `stores/authStore.ts`

## 5. PocketBase schema değişiklikleri

- `password_reset_tokens` collection oluşturuldu.
- `audit_logs`, `payment_profiles`, `transactions`, `payment_intents`, `device_tokens`, `users` için index sync genişletildi.
- Sensitive collection rule'ları superuser-only/null olacak şekilde sync edildi: `users`, `wallets`, `transactions`, `payment_intents`, device/security/payment/audit koleksiyonları.
- `OROYA_SCHEMA_SIGN_UNSIGNED_TRANSACTIONS=true` verilmedikçe schema sync artık unsigned transaction imzalamıyor.
- `device_security.idx_device_security_week` index'i PocketBase tarafından reddedildi ve veri silmeden atlandı.

## 6. Eklenen testler

- Device token request fingerprint mismatch reddi.
- Transfer idempotency key zorunluluğu ve stable reference üretimi.
- Deposit idempotency key zorunluluğu ve stable reference üretimi.
- Password reset token hash saklama ve single-use consume.
- Webhook private network default fail-closed beklentisi.
- Low-value transferlerin default threshold ile 2FA zorunlu olması.
- Firebase PNV ES256 JWT imza/claim doğrulaması ve telefon numarası eşleştirme testi.

## 7. Test sonuçları

- `npm run check --prefix backend`: PASS
- `npm test --prefix backend`: PASS, 82/82
- `npx tsc --noEmit`: PASS
- `npm run schema:sync --prefix backend`: PASS, PocketBase bağlantısı başarılı; bir optional `device_security.week_key` index'i skipped.

## 8. Hala kalan riskler

- PB-01 / PB-02: PocketBase Cloud admin yüzeyinin public internete açık olup olmaması kodla tam kapatılamaz; edge/WAF/IP allowlist veya provider ayarı gerekir.
- CFG-01 / AUTH-12: Yerel/prod `.env` dosyalarındaki gerçek secret'lar kodla rotate edilemez. Secret manager ve rotasyon zorunlu.
- FE-06: Certificate pinning native seviyede hala uygulanmadı.
- RATE-07: Multi-instance için tam shared Redis/centralized limiter yok; PocketBase bucket'ları ana limiter olarak kullanılıyor ama bazı local state'ler süreç bazlı kalır.
- `device_security.week_key` index'i PB tarafından kabul edilmedi; veri/field durumunun admin panelinde incelenmesi gerekir.
- Password reset token üretildi, ancak gerçek email/SMS delivery provider entegrasyonu yok.
- Firebase PNV backend JWT doğrulaması hazır; Expo managed app için Android native Firebase PNV SDK köprüsü dev build/prebuild ile eklenmelidir. Expo Go içinde native PNV modülü yoksa frontend güvenli şekilde başarısız olur.

## 9. RED / YELLOW / GREEN kararı

YELLOW.

Kod ve schema güvenliği belirgin biçimde güçlendi; ana Critical/High runtime açıkları kapatıldı ve testlerden geçti. Ancak production için PocketBase admin yüzeyi, secret rotasyonu, certificate pinning ve operasyonel provider ayarları kod dışı zorunlu işler olarak kalıyor.

## 10. Production'a çıkmak için son zorunlu adımlar

- PocketBase admin UI/API erişimini public internetten kaldır veya WAF/IP allowlist arkasına al.
- Tüm prod secret'ları rotate et; `OROYA_LEDGER_SECRET`, `OROYA_DEVICE_TOKEN_SECRET`, `TWO_FACTOR_HMAC_SECRET`, NOWPayments ve PB superuser credential'larını secret manager'a taşı.
- `NODE_ENV=production`, `BACKEND_LOCAL_ONLY`, `CORS_ORIGIN`, webhook allowed IP ayarlarını production deploy'da doğrula.
- Password reset için güvenilir email/SMS delivery provider ekle; dev echo bayraklarını production'da kapalı tut.
- Firebase Console'dan proje numarası/proje ID değerlerini `FIREBASE_PNV_PROJECT_NUMBER` ve `FIREBASE_PNV_PROJECT_ID` olarak backend ortamına ekle; paylaşılan test tokenını rotate et ve koda yazma.
- Android dev build/prebuild içinde Firebase PNV SDK native köprüsünü ekle; `getVerifiedPhoneNumber()` sonucu dönen JWT'yi backend'e `firebase_pnv_token` olarak gönder.
- Certificate pinning/native network hardening planını uygula.
- `device_security.week_key` index skip nedenini PB admin tarafında incele ve gerekirse field/index migration'ı veri silmeden tamamla.
