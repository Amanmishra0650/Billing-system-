-- Additive and repeatable. Existing invoice snapshots are not backfilled from mutable patient data.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_mobile TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_address TEXT NOT NULL DEFAULT '';
