# CODEX_FINAL_P0_FIX_REPORT.md

## SMS OTP Money Flow Update - 2026-06-06

Secret, sifre, token veya local `.env` degerleri yazilmadi.

### Duzeltilen maddeler

- Deposit akisi artik SMS OTP dogrulamasi olmadan `/payments/create-deposit` uzerinden deposit adresi olusturmuyor.
- Transfer akisi artik SMS OTP dogrulamasi olmadan `/transfers/send` uzerinden para hareketi baslatmiyor.
- Ortak backend OTP servisi eklendi: tek kullanimlik, kisa sureli, amaca ve islem detayina bagli, HMAC imzali ticket uretir.
- OTP kodlari PocketBase `two_factor_otps` koleksiyonunda duz metin degil HMAC hash olarak saklanir.
- Yanlis kod denemeleri PocketBase helper uzerinden sayilir ve limit asiminda kilitlenir.
- OTP baslatma endpointi kullanici bazli rate limit uygular.
- SMS provider production'da yoksa sistem fail-closed davranir ve para islemi baslamaz.
- Eski transfer challenge endpointi Firebase PNV bileti yerine ortak SMS OTP baslatacak sekilde guncellendi.
- Frontend deposit ve transfer ekranlari SMS kod modalina baglandi.

### Degistirilen dosyalar

- `backend/src/smsOtp.js`
- `backend/src/routes/smsOtp.js`
- `backend/src/routes/payments.js`
- `backend/src/routes/transfers.js`
- `backend/src/pocketbase.js`
- `backend/src/server.js`
- `backend/package.json`
- `backend/test/security.test.js`
- `services/api/smsOtp.ts`
- `services/api/transfers.ts`
- `app/deposit/index.tsx`
- `app/send/confirm.tsx`
- `CODEX_FINAL_P0_FIX_REPORT.md`

### Eklenen testler

- Deposit request valid device token ile gelse bile SMS OTP ticket yoksa provider cagrilmadan reddediliyor.
- Deposit request gecerli SMS OTP ticket ile provider/adres olusturma asamasina geciyor.
- SMS OTP start/verify akisi kodu hash olarak sakliyor ve scoped ticket uretiyor.
- Legacy transfer challenge endpointi ortak SMS OTP baslatiyor.
- Transfer request SMS OTP ticket yoksa para hareketi yapmadan reddediliyor.
- Transfer request gecerli SMS OTP ticket ile tamamlanabiliyor.

### Test sonuclari

- `npm run check --prefix backend`: PASS
- `npm test --prefix backend`: PASS, 94/94
- `npx tsc --noEmit`: PASS
- `npm run schema:sync --prefix backend`: PASS. Veri silinmedi/drop yapilmadi. `device_security.idx_device_security_week` optional index'i yine skipped.

### Kalan gercek riskler

- Production'da gercek SMS icin `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` set edilmeli. Bu degerler yoksa sistem bilincli olarak para islemlerini baslatmaz.
- Lokal gelistirmede `SMS_OTP_DEV_ECHO=true` kullanilabilir; production'da OTP kodu response'a echo edilmez.
- Kullanici telefon numaralari E.164 formatinda olmalidir; ornek olarak ulke kodu ile baslamalidir.
- Twilio disinda baska SMS saglayici istenirse `sendSms` provider katmanina yeni adapter eklenmeli.

### Karar

YELLOW.

Kod tarafinda deposit ve transfer SMS OTP olmadan fail-closed hale getirildi. Production'a cikmadan once zorunlu kalan adim gercek SMS provider env degerlerinin deploy ortaminda set edilmesi ve canli cihazla SMS teslim testidir.

Tarih: 2026-06-05

Bu rapor `MINIMAX_FINAL_20_AGENT_SECURITY_AUDIT.md` icindeki 1. ve 2. maddeler haric tutularak yapilan P0 kontrol ve duzeltmeleri ozetler. Secret, sifre, token veya local `.env` degerleri bu rapora yazilmadi.

## 1. Duzeltilen maddeler

- Firebase PNV native modul eksikligi: Expo managed proje icin `./plugins/withFirebasePnv.js` eklendi. Android prebuild/dev build sirasinda Firebase PNV dependency'si ve React Native native module kaynaklari uretiliyor. Expo Go'nun bu native modulu iceremeyecegi netlestirildi. Frontend PNV hatalarini ayrik kodlarla ele aliyor; backend PNV token olmadan transferi fail-closed reddediyor.
- `/users/me/update` guvenligi: Telefon veya username degisikligi artik sadece Bearer token ile yapilamiyor. Backend mevcut kayitla yeni degeri karsilastiriyor; hassas degisiklikte current device token + security PIN istiyor. Telefon degistirerek transfer 2FA bypass kapatildi.
- Change-password sonrasi sessionlar: Backend zaten tum device tokenlari, user-wide bearer sessionlarini ve current bearer tokeni revoke ediyordu. Buna ek olarak eski bearer ile protected endpointin 401 dondugunu kanitlayan davranis testi eklendi. Frontend change-password sonrasi local session temizleme davranisi mevcut kabul edildi.
- Test kalitesi: Regex/source-grep agirligini azaltmak icin davranis testleri eklendi: PNV olmadan transfer reddi, gecerli PNV ile transfer basarisi, hassas profil degisikliginde device token + PIN zorunlulugu, sifre degisimi sonrasi eski token reddi, NOWPayments webhook deposit claim/credit akisi.
- PocketBase deploy / firewall / backup: `backend/DEPLOYMENT_RUNBOOK.md` eklendi. PocketBase'in private bind edilmesi, admin/API yuzeyinin public internete acilmamasi, env file izinleri, backup/restore tatbikati ve veri silmeden schema sync notlari yazildi.
- NOWPayments IPN: HMAC, timestamp, nonce ve idempotent claim korumalari korunarak production startup guard eklendi. Production'da `NOWPAYMENTS_IPN_ALLOWED_IPS` bos ise uygulama acilmiyor; boylece tum IPN'lerin sessizce reddedilmesi engelleniyor. `.env.example` ve README/runbook bu davranisi acikliyor.

## 2. Yanlis pozitif cikan maddeler

- Change-password backend revoke eksikligi: Backend tarafinda revoke zinciri zaten vardi; eksik olan guclu davranis testi olarak degerlendirildi ve test eklendi.
- Transferin PNV olmadan gecmesi: Backend zaten fail-closed reddediyordu; bu turda gercek handler testiyle kanitlandi.
- NOWPayments HMAC/claim korumasinin eksik oldugu varsayimi: HMAC ve claim akisi zaten vardi; bu turda runtime webhook testi ve production allowlist startup guard'i eklendi.

## 3. Degistirilen dosyalar

- `.gitignore`
- `app.json`
- `app/profile/edit.tsx`
- `app/send/confirm.tsx`
- `backend/.env.example`
- `backend/DEPLOYMENT_RUNBOOK.md`
- `backend/README.md`
- `backend/src/config.js`
- `backend/src/routes/users.js`
- `backend/test/security.test.js`
- `plugins/withFirebasePnv.js`
- `services/firebasePnv.ts`
- `stores/authStore.ts`
- `CODEX_FINAL_P0_FIX_REPORT.md`

## 4. Eklenen testler

- `/users/me/update` telefon degisikligi device token olmadan reddediliyor.
- `/users/me/update` telefon degisikligi PIN olmadan reddediliyor.
- `/users/me/update` gecerli device token + PIN ile basarili oluyor.
- `sendTransfer` Firebase PNV token yokken transfer uygulamiyor.
- `sendTransfer` gecerli challenge ticket + Firebase PNV JWT ile tamamlanabiliyor.
- Change-password sonrasi eski bearer token protected endpointte `token_revoked` ile reddediliyor.
- NOWPayments webhook gercek handler akisi idempotent claim -> transaction -> wallet reconcile sirasiyla kredi uyguluyor.
- Production config bos `NOWPAYMENTS_IPN_ALLOWED_IPS` degerini reddediyor.

## 5. Test sonuclari

- `npm run check --prefix backend`: PASS
- `npm test --prefix backend`: PASS, 88/88
- `npx tsc --noEmit`: PASS
- `npm run schema:sync --prefix backend`: PASS. Collection/rule/index sync veri silmeden tamamlandi. `device_security.idx_device_security_week` optional index'i PocketBase tarafindan yine skipped.
- Ek kontrol: `node --check plugins/withFirebasePnv.js`: PASS

## 6. Kalan gercek riskler

- Firebase PNV Expo Go'da calismaz. Gercek cihaz testi icin Android dev build/prebuild, `google-services.json`, Firebase Console SHA-256/API enablement ve `EXPO_PUBLIC_FIREBASE_PNV_PRIVACY_POLICY_URL` gerekir.
- Firebase PNV carrier/SIM destek disi cihazlarda basarisiz olabilir. Bu turda SMS fallback eklenmedi; transfer guvenli sekilde fail-closed kalir.
- PocketBase firewall/backup runbook eklendi ama gercek firewall, systemd, backup ve restore tatbikati operasyonel olarak uygulanmali.
- Production NOWPayments IPN icin trusted ingress/proxy IP'leri operator tarafindan dogru set edilmezse startup durur. Bu bilincli fail-fast davranistir.
- Mevcut testler belirgin sekilde guclendi; yine de tam gercek PocketBase + Android cihaz + NOWPayments sandbox entegrasyon testi ayrica gereklidir.

## 7. RED / YELLOW / GREEN karari

YELLOW.

Bu turdaki P0 kod aciklari calisan kodla kapatildi ve davranis testleriyle kanitlandi. Production icin kalan ana riskler artik koddan cok Android dev build/Firebase Console, PocketBase firewall-backup ve NOWPayments ingress konfigrasyonu gibi operasyonel zorunluluklardir.
