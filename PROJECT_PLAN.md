# Oroya — Mobile Money App · Project Plan (MVP)

> **Version:** 0.1.0 · MVP  
> **Platform:** iOS & Android (Expo React Native)  
> **Last updated:** 2026-05-31

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Principles](#2-core-principles)
3. [App Navigation Architecture](#3-app-navigation-architecture)
4. [Full Page / Screen List](#4-full-page--screen-list)
5. [Screen Specifications](#5-screen-specifications)
6. [User Flows](#6-user-flows)
7. [MVP Features](#7-mvp-features)
8. [Future Features (Post-MVP)](#8-future-features-post-mvp)
9. [Database Tables](#9-database-tables)
10. [Backend API Endpoints](#10-backend-api-endpoints)
11. [Payment Provider Integration Plan](#11-payment-provider-integration-plan)
12. [Security Rules](#12-security-rules)
13. [Folder Structure](#13-folder-structure)
14. [Tech Stack](#14-tech-stack)
15. [Design System & Branding](#15-design-system--branding)
16. [Step-by-Step Development Roadmap](#16-step-by-step-development-roadmap)

---

## 1. Product Overview

**Oroya** is a simple, modern mobile money application. Users can:

- View their wallet balance
- Send money to other Oroya users
- Receive money
- Request money from contacts
- Share / scan QR codes for instant transfers
- View full transaction history with filters
- Manage friends and contacts
- Manage profile, security, and payment settings

### MVP Scope

The first version uses **mock / test payment flows** on the client and a **placeholder backend** so the full user experience can be built, tested, and demonstrated. Real payment processing will be added through a backend server connected to a licensed payment provider — **no API keys or secrets will ever be stored in the mobile app**.

---

## 2. Core Principles

| Principle | Detail |
|---|---|
| **Security-first** | All sensitive operations go through the backend. The app never stores secrets, API keys, or raw card data. |
| **Offline-aware** | Graceful degradation when network is unavailable; queue actions and sync when reconnected. |
| **Simplicity** | Every screen serves one clear purpose. Minimize taps to complete a task. |
| **Accessibility** | WCAG-compliant contrast ratios, screen-reader labels, minimum 44pt touch targets. |
| **Performance** | Target < 2 s cold start. Virtualized lists, lazy loading, optimistic UI updates. |

---

## 3. App Navigation Architecture

```
Bottom Tab Bar (4 tabs + 1 center FAB)
├── 🏠 Home          (Tab 1)
├── 👥 People        (Tab 2)
├── ➕ Actions FAB   (Center floating button — opens modal)
├── 📋 Activity      (Tab 3)
└── 👤 Profile       (Tab 4)
```

### Center Floating Action Button (FAB)

The center tab position is occupied by a **raised circular button** that opens an **action sheet / bottom-sheet modal** with:

| Action | Icon | Description |
|---|---|---|
| Send Money | ↗ | Navigate to send-money flow |
| Receive Money | ↙ | Show receive screen / wallet address |
| Request Money | 🔔 | Create a payment request to a contact |
| Show QR Code | ◻ | Display user's personal QR code |
| Scan QR Code | 📷 | Open camera to scan another user's QR |

The FAB is **not a tab screen** — it is a modal overlay. The active tab underneath stays unchanged.

### Navigation Library

- `expo-router` (file-based routing built on React Navigation)
- Bottom tabs: `@react-navigation/bottom-tabs`
- Modals & stack screens: native stack navigators via `expo-router`

---

## 4. Full Page / Screen List

### Tab Screens

| # | Screen | Route | Parent Tab |
|---|---|---|---|
| 1 | Home / Balance | `/(tabs)/home` | Home |
| 2 | People / Contacts | `/(tabs)/people` | People |
| 3 | Activity / Transactions | `/(tabs)/activity` | Activity |
| 4 | Profile / Settings | `/(tabs)/profile` | Profile |

### Stack / Modal Screens

| # | Screen | Route | Triggered From |
|---|---|---|---|
| 5 | Send Money | `/send` | FAB, Home quick-action, People card |
| 6 | Send — Confirm | `/send/confirm` | Send Money |
| 7 | Send — Success / Receipt | `/send/receipt` | Send Confirm |
| 8 | Receive Money | `/receive` | FAB |
| 9 | Request Money | `/request` | FAB |
| 10 | Request — Confirm | `/request/confirm` | Request Money |
| 11 | Show QR Code | `/qr/show` | FAB, Receive |
| 12 | Scan QR Code | `/qr/scan` | FAB |
| 13 | Transaction Detail | `/activity/[id]` | Activity list item |
| 14 | Add Friend | `/people/add` | People |
| 15 | Friend / User Profile | `/people/[id]` | People list item |
| 16 | Edit Profile | `/profile/edit` | Profile |
| 17 | Identity Verification | `/profile/verification` | Profile |
| 18 | Security Settings | `/profile/security` | Profile |
| 19 | Payment Settings | `/profile/payments` | Profile |
| 20 | Help & Support | `/profile/help` | Profile |
| 21 | Notifications | `/notifications` | Home header bell icon |

### Auth Screens (pre-login)

| # | Screen | Route |
|---|---|---|
| 22 | Welcome / Onboarding | `/onboarding` |
| 23 | Sign Up | `/auth/signup` |
| 24 | Log In | `/auth/login` |
| 25 | Forgot Password | `/auth/forgot-password` |
| 26 | OTP / Email Verification | `/auth/verify` |
| 27 | Set PIN | `/auth/set-pin` |

---

## 5. Screen Specifications

### 5.1 Home / Balance Screen

```
┌─────────────────────────────────┐
│  👋 Good morning, Alex          │
│  🔔 (notification bell)        │
├─────────────────────────────────┤
│  ┌─ Balance Card ─────────────┐ │
│  │  Total Balance             │ │
│  │  $4,250.00                 │ │
│  │  +2.4% this month          │ │
│  └────────────────────────────┘ │
├─────────────────────────────────┤
│  Quick Actions                  │
│  [Send] [Receive] [Request]     │
│  [Scan QR]                      │
├─────────────────────────────────┤
│  Recent Transactions            │
│  ┌──────────────────────────┐   │
│  │ ↗ Sent to Maria  -$50   │   │
│  │ ↙ From Daniel    +$120  │   │
│  │ ↗ Sent to Store  -$18   │   │
│  └──────────────────────────┘   │
│  [View All →]                   │
├─────────────────────────────────┤
│  Recent Contacts (avatars row)  │
│  (Maria) (Daniel) (Chris) (+)   │
└─────────────────────────────────┘
```

**Components:**
- `BalanceCard` — gradient card with masked/visible toggle for balance
- `QuickActions` — horizontal icon row
- `TransactionPreviewList` — last 5 transactions, each tappable
- `RecentContacts` — horizontal avatar scroll

---

### 5.2 People / Contacts Screen

```
┌─────────────────────────────────┐
│  People            [+ Add]      │
├─────────────────────────────────┤
│  🔍 Search contacts…           │
├─────────────────────────────────┤
│  Recent Recipients              │
│  (Maria) (Daniel) (Chris)       │
├─────────────────────────────────┤
│  All Friends                    │
│  ┌──────────────────────────┐   │
│  │ 🟢 Maria López           │   │
│  │    @maria · Last sent    │   │
│  ├──────────────────────────┤   │
│  │ 🟢 Daniel Kim            │   │
│  │    @daniel               │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

**Features:**
- Search by name or username
- Tap contact → go to `/people/[id]` (view profile, send money)
- Add friend → go to `/people/add` (search by username, phone, or QR)
- Recent recipients shown as horizontal avatar chips

---

### 5.3 Activity / Transactions Screen

```
┌─────────────────────────────────┐
│  Activity                       │
├─────────────────────────────────┤
│  [All] [Sent] [Received]        │
│  [Pending] [Failed]             │
├─────────────────────────────────┤
│  Today                          │
│  ┌──────────────────────────┐   │
│  │ ↗ Maria López    -$50   │   │
│  │   Completed · 2:34 PM   │   │
│  ├──────────────────────────┤   │
│  │ ↙ Daniel Kim     +$120  │   │
│  │   Completed · 11:02 AM  │   │
│  └──────────────────────────┘   │
│  Yesterday                      │
│  ┌──────────────────────────┐   │
│  │ ⏳ Chris Park    -$200  │   │
│  │   Pending · 5:15 PM     │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

**Features:**
- Filter pills: All, Sent, Received, Pending, Failed
- Section headers by date
- Tap row → go to `/activity/[id]` (full transaction detail)
- Pull-to-refresh
- Infinite scroll / pagination

**Transaction Detail Screen (`/activity/[id]`):**
- Amount, direction (sent / received)
- Counterparty name + avatar
- Date & time
- Status badge (Completed / Pending / Failed)
- Reference / transaction ID
- Note / memo
- Action: Repeat transaction, Report issue

---

### 5.4 Profile / Settings Screen

```
┌─────────────────────────────────┐
│  ┌─ Avatar ──┐                  │
│  │   (photo) │  Alex Johnson    │
│  │           │  @alexj          │
│  └───────────┘  Edit profile →  │
├─────────────────────────────────┤
│  Identity Verification          │
│  ├ Status: Verified ✅          │
├─────────────────────────────────┤
│  Security                       │
│  ├ Change PIN                   │
│  ├ Biometric Login              │
│  ├ Change Password              │
│  ├ Two-Factor Auth              │
├─────────────────────────────────┤
│  Payment Settings               │
│  ├ Linked Wallet                │
│  ├ Default Currency             │
│  ├ Transaction Limits           │
├─────────────────────────────────┤
│  Help & Support                 │
│  ├ FAQ                          │
│  ├ Contact Support              │
│  ├ Terms & Privacy              │
├─────────────────────────────────┤
│  [Log Out]                      │
└─────────────────────────────────┘
```

---

## 6. User Flows

### 6.1 Onboarding & Registration

```
Welcome screen
  → Sign Up (name, email, phone, password)
    → OTP / Email verification
      → Set 4-digit PIN
        → (Optional) Enable biometrics
          → Home screen
```

### 6.2 Log In

```
Login (email + password)
  → OTP / 2FA (if enabled)
    → Enter PIN or biometric
      → Home screen
```

### 6.3 Send Money

```
Tap "Send" (from FAB, Home, or People)
  → Select recipient (search, recent, contacts)
    → Enter amount + optional note
      → Review & Confirm screen
        → Enter PIN / biometric
          → Processing…
            → Success screen with receipt
              → [Done] → Home
```

### 6.4 Receive Money

```
Tap "Receive" (from FAB or Home)
  → Show personal QR code + username + copy link
  → (Sender scans / sends from their app)
  → Push notification received
    → Tap notification → Transaction detail
```

### 6.5 Request Money

```
Tap "Request" (from FAB)
  → Select contact
    → Enter amount + optional note
      → Confirm request
        → Request sent (pending)
          → Recipient receives notification
            → Recipient approves → funds transfer
```

### 6.6 Scan QR Code

```
Tap "Scan QR" (from FAB or Home)
  → Camera opens
    → Scan valid Oroya QR
      → Pre-fill recipient in Send Money flow
        → Enter amount → Confirm → Success
```

---

## 7. MVP Features

### Must-Have (v1.0)

- [x] User registration with email + phone + OTP verification - Completed
- [x] Login with password + PIN - Completed
- [x] View wallet balance (mock data) - Completed
- [x] Send money to another user (mock flow) - Completed
- [x] Receive money (mock flow with push notification) - Completed (Mock flow)
- [x] Transaction history with filters - Completed
- [x] Transaction detail view - Completed
- [x] Friends / contacts list with search - Completed
- [x] Add friend by username - Completed
- [x] Show personal QR code - Completed
- [x] Scan QR code to pre-fill send - Completed
- [x] User profile view and edit - Completed (Profile view)
- [x] Change PIN - Completed
- [x] Logout - Completed
- [x] Bottom tab navigation with center FAB - Completed
- [x] Pull-to-refresh on lists - Completed
- [x] Loading, empty, and error states for every screen - Completed
- [x] Haptic feedback on key actions - Completed

### Nice-to-Have for MVP

- [x] Biometric unlock (Face ID / Touch ID) - Completed
- [ ] Dark mode support
- [x] Request money flow - Completed (Mock Flow)
- [ ] Push notifications (Expo Notifications)
- [x] Skeleton loading placeholders - Completed

---

## 8. Future Features (Post-MVP)

| Feature | Priority | Notes |
|---|---|---|
| Real payment provider integration | 🔴 High | Stripe Connect, Paystack, Flutterwave, etc. |
| KYC / Identity verification | 🔴 High | Third-party KYC provider (Jumio, Onfido) |
| Bank account / card linking | 🔴 High | Via payment provider |
| Scheduled / recurring transfers | 🟡 Medium | Cron-based backend jobs |
| Multi-currency wallets | 🟡 Medium | Currency conversion API |
| Bill splitting | 🟡 Medium | Group transactions |
| In-app chat | 🟡 Medium | Around payments context |
| Savings goals / vaults | 🟢 Low | Sub-wallets with goals |
| Card issuance (virtual / physical) | 🟢 Low | Stripe Issuing or Marqeta |
| Merchant payments | 🟢 Low | POS QR scanning |
| Crypto wallet support | 🟢 Low | Web3 integration |
| Gamification (rewards, badges) | 🟢 Low | Engagement features |
| Localization (i18n) | 🟡 Medium | Multiple languages |

---

## 9. Database Tables

> The database lives on the **backend server only** (e.g., PostgreSQL via Supabase, or a custom API with any SQL/NoSQL database). The mobile app accesses data exclusively through API calls.

### 9.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `email` | VARCHAR(255) | Unique, indexed |
| `phone` | VARCHAR(20) | Unique, indexed |
| `username` | VARCHAR(30) | Unique, indexed, lowercase |
| `display_name` | VARCHAR(100) | |
| `avatar_url` | TEXT | |
| `pin_hash` | VARCHAR(255) | bcrypt / argon2 hash |
| `password_hash` | VARCHAR(255) | bcrypt / argon2 hash |
| `kyc_status` | ENUM | `none`, `pending`, `verified`, `rejected` |
| `is_active` | BOOLEAN | Default `true` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### 9.2 `wallets`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | Indexed |
| `currency` | VARCHAR(3) | e.g., `USD`, `EUR` |
| `balance` | DECIMAL(15,2) | Server-managed; never trust client |
| `is_default` | BOOLEAN | |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### 9.3 `transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `sender_id` | UUID (FK → users) | Nullable for top-ups |
| `receiver_id` | UUID (FK → users) | Nullable for withdrawals |
| `wallet_id` | UUID (FK → wallets) | |
| `amount` | DECIMAL(15,2) | Always positive |
| `currency` | VARCHAR(3) | |
| `type` | ENUM | `send`, `receive`, `request`, `topup`, `withdrawal` |
| `status` | ENUM | `pending`, `completed`, `failed`, `cancelled` |
| `note` | TEXT | Optional memo |
| `reference` | VARCHAR(64) | Unique external reference |
| `payment_provider_id` | VARCHAR(255) | External provider transaction ID |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### 9.4 `friends`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `friend_id` | UUID (FK → users) | |
| `status` | ENUM | `pending`, `accepted`, `blocked` |
| `created_at` | TIMESTAMP | |

> **Unique constraint** on `(user_id, friend_id)`.

### 9.5 `payment_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `requester_id` | UUID (FK → users) | Who is asking for money |
| `payer_id` | UUID (FK → users) | Who should pay |
| `amount` | DECIMAL(15,2) | |
| `currency` | VARCHAR(3) | |
| `note` | TEXT | |
| `status` | ENUM | `pending`, `paid`, `declined`, `expired` |
| `transaction_id` | UUID (FK → transactions) | Linked once paid |
| `created_at` | TIMESTAMP | |
| `expires_at` | TIMESTAMP | |

### 9.6 `devices`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `push_token` | TEXT | Expo push token |
| `platform` | ENUM | `ios`, `android` |
| `device_name` | VARCHAR(100) | |
| `last_active_at` | TIMESTAMP | |
| `created_at` | TIMESTAMP | |

### 9.7 `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK → users) | |
| `title` | VARCHAR(255) | |
| `body` | TEXT | |
| `type` | ENUM | `transaction`, `request`, `friend`, `system` |
| `reference_id` | UUID | Polymorphic link |
| `is_read` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMP | |

---

## 10. Backend API Endpoints

> All endpoints are prefixed with `/api/v1`. Authentication via `Authorization: Bearer <JWT>`.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/verify-otp` | Verify OTP code |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |
| POST | `/auth/refresh` | Refresh JWT |
| POST | `/auth/set-pin` | Set or update PIN |
| POST | `/auth/verify-pin` | Verify PIN for sensitive actions |

### Users

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users/me` | Get authenticated user profile |
| PATCH | `/users/me` | Update profile |
| POST | `/users/me/avatar` | Upload avatar |
| GET | `/users/search?q=` | Search users by username/phone |
| GET | `/users/:id` | Get public profile |

### Wallets

| Method | Endpoint | Description |
|---|---|---|
| GET | `/wallets` | Get user's wallets |
| GET | `/wallets/:id/balance` | Get balance |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| POST | `/transactions/send` | Send money |
| GET | `/transactions` | List transactions (paginated) |
| GET | `/transactions/:id` | Get transaction detail |
| GET | `/transactions?filter=sent` | Filter transactions |

### Payment Requests

| Method | Endpoint | Description |
|---|---|---|
| POST | `/requests` | Create payment request |
| GET | `/requests` | List incoming/outgoing requests |
| POST | `/requests/:id/pay` | Pay a request |
| POST | `/requests/:id/decline` | Decline a request |

### Friends

| Method | Endpoint | Description |
|---|---|---|
| GET | `/friends` | List friends |
| POST | `/friends/add` | Send friend request |
| POST | `/friends/:id/accept` | Accept request |
| POST | `/friends/:id/block` | Block user |
| DELETE | `/friends/:id` | Remove friend |
| GET | `/friends/recent` | Recent recipients |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/notifications` | List notifications (paginated) |
| PATCH | `/notifications/:id/read` | Mark as read |
| POST | `/notifications/register-device` | Register push token |

### QR

| Method | Endpoint | Description |
|---|---|---|
| GET | `/qr/me` | Get data payload for personal QR code |
| POST | `/qr/resolve` | Decode scanned QR → user info |

---

## 11. Payment Provider Integration Plan

### MVP Phase (Mock)

In the MVP, all money movement is **simulated**:

- The backend manages wallet balances directly in the database.
- `POST /transactions/send` deducts from sender's wallet and credits receiver's wallet in a single database transaction.
- No real money moves. Balances are seeded with test amounts.
- The mobile app calls the same API endpoints it will use in production — the experience is identical.

### Production Phase (Real Payments)

```
┌──────────┐       ┌──────────────┐       ┌─────────────────────┐
│  Mobile  │──────▶│  Backend     │──────▶│  Payment Provider   │
│  App     │  API  │  Server      │  SDK  │  (Stripe, Paystack, │
│          │◀──────│              │◀──────│   Flutterwave, etc) │
└──────────┘       └──────────────┘       └─────────────────────┘
```

**Key points:**

1. **API keys live on the backend only.** The mobile app never sees provider credentials.
2. The backend wraps provider SDK calls behind its own API endpoints.
3. Money flow:
   - **Top-up:** User adds funds via card/bank → Backend calls provider → Provider confirms → Backend credits wallet.
   - **Send:** Backend debits sender wallet, credits receiver wallet (internal ledger). Provider is used for deposits/withdrawals only.
   - **Withdrawal:** User requests withdrawal → Backend calls provider → Provider sends to bank/mobile money.
4. **Webhook handling:** The backend exposes a webhook endpoint that the payment provider calls for async confirmations (e.g., `/webhooks/stripe`).
5. **Idempotency:** Every transaction request includes an idempotency key to prevent duplicate charges.

### Recommended Providers

| Provider | Best For | Notes |
|---|---|---|
| **Stripe Connect** | Global, card-based | Excellent API, broad coverage |
| **Paystack** | Africa (Nigeria, Ghana, SA) | Acquired by Stripe |
| **Flutterwave** | Africa, multi-channel | Mobile money support |
| **Rapyd** | Global, multi-rail | Aggregator |
| **Chipper Cash API** | Africa P2P | If available |

### Integration Checklist (Production)

- [ ] Select payment provider based on target geography
- [ ] Set up provider account and obtain API keys
- [ ] Store API keys in backend environment variables (never in app code)
- [ ] Implement server-side SDK integration
- [ ] Set up webhook endpoint and signature verification
- [ ] Implement idempotency for all payment operations
- [ ] Add transaction reconciliation job
- [ ] Implement refund/reversal flows
- [ ] Test with provider's sandbox/test environment
- [ ] Complete provider's compliance review
- [ ] Go live with real payments

---

## 12. Security Rules

### Authentication & Authorization

- All API calls require a valid JWT (except auth endpoints).
- JWTs expire after 15 minutes; refresh tokens last 7 days.
- Sensitive actions (send money, change PIN) require PIN or biometric re-verification.
- Rate-limit login attempts: max 5 per minute per IP.

### Data Protection

- Passwords and PINs are hashed with **Argon2id** or **bcrypt** (never stored in plain text).
- All API communication over **HTTPS/TLS 1.3** only.
- Sensitive data encrypted at rest (database-level encryption).
- PII (personal identifiable information) access is logged and auditable.

### Mobile App Security

- **No API keys, secrets, or provider credentials in the app bundle.**
- Secure token storage: `expo-secure-store` (Keychain on iOS, Keystore on Android).
- Certificate pinning for production API endpoints.
- Jailbreak / root detection (informational warning).
- Auto-lock app after 5 minutes of inactivity → require PIN/biometric.
- Mask balance and sensitive data on the task switcher (app snapshot protection).
- Disable screenshots on sensitive screens (Android).

### Transaction Security

- All money operations are **server-authoritative**. The client never computes balances.
- Database transactions with row-level locking for balance updates (prevent race conditions).
- Every transaction has a unique idempotency key.
- Maximum transaction limits enforced server-side.
- Velocity checks: flag unusual patterns (e.g., many transactions in short period).
- All transactions are immutable once created (append-only ledger pattern).

### Infrastructure

- Backend behind a WAF (Web Application Firewall).
- DDoS protection (Cloudflare or equivalent).
- Separate staging and production environments.
- Automated security dependency scanning (Dependabot / Snyk).
- Penetration testing before production launch.

---

## 13. Folder Structure

```
oroya/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root layout (providers, auth gate)
│   ├── (auth)/                   # Auth group
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   ├── verify.tsx
│   │   ├── forgot-password.tsx
│   │   └── set-pin.tsx
│   ├── (tabs)/                   # Main tab group
│   │   ├── _layout.tsx           # Tab bar config + FAB
│   │   ├── home.tsx
│   │   ├── people.tsx
│   │   ├── activity.tsx
│   │   └── profile.tsx
│   ├── send/
│   │   ├── index.tsx             # Select recipient + amount
│   │   ├── confirm.tsx
│   │   └── receipt.tsx
│   ├── receive/
│   │   └── index.tsx
│   ├── request/
│   │   ├── index.tsx
│   │   └── confirm.tsx
│   ├── qr/
│   │   ├── show.tsx
│   │   └── scan.tsx
│   ├── activity/
│   │   └── [id].tsx              # Transaction detail
│   ├── people/
│   │   ├── add.tsx
│   │   └── [id].tsx              # Friend profile
│   ├── profile/
│   │   ├── edit.tsx
│   │   ├── verification.tsx
│   │   ├── security.tsx
│   │   ├── payments.tsx
│   │   └── help.tsx
│   ├── notifications.tsx
│   └── onboarding.tsx
│
├── components/                   # Reusable UI components
│   ├── ui/                       # Primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   ├── Avatar.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── PinPad.tsx
│   │   ├── SkeletonLoader.tsx
│   │   └── EmptyState.tsx
│   ├── home/
│   │   ├── BalanceCard.tsx
│   │   ├── QuickActions.tsx
│   │   ├── RecentTransactions.tsx
│   │   └── RecentContacts.tsx
│   ├── people/
│   │   ├── ContactCard.tsx
│   │   ├── ContactSearch.tsx
│   │   └── RecentRecipients.tsx
│   ├── activity/
│   │   ├── TransactionItem.tsx
│   │   ├── TransactionFilters.tsx
│   │   └── TransactionDetail.tsx
│   ├── profile/
│   │   ├── ProfileHeader.tsx
│   │   ├── SettingsItem.tsx
│   │   └── VerificationBadge.tsx
│   ├── send/
│   │   ├── RecipientSelector.tsx
│   │   ├── AmountInput.tsx
│   │   └── ConfirmSheet.tsx
│   └── shared/
│       ├── FABActionSheet.tsx
│       ├── HeaderBar.tsx
│       ├── StatusBadge.tsx
│       └── QRCode.tsx
│
├── services/                     # API client & business logic
│   ├── api/
│   │   ├── client.ts             # Axios/fetch instance, interceptors
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── wallets.ts
│   │   ├── transactions.ts
│   │   ├── friends.ts
│   │   ├── requests.ts
│   │   ├── notifications.ts
│   │   └── qr.ts
│   └── mock/                     # Mock implementations for MVP
│       ├── mockData.ts
│       ├── mockAuth.ts
│       ├── mockTransactions.ts
│       └── mockWallets.ts
│
├── stores/                       # State management (Zustand)
│   ├── authStore.ts
│   ├── walletStore.ts
│   ├── transactionStore.ts
│   ├── friendStore.ts
│   └── notificationStore.ts
│
├── hooks/                        # Custom React hooks
│   ├── useAuth.ts
│   ├── useBalance.ts
│   ├── useTransactions.ts
│   ├── useFriends.ts
│   ├── useBiometrics.ts
│   └── useSecureStore.ts
│
├── utils/                        # Pure utility functions
│   ├── format.ts                 # Currency formatting, dates
│   ├── validation.ts             # Input validation rules
│   ├── qr.ts                     # QR encode/decode helpers
│   └── constants.ts              # App-wide constants
│
├── theme/                        # Design tokens & theming
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   └── index.ts                  # Combined theme export
│
├── types/                        # TypeScript type definitions
│   ├── user.ts
│   ├── wallet.ts
│   ├── transaction.ts
│   ├── friend.ts
│   └── navigation.ts
│
├── assets/                       # Static assets
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── tsconfig.json
├── package.json
└── README.md
```

---

## 14. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Expo SDK 53+ | Managed workflow, OTA updates, easy native APIs |
| **Routing** | expo-router v4 | File-based routing, deep linking, type-safe |
| **Language** | TypeScript | Type safety across the entire app |
| **State** | Zustand | Minimal boilerplate, performant, hooks-based |
| **Data Fetching** | TanStack Query (React Query) | Caching, pagination, background refetching |
| **Styling** | StyleSheet + Nativewind (optional) | Native performance, utility classes if desired |
| **Animations** | react-native-reanimated v3 | 60fps gesture/layout animations |
| **Gestures** | react-native-gesture-handler | Swipe, long-press, pinch interactions |
| **Bottom Sheets** | @gorhom/bottom-sheet | Performant, gesture-based bottom sheets |
| **Icons** | @expo/vector-icons | Comprehensive icon set |
| **Secure Storage** | expo-secure-store | Keychain / Keystore for tokens and PINs |
| **Camera / QR** | expo-camera + expo-barcode-scanner | QR scanning |
| **QR Generation** | react-native-qrcode-skia or svg | Display QR codes |
| **Push Notifications** | expo-notifications | Cross-platform push |
| **Biometrics** | expo-local-authentication | Face ID / Touch ID |
| **Haptics** | expo-haptics | Tactile feedback |
| **Image Picker** | expo-image-picker | Avatar upload |
| **Testing** | Jest + React Native Testing Library | Unit & component tests |
| **E2E Testing** | Maestro | Cross-platform E2E automation |

---

## 15. Design System & Branding

### Color Palette

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| `primary` | `#6C5CE7` | `#A29BFE` | Buttons, FAB, active states |
| `primary-dark` | `#5A4BD1` | `#8B80F0` | Pressed states |
| `secondary` | `#00CEC9` | `#81ECEC` | Accents, success |
| `background` | `#F8F9FE` | `#0D0D1A` | Screen backgrounds |
| `surface` | `#FFFFFF` | `#1A1A2E` | Cards, sheets |
| `text-primary` | `#1A1A2E` | `#F8F9FE` | Headings, body |
| `text-secondary` | `#6B7280` | `#9CA3AF` | Captions, labels |
| `success` | `#10B981` | `#34D399` | Completed, received |
| `warning` | `#F59E0B` | `#FBBF24` | Pending |
| `error` | `#EF4444` | `#F87171` | Failed, destructive |
| `border` | `#E5E7EB` | `#2D2D44` | Dividers, outlines |

### Typography

| Style | Font | Size | Weight |
|---|---|---|---|
| `h1` | Inter | 28px | Bold (700) |
| `h2` | Inter | 22px | SemiBold (600) |
| `h3` | Inter | 18px | SemiBold (600) |
| `body` | Inter | 16px | Regular (400) |
| `body-sm` | Inter | 14px | Regular (400) |
| `caption` | Inter | 12px | Medium (500) |
| `balance` | Inter | 36px | Bold (700) |
| `amount` | Inter | 24px | SemiBold (600) |

### Spacing Scale

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

### Border Radius

| Token | Value |
|---|---|
| `sm` | 8px |
| `md` | 12px |
| `lg` | 16px |
| `xl` | 24px |
| `full` | 9999px |

### Elevation / Shadows

- Cards: `0 2px 8px rgba(0,0,0,0.08)`
- FAB: `0 4px 16px rgba(108,92,231,0.3)`
- Bottom Sheet: `0 -4px 24px rgba(0,0,0,0.12)`

---

## 16. Step-by-Step Development Roadmap

### Phase 0 — Project Setup (Days 1–2)

- [x] Initialize Expo project with `expo-router` template - Completed
- [x] Configure TypeScript - Completed
- [x] Set up folder structure per Section 13 - Completed
- [x] Install all dependencies (Section 14) - Completed
- [x] Configure theme tokens (colors, typography, spacing) - Completed
- [x] Set up Zustand stores (empty shells) - Completed
- [x] Set up API client with mock interceptor - Completed
- [x] Create mock data (users, transactions, wallets) - Completed

### Phase 1 — Auth Screens (Days 3–5)

- [x] Build UI primitives (`Button`, `Input`, `Card`, `PinPad`) - Completed
- [x] Welcome / Onboarding screen - Completed
- [x] Sign Up screen + form validation - Completed
- [x] Login screen - Completed
- [x] OTP verification screen - Completed
- [x] Set PIN screen - Completed
- [x] Auth store (mock login/signup flow) - Completed
- [x] Auth gate: redirect unauthenticated users to login - Completed
- [x] Secure token storage with `expo-secure-store` - Completed

### Phase 2 — Tab Navigation & Home (Days 6–9)

- [x] Tab layout with custom tab bar and center FAB - Completed
- [x] FAB action sheet / bottom sheet modal - Completed
- [x] Home screen: BalanceCard component - Completed
- [x] Home screen: QuickActions row - Completed
- [x] Home screen: RecentTransactions list - Completed
- [x] Home screen: RecentContacts avatars - Completed
- [x] Balance visibility toggle (mask/show) - Completed
- [x] Pull-to-refresh - Completed

### Phase 3 — Send & Receive Money (Days 10–14)

- [x] Recipient selector (search, recent, contacts) - Completed
- [x] Amount input with currency formatting - Completed
- [x] Send confirmation screen - Completed
- [x] PIN re-entry for send confirmation - Completed
- [x] Send success / receipt screen - Completed
- [x] Receive screen with QR code display - Completed
- [x] QR code generation - Completed
- [x] QR scanner (camera permission, decode, pre-fill) - Completed (Mock Scanner)
- [x] Request money flow (select contact, amount, confirm) - Completed (Mock Flow)
- [x] Mock transaction processing (delay + status update) - Completed

### Phase 4 — Activity / Transactions (Days 15–17)

- [x] Transaction list screen with date sections - Completed
- [x] Filter pills (All, Sent, Received, Pending, Failed) - Completed
- [x] Transaction detail screen - Completed
- [x] Pagination / infinite scroll - Completed
- [x] Empty state for no transactions - Completed
- [x] Status badges (Completed, Pending, Failed) - Completed

### Phase 5 — People / Contacts (Days 18–20)

- [x] Contacts list screen - Completed
- [x] Search contacts - Completed
- [x] Contact card component - Completed
- [x] Add friend screen (search by username) - Completed
- [x] Friend profile screen (view + send money shortcut) - Completed
- [x] Recent recipients section - Completed

### Phase 6 — Profile & Settings (Days 21–24)

- [x] Profile screen layout - Completed
- [x] Edit profile screen (name, avatar) - Completed
- [x] Avatar upload with `expo-image-picker` - Completed
- [x] Change PIN screen - Completed
- [x] Biometric login toggle - Completed
- [x] Security settings screen - Completed
- [x] Payment settings screen (placeholder) - Completed
- [x] Identity verification status (mock) - Completed
- [x] Help & support screen - Completed
- [x] Logout flow (clear tokens, navigate to login) - Completed

### Phase 7 — Polish & Optimization (Days 25–28)

- [ ] Animations (screen transitions, list items, FAB)
- [x] Haptic feedback on buttons, send, receive - Completed
- [ ] Dark mode implementation
- [x] Loading skeletons for all lists - Completed
- [ ] Error boundary / error screens
- [ ] Accessibility audit (labels, contrast, touch targets)
- [ ] Performance profiling and optimization
- [ ] App icon and splash screen

### Phase 8 — Testing & QA (Days 29–32)

- [ ] Unit tests for utils, stores, and hooks
- [ ] Component tests for critical UI components
- [ ] E2E tests with Maestro (happy paths)
- [ ] Manual QA on iOS and Android devices
- [ ] Bug fixes and refinements

### Phase 9 — Build & Distribution (Days 33–35)

- [ ] Configure `eas.json` for development and preview builds
- [ ] Build iOS development client
- [ ] Build Android APK / AAB
- [ ] Internal distribution via EAS or TestFlight / Play Internal Testing
- [ ] Write README with setup instructions

---

## Timeline Summary

| Phase | Description | Duration |
|---|---|---|
| 0 | Project Setup | 2 days |
| 1 | Auth Screens | 3 days |
| 2 | Tab Nav & Home | 4 days |
| 3 | Send & Receive | 5 days |
| 4 | Activity | 3 days |
| 5 | People | 3 days |
| 6 | Profile | 4 days |
| 7 | Polish | 4 days |
| 8 | Testing | 4 days |
| 9 | Build | 3 days |
| **Total** | | **~35 days** |

---

> **Next step:** Once this plan is approved, proceed to **Phase 0 — Project Setup**.
