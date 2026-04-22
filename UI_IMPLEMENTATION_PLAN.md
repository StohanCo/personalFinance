# UI Implementation Plan

## Completed in this delivery

### Step 1: App shell and navigation foundation
- Added a multi-section navigation shell inside the dashboard UI:
  - Overview
  - Accounts
  - Transactions
  - Budgets
  - Analytics
  - Receipts
  - Tax
- Added section-aware navigation state using the `section` URL search parameter.
- Added a stronger visual direction (typography tokens, atmospheric background, gradient accents).

### Step 2: Account details interaction
- Account rows are now clickable.
- Added account details modal with editable fields:
  - Name
  - Type
  - Currency
  - Balance
  - Credit limit
  - APR
  - Notes
  - Color
  - Archive state
- Added account update API endpoint for detail editing.

### Currency improvements in this delivery
- Added `RUB` to account currency selection.
- Added FX normalization display for total net worth in NZD.
- Added a manual "Recheck via public FX API" action that calls a public exchange-rate provider.

### Daily account snapshot infrastructure
- Added `AccountSnapshot` model and migration.
- Added DB trigger to keep per-account daily snapshots up to date on account changes.
- Added SQL function `snapshot_all_accounts_for_today()` for full daily captures.
- Added daily cron endpoint and Vercel cron schedule for automatic snapshots.

## Next stages

### Stage 3: Transactions deep-detail workflow
- Dedicated transaction detail drawer/page.
- Edit and verification controls for existing transactions.
- Improved filters and search.

### Stage 4: Budgets full feature set
- Budget CRUD UI.
- Budget vs actual progress cards.
- Alert thresholds and rollover behavior.

### Stage 5: Analytics and spend intelligence
- Rich chart suite (spend categories, trends, account distribution, budget variance).
- Date-range and account segmentation controls.

### Stage 6: Currency and statistics expansion
- Historical FX storage and date-aware conversions.
- Multi-currency performance trend lines in NZD.
- Snapshot-driven daily/weekly/monthly account statistics.
- Statistical summaries for volatility, run-rate, and category concentration.
