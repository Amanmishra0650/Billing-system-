# Yogi Piles Billing and OPD

A Node.js 24+ application for Yogi Piles & Panchkarma Center. Billing and OPD share the existing green/cream palette, Segoe UI/system typography, and responsive panels.

## Local startup

```sh
npm install
npm run setup -- admin "choose-a-long-unique-password"
npm start
```

Open http://localhost:3000. Without DATABASE_URL, the app stores PostgreSQL data locally using PGlite in `data/postgres`. This directory survives restarts. Only one process may open it: stop the app before setup, migration, backup, or starting another local server. Existing staff accounts are never overwritten by setup.

For an existing SQLite installation, migrate **before** creating a new PostgreSQL account:

```sh
# Stop the old server first.
npm run migrate:sqlite -- data/billing.sqlite backups
npm start
```

Migration copies existing password hashes, so the same login works. Old sessions are intentionally invalidated. The SQLite file is retained, a consistent backup is made first, and import requires an empty destination. Every imported record and normalized invoice item is compared, alongside invoice financial totals. A failure rolls back imported records. Do not rerun migration against a database that already has records.

## OPD workflow

1. Select **OPD → New OPD registration**.
2. Search by UID, name, or mobile to reuse a patient. A new patient receives one permanent UID. Possible duplicate patients must be selected or explicitly identified as a different person.
3. Select a doctor, illness, visit time, consultation fee and Paid/Unpaid status. Other illness requires a description. Paid requires a payment mode.
4. Save the visit to obtain an immutable OPD number. Saving a visit does not issue an invoice.
5. Choose **Create invoice**, review the prefilled consultation, optionally add charges, then **Save invoice**. The original consultation and patient identity are preserved. A visit can have only one invoice; repeated saves return that same invoice.

To print an OPD registration, open the saved visit and choose **OPD form / PDF → Print / Save as PDF**. The A4 form uses the clinic logo, address, green letterhead, patient UID, OPD number, doctor, illness and registration payment summary. Printing an OPD form does not issue a billing invoice.

Doctors are seeded as database records: Dr. Saurabh Mishra, Dr. Aman Mishra, and Dr. Suraj Mishra. Deactivating a doctor removes them from new-visit options while preserving historical visits. Illness is stored per visit.

The existing 9% CGST and 9% SGST calculation is retained. A consultation fee of ₹500 produces a ₹590 total. Paid at registration records ₹590 received; extra invoice charges remain outstanding. Unpaid starts with zero received. OPD history displays the registration payment state; the linked invoice displays the current balance after subsequent payments or adjustments.

## Billing

Standalone invoices continue to work. New invoice totals are calculated on the server in integer paise. Item quantity, unit price, CGST and SGST are preserved on saved invoices. View invoices, record later payments, change Paid/Unpaid status from history, void an unpaid invoice with a reason, and use Print / Save as PDF.

Invoice numbers, permanent patient UIDs, and OPD numbers are assigned on the server. Legacy registration values are retained as issued and are not silently assigned to new patient profiles. A shared UID sequence starts above imported historical UIDs; invoice and OPD numbers have separate sequences. Sequences can have gaps after failed or rolled-back operations.

Saved invoice amounts and identities cannot be edited. Manual Paid/Unpaid changes create signed adjustments without deleting payment history. An invoice with money received cannot be voided. Repeated payment and invoice-link operations are protected by database transactions and row locks.

## Neon PostgreSQL and Vercel

The repository contains deployment configuration; running locally does not publish it or create a Neon account.

1. Create a Neon database and obtain its pooled PostgreSQL connection string with TLS enabled.
2. Copy `.env.example` to `.env` locally and set `DATABASE_URL`. Keep `.env` out of Git. Set a random `SESSION_SECRET` of at least 32 characters. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` for first-time setup.
3. With the remote URL configured, run `npm run migrate:sqlite` for an existing SQLite database **or** `npm run setup` for a fresh installation. Do not seed a new admin before importing existing users. Schema creation and doctor seeding happen in these explicit commands, not inside Vercel requests.
4. Import this directory as the Vercel project root; framework preset **Other**, output directory `public`, no build command. `api/index.mjs` serves API requests through the rewrite in `vercel.json`.
5. Configure Vercel environment variables: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `COOKIE_SECURE=1`. Use Node.js 24. Never put credentials in browser code or commit them.
6. Verify login, registration, invoice linking, existing invoices and printing against the intended deployment before cutover. Compare migration counts/totals, retain the SQLite backup, and complete a restore drill.

Vercel/production refuses local PGlite storage and requires remote PostgreSQL, secure cookies and a session secret. Data and sessions reside in PostgreSQL, outside the deployment filesystem. Redeployments do not recreate accounts or reset records. Persistent storage still requires backups and access controls.

References: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [node-postgres transactions](https://node-postgres.com/features/transactions), [PGlite local storage](https://pglite.dev/docs/filesystems).

## Backups and restore

Stop the local app and run `npm run backup -- backups`. Local PGlite backups are PostgreSQL data-directory archives (`.tar.gz`). Restore into a **new** directory using `npm run restore:local -- backups/<archive>.tar.gz data/restored-postgres`, then set `PGLITE_DATA_DIR` to that directory and start the app. Verify representative invoices before replacing any existing installation. Keep the original directory intact.

With `DATABASE_URL` set, the backup command uses the official PostgreSQL `pg_dump` client to produce a custom-format `.dump` file. Install PostgreSQL client tools first. Restore into a separate empty PostgreSQL database using `pg_restore --no-owner --no-acl --dbname <destination> <backup.dump>` with credentials supplied securely. Use a client version compatible with the Neon server. Test restoration before production acceptance.

Store backups securely outside the app directory/server and restrict access to clinic staff. Patient data and credentials must not be included in application logs or source control.

## Tests

```sh
npm test
npm run test:e2e
```

Unit/API/migration tests use isolated PostgreSQL instances and synthetic data. Browser tests use Playwright and installed Chrome; set `PLAYWRIGHT_CHANNEL=msedge` for Edge, or install a supported browser. They exercise desktop/mobile OPD registration, Other illness, returning-patient lookup, invoice prefill/save, later payments, history, logout and PDF generation. Screenshots and a sample PDF are written to the ignored `test-results` directory. No test patients are inserted into the application's real database.
