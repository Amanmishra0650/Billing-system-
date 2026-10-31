-- Run in a transaction with application writes paused. Permanent IDs are unchanged.
SET LOCAL lock_timeout = '10s';
LOCK TABLE opd_visits IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE opd_visits ADD COLUMN IF NOT EXISTS opd_date DATE;
ALTER TABLE opd_visits ADD COLUMN IF NOT EXISTS daily_opd_number INTEGER;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM opd_visits WHERE (opd_date IS NULL) <> (daily_opd_number IS NULL)) THEN
    RAISE EXCEPTION 'Incomplete daily OPD state; refusing to renumber records';
  END IF;
END $$;
WITH numbered AS (
  SELECT id, (visited_at::timestamptz AT TIME ZONE 'Asia/Kolkata')::date AS visit_date,
    row_number() OVER (
      PARTITION BY (visited_at::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY visited_at::timestamptz,opd_sequence,id
    ) AS daily_number
  FROM opd_visits
)
UPDATE opd_visits v SET opd_date=n.visit_date,daily_opd_number=n.daily_number
FROM numbered n WHERE v.id=n.id AND v.opd_date IS NULL AND v.daily_opd_number IS NULL;
ALTER TABLE opd_visits ALTER COLUMN opd_date SET NOT NULL;
ALTER TABLE opd_visits ALTER COLUMN daily_opd_number SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='opd_visits'::regclass AND conname='opd_daily_number_positive') THEN
    ALTER TABLE opd_visits ADD CONSTRAINT opd_daily_number_positive CHECK (daily_opd_number>0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='opd_visits'::regclass AND conname='opd_date_daily_number_unique') THEN
    ALTER TABLE opd_visits ADD CONSTRAINT opd_date_daily_number_unique UNIQUE (opd_date,daily_opd_number);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS opd_daily_counters (
  opd_date DATE PRIMARY KEY,
  last_number INTEGER NOT NULL CHECK (last_number>0)
);
INSERT INTO opd_daily_counters(opd_date,last_number)
SELECT opd_date,max(daily_opd_number) FROM opd_visits GROUP BY opd_date
ON CONFLICT(opd_date) DO UPDATE SET last_number=GREATEST(opd_daily_counters.last_number,EXCLUDED.last_number);
