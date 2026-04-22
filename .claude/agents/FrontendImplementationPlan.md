# Frontend Developer Agent Plan

## Objective
Deliver a complete one-stop home finance experience from the current dashboard shell into a fully operational product across accounts, transactions, receipts, budgets, analytics, and tax workflows.

## Working assumptions
- Current codebase already has the route shell and modal-based creation paths.
- Security/privacy hardening is intentionally deferred for now due to narrow user scope.
- Backend endpoints for advanced views will be added incrementally; frontend should be API-contract driven.

## Design direction
- Keep the current high-contrast "financial cockpit" identity and evolve it with stronger information hierarchy.
- Preserve expressive visual language while improving data-density for power usage.
- Default to desktop-first information richness, then optimize responsive behavior for mobile.

## Phase FE-1: App Shell Maturation
### Scope
- Replace section placeholders with real section pages while preserving URL-based navigation.
- Introduce consistent page scaffolding primitives:
  - SectionHeader
  - FilterBar
  - DataTable
  - EmptyState
  - InsightCard

### Deliverables
- Section-level page components under app shell for:
  - Accounts
  - Transactions
  - Receipts
  - Budgets
  - Analytics
  - Tax
- Shared UI primitives folder and usage migration.

### Acceptance criteria
- Every nav section renders meaningful content, no placeholder-only pages remain.
- Section transitions keep URL state and are deep-linkable.

## Phase FE-2: Transactions Workspace
### Scope
- Build full transaction journal UX:
  - table/list toggle
  - filters (date, type, account, category, status)
  - transaction detail drawer
  - edit, verify, reject actions
  - bulk actions

### UI requirements
- Sticky filter bar.
- Fast keyboard flow for review and categorization.
- Inline badges for GST, deductible, and receipt-linked status.

### Acceptance criteria
- User can manage monthly transaction review entirely from one section.

## Phase FE-3: Receipts Inbox + Review UX
### Scope
- Dedicated receipts inbox with queues:
  - Processing
  - Needs review
  - Linked
  - Failed
- OCR result inspector:
  - extracted total/GST
  - confidence indicator
  - line-item list viewer
  - quick fix + create/update linked transaction

### Tooling/UI behavior
- Diff highlight between scanned values and user-edited values.
- One-click "Apply scanned values" and "Keep manual values" actions.

### Acceptance criteria
- Receipt processing to verified transaction is fully manageable in-app.

## Phase FE-4: Budgets and Planning
### Scope
- Budget creation/editing UI for monthly/quarterly/yearly periods.
- Category budget cards with progress and projected overspend date.
- Rollover behavior indicators.

### UI requirements
- Visual burn-rate meter.
- Alerts for threshold breaches.

### Acceptance criteria
- User can set and monitor all monthly household budgets without leaving the app.

## Phase FE-5: Analytics and Decision Support
### Scope
- Build chart suite with drilldowns:
  - net worth trend (from snapshots)
  - income vs expense trend
  - top category spend
  - account distribution
  - budget vs actual
- Add period controls and comparison mode.

### UI requirements
- Drillthrough from chart point to filtered transaction list.
- Chart tooltip includes GST and deductible context when applicable.

### Acceptance criteria
- User can answer where money is going and how trends are changing in less than 3 interactions.

## Phase FE-6: UX quality and tools
### Scope
- Improve front-end implementation tools and workflows:
  - Storybook (or equivalent) for shared components
  - visual regression tests for critical screens
  - interaction tests for modal flows
  - reusable form schema helpers for consistent validation UX

### Acceptance criteria
- New features are implemented from reusable component primitives with predictable testing support.

## Frontend technical standards
- TypeScript strict mode with explicit view-model types.
- Data-fetching via clear API adapters (no scattered fetch logic).
- Avoid large monolithic components; split by domain and intent.
- Accessibility baseline: keyboard navigation, focus states, and semantic landmarks.

## Frontend sprint sequence (recommended)
1. FE-1 App Shell Maturation
2. FE-2 Transactions Workspace
3. FE-3 Receipts Inbox
4. FE-4 Budgets
5. FE-5 Analytics
6. FE-6 UX tools and quality layer
