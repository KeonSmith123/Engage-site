-- CR-01 (Sept 2026): capture company on guide downloads and demo bookings.
-- The functions also run this idempotently, so it's safe either way.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT;
