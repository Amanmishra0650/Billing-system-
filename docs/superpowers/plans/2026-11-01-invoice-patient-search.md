# Invoice patient search implementation

**Goal:** Implement the user-supplied detailed invoice autocomplete specification from the attachment, reusing patient identities and never creating an OPD for medicine-only purchases.
**Architecture:** Shared patient service for authenticated bounded search and duplicate-safe creation; standalone invoice transaction resolves selected/new patient and snapshots identity. A focused browser module manages search and selection independently of OPD-linked billing.
**Stack:** Existing Node.js 24, PostgreSQL/PGlite, plain JavaScript and Playwright.

- [x] Write failing tests for bounded search, last visit, same names, permanent identity, invoice rollback, explicit master updates, snapshots and no extra OPD.
- [x] Extract shared patient functions and implement standalone invoice transaction; add repeatable snapshot-column SQL and explicit migration command.
- [x] Add 300 ms autocomplete, manual selection, optional details, safe clearing, explicit new-patient status, and confirmation for master edits. Preserve OPD-linked forms.
- [x] Verify browser selection/new patient flows, all existing tests, print/PDF and production modules.
- [x] Backup and restore-check the active local database, apply additive migration, compare original records/medicine catalogue, restart and smoke test.

Constraints: No existing UHID/OPD reset, data deletion, name-based auto-selection, old-invoice rewrite, commit or push. Server resolves canonical identity and rejects conflicting new/selected patient payloads. Search includes only specified identity fields and last-visit timestamp, never illnesses or payments. Missing optional data remains allowed. Legacy internal invoice helpers remain usable for migrations/financial tests; all new public invoice requests must resolve a patient profile.

Completed: 37 backend tests and 13 browser tests passed; production verification passed. Backup restored and original-data fingerprints verified before applying additive migration. Local app restarted at http://localhost:3001; existing patient search and all 68 medicines verified. Review gap for same-name new patients fixed and re-reviewed. No commit or push. Full report: docs/invoice-patient-search-verification.md.
