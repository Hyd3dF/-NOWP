# Oroya Production Security Runbook

## PocketBase network boundary

- Run PocketBase on a private listener only, for example `127.0.0.1:8090`.
- Do not expose PocketBase admin UI or API directly to the public internet.
- If a reverse proxy is required, allow only the backend host or a VPN/admin IP range.
- Store PocketBase superuser credentials in a root-owned environment file or secret manager; use mode `0600`.
- Rotate PocketBase superuser credentials after every suspected local `.env` exposure.

## PocketBase backup and restore

- Take at least one encrypted backup per day before production traffic starts.
- Keep a 7-day hot retention and a 30-day cold retention unless legal requirements say otherwise.
- Backup scope must include PocketBase data, uploaded files, and the exact backend release SHA.
- Restore test cadence: at least once per month, restore the latest backup into an isolated PocketBase instance and run `npm run schema:sync --prefix backend` against it.
- Never test restores against production. Never use collection drop/delete as part of routine schema sync.

## SMS OTP for money flows

- Deposit and transfer must use the shared SMS OTP flow before any money operation starts.
- Production should use Firebase Phone Authentication. Set:
  - `SMS_PROVIDER=firebase_auth`
  - `FIREBASE_AUTH_PROJECT_ID`
- The mobile app must be a development or production build with React Native Firebase, not Expo Go.
- Add Firebase app config files before building:
  - Android: `google-services.json`
  - iOS: `GoogleService-Info.plist`
- Keep `SMS_OTP_DEV_ECHO=false` in production and in real device testing. If it is enabled for isolated local tests, never expose that build to users.
- Users must have phone numbers in international E.164 format, for example `+905551112233`.
- If Firebase Auth is missing, the backend intentionally fails closed and deposit/transfer must not continue.
- Twilio remains supported only as an optional fallback provider when `SMS_PROVIDER=twilio` and Twilio credentials are configured.

## NOWPayments IPN ingress

- HMAC verification, timestamp freshness, nonce replay protection, and idempotent credit claim must remain enabled.
- In production, `NOWPAYMENTS_IPN_ALLOWED_IPS` must list the trusted ingress/proxy IPs that forward webhook requests to the backend.
- Keep `NOWPAYMENTS_IPN_ALLOW_PRIVATE=false` in production.
- Empty `NOWPAYMENTS_IPN_ALLOWED_IPS` in production is intentionally rejected at startup so deposits do not silently remain pending because every webhook is denied.
- If NOWPayments webhook delivery fails, do not manually edit balances. Run the deposit reconciliation job against pending intents and verify the audit log.
