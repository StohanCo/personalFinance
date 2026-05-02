# FinOps Tracker — Project Map, Audit & Improvement Plan

_Audit produced 2026-05-02 against `H:\Documents\Projects\personalFinance` using
guidance from `awesome-copilot` agents:
`project-architecture-planner`, `frontend-performance-investigator`,
`expert-nextjs-developer`, `tech-debt-remediation-plan`,
`implementation-plan` (no finance-specific skill exists in the catalog;
the planning + Next.js performance agents are the closest fit)._

---

## 1. Full project map

### Stack
Next.js 14 App Router · React 18 · TypeScript strict · Prisma 5 / Postgres
(Neon) · Auth.js v5 · Tailwind 3 · Vercel Blob · Anthropic Claude (Sonnet 4)
· Zod · `decimal.js` for money. Tests: Vitest. Hosting: Vercel.

### Directory layout (`src/`)

```
src/
├── app/
│   ├── page.tsx                       SSR dashboard entry; loads accounts/recent tx/categories/currencies in parallel
│   ├── layout.tsx                     Global shell
│   ├── settings/                      User-currency settings page
│   ├── sign-in/                       Auth.js sign-in
│   └── api/
│       ├── accounts/{route, [id]/route}
│       ├── transactions/{route, [id]/route}        ← list/create + GET/PATCH/DELETE single
│       ├── budgets/{route, [id]/route, progress/}
│       ├── analytics/{summary, stats}              ← derived reports (no caching)
│       ├── fx/{latest, history}                    ← public exchange-rate provider proxy + persistence
│       ├── settings/currencies/{route, [code]/route}
│       ├── receipts/scan                           ← Claude Vision pipeline
│       ├── internal/snapshots/daily                ← cron-driven daily account snapshot
│       └── auth/[...nextauth]
├── components/
│   ├── Dashboard.tsx                  Big client switch over `?section=…`
│   ├── AddAccountModal.tsx
│   ├── AddTransactionModal.tsx        ← receipt scan + manual entry
│   ├── TransactionsSection.tsx        ← filter/list/drawer/edit/verify/reject/delete
│   ├── BudgetsSection.tsx             ← CRUD + progress
│   ├── AnalyticsSection.tsx           ← KPI + monthly trends + top categories/vendors
│   ├── StatsSection.tsx               ← volatility, run-rate, HHI, FX & balance trend SVG charts
│   ├── GitHubSignInButton.tsx, SignOutButton.tsx
├── lib/
│   ├── ai/receipt-scanner.ts          Claude vision call + Zod-validated extraction
│   ├── auth.ts                        Auth.js config
│   ├── currencies.ts                  DEFAULT_CURRENCIES
│   ├── db/client.ts                   Singleton PrismaClient
│   ├── domain/categories.ts           System category seed
│   ├── fx/exchange.ts                 open.er-api.com fetch + NZD conversion
│   └── tax/gst.ts                     GST math (15% NZ)
└── server/
    └── services/transactions.ts       Atomic balance mutations + audit log
```

### Data model summary
`User → Account → Transaction` with `Category`, `Receipt`, `Budget`,
`AccountSnapshot` (daily DB-trigger backed), `GSTPeriod`, `TaxYear`,
`FxRate` (snapshot history), `AuditLog`, `UserCurrency`. Money is
`Decimal(18,2)`, GST per-line, deductibility per-tx with category default,
status workflow `PENDING → VERIFIED/REJECTED`. Indexes on
`(userId,date)`, `(userId,status)`, `(userId,type,date)`, `(accountId,date)`.

### Data flow at runtime
1. **Initial dashboard render** (`app/page.tsx`, RSC):
   `Promise.all` of accounts + 20 recent tx + categories + user currencies,
   then **awaits** an external FX HTTP call before rendering. This is the
   first visible source of the 2–3 s lag.
2. **Section navigation** is `?section=…` URL-state with **client-side
   refetch** on every visit (Transactions, Budgets, Analytics, Stats each
   call their own `/api/*` endpoint on mount → no caching, no prefetch).
3. **Modals** also fetch on open (`AccountDetailsModal` re-fetches
   `/api/accounts/:id` even though parent already has the row;
   `AddTransactionModal` also calls `/api/settings/currencies`).
4. **Mutations** go through `server/services/transactions.ts`, wrap
   transaction insert + balance increment + audit log in a single
   `prisma.$transaction`. After mutation the client calls
   `router.refresh()` which re-runs the entire RSC tree (and the FX call
   again).

---

## 2. Goods (keep these — they're load-bearing)

| ✅ | What | Why it matters |
|----|------|----------------|
| 🟢 | `Decimal(18,2)` end-to-end via `decimal.js`, `HALF_UP` rounding | Correct money math is the whole point of a finance app |
| 🟢 | Atomic balance mutation in `prisma.$transaction` (`server/services/transactions.ts:53-94`) | Prevents balance/Tx desync under concurrency |
| 🟢 | PENDING/VERIFIED/REJECTED workflow gates IRD/GST reports | Matches how filings actually work, prevents dirty totals |
| 🟢 | Append-only `AuditLog` with field-level diff on update | Required for any tax-grade trail |
| 🟢 | Per-line `gstApplicable / gstAmount / gstInclusive` + per-tx `deductiblePercent` override of category default | GST returns regenerable for any window, not just current period |
| 🟢 | Cursor-based pagination on `/api/transactions` with composite index `(userId,date)` and `(userId,date) + id` ordering | Scales past 10k tx |
| 🟢 | Schema already has hooks for Phase 2 (`AccountType.INVESTMENT`, `TxSource.API/IMPORT/RULE`) | Avoids future migrations |
| 🟢 | `AccountSnapshot` daily DB-trigger + cron endpoint | Enables historical balance charts without recomputing |
| 🟢 | Receipt-scan extraction validated by Zod against Claude output | Drift-safe LLM JSON |

---

## 3. Bads & gaps (prioritized)

### 🔴 Performance — root cause of the 2–3 s loads
| # | Issue | Evidence | Fix |
|---|-------|----------|-----|
| P1 | Dashboard SSR awaits a third-party HTTP FX call **inside** the page render | `app/page.tsx:91` `await fetchNzdFxRates()` blocks the response. `next.revalidate=3600` only caches per-request, cold renders still wait. | Move FX into a streamed RSC island (`<Suspense>`), pre-fetch from `FxRate` table first, fallback to network in background. |
| P1 | Every section refetches on each click via `useEffect` with no SWR/cache | `TransactionsSection.tsx:185`, `BudgetsSection.tsx:625`, `AnalyticsSection.tsx:469`, `StatsSection.tsx:662` | Wrap fetches in SWR / `unstable_cache` / route handlers with `revalidate`; pre-render initial data as RSC props. |
| P1 | `AccountDetailsModal` re-fetches `/api/accounts/:id` despite parent already passing the row | `Dashboard.tsx:451-505` | Pass row through props, only re-fetch when stale or after mutate. |
| P1 | `AddTransactionModal` opens then fires `/api/settings/currencies` on first paint of modal | `Dashboard.tsx:441-449` (the same pattern is duplicated in account modal) | Lift currencies into RSC, pass via props. |
| P2 | `prisma.transaction.count` runs in parallel with each list query — full table scan with filters | `app/api/transactions/route.ts:123-134` | Drop the always-on count; expose `hasMore` from cursor; show count via separate, debounced endpoint or omit. |
| P2 | `router.refresh()` after every mutation re-runs the whole RSC tree (incl. FX) | `TransactionsSection.tsx:300/337/356`, `Dashboard.tsx:533` | Use Server Actions + `revalidateTag('accounts')` / `revalidateTag('tx')` for surgical invalidation. |
| P2 | Dashboard derives "month income/expenses" from only the last 20 tx | `app/page.tsx:73-82` | Wrong as soon as you have >20 tx in a month. Replace with `groupBy` aggregate. |
| P2 | `analytics/summary` runs 6 queries serially-ish with no caching, recomputed for every Analytics tab open | `app/api/analytics/summary/route.ts:117-189` | Add `unstable_cache` keyed by `(userId, dateFrom, dateTo, accountId)` with 5-min TTL; invalidate on tx mutation. |
| P3 | Prisma `log: ["query","error","warn"]` in dev | `lib/db/client.ts:10-13` | Fine for dev, ensure NEVER reaches prod. (Currently guarded — keep it that way.) |
| P3 | `recentTxs` includes full `category` row but only uses `nameEn` & `color` | `app/page.tsx:24` | `select` only the needed columns (also for `account`). |
| P3 | No HTTP cache headers on `/api/fx/latest`; persists every call | `app/api/fx/latest/route.ts:19-28` | `Cache-Control: s-maxage=3600`; only persist when rate diff > epsilon. |

### 🟡 Quality / correctness
| # | Issue | Evidence | Fix |
|---|-------|----------|-----|
| Q1 | **No copy / duplicate transaction action** anywhere | Grep across `src/` — only one match (`copy:` in fx route, unrelated) | Add a "Duplicate" action in the Transactions drawer + bulk duplicate; persist a `clonedFromId` field for traceability. (Plan in §6.) |
| Q2 | TRANSFER transactions create a **single** Transaction row with `transferAccountId`. Reports filtering on `type='EXPENSE'/'INCOME'` ignore them, but balance maths double-applies. Updating amount/account on TRANSFER is intentionally disabled (`transactions.ts:189`) yet the UI exposes the type-toggle, allowing edits that silently drop transfer linkage. | `server/services/transactions.ts:185-213` | Either store transfer as paired rows (out + in) or block type changes from/to TRANSFER in the edit drawer. |
| Q3 | FX conversion uses **today's rate** for past-month income/expenses | `app/page.tsx:91-114` | Use `FxRate` snapshot closest to `tx.date` (date-aware FX) — model and history API already exist. |
| Q4 | `convertToNzd` silently returns the un-converted amount when a rate is missing | `lib/fx/exchange.ts:46` | Surface "no rate" so the UI can flag affected rows; never sum apples and oranges silently. |
| Q5 | `incrementBalance` casts a stringified Decimal back through `as unknown as number` | `server/services/transactions.ts:343` | Use `Prisma.Decimal` directly: `data: { balance: { increment: new Prisma.Decimal(delta.toFixed(2)) } }`. |
| Q6 | Receipts and Tax sections are placeholder copy in the UI | `Dashboard.tsx:351-363` | Either ship the verification queue + tax dashboard or hide the tabs until ready (no stubs in production navigation). |
| Q7 | Error states use plain text + manual retry buttons. No telemetry. | All sections | Add Sentry (already called out in `ARCHITECTURE.md §6`); upgrade now since you're scaling features. |
| Q8 | `monthlyTrends` y-axis pads with 100 NZD when min==max — chart looks broken on first user | `StatsSection.tsx:248`, `AnalyticsSection.tsx:149` | Use a relative pad (`max(rawMax * 0.1, 100)`). |
| Q9 | No automated test coverage visible beyond Vitest config | `tests/` directory exists but content unverified | Add unit tests for `transactions.ts` (balance math + status transitions) and `gst.ts` before further refactor. |
| Q10 | `next.config.mjs` allows 10MB server-action bodies with no per-route overrides | `next.config.mjs:5-8` | Restrict to receipt scan route only — large body limit on every action enables abuse. |

### 🟢 Hygiene
- `skills-lock.json` references `frontend-design` from `anthropics/skills` — fine.
- `package.json` Auth.js still on `5.0.0-beta.25`; pin or upgrade once stable.
- Many large client components contain inline JSX-style maps (e.g.
  `TYPE_COLOR`, `STATUS_BADGE`). Promote to a single `lib/ui/tokens.ts`
  to deduplicate and prep for theming.

---

## 4. Performance budget (before/after target)

| Surface | Now (reported) | Target | How |
|---------|----------------|--------|-----|
| First dashboard paint | 2–3 s | < 800 ms LCP | Stream FX, drop blocking await, narrow Prisma `select`s, use `unstable_cache` for FX |
| Open Transactions tab | 1.5–2 s | < 400 ms | RSC-render first page, hydrate filters; drop `count(*)` from default response |
| Open AddTransaction modal | 600–900 ms | < 100 ms | Pass currencies through props, no fetch |
| Open Account details modal | 700 ms | instant | Use parent row, lazy-fetch only when stale |
| `router.refresh()` after edit | full SSR (incl. FX) | < 200 ms | Server Actions + `revalidateTag` |

---

## 5. awesome-copilot integration (how the catalog plugs in)

There is **no** finance/accounting skill in `awesome-copilot`. The relevant
agents for this project are:

| Agent file | Use it for |
|------------|------------|
| `agents/project-architecture-planner.agent.md` | Phase-2 roadmap (investments, recurring, openclaw) once the perf foundation is fixed |
| `agents/frontend-performance-investigator.agent.md` | Drives the P1 work above: capture real Lighthouse + DevTools traces for the dashboard and Transactions tab and validate every fix |
| `agents/expert-nextjs-developer.agent.md` | Reviews the App-Router patterns: RSC islands, `unstable_cache`, Server Actions, `<Suspense>` streaming, Cache Components |
| `agents/tech-debt-remediation-plan.agent.md` | Generates per-issue tickets from §3 with the 1–5 Ease/Impact/Risk grid |
| `agents/implementation-plan.agent.md` | For the "Copy transaction" feature in §6 — writes the AI-executable implementation plan |
| `instructions/nextjs.instructions.md` + `nextjs-tailwind.instructions.md` | Drop into `.github/copilot-instructions.md` so contributors get App-Router-correct suggestions |
| `skills/sql-optimization/SKILL.md` | When tackling the `analytics/summary` query plan |

**Suggested install path** (no need to vendor the whole repo):

```
.github/
└── copilot-instructions.md       ← link to nextjs + nextjs-tailwind instructions
.claude/agents/                   ← copy frontend-performance-investigator,
                                    expert-nextjs-developer,
                                    project-architecture-planner,
                                    implementation-plan
```

---

## 6. Improvement plan — execution order

### Sprint 1 — Performance foundation (1 week, biggest UX win)
1. **Stream FX out of the SSR critical path.** Wrap the FX-derived block
   in `<Suspense>` with a server component that reads from `FxRate` first
   and falls back to network async. Removes the largest blocking await on
   the dashboard.
2. **Cache analytics responses.** `unstable_cache` on `analytics/summary`
   and `analytics/stats`, keyed by `(userId, dateFrom, dateTo, accountId)`,
   tagged `analytics:${userId}`. Invalidate on tx mutations.
3. **Pass-through props instead of refetch.** `AccountDetailsModal` and
   `AddTransactionModal` consume currencies/account from RSC props.
4. **Drop blocking `count(*)`** from default `/api/transactions`. Return
   `hasMore` from cursor; expose `?withCount=1` for the rare full-count
   need.
5. **Switch mutations to Server Actions** with `revalidateTag` per
   collection (`tx`, `accounts`, `budgets`) instead of `router.refresh()`.

### Sprint 2 — Quality / correctness (1 week)
6. **Date-aware FX**: per-tx conversion uses the closest `FxRate` snapshot
   on or before `tx.date`.
7. **Fix "month totals from last-20-tx"**: replace with
   `prisma.transaction.groupBy` aggregates.
8. **Block type changes that break TRANSFER linkage** in the edit drawer;
   add validation in `updateTransaction`.
9. **Prisma decimal hygiene**: remove `as unknown as number` cast in
   `incrementBalance`.
10. **Missing-rate visibility**: surface "no FX rate" status on rows so
    sums never silently mix currencies.
11. **Restrict 10 MB body limit** to the `/api/receipts/scan` route only.

### Sprint 3 — Copy transaction + tighter UX (3–5 days)
12. **Copy transaction (the feature you asked for):**
    - **DB**: add nullable `Transaction.clonedFromId` (self-relation),
      keep audit log `action:"cloned"`.
    - **Service**: new `cloneTransaction(txId, userId, overrides?)` in
      `server/services/transactions.ts`. Re-uses `createTransaction`,
      defaults `date = today`, `status = "PENDING"` (force re-verify),
      drops `receiptId`, copies everything else (vendor, amount, category,
      GST flags, deductible %, notes).
    - **API**: `POST /api/transactions/:id/clone` with optional `overrides`
      body (date, accountId).
    - **UI**: in the Transactions drawer, add a "Duplicate" button next
      to Edit/Delete; on the list row, add a context-menu "Duplicate to
      today / Duplicate as recurring template". Bulk-select duplicate via
      checkbox in list.
    - **Tests**: Vitest unit covering balance impact (clone with
      `status:VERIFIED` must move balance once, not twice).
13. Hide stub Receipts/Tax tabs OR ship the verification queue UI.
14. Promote shared style tokens to `lib/ui/tokens.ts`.

### Sprint 4 — Observability + Phase-2 readiness (1 week)
15. Sentry for FE+BE. Custom span around every Server Action.
16. Vitest tests for `services/transactions.ts` covering all status
    transitions + transfer semantics + clone.
17. Use `awesome-copilot/agents/project-architecture-planner` to plan
    Phase-2 (recurring tx, rules engine, investments). Output:
    `/plan/phase2-recurring-and-rules.md`.

---

## 7. Quick wins you can ship today

- Replace `recentTxs` `include: { category: true }` with `select:
  { nameEn: true, color: true }` (saves ~1 KB/tx on the wire,
  reduces Prisma generated SQL columns).
- Add `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`
  to `/api/fx/latest`.
- Remove `prisma.transaction.count` from the default Transactions list
  payload — single biggest perf gain you can land in 10 minutes.
- Pass `currencies` from `app/page.tsx` to `AddTransactionModal` so it
  stops fetching `/api/settings/currencies` on every open.

---

_Generated as a static plan. No code modified._
