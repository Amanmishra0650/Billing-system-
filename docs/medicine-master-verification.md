# Medicine Master delivery and verification

Date: 2026-10-13 (Asia/Calcutta)

Implemented editable medicine names, selling prices, tax percentages, and active status. The sidebar has separate Invoices, OPD, and Medicines sections. Invoices contains New invoice and Invoice history; Medicines contains Add Medicine and Medicine List. Medicine invoice rows use a searchable active-medicine dropdown with price autofill and editable quantities. Medicine prices are resolved on the server; issued items preserve name, price, tax percentage, tax amount, and final amount snapshots. Existing Treatment/Service taxes, OPD consultations/discounts, payments, and historical invoices remain compatible.

## Verification results

Used temporary Node v24.21.0 through `npm exec --yes --package=node@24`; the system Node installation was not replaced.

| Check | Result |
| --- | --- |
| `npm test` under Node 24 | 22 tests passed; zero failures |
| `npm run test:e2e` under Node 24 | 3 browser tests passed; zero failures |
| `npm run build` under Node 24 | Passed syntax, local import, static asset, migration file, and production output checks for 27 JavaScript modules |
| Connected PostgreSQL medicine migration | Applied successfully; all existing record fingerprints unchanged |
| Connected migration reapplication | Passed; unchanged record fingerprints |
| Read-only live schema verification | Seven medicine columns, five item snapshot columns, and case-insensitive unique index confirmed |
| Review | Type-normalization bypass reproduced, fixed, and covered by regression assertions |
| Desktop/mobile visual inspection | Invoice and responsive medicine pages inspected from browser screenshots |

The connected database retained 1 staff account, 4 patients, 4 OPD visits, and 4 audit records. It contained no invoices or payments at migration time. Legacy invoice preservation was additionally exercised with synthetic issued records in isolated migration tests. Tests never insert synthetic data into the application's connected database. Credentials were not changed or printed.

The build command verifies this project's existing deployment structure: static frontend files are served directly from `public/`; there is no frontend framework bundling step. No deployment was performed.

## Changed files

| File | Change |
| --- | --- |
| `medicines.mjs` | Medicine validation, authenticated-handler service operations, parameterized queries, uniqueness errors, server-side invoice selection resolution |
| `medicine-migration.mjs` | Transactional migration and preservation fingerprints |
| `migrate-medicines.mjs` | Explicit configured-database migration command |
| `migrations/2026-10-13-medicines.sql` | Medicine table, unique index, nullable invoice snapshot columns, restrictive foreign key |
| `database.mjs` | Initialize medicine schema for fresh/local application databases |
| `handler.mjs` | Five medicine API routes and new browser module assets |
| `billing.mjs` | Resolve masters, save/read immutable medicine snapshots, calculate medicine tax totals |
| `items.mjs` | Carry trusted medicine metadata through existing item normalization; preserve legacy import compatibility |
| `public/invoice-totals.js` | Shared integer-paise tax and discount arithmetic |
| `public/medicine-picker.js` | Searchable dropdown, keyboard selection, active filtering, readonly price autofill, and type-switch cleanup |
| `public/medicines-ui.js` | Sidebar actions, Add/Edit Medicine form, list/search/status actions, errors and cancellation |
| `public/opd-ui.js` | Cancel stale history-search navigation when opening a new registration |
| `public/app.js` | Separate sidebar active/expanded states, medicine navigation, row selection, quote submission, tax-aware preview, snapshot printing |
| `public/styles.css` | Medicine forms, tables, dropdown, mobile styles; earlier reference UI styles retained |
| `public/index.html` | Sidebar groups invoice, OPD, and medicine navigation under separate expandable parents |
| `test/medicines.test.mjs` | Validation, authentication, CRUD/status/search, concurrent duplicates, and migration preservation |
| `test/medicine-invoices.test.mjs` | Price/name/tax snapshots, inactive rejection, stale quotes, type bypass regression, rounding, mixed taxes, and persisted OPD invoice |
| `test/opd-api.test.mjs` | Existing new-medicine fixture now references a valid master without changing expected totals |
| `e2e/opd.spec.mjs` | Full OPD workflow regression; 60-second budget for visit/invoice operations and PDF exports |
| `e2e/medicines.spec.mjs` | Separate desktop/mobile sidebar groups, master page operations, keyboard/mouse dropdown selection, autofill, quantity preview, type switches, snapshot printing, mobile layout |
| `scripts/run-tests.mjs` | Cross-platform test file enumeration for the existing Node test suite |
| `scripts/verify-production.mjs` | Production module and static output verification |
| `package.json` | Medicine migration/build commands and cross-platform test entrypoint |
| `README.md` | Medicine operations, migration, tax/snapshot behavior, API contract and build command |
| `docs/superpowers/specs/2026-10-13-medicine-master-design.md` | Reviewed feature specification |
| `docs/superpowers/plans/2026-10-13-medicine-master.md` | Implementation plan and completed verification ledger |
| `docs/medicine-master-verification.md` | This complete file inventory and verification record |

## Browser artifacts

Ignored artifacts are in `test-results/medicines-medicine-master--43774-l-preserve-issued-snapshots/`: `medicine-invoice-desktop.png`, `medicine-list-mobile.png`, and `medicine-form-mobile.png`. The existing OPD browser test also produces OPD/invoice print artifacts.

## Operational notes

Start locally using Node 24 or newer and the existing database configuration. The master is initially empty; add real medicines through Add Medicine. Do not seed test medicines in the connected database. For future deployments, apply `npm run migrate:medicines` to the intended configured database before deploying application changes. No medicine deletion API is provided.

Sidebar follow-up verified: separate Invoices/OPD/Medicines groups, expanded parent and active child highlights, desktop/mobile navigation, no billing calculation changes. Production verification passed again; localhost:3001 returned HTTP 200.
