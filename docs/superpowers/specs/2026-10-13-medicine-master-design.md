# Medicine Master design

Date: 2026-10-13

## Intent and existing application

Add a Medicine Master to Yogi Patient Billing using its existing authenticated Node HTTP APIs, PostgreSQL driver, plain JavaScript modules, and green/cream CSS. The project does not use React or a frontend compilation step. Preserve patients, OPD records, issued invoices, payments, and existing local UI changes. Never expose or change database credentials.

The user's tax confirmation is interpreted as: a medicine with a selling price of INR 100 and tax of 5% costs INR 105 for quantity one. Master names, prices, tax percentages, and active status can be edited later. Those edits affect future invoices only.

## Medicine data and migration

Create medicines with UUID id, trimmed name, selling_price NUMERIC(12,2) in INR, tax_percentage NUMERIC(5,2), is_active BOOLEAN, and created_at/updated_at ISO timestamp text, following existing UUID and timestamp conventions. Tax defaults to zero and active status defaults to true. Bound price from zero to INR 1,000,000, matching existing invoice limits. Bound tax from zero to 100%, with at most two decimal places. Medicine names must contain 1–140 characters and be unique using a database index on lower(name), including inactive medicines.

Use an explicit, repeatable, additive migration in a transaction. Add nullable medicine_id with a restrictive foreign key and nullable medicine_name, tax_percentage, tax_amount_paise, and final_amount_paise snapshot columns to invoice_items. Reuse description, quantity, unit_price_paise, and amount_paise for the existing name, unit price, and pre-tax amount. Old item rows remain unchanged, with null new metadata; do not recalculate old invoices or reset sequences. Include the additive schema in fresh database initialization. Provide a migration command that does not seed accounts or update unrelated records. Check existing record counts and financial totals before and after the connected database migration.

## APIs and validation

All medicine endpoints require the existing staff session and origin protection:

- POST /api/medicines creates a medicine.
- GET /api/medicines supports name search using q and an active-only filter for invoice selection.
- GET /api/medicines/:id returns one medicine.
- PUT /api/medicines/:id edits its name, price, tax, and active status.
- PATCH /api/medicines/:id/status accepts a boolean is_active.

Validate UUIDs, name types/lengths, finite decimal prices/taxes, and boolean status on the server. Reject blank required prices, negative values, malformed inputs, and excessive decimal precision. Use parameterized queries, field-specific 400 errors, 404 missing-resource errors, and 409 duplicate-name errors, including concurrent duplicate writes. No deletion endpoint. Escape literal wildcard characters in search. Do not include SQL, secrets, or patient details in error logs.

## Sidebar and master pages

Updated by the user after implementation: the sidebar has three parent sections, Invoices, OPD, and Medicines. Invoices contains only New invoice and Invoice history. Medicines is the third parent and contains Add Medicine and Medicine List. Follow existing view switching and responsive sidebar behavior. Add/Edit Medicine uses one form with Medicine Name, Selling Price in INR, optional Tax Percentage defaulting to zero, Active status, Save Medicine, and Cancel. Cancel returns to the medicine list without persisting changes. Show errors and successful saves clearly and disable submit during requests.

Medicine List displays name, formatted selling price, tax percentage, active/inactive status, created date, Edit, and Activate/Deactivate. Include name search, loading/error/empty states, and protection against stale search responses. Status changes retain historical references and update available invoice options.

## Invoice selection, pricing, and snapshots

When a row's type is Medicine, use an accessible searchable dropdown that accepts only active master records. Keyboard navigation and selection must work. Show useful loading, no-match, and request-error states. Treatment and Service retain their free-text names and editable prices. Switching types clears stale medicine identity and tax metadata. Selected medicine prices are auto-filled and read-only; quantities remain editable. Refresh medicine availability for new invoice selections after master edits.

For issuance, the server resolves each medicine_id inside the existing invoice transaction and verifies that it is active. Lock selected records consistently while reading current name, selling price, and tax. Never trust client-supplied medicine names, prices, taxes, or calculated amounts. If the master changed after selection, reject the stale quote with a clear refresh/reselect error rather than silently issuing a different total. Snapshot the current values into invoice_items. Later invoice reads and printouts use only item snapshots, not live master joins.

Calculate medicine base amount as quantity multiplied by integer unit-price paise. Calculate its total tax by rounding base amount multiplied by the snapshotted percentage; final amount is base plus tax. Split that tax between existing CGST/SGST totals, assigning the rounding remainder consistently so their sum equals the medicine tax. For mixed rates, label summary and print totals CGST and SGST without a misleading fixed percentage and show the medicine tax percentage and final amount on item rows.

Treatment and Service retain their existing 9% CGST and 9% SGST calculation and rounding. New OPD consultations remain tax-free, consultation discounts apply only to the saved consultation, and legacy OPD consultations retain their stored rate. A mixed invoice combines medicine tax with existing non-medicine tax without taxing medicine twice. Do not change balances, payments, discounts, registration sequences, or invoice numbering. New Medicine items must reference a master record; historical free-text Medicine items remain readable and compatible with the legacy SQLite import path.

## Verification and delivery

Write meaningful tests before implementation for medicine validation; authenticated CRUD/status/search APIs; case-insensitive and concurrent duplicate handling; inactive medicine rejection; invoice tax arithmetic; master edits preserving issued name/price/tax/final amounts; stale quotes; mixed Medicine/Treatment/Service invoices; and OPD linking. Browser tests cover search/dropdown keyboard selection, price autofill, quantity changes, editing/status actions, cancellation, errors, responsive pages, and saved invoice printing. Update synthetic API fixtures that create new medicines to select valid master records.

Run the full existing suite plus new tests using Node 24 or newer. Run the connected PostgreSQL migration only after isolated migration preservation/idempotency checks pass. This repository has no production build command: verify production source syntax and static assets, and document that deployment serves public directly; do not invent or introduce a frontend framework to satisfy a build request. Report every changed file, exact verification outcomes, and any environment limitations. Do not deploy or alter credentials.
