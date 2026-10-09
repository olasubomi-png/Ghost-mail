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

1. Point your domain’s MX (or provider routing) so messages arrive at your chosen provider.
2. Configure the provider to send a webhook `POST` to:

   ```
   https://your-app.vercel.app/api/webhook/inbound
   ```

3. Set `INBOUND_PROVIDER` and `INBOUND_WEBHOOK_SECRET` to match the provider’s signature scheme.
4. Set `EMAIL_DOMAIN` to the domain users will see (must match what the provider delivers to).

Supported signature schemes:

- **Mailgun** – `X-Mailgun-Signature` + timestamp/token (replay window 5 min)
- **Resend** – Svix-style / HMAC body
- **Generic** – `X-Webhook-Signature: sha256=<hex>`

Unknown recipients are acknowledged with 200 so providers do not retry indefinitely. Duplicate `externalId` values are ignored (idempotent).

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
