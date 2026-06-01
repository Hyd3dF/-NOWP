# Oroya Local Quality Pass Report

Date: 2026-06-01

Scope: Local-only application hardening and quality cleanup. No production deployment was attempted.

## Summary

The app was split into focused work areas and reviewed by multiple agents:

- Auth/Register/Login
- Profile/Settings
- Wallet/Deposit/Activity
- People/Friends/Chat
- Backend permissions and security
- General mock text and UI cleanup

The main goal was to remove prototype behavior, reduce technical error exposure, improve empty/error states, and keep the local backend stable.

## 1. Auth, Register, Login

Changed areas:

- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/verify.tsx`
- `stores/authStore.ts`
- `services/api/client.ts`

What was improved:

- Removed simulator/mock biometric login behavior.
- Login now shows safer user-facing messages.
- Signup errors are mapped to clean messages such as conflict, validation, unavailable server, or connection issue.
- Verify screen no longer exposes a fixed test code.
- Email display is masked where appropriate.
- Logout clears session token, PIN, biometric setting, wallet cache, friend cache, transaction cache, payment profile cache, and send state.
- API client prevents external `Authorization` header override.
- API client sends device headers for backend security checks.
- API client uses safe error codes instead of showing raw backend error text.
- Device ID prefix was made production-neutral.

## 2. Profile And Settings

Changed areas:

- `app/(tabs)/profile.tsx`
- `app/profile/edit.tsx`
- `app/profile/help.tsx`
- `app/profile/security.tsx`
- `app/profile/payments.tsx`
- `app/profile/verification.tsx`

What was improved:

- Profile page was simplified.
- Oroya ID remains copyable.
- Prototype labels such as MVP/build/mock/simulated were removed from visible UI.
- Help page now uses professional support language.
- Payment settings no longer shows fake card/Stripe/Plaid behavior.
- Security screen no longer enables biometrics as a fake fallback.
- Verification screen uses neutral review language.
- Profile edit messages are cleaner and less technical.

## 3. Wallet, Deposit, Activity

Changed areas:

- `app/deposit/index.tsx`
- `app/deposit/select-coin.tsx`
- `app/(tabs)/home.tsx`
- `app/(tabs)/activity.tsx`
- `app/activity/[id].tsx`
- `stores/walletStore.ts`
- `stores/transactionStore.ts`

What was improved:

- Deposit screen keeps NOWPayments keys out of the mobile app.
- Deposit text and validation messages are clearer.
- Wallet error messages are user-friendly.
- Fake growth text was removed from the home screen.
- Activity store no longer depends on mock transaction data.
- Activity now loads from backend endpoint `GET /transactions/me`.
- Activity empty and error states were improved.
- Transaction detail screen attempts to load transactions if opened directly.

Backend support added:

- `backend/src/routes/transactions.js`
- `GET /transactions/me`
- `pocketBase.getTransactionsForUser(userId)`

## 4. Friends, People, Chat

Changed areas:

- `app/people/add.tsx`
- `app/(tabs)/people.tsx`
- `app/people/[id].tsx`
- `app/chat/[id].tsx`
- `stores/friendStore.ts`
- `services/api/social.ts`
- `app/qr/scan.tsx`

What was improved:

- Friends list now focuses on accepted friends.
- Friend request states are clearer.
- Add friend search has visible error state.
- Empty states are more useful.
- Chat load failure has retry.
- Message send failure restores the draft and informs the user.
- Chat input is disabled when the chat cannot be opened.
- Friend profile no longer shows unnecessary phone data; Oroya ID is used instead.
- QR scan no longer routes to a fake user.
- QR scan now reads Oroya profile QR payload and opens Add Friend with the payment tag.

## 5. Backend Security And Permissions

Changed areas:

- `backend/src/http.js`
- `backend/src/server.js`
- `backend/src/pocketbase.js`
- `backend/src/routes/auth.js`
- `backend/src/routes/payments.js`
- `backend/src/routes/transactions.js`
- `backend/src/config.js`
- `backend/src/nowpayments.js`
- `backend/package.json`

What was improved:

- Central safe error response handling.
- Server errors no longer expose internal details.
- Error details are allowlisted.
- Audit logs now redact sensitive nested fields.
- Password, PIN, token, secret, API key, signature, credential, and hash fields are protected in audit metadata.
- Device ID is hashed before storage.
- Header values are normalized and truncated.
- Request body size is measured by bytes.
- CORS supports configured origin lists and safer local behavior.
- `/health` no longer exposes secret configuration flags.
- Startup logs no longer print secret availability.
- Failed login attempts count toward device security limits.
- Logout is audited without increasing login count.
- NOWPayments signature validation was tightened.
- Raw provider responses are no longer carried through normal app logic.

## 6. Removed Or Reduced Prototype Behavior

Removed or reduced:

- Mock login/biometric behavior
- Fake card/payment method text
- Mock support chat text
- Simulated verification copy
- Fake QR scan recipient
- Fake growth metric on home
- Mock transaction dependency for Activity
- Technical backend errors in UI

Known remaining development-only item:

- `services/mock/mockData.ts` still exists as a development support file, but normal transaction/friend flows were moved away from it where needed.

## 7. Local Backend Status

Backend remains local-only.

Health check result:

```json
{
  "success": true,
  "status": "ok",
  "service": "oroya-backend",
  "mode": "local"
}
```

No public deployment or production callback URL was configured.

## 8. Verification

Commands run:

```bash
npx tsc --noEmit
npm run backend:check
```

Result:

- TypeScript check passed.
- Backend syntax check passed.
- Backend was restarted locally.
- Health check passed.

## 9. Recommended Manual Test Order

Use this order in the app:

1. Register a new account.
2. Log out.
3. Log in with the same account.
4. Open Profile and copy Oroya ID.
5. Open Wallet/Home and confirm wallet loads.
6. Open Deposit and create a deposit address with a valid amount.
7. Open Activity and confirm empty/error states look clean.
8. Create a second account on another device/session if needed.
9. Search friend by Oroya ID.
10. Send and accept friend request.
11. Open chat and send a message.
12. Open QR scan and scan an Oroya profile QR.

## 10. Next Local-Only Improvements

Recommended next steps:

- Add backend endpoint tests for auth, wallets, transactions, friends, and chat.
- Add a local seed script for test users.
- Build a small local admin/dev checklist screen or script.
- Improve verification submission with real file upload.
- Add request-money backend persistence if the request flow should become real.
- Add push-notification placeholders only after local app flows are stable.
