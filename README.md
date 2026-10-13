# CapeX Transport website (built on the WorkInFlow site starter)

See `CAPEX-NOTES.md` for what was customised, settings and placeholders. The starter documentation follows.

---

# WorkInFlow site starter

The starting point for every WorkInFlow marketing or conversion site: the APAG engage stack, cleaned up and made modular.

**Stack:** GitHub · Eleventy 3 + Nunjucks · Decap CMS (GitHub login) · Netlify (hosting + Functions) · optional leads database (Supabase or Neon), Resend, reCAPTCHA, any booking calendar, YouTube, GA4, and a leads dashboard.

Functions call Supabase, Resend, HubSpot and Calendly with plain `fetch`. The only runtime package is the Neon driver, used only when a site stores leads in Neon.

---

## What's in the box

| Path | What it is |
| --- | --- |
| `src/_data/site.json` | Client name, nav, **feature flags**, booking link, public keys (reCAPTCHA site keys, GA4 ID) |
| `src/_data/contact.json` | Contact details. Editable in the CMS |
| `src/_data/emails.json` | Copy for every automated email. Editable in the CMS |
| `src/assets/css/tokens.css` | Brand colours, fonts, spacing. **The only file you edit to rebrand** |
| `src/assets/css/styles.css` | Base styles. Don't edit per client |
| `src/assets/css/overrides.css` | Per-client CSS, as labelled chunks, tokens only |
| `src/assets/js/main.js` | One guarded IIFE per behaviour (nav, video, forms + reCAPTCHA, booking reveal) |
| `src/admin/` | Decap CMS (`/admin`) |
| `src/guides/` | One Markdown file per guide. `gated: true` + `file:` = emailed PDF |
| `src/logos/` | One Markdown file per client logo (logo strip) |
| `netlify/functions/lead.mjs` | Guide download + contact form: verify → store → email → notify team |
| `netlify/functions/booking-gate.mjs` | Demo gate: verify → store (with company) → notify → return prefilled calendar URL |
| `netlify/functions/send-scheduled.mjs` | Daily: day-5 follow-up emails |
| `netlify/functions/dash-auth.mjs` | Dashboard sign-in: emailed code or shared password, signed cookie |
| `netlify/functions/dash-data.mjs` | Dashboard data: leads + bookings (read-only), saves status and notes |
| `netlify/lib/store.mjs` | Lead storage adapter: Supabase or Neon, same interface |
| `netlify/lib/integrations/` | Booking sources (HubSpot, Calendly) and lead hooks (HubSpot, webhook) |
| `netlify/lib/` | Other helpers: email layout, reCAPTCHA, sessions, responses |
| `src/dashboard.njk` + `assets/js/dashboard.js` | The leads dashboard at `/dashboard/` (`/dashboard/?demo` shows sample data) |
| `database/supabase/0001_leads.sql` | The `leads` table for Supabase, row-level security on |
| `database/neon/0001_leads.sql` | The same table for Neon / Netlify DB |
| `database/neon/add-dashboard-columns.sql` | Adds status/notes to an existing table (e.g. engage) without touching data |
| `.env.example` | Every secret the functions use |
| `LAUNCH-CHECKLIST.md` | Go-live list |

## Feature flags

In `src/_data/site.json` → `features`:

| Flag | Turns on | Needs |
| --- | --- | --- |
| `leads` | Storing form submissions in Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| `email` | Guide emails, team notifications, day-5 follow-ups | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NOTIFY_EMAIL` |
| `booking` | Book a demo gate + calendar, nav button | `booking.provider` (`hubspot` or `calendly`) and `booking.url` in site.json |
| `recaptcha` | v3 on every form, v2 checkbox fallback on a low score | `recaptcha.siteKey`, `recaptcha.v2SiteKey` in site.json; `RECAPTCHA_SECRET`, `RECAPTCHA_V2_SECRET` in Netlify |
| `video` | Click-to-play YouTube in the hero | `video.youtube` (URL or ID) in site.json |
| `analytics` | GA4 tag + `generate_lead` / `book_demo` events | `analytics.ga4` in site.json |
| `dashboard` | Leads dashboard at `/dashboard/` | `leads` on, `DASHBOARD_SECRET`, plus `DASHBOARD_EMAILS` (with `email` on) and/or `DASHBOARD_PASSWORD` |

A module that's switched off loads no script. A function whose env vars are missing replies "not set up yet" instead of failing silently.

---

## New site setup (about half a day)

1. **Client creates the accounts** on the kickoff call: GitHub organisation, Netlify team, a Google brand account (GA4, Search Console, reCAPTCHA), plus Supabase and Resend if those modules are on. Each one invites `info@workinflow.co.za`.
2. **Create the repo:** GitHub → this repo → **Use this template** → owner = the client's organisation → name `<client>-site`.
3. **Connect Netlify:** Add new site → Import from GitHub → pick the repo. Build settings come from `netlify.toml`.
4. **CMS login:**
   - GitHub → Settings → Developer settings → OAuth Apps → New. Homepage URL: the Netlify URL. Callback URL: `https://api.netlify.com/auth/done`.
   - Netlify → Site configuration → Access control → OAuth → Install provider → GitHub → paste the client ID and secret.
   - In `src/admin/config.yml` set `backend.repo` and `site_url`.
   - Editors need a GitHub account with write access to the repo.
5. **Brand it:** edit `tokens.css`, `site.json`, `contact.json`. Replace `src/assets/img/logo.svg`, `src/favicon.svg`, `src/assets/img/share.png` (1200×630).
6. **Switch modules on or off** in `site.json` → `features`, and copy the matching keys from `.env.example` into Netlify → Environment variables.
7. **Database** (if `leads` is on), one of:
   - **Supabase:** SQL editor → run `database/supabase/0001_leads.sql`. Put `SUPABASE_URL` and the **secret** key in Netlify.
   - **Neon / Netlify DB:** turn on Netlify DB (sets `NETLIFY_DATABASE_URL`) or paste a Neon URL as `DATABASE_URL`, then run `database/neon/0001_leads.sql` in the Neon SQL editor.
8. **Email** (if `email` is on): add `send.<clientdomain>` as a domain in Resend. DNS waits for the launch checklist.
9. **Push and preview:** every push deploys; every branch gets its own preview URL for client review.

### Working locally

```sh
npm install
npm start           # http://localhost:8080
```

To run the functions locally too: `npm i -g netlify-cli`, put real values in a `.env` file, then `netlify dev`.

---

## Integrations: nothing is hard-coded

A client's tools are settings, not code.

**Booking calendar:** `site.json` → `booking.provider`

| Provider | What visitors see | Dashboard bookings panel |
| --- | --- | --- |
| `hubspot` | HubSpot Meetings embed, prefilled | Reads meetings with `HUBSPOT_TOKEN` |
| `calendly` | Calendly inline embed, prefilled | Reads events with `CALENDLY_TOKEN` |
| `iframe` | Any embeddable calendar page (Google appointment page, Cal.com, Microsoft Bookings) | Not read; demo requests still show as leads |
| `link` | A button that opens the calendar in a new tab | Not read |
| `none` | Booking off; Book a demo page points to Contact | Hidden |

For `iframe` or `link`, set `booking.prefill` to pass the visitor's details, e.g. `{ "name": "fullName", "email": "email" }` (URL parameter → value). Values available: `firstName`, `lastName`, `fullName`, `email`, `company`.

The bookings panel shows only meetings whose guest email matches a website lead, so a shared calendar (e.g. a director's) doesn't flood it. A toggle shows the rest.

**Where leads go besides the database:** `LEAD_HOOKS`

- `hubspot`: creates or updates the contact in HubSpot.
- `webhook`: POSTs `{ event: "lead.created", lead }` to `LEAD_WEBHOOK_URL`. Use this for Zapier, Make, n8n or any other CRM, so we never write a one-off integration.
- Leave it empty for neither. A failing hook is logged and never blocks the visitor.

**Adding a provider:** add a module in `netlify/lib/integrations/` with `configured()` and `listBookings()` (or a hook function), and register it in `integrations/index.mjs`. Nothing else changes.

## Leads dashboard

`/dashboard/` gives the client a working view of their leads instead of raw database rows.

- **Stat tiles:** all leads, guide downloads, demo requests, contact messages, each against the previous period. Clicking a tile filters the whole page. Open pipeline count.
- **Chart:** leads per day, week or month (depending on the range), stacked by type, with hover details.
- **Top guides** and **demo bookings** (read-only from the booking provider).
- **All leads table:** search, sort, date ranges, CSV export (opens in Excel).
- **Pipeline:** drag leads between New, Contacted, Qualified, Won and Lost, or use the dropdown on each card.
- **Lead panel:** full details, follow-up email status, matched booking, status and notes.

**Sign-in:** approved emails (`DASHBOARD_EMAILS`) get an 8-character one-time code, valid for 10 minutes. Or set `DASHBOARD_PASSWORD` for a shared password. Sessions last 12 hours. No accounts to manage, and no database keys in the browser.

**Demo:** `/dashboard/?demo` shows the full dashboard with generated sample data and saves nothing. Use it in sales meetings.

**Adding it to an older site (e.g. engage):**
1. Copy `src/dashboard.njk`, `src/assets/js/dashboard.js`, `src/assets/css/dashboard.css`, `netlify/functions/dash-*.mjs`, `netlify/lib/store.mjs`, `session.mjs` and `integrations/`.
2. Add `"dashboard": true` under `features` in `site.json`, and `@neondatabase/serverless` to `package.json` if it uses Neon.
3. Run step 1 of `database/neon/add-dashboard-columns.sql` to see the table's columns, then the rest to add `status` and `notes`. The dashboard reads common alternative column names (`name`, `organisation`, `asset`, `createdAt`, `day5_sent_at`…). If a column still shows blank, add its name to `normalizeLead()` in `store.mjs`.
4. Set `DASHBOARD_SECRET` and `DASHBOARD_EMAILS` in Netlify and deploy.

---

## House rules

- Run `npm run build` after every change; it must finish clean before you push.
- New CSS → `overrides.css`, labelled, tokens only. New JS → a new guarded IIFE at the end of `main.js`.
- Secrets only in Netlify env vars. Browser-safe keys only in `site.json`.
- Quote every YAML frontmatter value: one bad value stops the whole Eleventy build.
- Push with GitHub Desktop, not drag-and-drop. Finder hides `eleventy.config.js` and `.gitignore`, and a wrapper folder in a zip upload creates a duplicate folder instead of replacing files.
- Flag destructive changes and confirm brand, content and DNS decisions with the client before site-wide changes.

## Notes and limits

- **Gated guides are soft-gated.** The PDF sits at a public URL that's emailed after the form. Fine for marketing guides; don't use it for anything confidential.
- **HubSpot embed** is built only after the gate passes, because HubSpot's script can't size a hidden container. Prefill uses `firstName`, `lastName`, `email`. Extra fields like company are stored by the site, not added to the meeting form, so a shared meeting link isn't changed everywhere.
- **reCAPTCHA** can't be tested without a network. Test both paths (pass, and low score → checkbox) on a Netlify deploy preview, with the preview domain added to the key's domain list.
- **Dashboard limits:** it loads up to 5,000 most recent leads at once, which is plenty for a marketing site. Past that, add server-side paging to `dash-data.mjs`. HubSpot bookings are read-only; nothing is written back to HubSpot from the dashboard.
