# Consecutive UHID allocation and two-number display

The user requests only UHID and daily OPD in the PDF/history and asks to fix UHID gaps. Prior isolated testing reproduced legacy PostgreSQL sequence recovery as 1,34,67 after abrupt exits.

- [x] Observe failing tests for only two PDF identifiers and counter persistence after abrupt exits.
- [x] Add a durable transactional singleton UHID counter, seeded above all known previously issued/allocated values without changing old identities or lowering existing counters. Preserve legacy sequence for compatibility and never use it for new public allocations.
- [x] Route patient/invoice UHID allocation and previews through the counter, and synchronize it after explicit SQLite import. Remove permanent-ID display, retaining the permanent database identity internally.
- [x] Test rollback, restart, simultaneous creation, repeat migration and original-record preservation. Back up and restore-check the active database, migrate it, and verify medicines and existing identities.
- [x] Run backend/browser/production checks and restart locally. Do not commit or push.

Verified: 40 backend tests, 5 affected browser tests, and production verification (41 modules) passed. Independent review found no blocking issues under the documented stop-all-legacy-writers procedure. Before stopping the active local server, authenticated legacy preview captured last allocation 2011294 / next 2011295 in ignored data/uhid-counter-live-high-water.json. A full backup was restored and original-record fingerprints matched. Within the migration transaction, the new row was seeded from that verified live allocation before applying the generic issued-record high-water SQL; no legacy sequence was reset. Original UHIDs 2011261 and 2011294, both visits, and all 68 medicines remain unchanged. Live post-restart preview is 2011295. PDF and history omit permanent ID; internal permanent identities remain untouched. No commit or push.
