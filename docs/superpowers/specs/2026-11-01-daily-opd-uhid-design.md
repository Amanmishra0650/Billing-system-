# Permanent UHIDs and daily OPD numbering

## Request and repository inspection

Implement the attached user specification in the existing Node.js 24 / plain JavaScript / PostgreSQL (Neon in production, PGlite locally) application. Preserve existing data, local edits, authentication, financial rules and print-image readiness. No commit, push or production deployment is authorized.

Inspected the repository's schema, database initialization, patient/visit services, invoice and medicine services, HTTP handler, frontend entry points and OPD screens, PDF rendering, legacy migration, explicit medicine migration, backup/restore commands, Vercel entry point/configuration and related API, persistence, migration, financial and browser tests. The local origin matches the requested GitHub repository. There are existing uncommitted edits, including the earlier numbering and PDF fixes; preserve them except where the new requirements explicitly supersede their behavior.

Current facts:

- `patients.id` is UUID. `patient_uid` and `uid_sequence` are unique. Existing `patient_uid_seq` is shared with standalone invoice registration generation and currently starts at 2011162 on fresh databases.
- `opd_visits.id` is UUID; `opd_number` and `opd_sequence` are unique permanent identifiers. `visited_at` is an ISO timestamp stored as text. No daily date/number exists.
- Returning OPD patients already retain their patient record and UHID; duplicate checks serialize patient creation. Patient search currently covers name, UHID and mobile.
- The invoice API currently ignores a standalone request's `patient_id`. Standalone invoices allocate registration numbers without creating/linking patient profiles.
- OPD history returns a maximum of 100 search matches, with no date range or aggregate summary. Browser date handling currently depends partly on the browser timezone.
- Production requests do not run schema initialization; an explicit migration command is required before deployment.

## Approaches and chosen recommendation

Use an additive daily-counter table with one row per Kolkata date and an atomic transactional upsert. PostgreSQL row locking serializes competing allocations. A database unique constraint independently enforces visit date/number uniqueness. Retain all existing permanent sequences.

An advisory lock followed by a maximum query is possible, but adds a lock-key convention and scans visit numbers. Resetting the permanent OPD sequence would violate the request and is excluded. The daily-counter approach is recommended.

## Identifier policy

- Preserve every issued legacy UHID verbatim, including numeric and `YPC-UID-` identifiers. Do not rename existing patients or rewrite invoice snapshots.
- New patient UHIDs use `YPC-UHID-` plus a minimum six-digit suffix. A genuinely fresh installation starts at `YPC-UHID-000001`.
- On existing installations, continue the existing global sequence without resetting or decreasing it. For example, after numeric UHID 2011162, a subsequent new patient may receive `YPC-UHID-2011163`. This reconciles the requested new format with preservation and never-reset rules.
- Preserve existing permanent OPD numbers and the `opd_number_seq`; each visit also keeps its UUID. Newly issued permanent numbers retain the current minimum-four-digit format.
- Daily OPD numbers are positive integers starting at 1 separately for each Kolkata calendar date. They are never primary keys.
- Patient selection uses the UUID; client-supplied UHID text cannot override the stored identity. No patient deletion, counter-reset or UHID editing feature is added.

## Date and counter semantics

Determine `opd_date` from the saved `visited_at` instant in `Asia/Kolkata`, including historical and backdated visits. Default new visits to the current Kolkata date/time. Convert datetime-local input explicitly from Kolkata time, independent of browser timezone. Reject ambiguous or invalid API timestamps rather than letting the server's local timezone choose a date.

Allocate a visit number inside the same transaction that inserts the visit. Upsert the date's counter and return the incremented number. Rollback of the registration also rolls back the counter increment. Failed permanent-sequence allocations may still leave harmless gaps.

## Additive migration and safety

Create a separately reviewable SQL migration and explicit Node migration command. Reapply safely without renumbering already backfilled visits.

1. Before application to a populated installation, stop local writers or schedule a production maintenance window, produce a backup with the existing backup tool and restore it into a separate destination for verification. Never log credentials or patient details.
2. Use one transaction, a bounded lock timeout and table locks to exclude competing visit writes during backfill. Validate legacy timestamps; invalid rows abort the transaction and require explicit correction, never silent reassignment.
3. Add nullable `opd_date DATE` and `daily_opd_number INTEGER` fields. For historical rows without these fields, calculate Kolkata dates and use chronological order (`visited_at` as timestamptz, then permanent sequence and UUID for deterministic ties) to assign numbers per date. On repeat application leave allocated date/number pairs unchanged. Abort inconsistent partial states rather than silently modifying them.
4. Create `opd_daily_counters(opd_date DATE PRIMARY KEY, last_number INTEGER NOT NULL)` with a positive-number constraint. Populate counters from saved daily numbers; on reapplication never decrease a counter.
5. Validate positive numbers, complete backfill and uniqueness. Add `NOT NULL` only after validation, then a named unique constraint on `(opd_date, daily_opd_number)` and useful date indexes.
6. Compare row counts and fingerprints of the original projections of patients, visits, invoices, invoice items, medicine records, payments, adjustments and audit records. The two added visit columns are excluded from original-record fingerprints. Abort on changes to original data.
7. Preserve sequence high-water marks. New formatting must not reuse imported numeric or prefixed suffixes. Migration does not lower or reset an existing sequence.

Fresh schema initialization creates the updated layout. Local startup may apply the repeatable additive migration; Vercel requests never run DDL. Deploy the migration before code that requires its columns. Rollback uses the previous application only if it can still write all required columns; otherwise keep writes paused and roll forward. Do not drop columns or restore over a live database as an automatic rollback.

## Patient and medicine-only flow

Offer New Patient and Existing Patient modes for OPD and standalone invoice entry. Search existing patients by UHID, normalized mobile or name. Selection fills read-only identity fields and a read-only UHID. Existing mode requires selection before saving.

New patient creation keeps serialized duplicate detection. Exact existing identity matches cannot be bypassed to create a second UHID. Potential shared-name/mobile matches are shown for staff selection; no automatic merging of historical patient records occurs.

Builder decisions: an exact match means the same normalized name, nonempty normalized mobile, age and gender. Matching just a name or family mobile remains a possible match, for which staff may explicitly confirm a distinct person. Legacy standalone invoice identities must also appear in existing-patient search: staff explicitly selects the legacy invoice identity, then the server creates or reuses a patient profile retaining its original registration/UHID. Do not rewrite any historical invoice snapshot or automatically merge conflicting legacy identities. Missing or conflicting legacy registrations require staff review; never silently issue a replacement UHID for a selected legacy identity.

Standalone medicine invoices accept a validated patient UUID. The server resolves the stored name, demographic fields and UHID rather than trusting client replacements. They create invoices only and never insert OPD visits or increment daily counters. A new standalone patient is created and linked transactionally when no existing patient is selected. Failed invoice validation rolls back patient creation. Historical unlinked invoices remain valid and unchanged.

## OPD history API and UI

Keep the existing search endpoint compatible where possible. Add a history/report response for paginated records, date range and totals calculated in PostgreSQL, with parameterized filters. Support Today, Yesterday, Last 7 Days (today plus preceding six Kolkata dates), This Month and inclusive Custom Date Range. Validate real calendar dates, both custom bounds and start <= end. Use server time for preset boundaries in Kolkata.

Show Daily OPD No., permanent OPD ID, UHID, patient name, visit date/time in Kolkata, doctor and registration payment status in history and details. Search and date filters apply consistently to the complete result set and its totals; totals must not be calculated from the first page of records.

Summary semantics: total patients is distinct patient UUIDs; paid patients and unpaid patients are distinct patients with at least one respective registration in the range. A patient with both paid and unpaid visits may appear in both categories. Also return total/paid/unpaid visit counts to make this clear. Total consultation amount is the sum of each saved consultation's discounted total, including any preserved legacy taxes, in integer paise. Later invoice payments do not change the registration's saved payment status.

## PDF

Patient information displays the stored UHID. Header displays the permanent OPD ID, daily OPD number and visit date/time. Existing numeric UHIDs print unchanged; newly created patients print their `YPC-UHID-` identifier. Continue waiting for the logo and fonts before printing.

Latest user instruction: the top-right header shows UHID above the permanent OPD number, with daily OPD number added below when implemented. The suggested Save as PDF filename is the patient's name, with filesystem-invalid characters removed while preserving Hindi names. This immediate print-layout/filename change is implemented independently of the pending daily-numbering migration.

## Affected files

Existing: `schema.sql`, `database.mjs`, `opd-service.mjs`, `opd.mjs`, `billing.mjs`, `handler.mjs`, `migration.mjs`, `package.json`, `scripts/verify-production.mjs`, `public/opd-ui.js`, `public/opd-print.js`, `public/app.js`, `public/index.html`, `public/styles.css`, `README.md`; related numbering/API/migration/tax/medicine tests and OPD/invoice browser tests.

New: separately reviewable `migrations/2026-11-01-daily-opd.sql`, migration module/CLI, shared Kolkata date utilities, patient selection UI helper if needed, migration/date/concurrency/medicine-only tests and browser coverage. Keep this scoped to the requested feature; no framework or hosting migration.

## Verification

Write failing tests before implementation. Cover daily rollover and Kolkata UTC-midnight boundaries, same-day allocations, simultaneous registrations, uniqueness constraints, global UHID continuation and fresh formatting, returning patient visits, immutable old identities, medicine-only invoices, rollback, chronological deterministic backfill, migration reapplication with unchanged fingerprints, sequence high-water marks, all date presets/custom validation, pagination totals and server-side search filtering. Run the complete Node.js 24 suite and affected browser tests; generate a sample PDF and inspect print layout. PGlite tests verify PostgreSQL SQL semantics but cannot alone prove multi-connection PostgreSQL contention: run the contention tests against an explicitly isolated PostgreSQL database when available, and report any remaining verification limit.

Review deliverables: changed-file list, migration SQL separately, test evidence and backup/application instructions. No commit or push until the user reviews.
