# Backend Developer Agent Plan

## Objective
Evolve the current API and domain services into a complete backend platform for one-stop home finance: robust transaction lifecycle, receipt pipelines, budgeting logic, analytics aggregates, and planning support.

## Working assumptions
- Existing schema and services are foundation-level but not feature-complete.
- Security/privacy controls are intentionally deprioritized for initial scope.
- Priority is product capability, correctness, and developer velocity.

## Phase BE-1: Transaction Lifecycle APIs
### Scope
- Expand transaction API surface beyond create:
  - list with pagination and filters
  - read by id
  - update
  - verify/reject
  - delete with balance reversal safety
  - bulk update status/category

### Service requirements
- All balance-changing operations remain atomic.
- Ensure edits correctly adjust balances via delta logic.
- Preserve audit records for every state mutation.

### Acceptance criteria
- Full transaction lifecycle is available through stable APIs and service layer methods.

## Phase BE-2: Receipts Domain Normalization
### Scope
- Add receipt item model for normalized line-item storage.
- Persist scanner output both as raw JSON and normalized entities.
- Add reconciliation endpoints:
  - link receipt -> existing transaction
  - create transaction from receipt
  - reprocess failed scans

### Data model additions
- ReceiptItem table with name, amount, quantity (optional), sequence.
- OCR confidence fields on item level where practical.

### Acceptance criteria
- Receipt-derived analytics can be built from relational data, not notes parsing.

## Phase BE-3: Budget Engine APIs
### Scope
- Implement budgets CRUD endpoints.
- Build budget progress aggregate endpoint (actual vs plan).
- Add threshold breach computation and overspend projection.

### Acceptance criteria
- Budget section can fully function from backend APIs without client-side heavy calculation.

## Phase BE-4: Analytics Aggregate Layer
### Scope
- Add analytics endpoints with pre-aggregated payloads:
  - monthly cashflow series
  - category spend ranking
  - account distribution
  - net worth trend from snapshots
  - budget variance

### Performance requirements
- All endpoints support date range and account filters.
- Add DB indexes for common filter paths.

### Acceptance criteria
- Frontend charts consume backend-ready datasets directly.

## Phase BE-5: Multi-currency historical correctness
### Scope
- Add ExchangeRate model with effective date and provider metadata.
- Add scheduled rate ingestion job.
- Add conversion utility service using date-aware rates.
- Store conversion context where needed for immutable reporting.

### Acceptance criteria
- Historical reports remain stable even if latest rates change.

## Phase BE-6: Planning capabilities
### Scope
- Add recurring transaction engine (rules + generated instances).
- Add bills/reminders model and due-state computation.
- Add goals/sinking funds model and progress calculations.

### Acceptance criteria
- Backend supports full monthly household finance planning lifecycle.

## Phase BE-7: Tooling and delivery quality
### Scope
- Improve backend implementation tools:
  - contract tests for API schemas
  - integration tests for balance mutation invariants
  - fixture factories for realistic finance scenarios
  - migration safety checks in CI
- Expand test matrix beyond GST unit tests.

### Acceptance criteria
- Core financial flows have regression protection in automated tests.

## Backend technical standards
- Keep business logic in service layer; route handlers remain thin.
- All money operations use Decimal end-to-end.
- Enforce deterministic date handling (UTC boundaries for period reporting).
- Include idempotency mechanism for write endpoints with potential retries.

## Backend sprint sequence (recommended)
1. BE-1 Transaction Lifecycle APIs
2. BE-2 Receipts Domain Normalization
3. BE-3 Budget Engine APIs
4. BE-4 Analytics Aggregate Layer
5. BE-5 Multi-currency historical correctness
6. BE-6 Planning capabilities
7. BE-7 Tooling and test quality
