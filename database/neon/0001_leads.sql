-- WorkInFlow site starter: leads table (Neon / Netlify DB)
-- Run once in the Neon console > SQL editor (Netlify > Extensions > Neon opens it). Safe to re-run.

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  type              text not null check (type in ('guide', 'demo', 'contact')),
  first_name        text not null,
  last_name         text,
  email             text not null,
  company           text,
  message           text,
  guide_slug        text,
  source_page       text,
  recaptcha_score   numeric(3, 2),
  followup_sent_at  timestamptz,
  unsubscribed      boolean not null default false,
  status            text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  notes             text
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_followup_idx on public.leads (created_at) where followup_sent_at is null;


comment on table public.leads is 'Website leads: guide downloads, demo requests, contact messages.';
comment on column public.leads.status is 'For the leads dashboard upsell: pipeline stage.';
