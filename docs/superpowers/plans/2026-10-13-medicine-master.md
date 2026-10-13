# Medicine Master Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation. Steps use checkbox syntax for tracking.

**Goal:** Add editable medicines and safe medicine selection with immutable invoice snapshots.

**Architecture:** Keep the existing Node HTTP handlers, PostgreSQL transactions, and browser JavaScript modules. Use an additive SQL migration and server-resolved medicine snapshots, with shared integer-paise tax arithmetic.

**Tech Stack:** Node 24+, pg, PGlite, plain JavaScript/CSS, node:test, Playwright.

**Spec:** ../specs/2026-10-13-medicine-master-design.md

## Global Constraints

- Preserve all patient, OPD, invoice, payment, and historical tax data.
- Never change or print credentials; use existing database configuration.
- Medicine prices: INR 0–1,000,000; tax: 0–100%; at most two decimal places.
- Keep Treatment/Service taxes and OPD discounts/consultation rules unchanged.
- Preserve existing green/cream responsive UI and current local edits.

## Review Focus

- Concurrent duplicate names must return 409 through database uniqueness.
- Master changes after dropdown selection must reject stale quotes.
- A type switch must not retain medicine identity or tax on a Service row.
- Odd-paise tax rounding must agree between browser, server, and print.
- Migration reapplication must preserve legacy rows and issued totals.

### Task 1: Medicine persistence and APIs

Files: migrations/2026-10-13-medicines.sql, medicine-migration.mjs, migrate-medicines.mjs, medicines.mjs, database.mjs, handler.mjs, package.json, test/medicines.test.mjs.

Interfaces: validateMedicine(input), createMedicine(db,input), listMedicines(db,{q,active}), getMedicine(db,id), updateMedicine(db,id,input), setMedicineStatus(db,id,input), migrateMedicines(db).

- [x] Write validation, authenticated API, duplicate/concurrent name, filtering, status, and legacy migration preservation tests.
- [x] Run tests and confirm missing module/routes fail.
- [x] Implement parameterized APIs and repeatable transactional migration; integrate initialization without unrelated migration changes.
- [x] Run targeted tests until passing.

### Task 2: Invoice snapshots and medicine taxes

Files: billing.mjs, items.mjs, public/invoice-totals.js, handler.mjs, test/medicine-invoices.test.mjs, test/opd-api.test.mjs.

Interfaces: resolveMedicineItems(tx,items) returns server snapshots; invoiceTotals(items,consultation) returns subtotal, CGST/SGST, discount, total and line tax/final amounts.

- [x] Write tests proving INR 100 at 5% totals INR 105, legacy totals stay fixed, edited/deactivated masters do not alter saved invoices, invalid/inactive medicines fail, stale quotes fail, mixed taxes and OPD discount work, and odd-paise rounding is deterministic.
- [x] Confirm new tests fail before code changes.
- [x] Resolve active medicines under transaction locks; reuse existing amount/name/price columns and persist additional snapshots.
- [x] Retain legacy normalization for SQLite imports; update new-medicine API fixtures.
- [x] Run invoice and existing API regressions.

### Task 3: Master pages and searchable invoice dropdown

Files: public/medicines-ui.js, public/medicine-picker.js, public/app.js, public/index.html, public/styles.css, handler.mjs, e2e/medicines.spec.mjs.

Interfaces: initMedicines({api,view,esc,fmt,onChanged}); attachMedicinePicker(row,{api,onChange}) handles selection and type switches.

- [x] Add browser tests for create/edit/search/status/cancel, dropdown keyboard selection, price autofill, quantity/tax preview, Treatment/Service switching, snapshot print, and mobile widths.
- [x] Confirm missing medicine navigation makes tests fail.
- [x] Add requested sidebar actions and responsive pages with existing field/error patterns.
- [x] Add accessible server-backed search, readonly medicine prices, identity reset on type switch, and invoice tax-aware summary/print.
- [x] Run new and existing browser tests.

### Task 4: Final verification and connected migration

Files: scripts/verify-production.mjs, package.json, README.md, docs/superpowers/medicine-master-progress.md.

- [x] Verify full test suite and browser suite with Node 24+, syntax/static production verification, and diff whitespace checks.
- [x] Run connected additive migration after isolated migration tests pass; compare counts/totals and rerun to confirm idempotence.
- [x] Review all changes and repair material issues; report each changed file and actual verification results.
- [x] Document direct static production delivery and medicine tax/snapshot behavior.

## Execution ledger

Ruling: Implement in the supplied workspace and execute inline because the user explicitly instructed implementation here after reviewing the specification. Preserve their prior UI edits. Do not create a separate worktree, publish, or commit unrelated changes.

Ruling: No frontend framework build exists. Provide a production verification command that checks deployable modules and static assets, without introducing a bundler.

Task 1: complete ? validation/API/migration tests failed before implementation and now pass.
Task 2: complete ? immutable snapshots, mixed tax, stale quotes, and actual OPD linking verified.
Task 3: complete ? desktop/mobile medicine and existing OPD browser tests pass; screenshots inspected.
Task 4: complete ? Node 24 suite 22/22, browser suite 2/2, production verification, connected migration twice, and live schema checks passed.
Review: one material normalization bypass reproduced with a failing regression and fixed before connected migration.
