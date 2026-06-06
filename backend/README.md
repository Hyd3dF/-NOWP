# Oroya Backend

PocketBase-backed API for the Oroya mobile app.

## Quick start

```bash
npm install --prefix backend
cp backend/.env.example backend/.env
npm run schema:sync --prefix backend
npm run start --prefix backend
```

## Scripts

```bash
npm run check --prefix backend     # node --check on every source file
npm run test --prefix backend      # unit + regression tests
npm run schema:sync --prefix backend
npm run start --prefix backend
npm run dev --prefix backend       # node --watch
```

## Security primitives

This backend implements the following defenses against the eight critical findings
called out in `SECURITY_AUDIT_PLAN.md`:

| Critical | Defence |
|----------|---------|
| K-1      | `/auth/register` never authenticates. Existing accounts are still re-provisioned, but the caller always gets `201 requiresLogin: true` and must call `/auth/login`. |
| K-2      | Devices are bound to a server-issued, HMAC-signed `device_token` (header `X-Oroya-Device-Token`) stored in the `device_tokens` PocketBase collection. |
| K-3      | Logout sets `device_tokens.revoked_at`. Every money-endpoint call validates the token and rejects revoked tokens. A `POST /auth/sessions/revoke` endpoint revokes all sessions for a user. |
| K-4      | The register endpoint always returns 201 with the same body shape regardless of whether the email exists. No `existingAccount` flag, no `token` field, no `200` status. |
| K-5      | All wallet mutations use optimistic locking on `wallets.version` + `updated`. The transfer flow retries up to 4 times via `applyInternalTransferWithLock`. |
| K-6      | Webhook credits are applied via a conditional PATCH on `payment_intents.credit_applied_at`. Only the thread that successfully claims the credit proceeds with wallet update + transaction completion. A `npm run reconcile:deposits` job repairs intents that crashed mid-credit. |
| K-7      | Webhook HMAC is computed over the raw request bytes returned by `parseRawJsonBody`. Re-serializing the parsed JSON cannot produce a matching signature. |
| K-8      | Persistent, PocketBase-backed rate limiter (`rate_limit_buckets` collection) applied to: login (10/5min), register (5/hr), deposit-create (10/min), webhook (120/min), transfer (30/min), admin (30/min), plus a global 600/min per-IP. |

## High-risk closures (Phase 2)

| Finding | Defence |
|---------|---------|
| YA-1    | `searchUsersForFriend` no longer matches on `email`. It only matches `username` (case-insensitive prefix via `lower(username) ~`) or an exact `payment_tag`. |
| YA-3/YP-8 | Deposit and transfer money flows require shared SMS OTP verification before the money operation starts. OTP codes are short-lived, single-use, rate-limited, stored only as HMAC hashes, and exchanged for a scoped `sms_otp_ticket`. Production requires a real SMS provider such as Twilio. |
| YP-1    | Webhook replays are blocked. Each webhook carries a 5-minute timestamp window (`NOWPAYMENTS_IPN_MAX_AGE_SECONDS`) and a server-issued nonce persisted in `webhook_nonces` (24h TTL). Replays return `409 webhook_replay_detected`. |
| YP-2    | The webhook source is gated by `isWebhookSourceAllowed`. By default only private-network IPs are accepted; an explicit allowlist can be set via `NOWPAYMENTS_IPN_ALLOWED_IPS`. |
| YP-5    | Production refuses to start if `OROYA_LEDGER_ALLOW_UNSIGNED=true`, the IPN secret is weak, or the admin token is short. |
| YP-7    | `getDailyTransferStats` paginates internally beyond the 200-record ceiling (capped at 50 pages, audit-logged on cap). |
| YS-1    | `toFriendUser` no longer leaks phone numbers. Phone is only returned inside an explicit `includePhone: true` call (e.g. from `listFriends`). |
| YS-2    | `/admin/notifications` is locally-networked in production, throttled at 30/min per IP, and writes an audit log on both success and token failures. |
| YI-1    | `/admin/notifications-tool` is disabled in production and serves the admin HTML with `Content-Security-Policy: default-src 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. |

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | Always returns 201. No token. |
| POST | `/auth/login` | Returns `token` + `device_token` (K-2). |
| POST | `/auth/logout` | Revokes the current `device_token`. |
| POST | `/auth/sessions/revoke` | Revokes all sessions for the caller. |
| GET  | `/users/me` | Authenticated. |
| POST | `/users/me/update` | Authenticated. Phone/username changes require the current device token plus security PIN. |
| GET  | `/users/payment-profile` | Authenticated. |
| GET  | `/wallets/me` | Authenticated. |
| GET  | `/friends`, `/friends/requests` | Authenticated. |
| GET  | `/friends/search` | Authenticated. Username/payment_tag only. |
| POST | `/friends/request`, `/friends/accept` | Authenticated. |
| POST | `/chats/open`, `/chats/messages` | Authenticated. |
| GET  | `/notifications`, `POST /notifications/read` | Authenticated. |
| POST | `/admin/notifications` | Static bearer token, IP-throttled, locally networked in production. |
| GET  | `/security/overview`, `POST /security/*` | Authenticated. |
| GET  | `/payments/currencies` | Authenticated. |
| POST | `/security/sms-otp/start` | Authenticated. Starts SMS OTP for `deposit` or `transfer`. |
| POST | `/security/sms-otp/verify` | Authenticated. Verifies SMS OTP and returns a scoped `sms_otp_ticket`. |
| POST | `/payments/create-deposit` | Authenticated + device token + SMS OTP ticket. |
| POST | `/payments/nowpayments-webhook` | Public, HMAC-verified, replay-protected, IP-allowlisted, rate-limited. |
| POST | `/transfers/two-factor/challenge` | Backward-compatible endpoint that starts transfer SMS OTP. |
| POST | `/transfers/send` | Authenticated + device token + SMS OTP ticket, optimistic lock, rate-limited. |
| GET  | `/transactions/me` | Authenticated. |

## Test command

```bash
npm test --prefix backend
```

Tests cover the eight critical paths plus the HTTP body parsing, optimistic lock
helper, rate limiter, 2FA challenge, webhook replay/nonce/allowlist guards,
admin endpoint hardening, search enumeration protection, daily-stats pagination,
and the deposit-reconcile job.

## Reconcile job

`npm run reconcile:deposits --prefix backend` sweeps `payment_intents` whose
`credit_applied_at` is set but whose `transaction.credit_applied_at` is not, and
finalises them. Run this after any backend crash between K-6 step 1 (claim) and
step 4 (mark applied).

### systemd (every 5 minutes)

```ini
# /etc/systemd/system/oroya-reconcile.service
[Service]
Type=oneshot
User=oroya
WorkingDirectory=/opt/oroya/backend
EnvironmentFile=/etc/oroya/backend.env
ExecStart=/usr/bin/node src/scripts/reconcile-pending-deposits.js
```

```ini
# /etc/systemd/system/oroya-reconcile.timer
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true
Unit=oroya-reconcile.service
[Install]
WantedBy=timers.target
```

```bash
sudo cp deploy/systemd/oroya-reconcile.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oroya-reconcile.timer
journalctl -u oroya-reconcile.service -f
```

### cron (every 5 minutes)

```cron
*/5 * * * * oroya cd /opt/oroya/backend && /usr/bin/node src/scripts/reconcile-pending-deposits.js >> /var/log/oroya/reconcile.log 2>&1
```

Run `RECONCILE_DRY_RUN=true npm run reconcile:deposits --prefix backend` to
preview the sweep without applying changes.

## Audit log retention

`npm run audit:purge --prefix backend` removes `audit_logs` records older than
`AUDIT_LOG_RETENTION_DAYS` (default 90) **except** financial/protected actions,
which are kept for `AUDIT_LOG_FINANCIAL_RETENTION_DAYS` (default 365). The
protected actions are: transfer send/receive, deposit crash recovery, webhook
replay/timestamp/source rejections, and wallet tamper/negative-ledger
detections.

Suggested schedule (cron.d):

```cron
13 3 * * * oroya cd /opt/oroya/backend && /usr/bin/node src/scripts/purge-audit-logs.js >> /var/log/oroya/audit-purge.log 2>&1
```

## Logging

Production runs use the structured logger in `src/logger.js`. Set:

- `LOG_LEVEL=info` (default) — `debug|info|warn|error|fatal`
- `SERVICE_NAME=oroya-backend` (default)

Every line is JSON on stdout/stderr, suitable for any log shipper (Loki,
Datadog, ELK). Legacy `console.log` in `start()` was replaced with `logger.info`
/ `logger.fatal`; per-request `console.error` was replaced with
`logger.warn('request_error', ...)`. No behaviour change for callers.

## Reverse proxy / TLS

The backend must be behind a TLS-terminating reverse proxy in production.
Reference Nginx config lives at `deploy/nginx/oroya-backend.conf`. With
`BACKEND_LOCAL_ONLY=true`, the backend only accepts requests from
`127.0.0.1/<private-network>`; the reverse proxy connects to
`127.0.0.1:4000`, and the only externally-reachable path is
`/payments/nowpayments-webhook` (configured by `BACKEND_PUBLIC_INGRESS_PATHS`).

If you use Cloudflare, set the proxy to **Full (Strict)**, point DNS to the
origin, and put the backend behind it. Cloudflare's published IP ranges are at
<https://www.cloudflare.com/ips/>; if you need to lock down further, add those
ranges to your reverse proxy ACL, not to `NOWPAYMENTS_IPN_ALLOWED_IPS` (which is
only for the webhook).

## NOWPayments IP allowlist

NOWPayments does **not** publish a fixed IP allowlist for IPN callbacks. They
explicitly warn that IP-based filtering is unreliable because the egress IPs
can rotate. The recommended approach is:

1. **Don't rely on IP allowlist alone.** Use HMAC signature + timestamp window +
   nonce store (all already implemented in `K-7`, `YP-1`).
2. If you want a defence-in-depth allowlist, set
   `NOWPAYMENTS_IPN_ALLOWED_IPS` to the IPs of any reverse proxy you put in
   front of the webhook (Cloudflare or your own edge). Don't enumerate
   NOWPayments — they don't publish a stable list.
3. Empty `NOWPAYMENTS_IPN_ALLOWED_IPS` + `NOWPAYMENTS_IPN_ALLOW_PRIVATE=true`
   (default) → only private-network IPs are accepted (defence against external
   probing, but assumes the webhook comes through a private reverse proxy).
4. Empty `NOWPAYMENTS_IPN_ALLOWED_IPS` + `NOWPAYMENTS_IPN_ALLOW_PRIVATE=false`
   → no IP accepted, **webhook will break** unless you set the allowlist.

Production recommendation: set `NOWPAYMENTS_IPN_ALLOWED_IPS=<your-edge-proxy-ips>`
and keep `NOWPAYMENTS_IPN_ALLOW_PRIVATE=false` so only your edge can hit the
webhook.

## Firebase PNV client build

Firebase Phone Number Verification requires Android native code and a Firebase
Android configuration file. Expo Go does not include this app's native module,
so PNV cannot work there. Build with `npx expo prebuild --platform android` or
EAS Android so `../plugins/withFirebasePnv.js` can inject the native bridge and
the `com.google.firebase:firebase-pnv:16.0.0-beta01` dependency. See
`DEPLOYMENT_RUNBOOK.md` for the required `google-services.json`, privacy-policy
URL, and backend Firebase environment variables.

## NOWPayments production startup guard

Production startup rejects an empty `NOWPAYMENTS_IPN_ALLOWED_IPS`. This keeps a
deployment from silently denying every IPN webhook. Set the variable to the
trusted ingress/proxy IPs that forward webhook traffic to the backend, keep
`NOWPAYMENTS_IPN_ALLOW_PRIVATE=false`, and continue relying on HMAC signature,
timestamp, nonce replay protection, and idempotent credit claims.
