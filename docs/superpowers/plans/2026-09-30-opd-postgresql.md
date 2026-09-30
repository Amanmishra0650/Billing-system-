# OPD and PostgreSQL Implementation Plan

> Execute inline using executing-plans and test-driven-development; review the complete change before finishing.

**Goal:** Implement the supplied OPD design while retaining the existing green/cream theme, Segoe UI/system typography, billing, printing, and authentication.
**Architecture:** Shared asynchronous PostgreSQL service layer for the local Node server and Vercel API function. Neon uses pg; local development and isolated tests use persistent/in-memory PGlite (the PostgreSQL engine). No SQLite runtime writes after explicit migration.
**Spec:** ../specs/2026-09-30-opd-postgresql-design.md

## Global constraints and decisions
- Preserve invoice numbers, historical registrations, totals, payments, adjustments, and authentication hashes.
- Existing 9% CGST and 9% SGST apply to consultation fees; Paid records the consultation total including taxes. Additional invoice items remain outstanding unless separately paid.
- Patient UID and legacy billing UID share a sequence, initialized above historical registrations, to prevent collisions. Invoice and OPD numbering have separate sequences.
- OPD payment status records the registration payment; linked invoice displays its current balance separately.
- SQLite migration backs up first, refuses nonempty destinations, verifies records and totals within a transaction, and retains the source.
- Production requires DATABASE_URL, SESSION_SECRET and secure cookies. Local PGlite is forbidden in Vercel/production. Account setup is explicit; never reset an existing account.

## Review focus
Concurrent linking/payment updates; paid consultation plus extra charges; historical UID collisions; malformed fields and unsafe numeric totals; migration retries and partial failures.

## Tasks
- [x] 1. Add failing OPD validation and API acceptance tests; preserve baseline billing tests.
- [x] 2. Implement PostgreSQL schema, adapter, validation, transactional billing/OPD services and authenticated shared handler. Tests cover patient reuse, duplicate warnings, concurrent linking, payments, doctor validation, and unsafe input.
- [x] 3. Implement matching Billing/OPD navigation, patient lookup, registration, visit/history views and deliberate invoice prefill/save. Add browser tests for these flows and print layout.
- [x] 4. Implement explicit verified migration, backup/restore, setup, Vercel entrypoint/configuration and environment documentation. Test migration with legacy invoices/payments and destination refusal.
- [x] 5. Run full regression suite, verify browser flows if browser tooling is available, perform independent review, migrate the existing local database and restart the app.

## Progress ledger
- Baseline: npm test passed 4 tests. DATABASE_URL is not configured.
- User instructed implementation after providing the written design; proceed without further design approval. Work in the active checkout on codex/opd-postgresql so the launched app and user-visible files remain together.
- Cloud provisioning/cutover requires the user's Neon connection; finish the code and local verification independently.

- Final verification: npm test passed 14 tests; npm run test:e2e passed the desktop/mobile workflow, later payment, logout and PDF checks. git diff --check passed.
- Independent review found one payment-read race. test/payment-snapshot.test.mjs reproduced a negative received amount before the fix; reading both ledgers in one PostgreSQL snapshot fixed it. No deferred review findings.
- Local SQLite migration completed with one existing staff account and zero invoices; original source and backup retained. Existing login and all OPD endpoints verified on localhost:3000.
- Ruling: use persistent local PGlite until Neon is configured; this keeps the app usable without inventing credentials. Cloud storage and deployment remain unverified until DATABASE_URL and deployment settings are supplied.
- Ruling: preserve 9% CGST plus 9% SGST for OPD; paid consultation excludes any later added invoice charges, which remain due.
