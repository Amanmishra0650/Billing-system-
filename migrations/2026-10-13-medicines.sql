CREATE TABLE IF NOT EXISTS medicines (
 id UUID PRIMARY KEY,
 name TEXT NOT NULL CHECK (name=btrim(name) AND length(name) BETWEEN 1 AND 140),
 selling_price NUMERIC(12,2) NOT NULL CHECK (selling_price BETWEEN 0 AND 1000000),
 tax_percentage NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_percentage BETWEEN 0 AND 100),
 is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS medicines_name_unique ON medicines(lower(name));
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS medicine_id UUID REFERENCES medicines(id) ON DELETE RESTRICT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS medicine_name TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_percentage NUMERIC(5,2) CHECK (tax_percentage BETWEEN 0 AND 100);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_amount_paise BIGINT CHECK (tax_amount_paise>=0);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS final_amount_paise BIGINT CHECK (final_amount_paise>=0);
CREATE INDEX IF NOT EXISTS invoice_items_medicine ON invoice_items(medicine_id) WHERE medicine_id IS NOT NULL;
