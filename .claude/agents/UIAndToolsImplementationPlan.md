# UI and Developer Tools Improvement Plan

## Objective
Improve UI quality and implementation tooling so feature delivery is faster, cleaner, and more consistent while product capabilities expand.

## Constraints and prioritization
- Security/privacy hardening is not in immediate scope.
- Focus now is UI clarity, workflow speed, and maintainable engineering patterns.

## UI improvements roadmap

### UI-1: Information architecture clarity
- Convert section placeholders into true domain workspaces.
- Add persistent context in headers:
  - active period
  - selected account scope
  - quick actions
- Provide clear status semantics:
  - pending
  - needs review
  - verified
  - rejected

### UI-2: Data-rich transaction UX
- Build compact table with expandable details.
- Add saved filter presets ("this month", "needs review", "unverified GST").
- Add batch edit affordances for category and status.

### UI-3: Receipt review experience
- Side-by-side view:
  - scanned data
  - editable transaction draft
- Confidence-driven UX:
  - high confidence: quick confirm path
  - low confidence: explicit review path
- Line item browser for future category intelligence.

### UI-4: Budget and planning UX
- Show budget burn progress bars and projections.
- Introduce timeline indicators for bills and planned transactions.
- Add monthly review dashboard card group.

### UI-5: Analytics UX
- Upgrade chart visuals with clear legends, drilldowns, and comparison controls.
- Add "why changed" hints (e.g., top 3 categories driving variance).

## Developer tools and implementation upgrades

### TOOLS-1: UI component system discipline
- Introduce reusable primitives and domain components:
  - cards
  - filters
  - table rows
  - badges
  - review panels
- Keep style tokens centralized to prevent design drift.

### TOOLS-2: API adapter layer on frontend
- Introduce typed API client wrappers for all endpoints.
- Standardize error mapping and loading states.

### TOOLS-3: Testing stack upgrade
- Add frontend interaction tests for:
  - add/edit transaction
  - receipt scan + apply
  - account update
- Add backend integration tests for:
  - balance mutation invariants
  - transaction state changes
  - snapshot job correctness

### TOOLS-4: Storybook or visual catalog
- Build a component catalog for rapid iteration and shared language.
- Include states for loading/error/empty/success.

### TOOLS-5: Metrics and quality visibility
- Add lightweight developer metrics:
  - test run time
  - flaky test tracking
  - route performance snapshots

## Suggested implementation order
1. UI-1 + TOOLS-2
2. UI-2 + TOOLS-3
3. UI-3 + TOOLS-1
4. UI-4 + UI-5
5. TOOLS-4 + TOOLS-5

## Exit criteria
- Product workflows are complete enough for monthly home finance usage.
- UI state handling is consistent across all major sections.
- New features are delivered through reusable components and typed API adapters.
- Regression risk is reduced by reliable interaction and integration test coverage.
