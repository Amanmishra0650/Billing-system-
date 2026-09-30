CREATE SEQUENCE IF NOT EXISTS patient_uid_seq;
CREATE SEQUENCE IF NOT EXISTS opd_number_seq;
CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS patients (
 id UUID PRIMARY KEY, uid_sequence BIGINT UNIQUE NOT NULL DEFAULT nextval('patient_uid_seq'), patient_uid TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL, mobile TEXT NOT NULL DEFAULT '', age TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patients_mobile ON patients(mobile);
CREATE TABLE IF NOT EXISTS doctors (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, active BOOLEAN NOT NULL DEFAULT true, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS opd_visits (
 id UUID PRIMARY KEY, opd_sequence BIGINT UNIQUE NOT NULL DEFAULT nextval('opd_number_seq'), opd_number TEXT UNIQUE NOT NULL,
 patient_id UUID NOT NULL REFERENCES patients(id), doctor_id UUID NOT NULL REFERENCES doctors(id),
 illness_code TEXT NOT NULL CHECK (illness_code IN ('piles','anal-fissure','fistula','constipation','pilonidal-sinus','rectal-bleeding','abdominal-pain','acidity','other')),
 illness_text TEXT NOT NULL CHECK (length(illness_text)>0), consultation_fee_paise BIGINT NOT NULL CHECK (consultation_fee_paise BETWEEN 0 AND 100000000),
 payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','unpaid')), payment_mode TEXT CHECK (payment_mode IN ('CASH','UPI','CARD','BANK TRANSFER','OTHER')),
 note TEXT NOT NULL DEFAULT '', visited_at TEXT NOT NULL, created_by BIGINT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK (payment_status <> 'paid' OR payment_mode IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS opd_patient ON opd_visits(patient_id);
CREATE TABLE IF NOT EXISTS invoices (
 id BIGSERIAL PRIMARY KEY, invoice_number TEXT UNIQUE, created_at TEXT NOT NULL, patient_name TEXT NOT NULL, age TEXT, gender TEXT, registration TEXT,
 payment_mode TEXT NOT NULL, paid_paise BIGINT NOT NULL CHECK (paid_paise>=0), tax_rate_bps INTEGER NOT NULL,
 subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise>=0), cgst_paise BIGINT NOT NULL CHECK (cgst_paise>=0), sgst_paise BIGINT NOT NULL CHECK (sgst_paise>=0),
 total_paise BIGINT NOT NULL CHECK (total_paise BETWEEN 0 AND 9007199254740991), voided_at TEXT, void_reason TEXT,
 patient_id UUID REFERENCES patients(id), opd_visit_id UUID UNIQUE REFERENCES opd_visits(id)
);
CREATE TABLE IF NOT EXISTS invoice_items (
 invoice_id BIGINT NOT NULL REFERENCES invoices(id), position INTEGER NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK (quantity>0), unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise>=0), amount_paise BIGINT NOT NULL CHECK (amount_paise>=0), PRIMARY KEY(invoice_id,position)
);
CREATE TABLE IF NOT EXISTS payments (
 id BIGSERIAL PRIMARY KEY, invoice_id BIGINT NOT NULL REFERENCES invoices(id), amount_paise BIGINT NOT NULL CHECK (amount_paise>0), mode TEXT NOT NULL, received_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS payments_invoice ON payments(invoice_id);
CREATE TABLE IF NOT EXISTS payment_adjustments (
 id BIGSERIAL PRIMARY KEY, invoice_id BIGINT NOT NULL REFERENCES invoices(id), amount_paise BIGINT NOT NULL, status TEXT NOT NULL CHECK (status IN ('paid','unpaid')), created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS adjustments_invoice ON payment_adjustments(invoice_id);
CREATE TABLE IF NOT EXISTS audit_log (
 id BIGSERIAL PRIMARY KEY, invoice_id BIGINT REFERENCES invoices(id), opd_visit_id UUID REFERENCES opd_visits(id), user_id BIGINT REFERENCES users(id), action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
);
