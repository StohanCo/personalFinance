# Architecture

## 1. Design goals

- **Correctness over cleverness.** Money math must be exact. Every decimal
  operation goes through `decimal.js` with `HALF_UP` rounding.
- **Verification is a first-class workflow.** Nothing from a receipt scan
  hits your IRD numbers until you've explicitly verified it.
- **Reports recompute from source.** GST returns and tax summaries are
  derived views, not stored totals. We can always regenerate.
- **Phase 2 safe.** Investments, recurring transactions, and openclaw
  integration plug in without schema migrations to existing tables.

## 2. Tech stack rationale

Every choice maps to a real property we want.

| Choice                | Property gained                                             |
| --------------------- | ----------------------------------------------------------- |
| Next.js App Router    | Frontend + API in one deploy unit; RSC for fast dashboards  |
| TypeScript strict     | Type safety from schema → API → UI                          |
| Prisma                | Migrations under version control, type-safe queries         |
| Neon                  | DB branches per env, scale-to-zero, native Postgres         |
| Postgres (not MySQL)  | `NUMERIC(18,2)`, JSONB, partial indexes, `SELECT FOR UPDATE`|
| Decimal(18,2)         | Enough range for lifetime net worth, no float drift         |
| Vercel Blob           | Receipts storage with no extra SDK; same auth as app        |
| Claude Sonnet 4       | Vision + structured JSON output; same model as openclaw     |
| Zod                   | Validates LLM JSON at runtime; drift-safe                   |

## 3. Data flow

### Receipt scan → Transaction

```
┌─────────────┐   POST /api/receipts/scan         ┌──────────────┐
│  Browser    │ ─────────────────────────────────▶│  Next.js API │
│ (camera/pick)│         (multipart upload)        │   route      │
└─────────────┘                                    └──────┬───────┘
                                                          │ 1. auth.userId
                                                          │ 2. put() to Vercel Blob
                                                          │ 3. INSERT Receipt (PROCESSING)
                                                          │ 4. scanReceipt(base64) → Claude
                                                          │ 5. Zod validate
                                                          │ 6. UPDATE Receipt (COMPLETED + data)
                                                          ▼
                                                    ┌──────────────┐
                                                    │  Response:   │
                                                    │  { receipt,  │
                                                    │   extracted} │
                                                    └──────┬───────┘
                                                           │
                                                           ▼
                                                    UI shows extracted data
                                                    User reviews + confirms
                                                           │
                                                           ▼
                                                    POST /api/transactions
                                                    { …, receiptId, status: PENDING }
                                                           │
                                                           ▼
                                                    User verifies later
                                                    status → VERIFIED
                                                    balance mutation applied
```

**Why PENDING by default for scanned items?** Balance doesn't move until a
human confirms the extraction. This matches how IRD filings actually work:
you review every line before signing.

### Tax summary derivation

Tax summaries are **pure functions over verified transactions**. There is no
cached total that could drift out of sync:

```sql
-- Conceptual; real code lives in /src/server/services/tax.ts
SELECT
  SUM(amount * deductible_percent / 100) FILTER (
    WHERE type = 'EXPENSE' AND is_deductible AND status = 'VERIFIED'
  ) AS total_deductions,
  SUM(gst_amount) FILTER (
    WHERE gst_applicable AND status = 'VERIFIED' AND type = 'EXPENSE'
  ) AS input_gst,
  SUM(gst_amount) FILTER (
    WHERE gst_applicable AND status = 'VERIFIED' AND type = 'INCOME'
  ) AS output_gst
FROM transactions
WHERE user_id = $1 AND date BETWEEN $2 AND $3;
```

`GSTPeriod` and `TaxYear` rows exist only as a "filed" snapshot — they
capture the state at the moment you submitted to IRD. Useful for audits.

## 4. Balance mutation

Balance changes happen inside a single DB transaction that wraps:

1. `INSERT` (or `UPDATE`) on `Transaction`
2. `UPDATE Account SET balance = balance + delta`
3. `INSERT` on `AuditLog`

No step can commit without the others. Concurrent updates are safe because
Postgres's `UPDATE … SET balance = balance + $1` is atomic at the row level.
See `/src/server/services/transactions.ts`.

## 5. Environments & branching

Neon's branching is the killer feature. Each environment gets a branch:

```
main (production)  ←── merge staging
  │
  └─ staging  ←── merge feature/*
       │
       └─ feature/xyz  ←── ephemeral, deleted on PR close
```

Vercel's preview deploys pick up the `staging` branch URL automatically.
For PRs, a GitHub Action creates a throwaway Neon branch, runs the
preview, and Neon garbage-collects the branch when the PR closes.

## 6. Observability

Phase 1 keeps it minimal:

- **Errors** → Vercel's built-in error tracking (free tier).
  Upgrade path: Sentry when volume grows.
- **Audit log** → `AuditLog` table. Append-only, queryable in-app.
- **Scan failures** → `Receipt.scanStatus = FAILED` + `scanError` text.
  Surfaced in the UI so the user can retry.

## 7. Security notes

- **API key never ships to browser.** `ANTHROPIC_API_KEY` only lives in
  Next.js server code (`/api/*` route, server actions).
- **File uploads go through Blob, not through the DB.** Blob URLs are
  public but opaque (random suffix); we can switch to signed URLs later
  if receipts contain sensitive data.
- **Row-level auth.** Every query is scoped by `userId` pulled from the
  NextAuth session. Service layer enforces this — routes should not
  accept `userId` from the client.
- **Decimal serialization.** Prisma's `Decimal` never crosses the wire as
  a float — it's a string in JSON.

## 8. Phase 2 hooks (already in schema)

| Hook                  | Field / Model                                          |
| --------------------- | ------------------------------------------------------ |
| Investments           | `AccountType.INVESTMENT` enum value (already present)  |
| Recurring transactions| Add `recurrence: Json?` to `Transaction`, new cron job |
| Rules engine          | Add `Rule` model: `vendorPattern → categoryKey`         |
| openclaw Telegram     | New `TxSource.API` value (already present)             |
| Gmail invoice sync    | Reuse `TxSource.IMPORT`, new worker                    |
| Multi-currency FX     | Add `ExchangeRate` model; convert at tx creation time  |
