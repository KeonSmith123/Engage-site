-- Add the dashboard's columns to an EXISTING leads table (e.g. a site built before this starter, like engage).
-- Adds only what's missing; never changes or drops existing columns or data. Safe to re-run.
-- Works on Neon / Netlify DB and Supabase (both are Postgres).

-- 1. Look first: what columns does the table already have?
select column_name, data_type
  from information_schema.columns
 where table_name = 'leads'
 order by ordinal_position;

-- 2. Add the pipeline columns the dashboard writes to.
alter table leads add column if not exists status       text not null default 'new';
alter table leads add column if not exists notes        text;
alter table leads add column if not exists unsubscribed boolean not null default false;

-- 3. Follow-up tracking. SKIP this line if step 1 shows the table already records when the
--    day-5 email went out under another name (the dashboard also reads day5_sent_at,
--    followup_at and email2_sent_at). Adding an empty column next to a real one would make
--    every lead look un-followed-up.
-- alter table leads add column if not exists followup_sent_at timestamptz;

-- 4. Keep status values clean.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_status_check') then
    alter table leads add constraint leads_status_check
      check (status in ('new', 'contacted', 'qualified', 'won', 'lost'));
  end if;
end $$;
