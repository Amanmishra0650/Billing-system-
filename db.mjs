import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
mkdirSync('data', { recursive: true });
export const db = new DatabaseSync('data/billing.sqlite');
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (
 id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT UNIQUE,
 created_at TEXT NOT NULL, patient_name TEXT NOT NULL, age TEXT, gender TEXT,
 registration TEXT, payment_mode TEXT NOT NULL, paid_paise INTEGER NOT NULL,
 tax_rate_bps INTEGER NOT NULL, subtotal_paise INTEGER NOT NULL,
 cgst_paise INTEGER NOT NULL, sgst_paise INTEGER NOT NULL, total_paise INTEGER NOT NULL,
 items_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL REFERENCES invoices(id), amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), mode TEXT NOT NULL, received_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);`);
const columns = db.prepare('PRAGMA table_info(invoices)').all().map(x=>x.name);
if (!columns.includes('voided_at')) db.exec('ALTER TABLE invoices ADD COLUMN voided_at TEXT');
if (!columns.includes('void_reason')) db.exec('ALTER TABLE invoices ADD COLUMN void_reason TEXT');
// Existing invoices already recorded the initial amount received in this field.
// Later payments are separate rows so the issued invoice remains immutable.
