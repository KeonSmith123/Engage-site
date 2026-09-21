CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('guide', 'demo')),
  guide_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meeting_time TIMESTAMPTZ,
  email1_sent_at TIMESTAMPTZ,
  email2_sent_at TIMESTAMPTZ,
  email3_sent_at TIMESTAMPTZ,
  email4_sent_at TIMESTAMPTZ,
  next_step_booked_at TIMESTAMPTZ
);
