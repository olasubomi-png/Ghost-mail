# Ghost Mail

Premium persistent temporary email platform.

Generate disposable addresses, receive real messages, and keep inboxes until you explicitly delete them. Built with Next.js, TypeScript, Tailwind CSS, Neon PostgreSQL, and a pluggable inbound email provider.

## Features

- Random and custom username generation
- Persistent inboxes (no automatic expiry)
- Secure access via high-entropy tokens (not public IDs)
- Real-time polling inbox UI
- Verification code extraction & one-click copy
- Sanitized HTML email rendering
- Webhook signature verification (Mailgun, Resend, generic)
- Rate limiting on address creation
- Soft-delete for inboxes and messages
- Fully responsive dark theme UI

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Database | Neon PostgreSQL + Drizzle ORM |
| Hosting | Vercel |
| Email | Configurable inbound webhook provider |

## Prerequisites

- Node.js 20+
- A Neon (or any PostgreSQL) database
- A domain and inbound email provider (Mailgun, Resend, or custom) for real delivery

## Local development

```bash
# Clone
git clone https://github.com/olasubomi-png/Ghost-mail.git
cd Ghost-mail

# Install
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and (optionally) EMAIL_DOMAIN

# Push schema (or run migrations)
npm run db:push

# Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** Without `EMAIL_DOMAIN` and a configured inbound provider, address generation will return a clear error and no real email can be received. The UI and API structure are fully implemented.

## Environment variables

See `.env.example` for the full list (names only, no secrets).

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon / PostgreSQL connection string |
| `EMAIL_DOMAIN` | For real mail | Domain used in generated addresses |
| `INBOUND_PROVIDER` | For real mail | `mailgun` \| `resend` \| `generic` |
| `INBOUND_WEBHOOK_SECRET` | For real mail | Provider webhook signing secret |
| `RATE_LIMIT_GENERATE` | No | Max address creations per IP per minute (default 10) |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL |

## Database

Schema lives in `src/lib/db/schema.ts`.

```bash
npm run db:generate   # create migration files
npm run db:migrate    # apply migrations
npm run db:push       # push schema directly (dev)
npm run db:studio     # open Drizzle Studio
```

Tables:

- **inboxes** – address, access token, soft-delete timestamp
- **messages** – linked to inbox, external id for idempotency, sanitized bodies, read state

## Inbound email setup

Real email delivery requires a domain, DNS, a supported provider, and a webhook
pointing at this application. Until those are configured, address generation
returns a clear configuration error and no mail is accepted.

### 1. Database

```bash
# Apply schema (includes inboxes, messages, rate_limit_counters)
npm run db:push
# or: npm run db:generate && npm run db:migrate
```

### 2. Domain and DNS

1. Choose a domain (or subdomain) for temporary addresses, e.g. `mail.example.com`.
2. Set `EMAIL_DOMAIN=mail.example.com`.
3. Configure MX (or provider-specific receiving records) so mail for that domain
   is delivered to your inbound provider (Mailgun Routes, Resend Receiving, etc.).

### 3. Webhook URL

```
https://<your-app>/api/webhook/inbound
```

### 4. Provider configuration

| Provider | `INBOUND_PROVIDER` | `INBOUND_WEBHOOK_SECRET` | Extra | Notes |
|----------|--------------------|--------------------------|-------|-------|
| **Mailgun** | `mailgun` | Webhook Signing Key (Settings → API Security) | — | Verifies HMAC-SHA256 of `timestamp + token`. Supports JSON `signature` object, form fields `signature[timestamp]` / `signature[token]` / `signature[signature]`, flat form fields, and headers. 5-minute replay window. |
| **Resend** | `resend` | Signing secret (`whsec_…`) | **`RESEND_API_KEY` required** | Svix signature verification. Webhooks only include metadata; full body is fetched via `GET /emails/receiving/:email_id`. Without the API key, content retrieval fails and the message is not stored as complete. |
| **Generic** | `generic` | Shared HMAC secret | — | Header `X-Webhook-Signature: sha256=<hex of HMAC-SHA256(raw body)>`. |

### 5. Verify end-to-end delivery

1. Deploy with the env vars above.
2. Generate an address in the UI.
3. Send a real email to that address from an external account.
4. Confirm the message appears in `/inbox/<token>` with correct subject and body.

Until step 4 succeeds, do not claim that inbound delivery is working.

Unknown recipients return HTTP 200 `{ ignored: true }` so providers do not retry
indefinitely. Duplicate provider message IDs are ignored (unique index + conflict
handling). Soft-deleted inboxes do not accept new messages.


## Security notes

- Inbox contents are only reachable via the 32-character `accessToken` in the URL (`/inbox/[token]`). Do not share the URL.
- All secrets stay server-side.
- HTML is sanitized with DOMPurify before storage/display.
- Address generation is rate-limited by IP.
- Soft-deleted content is retained only as tombstones; you may add a cleanup job later.
- Production checklist: configure `INBOUND_WEBHOOK_SECRET`, use HTTPS, consider Redis-backed rate limiting for multi-instance deploys.

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run start        # production server
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run test         # Vitest unit tests
```

## Deployment (Vercel)

1. Import the repository in the Vercel dashboard.
2. Add environment variables from `.env.example`.
3. Deploy. Vercel will run `npm run build`.
4. Point your inbound provider webhook to `https://<project>.vercel.app/api/webhook/inbound`.

## License

Private / proprietary – all rights reserved.


## Rate limiting

Address generation is limited per client IP (default 10/minute) using a
PostgreSQL row-locked counter (`rate_limit_counters`). Concurrent requests for
the same key are serialized via `INSERT … ON CONFLICT DO UPDATE` on the primary
key — this is safe under READ COMMITTED and works with Neon's HTTP driver
(no interactive transactions required).

Opt-in concurrency integration tests:

```bash
RATE_LIMIT_TEST_DATABASE_URL=postgresql://… npm run test -- tests/rate-limit.integration.test.ts
```

Use a dedicated test database only — never production credentials.

### Applying the rate-limit schema to an existing database

```sql
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket_key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 0
);
```

Or: `npm run db:push` against a non-production branch. Do not reset production data.
The previous `rate_limit_buckets` table is unused and may be dropped manually if present.
