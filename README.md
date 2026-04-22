# FinOps Tracker

Personal finance tracker built for New Zealand IT contractors. Multi-account
bookkeeping with GST tracking, IRD-ready tax deduction workflow, AI-powered
receipt scanning, and budgeting — with investments as Phase 2.

## Stack

| Layer      | Choice                        | Why                                                            |
| ---------- | ----------------------------- | -------------------------------------------------------------- |
| Frontend   | Next.js 14 App Router + React | Server components, same codebase as API                        |
| Language   | TypeScript (strict)           | Type safety from DB to UI is mandatory for a finance app       |
| Styling    | Tailwind CSS + custom design  | Fast iteration, consistent tokens                              |
| Database   | Neon (serverless Postgres)    | Branching per environment, scale-to-zero, native Postgres      |
| ORM        | Prisma                        | Schema-first, type-safe queries, great migrations              |
| Hosting    | Vercel                        | Zero-config for Next.js, preview deploys, edge-friendly        |
| Auth       | Auth.js (NextAuth v5)         | Google + email, simple, works on Vercel                        |
| File store | Vercel Blob                   | Receipts storage next to the app, no extra SDK                 |
| AI         | Anthropic Claude (Sonnet 4)   | Vision for receipts; same model we'll reuse in openclaw        |
| Validation | Zod                           | Runtime + static validation for forms and API                  |
| Money      | Prisma Decimal + decimal.js   | Never use JS `number` for currency                             |

## Repository layout

```
finops-tracker/
├── .github/workflows/        # CI: typecheck, lint, tests, Prisma validate
├── prisma/
│   ├── schema.prisma         # Single source of truth for DB
│   ├── migrations/           # Generated, committed
│   └── seed.ts               # Demo data for local/staging
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (auth)/           # Sign in / sign up
│   │   ├── (app)/            # Authenticated app routes
│   │   │   ├── dashboard/
│   │   │   ├── accounts/
│   │   │   ├── transactions/
│   │   │   ├── scan/
│   │   │   ├── budget/
│   │   │   ├── tax/
│   │   │   └── settings/
│   │   └── api/              # API routes (webhooks, scan, export)
│   ├── components/
│   │   ├── ui/               # Primitives: Button, Card, Input, Sheet
│   │   ├── accounts/
│   │   ├── transactions/
│   │   ├── receipts/
│   │   ├── budget/
│   │   └── tax/
│   ├── lib/
│   │   ├── db/               # Prisma client
│   │   ├── ai/               # Claude client + receipt scanner
│   │   ├── tax/              # GST math, deduction rules, IRD export
│   │   ├── domain/           # Categories, enums, i18n dictionaries
│   │   └── utils/            # Formatters, date helpers
│   └── server/
│       └── services/         # Business logic (transactions, budgets, tax)
├── tests/
│   ├── unit/                 # Vitest unit tests (GST math, deduction logic)
│   └── integration/          # API + DB tests
├── docker-compose.yml        # Local Postgres
├── .env.example              # Required env vars
└── package.json
```

## Environments

Three stages, three Neon branches:

| Stage      | DB                          | Vercel env   | Trigger               |
| ---------- | --------------------------- | ------------ | --------------------- |
| Local      | Postgres in Docker          | none         | `npm run dev`         |
| Staging    | Neon branch `staging`       | preview      | push to `staging`     |
| Production | Neon branch `main`          | production   | push to `main`        |
| PR preview | Neon ephemeral branch       | preview      | any PR to `main`      |

Neon's branching means every PR can get its own isolated DB copy, and
migrations are tested before hitting production.

## Getting started

### 1. Prerequisites
- Node.js 20+
- Docker (for local Postgres)
- A [Neon](https://neon.tech) account (for staging/prod)
- An Anthropic API key

### 2. Install
```bash
git clone <repo>
cd finops-tracker
npm install
cp .env.example .env.local
```

### 3. Local database
```bash
docker compose up -d
npm run db:migrate
npm run db:seed       # loads NZ-contractor demo data
```

### 4. Dev server
```bash
npm run dev
```

### 5. Useful scripts
```bash
npm run dev                  # Next dev server
npm run build                # Production build
npm run type-check           # tsc --noEmit
npm run lint                 # ESLint
npm run test                 # Vitest (watch)
npm run test:ci              # Vitest (single run)
npm run db:studio            # Prisma Studio (DB GUI)
npm run db:migrate           # Create + apply migration (dev)
npm run db:migrate:deploy    # Apply migrations (CI/prod)
npm run db:reset             # Nuke and reseed local DB
```

## Deploying to staging

### One-time setup
1. Create a Neon project. Note the main branch connection string.
2. In Neon dashboard, create a branch named `staging`.
3. Connect the repo to Vercel.
4. In Vercel → Settings → Environment Variables, add for the **Preview**
   environment: `DATABASE_URL` and `DIRECT_URL` pointing at the `staging`
   Neon branch. Add the same for **Production** pointing at `main` branch.
5. Add `ANTHROPIC_API_KEY`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN` to both
   environments.

### Ongoing workflow
- Create a PR → Vercel builds a preview and runs migrations against a
  throwaway Neon branch.
- Merge to `staging` → preview deployment hits the staging DB.
- Merge `staging` → `main` → production deployment hits prod DB.

## Domain decisions worth knowing

**Money is stored as `Decimal(18, 2)`** — never `Float`. All math that crosses
the boundary goes through `decimal.js`. Rounding is always `HALF_UP` to match
IRD rules.

**GST is tracked per transaction**, not only at period rollup. Each expense or
income line stores `gstApplicable`, `gstAmount`, `gstInclusive`. This lets us
regenerate a GST return for any period on demand, not just the current one.

**Deductibility has a default AND an override.** The category carries a
`defaultDeductiblePercent` (e.g. business meals = 50%, home office = 20%,
equipment = 100%), but every transaction can override it. The verification
workflow is the gate before anything hits the tax summary.

**Verification workflow.** Scanned receipts land as `PENDING`. They don't
contribute to GST return or tax summary until a human marks them `VERIFIED`.
This matches how an IRD filing should actually work — review, then commit.

**NZ tax year is 1 April — 31 March.** All tax summaries default to that
window. GST periods are bi-monthly by default (NZ standard for most
contractors).

## Phase 2 (not built yet)

- Investment accounts (KiwiSaver, Sharesies, IBKR, crypto)
- Multi-currency FX with end-of-day rates from a proper source
- Recurring transactions / subscription detection
- Rules engine (vendor → category mapping)
- Integration with openclaw (Telegram bot) for voice expense entry
- Gmail sync for invoice emails → auto-transactions

## License

Private / personal project. Not for distribution.
