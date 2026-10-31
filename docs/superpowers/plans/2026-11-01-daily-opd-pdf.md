# Daily OPD PDF numbering implementation

User wants the printed OPD number to start at OPD-0001. Implement the daily-number portion of the existing design without changing permanent identities or the UHID format.

- [x] Test first/same-day/next-day numbers, Kolkata midnight, concurrency, backfill and repeat migration, and PDF permanent/daily identifier separation.
- [x] Add nullable visit date/number, deterministic historical backfill, unique constraint and transactional date counters in separately reviewable SQL. Initialize locally and supply an explicit production command.
- [x] Allocate the daily number inside the visit transaction; show the daily number on PDF/header/footer and retain permanent ID separately in PDF and history.
- [x] Backup the populated local database before applying; compare original records and medicines; run affected tests and full suite, then restart.

Do not reset permanent sequences, rewrite existing patient identifiers, delete records, commit or push. The broader history filters and new UHID prefix remain outside this focused PDF change.

Verified: all 34 automated tests passed, Chrome OPD/PDF workflow passed, production checks passed. A restored backup matched the local database before migration. Original record fingerprints and all 68 medicine records remained unchanged; existing permanent OPD-0100 now has daily number 1 for 2026-11-01. Independent review found no blocking issues. Multi-connection PostgreSQL contention was not independently tested; the atomic upsert and unique constraint were exercised with PGlite.
