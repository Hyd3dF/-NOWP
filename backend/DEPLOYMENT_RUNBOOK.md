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

## Firebase PNV Android build

- Firebase PNV is Android-only and requires a custom Android development/production build. It will not work in Expo Go because Expo Go cannot include the native PNV SDK module.
- Required local build inputs:
  - `google-services.json` at the project root. This file is intentionally ignored by git.
  - `EXPO_PUBLIC_FIREBASE_PNV_PRIVACY_POLICY_URL=https://...`
  - Backend `FIREBASE_PNV_PROJECT_NUMBER` and `FIREBASE_PNV_PROJECT_ID`.
- Run `npx expo prebuild --platform android` or an EAS Android build so `./plugins/withFirebasePnv` can inject:
  - `com.google.firebase:firebase-pnv:16.0.0-beta01`
  - `FirebasePhoneNumberVerification` React Native native module
- Transfer submission must continue to fail closed when Firebase PNV is unavailable or when the backend rejects the signed PNV token.

## NOWPayments IPN ingress

- HMAC verification, timestamp freshness, nonce replay protection, and idempotent credit claim must remain enabled.
- In production, `NOWPAYMENTS_IPN_ALLOWED_IPS` must list the trusted ingress/proxy IPs that forward webhook requests to the backend.
- Keep `NOWPAYMENTS_IPN_ALLOW_PRIVATE=false` in production.
- Empty `NOWPAYMENTS_IPN_ALLOWED_IPS` in production is intentionally rejected at startup so deposits do not silently remain pending because every webhook is denied.
- If NOWPayments webhook delivery fails, do not manually edit balances. Run the deposit reconciliation job against pending intents and verify the audit log.
