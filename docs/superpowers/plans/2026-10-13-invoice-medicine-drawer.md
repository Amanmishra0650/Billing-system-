# Invoice Medicine Drawer Implementation Plan

Goal: replace the New Invoice medicine dropdown with a searchable, synchronized multi-select drawer, reusing existing active medicines and authoritative invoice pricing.

Scope reviewed: package.json, server.mjs, database.mjs, schema.sql, medicine migration, medicines.mjs, handler.mjs, billing.mjs, items.mjs, invoice totals, invoice/OPD/master frontend modules, CSS, automated tests, and the connected medicines schema. The database currently has 67 medicines, all active. No application data will be created, edited, or deleted for this feature verification; fixtures remain isolated.

## Implementation

- [ ] Add failing browser tests for opening, database-backed search/price display, multi-selection, duplicates, row/checkbox removal synchronization, reopen state, manual charge types, quantity/totals, save/reopen, empty/error/loading states, keyboard closing, mobile width, and invoice limits.
- [ ] Add failing server regression for duplicate medicine IDs and preserve authoritative price/snapshot tests.
- [ ] Create public/medicine-drawer.js with a native modal dialog, search, checkbox cards, fresh active medicine fetching on open, retry, stale response protection, focus restoration, and a checked state derived from invoice rows.
- [ ] Update public/medicine-picker.js to bind Medicine fields to the drawer while preserving Treatment/Service manual fields and clearing stale medicine metadata on type switches.
- [ ] Update public/app.js to reuse empty Medicine rows, add one row per unique selected ID with quantity one and database price, synchronize removals and type changes, clear the drawer on view/reset, and display base line amounts as quantity multiplied by unit price while retaining medicine taxes in totals.
- [ ] Reuse GET /api/medicines?active=true; add the drawer module to static assets in handler.mjs. Reject duplicate medicine IDs on new issuance in medicines.mjs; leave historic invoices readable.
- [ ] Apply existing green/cream styling: desktop right-side width 380px; mobile full width. No PDF, authentication, OPD, history, database/schema, or credential changes.
- [ ] Adapt existing medicine browser tests to the drawer, then run all Node tests, all browser tests, production syntax/static verification, and whitespace checks.
- [ ] Review the complete change and repair material findings. Start/restart the local application and verify its actual active-medicine data without creating test records in the connected database.
- [ ] Record all changed files and exact final verification results. Do not commit or push.

Decisions: invoice rows are the selection source of truth; searching never changes selection. Selecting first reuses the clicked empty Medicine row, then another empty row, then appends. Unchecking removes only rows with that medicine ID. Blank medicine placeholders must not block issuance after selections have produced valid rows. The existing 30-charge limit applies and errors must be shown rather than silently creating an invalid invoice.
