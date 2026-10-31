# Invoice patient search — implementation and verification

Implemented locally on 1 November 2026. No commit, push or deployment was made.

## Result

Create Invoice searches by name, UHID or normalized mobile after two characters with a 300 ms debounce. Results are authenticated, bounded to 20, and contain only identity/demographic fields and the latest OPD timestamp. Same-name matches remain separate; staff select explicitly. Selected patients retain their database ID/UHID. Editing the name clears selection and demographics. New patients receive a profile and invoice in one transaction; failed issuance leaves no orphan. Medicine-only purchases do not create OPD visits. Existing demographic edits require confirmation and are checked against the selected original values before updating. Previously issued invoice snapshots remain unchanged.

An explicit distinct-person action and checkbox support genuinely different people sharing a name or mobile. Existing UHID formatting and daily/permanent OPD numbering remain unchanged.

## Validation

- Full backend suite: **37 passed**, Node.js 24, two workers. The original unrestricted worker count exceeded machine memory; limiting the runner to two workers resolved the resource issue.
- Full Chrome suite: **13 passed**, including manual same-name selection, debounce, safe clearing, medicine-only invoices, failed/new saves, confirmation cancellation/acceptance, separate same-name new patients, existing OPD, medicine drawer, invoice address selection and PDFs.
- Production verification: **38 JavaScript modules** plus imports, assets, migration files and hosting configuration passed.
- Independent code review: the same-name creation gap was corrected and re-reviewed; no remaining blocking issues.
- Live local smoke checks: staff login 200, existing UHID search succeeded, unauthenticated patient search 401, frontend module 200, one existing OPD retained and **68 medicines** retained.
- PostgreSQL-compatible tests use isolated PGlite instances; production Neon deployment and independent multi-connection PostgreSQL contention were not exercised.

## Backup and migration

Stopped the local server before opening the database. Saved a backup under `backups/before-invoice-patient-search-2026-10-31T19-26-48-204Z.tar.gz`, restored it in a separate in-memory instance, and compared original-record fingerprints. Applied the additive snapshot migration; original patient, visit, invoice, item, payment, adjustment and medicine records remained unchanged. Local server restarted on port 3001.

Production command, after taking a verified backup: `npm run migrate:invoice-patients`. Migration does not assign new UHIDs to old patients or rewrite historical invoices.

Separate SQL source: `migrations/2026-11-01-invoice-patient-snapshots.sql`:

```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_mobile TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_address TEXT NOT NULL DEFAULT '';
```

## Files changed for this feature

New runtime/migration files:

- `patients.mjs` — shared bounded search and duplicate-safe patient creation.
- `invoice-patients.mjs` — standalone invoice identity transaction and confirmed demographic updates.
- `invoice-patient-migration.mjs`, `migrate-invoice-patients.mjs` — repeatable migration with original-invoice fingerprint verification and explicit CLI.
- `migrations/2026-11-01-invoice-patient-snapshots.sql` — mobile/address snapshot columns.
- `public/invoice-patients.js` — autocomplete and patient-selection state.

Modified runtime/configuration files:

- `billing.mjs` — persist mobile/address snapshots.
- `opd-service.mjs` — reuse shared patient functions and snapshot OPD-linked invoice demographics.
- `handler.mjs` — resolve identity for public invoice issuance and serve the autocomplete module.
- `schema.sql`, `package.json` — additive local columns and production migration command.
- `public/app.js`, `public/styles.css` — integrate selection, invoice submission, demographic snapshots and presentation.
- `scripts/run-tests.mjs` — bound concurrent embedded databases to two workers.
- `scripts/verify-production.mjs` — verify the daily OPD and invoice snapshot migration assets.
- `README.md` — document the flows and migration.

Tests/documentation:

- Added `test/invoice-patients.test.mjs`, `e2e/invoice-patients.spec.mjs`.
- Updated `test/tax.test.mjs` to use distinct explicit new-patient names across independent invoices.
- Updated `e2e/invoice-address.spec.mjs`, `e2e/medicine-drawer.spec.mjs`, `e2e/medicines.spec.mjs` to explicitly choose new patients.
- Added `docs/superpowers/plans/2026-11-01-invoice-patient-search.md` and this report.

Other pre-existing uncommitted numbering, PDF, configuration and frontend changes were retained.
