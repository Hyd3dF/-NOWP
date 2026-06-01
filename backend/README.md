# Oroya Backend

First backend phase for Oroya:

- PocketBase connection is read from `.env`.
- Auth endpoints use PocketBase auth tokens as secure session tokens.
- Wallet and audit log collections are accessed only by the backend through the PocketBase superuser credentials.
- NOWPayments credentials are read from `.env`, but payment endpoints are intentionally not integrated in this phase.

## Scripts

```bash
npm run check --prefix backend
npm run test:pb --prefix backend
npm run start --prefix backend
```

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `GET /users/me`
- `GET /wallets/me`
- `POST /payments/create-deposit`
