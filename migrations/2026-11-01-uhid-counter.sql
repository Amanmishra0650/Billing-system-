-- Permanent identity allocation uses a logged row, not a recovery-preallocated sequence.
-- Existing patient/invoice identifiers and legacy sequences are never rewritten/reset.
CREATE TABLE IF NOT EXISTS patient_uhid_counter (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  last_value BIGINT NOT NULL CHECK (last_value>=0)
);
WITH issued AS (
  SELECT GREATEST(
    COALESCE((SELECT max(uid_sequence) FROM patients),0),
    COALESCE((SELECT max(substring(patient_uid from '[0-9]+$')::bigint) FROM patients WHERE patient_uid ~ '^(YPC-(UID|UHID)-)?[0-9]+$'),0),
    COALESCE((SELECT max(substring(registration from '[0-9]+$')::bigint) FROM invoices WHERE registration ~ '^(YPC-(UID|UHID)-)?[0-9]+$'),0)
  ) AS high_water
)
INSERT INTO patient_uhid_counter(singleton,last_value)
-- Increment before assignment: a fresh counter stores 2011161 to issue 2011162.
SELECT true,GREATEST(2011161,high_water,(SELECT CASE WHEN is_called THEN last_value ELSE last_value-1 END FROM patient_uid_seq)) FROM issued
ON CONFLICT(singleton) DO UPDATE SET last_value=GREATEST(patient_uhid_counter.last_value,(SELECT high_water FROM issued));
