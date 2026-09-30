OPD and PostgreSQL Integration Design
Goal
Extend the existing Yogi Piles billing application with a basic OPD registration and history workflow while preserving all current invoice, payment, PDF printing, voiding, and authentication features. The application will be deployable on Vercel and will keep records permanently in Neon PostgreSQL instead of a local SQLite file.
Confirmed Requirements
- Keep the existing Billing workspace and behavior.
- Add top-level Billing and OPD navigation.
- Maintain one permanent patient profile and allow many OPD visits per patient.
- Assign immutable sequential patient UIDs and OPD numbers on the server.
- Let staff create an invoice from a saved OPD visit with patient, UID, consultation fee, and payment details prefilled.
- Let staff select Paid or Unpaid when registering an OPD visit.
- Require a payment mode for paid registrations.
- Store the illness on each visit because a patient can have different problems on later visits.
- Use Neon PostgreSQL for durable Vercel-compatible storage.
OPD Form
The OPD registration form contains:
- Patient lookup by UID, name, or mobile number
- Patient name
- Mobile number
- Age
- Gender
- Address
- Visit date and time, defaulting to the current time
- Required doctor dropdown
- Required illness dropdown
- Custom illness field when Other is selected
- Consultation fee
- Payment status: Paid or Unpaid
- Payment mode when status is Paid
- Optional short note
Doctor Dropdown
The doctor field is a required dropdown. Manual doctor-name entry is not permitted. Initial doctors:
1. Dr. Saurabh Mishra
2. Dr. Aman Mishra
3. Dr. Suraj Mishra
Doctors are stored as database records rather than hard-coded only in the browser, allowing additional doctors to be activated later without changing historical visit records.
Illness Dropdown
Initial options:
- Piles
- Anal Fissure
- Fistula
- Constipation
- Pilonidal Sinus
- Rectal Bleeding
- Abdominal Pain
- Acidity
- Other
Selecting Other reveals a required custom illness field. Both the selected illness code and the final display text are stored on the visit.
Navigation and User Flow
After login, the top navigation contains:
- Billing
  - New Invoice
  - Invoice History
- OPD
  - New OPD Registration
  - OPD History
Saving an OPD visit opens its detail view. The detail view offers Create Invoice. That action opens the existing invoice editor with the patient identity, OPD reference, consultation charge, and payment state prefilled. The invoice is created only when staff confirms the existing Save Invoice action, preventing accidental financial records.
OPD History supports search by patient name, UID, mobile number, OPD number, doctor, or illness. Opening a record shows patient and visit details and any linked invoice.
Data Model
patients
- id UUID primary key
- uid_sequence generated unique integer
- patient_uid unique display value such as YPC-UID-000001
- name
- mobile
- age
- gender
- address
- created_at
- updated_at
doctors
- id UUID primary key
- name unique
- active boolean
- created_at
opd_visits
- id UUID primary key
- opd_sequence generated unique integer
- opd_number unique display value such as OPD-000001
- patient_id foreign key
- doctor_id foreign key
- illness_code
- illness_text
- consultation_fee_paise
- payment_status constrained to paid or unpaid
- payment_mode, required when paid
- note
- visited_at
- created_by staff user foreign key
- created_at
Existing Billing Tables
The current SQLite tables are represented in PostgreSQL as normalized tables for users, sessions, invoices, invoice items, payments, payment adjustments, and audit logs. Existing invoice behavior and numbering remain unchanged. Invoices gain nullable patient_id and unique nullable opd_visit_id references. The unique visit reference is the single source of truth for the OPD-to-invoice link.
API Boundaries
- GET /api/doctors — active dropdown options
- GET /api/patients?q= — patient lookup
- POST /api/patients — create a permanent patient
- GET /api/opd-visits?q= — searchable OPD history
- POST /api/opd-visits — validate and create a visit
- GET /api/opd-visits/:id — visit detail
- POST /api/opd-visits/:id/invoice — create a linked invoice exactly once
All OPD endpoints require an authenticated staff session. Server-side validation treats browser values as untrusted. Doctor IDs must reference active doctors, illnesses must match the allowed list or a valid custom value, fees must be safe non-negative integer paise, and paid visits must provide a payment mode.
Payment Rules
- Paid OPD: the consultation invoice is created with the received amount equal to the consultation total and the chosen payment mode.
- Unpaid OPD: the consultation invoice is created with zero received and retains the existing Billing controls for later payment.
- OPD payment state and invoice creation occur in a database transaction to avoid mismatched records.
- An OPD visit can link to only one invoice.
PostgreSQL and Vercel Architecture
- Replace node:sqlite access with a PostgreSQL data-access layer using the DATABASE_URL environment variable.
- Use Vercel Node.js Functions for API requests and static hosting for the current browser interface.
- Store sessions in PostgreSQL and issue Secure, HttpOnly, SameSite cookies.
- Keep secrets only in Vercel environment variables.
- Required variables: DATABASE_URL, SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, and COOKIE_SECURE=1.
- Seed the three doctor records idempotently during database setup.
Existing SQLite Migration
Migration is explicit and non-destructive:
1. Back up data/billing.sqlite.
2. Create the PostgreSQL schema.
3. Export and import users, invoices, payments, payment adjustments, and audit logs while preserving invoice numbers and timestamps.
4. Preserve every historical invoice registration value as issued. Do not automatically merge old invoices into new patient profiles when identity is uncertain.
5. Compare source and destination record counts and financial totals.
6. Test representative invoices and payment histories.
7. Keep the SQLite backup until production acceptance and a restore drill are complete.
No existing invoice is silently deleted or overwritten.
Error Handling and Safety
- Duplicate patient matches are shown to staff before a new profile is created.
- Concurrent UID, OPD, and invoice numbering is controlled by PostgreSQL sequences and unique constraints.
- Validation errors return clear field-level messages.
- Database errors do not expose credentials or patient data.
- Audit logs record OPD creation, invoice linking, and payment-status changes.
- Patient data must not appear in application logs.
Testing
- Unit tests for OPD validation, illness handling, doctor validation, and paid/unpaid rules.
- Database tests for patient reuse, multiple visits, unique numbering, and one-invoice-per-visit.
- Migration tests comparing SQLite and PostgreSQL counts and totals.
- API tests for authentication and malformed input.
- Browser verification for Billing/OPD navigation, registration, history search, invoice prefill, invoice save, and PDF printing.
- Regression tests for existing invoices, payments, payment-status changes, voiding, login, and logout.
Acceptance Criteria
- Existing Billing functionality continues to work.
- Staff can switch between Billing and OPD from top navigation.
- Staff can select only one of the three configured doctors from a dropdown.
- Staff can select a common illness or enter a custom illness through Other.
- Returning patients reuse a permanent UID and receive a new OPD number for each visit.
- Paid and unpaid OPD registrations are represented correctly in Billing.
- Creating an invoice from an OPD record cannot create duplicates.
- All records survive Vercel redeployments in Neon PostgreSQL.
- Existing SQLite data is migrated and verified before production cutover.

Implementation decisions (2026-09-30)
- Preserve the current green/cream palette and Segoe UI/system font stack.
- Preserve existing 9% CGST and 9% SGST; a 500 rupee consultation totals 590 rupees. Paid registration records only the consultation total; extra invoice charges remain outstanding.
- Neon uses DATABASE_URL and pg. Persistent local PGlite supports local startup and isolated tests; Vercel/production refuses local storage.
- OPD payment state describes registration, while the linked invoice shows current payment balance.
- Sessions from SQLite are not migrated; existing account password hashes are retained.
