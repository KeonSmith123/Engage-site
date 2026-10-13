# CapeX site: build notes (4 Oct 2026)

Built on the WorkInFlow site starter v2. Content comes from the approved CapeX Marketing Designs canvas (home, staff transport, events, Rides, Convoi OS, privacy).

## Pages

| URL | Source | Form |
| --- | --- | --- |
| `/` | `src/index.njk` | Links to the quote forms |
| `/staff-transport/` | `src/staff-transport.njk` | Staff transport quote: role, staff count, shift times, sites |
| `/events/` | `src/events.njk` | Event quote: date, headcount, venue, getting home, times. Also links to the rider app event booking |
| `/rides/` | `src/rides.njk` | Airport zone fares (live since 7 Oct) and "Book a ride" to the live booking page (`site.json → links.rideBooking`, card / Apple Pay / Google Pay / instant EFT). WhatsApp kept for questions only. Updated 12 Oct |
| `/software/` | `src/software.njk` | Convoi OS demo: vehicles, what you run |
| `/contact/` | `src/contact.njk` | General form with a "What do you need?" dropdown. `/contact/?service=branding` (or `events`, `software`, `partner`, `rides`) preselects it |
| `/about/` | `src/about.njk` | None |
| `/guides/` | Two guides: one open checklist and one gated PDF (year-end transport planner) | Guide form |
| `/privacy/` | `src/privacy.md` | None. **Draft for legal review** |
| `/dashboard/` | Starter leads dashboard (`/dashboard/?demo` shows sample data) | n/a |

## What changed from the starter

- **Brand:** `tokens.css` (navy, blue, teal, cream; Poppins, Barlow, IBM Plex Mono), plus labelled chunks CapeX-01 to CapeX-10 in `overrides.css` (tokens only).
  - The primary blue is `#1078B0`, a slightly deeper version of the brand blue, so white button text passes contrast checks.
  - The bright sky blue `#20A0E0` is only used on navy.
- **Header and footer:** a navy header with the logo on a light pill, a WhatsApp link and a "Get a quote" button. The button now shows even with booking switched off.
- **Lead form (`partials/lead-form.njk`):** new optional settings `service`, `serviceSelect`, `askPhone`, `extraFields`, `messageLabel` and `companyLabel`.
- **`netlify/functions/lead.mjs`:** folds service, mobile and the extra fields into the lead's `message`, as "Label: value" lines. This means **no database schema change**. The team notification subject names the service, e.g. "New staff transport quote request from …".
- **`main.js`:** two new guarded IIFEs:
  - `?service=` preselect
  - Rides fare calculator
- **Images:**
  - Logo: `logo-capex.png`, a horizontal crop of the master logo.
  - Favicon: `favicon.svg` and `favicon.png`.
  - Share image: `share.jpg` (1200×630).
  - Photos: Cape Town stock in `assets/img/photos/`, with number plates blurred and people cropped out.
- **Removed:** placeholder client logos (the logo strip hides itself), starter guides and the starter PDF.

## Settings (site.json → features)

| Flag | Setting | Needs |
| --- | --- | --- |
| leads | on | Supabase (or Neon) `leads` table + `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| email | on | Resend on `send.capextransport.co.za` + `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NOTIFY_EMAIL` |
| booking | **off** | No calendar yet. Every CTA goes to a quote form. Turn on with Calendly or a Google appointment page later |
| recaptcha | on, keys empty | Forms work without keys; add `recaptcha.siteKey` / `v2SiteKey` and secrets before launch |
| analytics | on, ID empty | Add the GA4 ID |
| video | off | n/a |
| dashboard | on | `DASHBOARD_SECRET`, `DASHBOARD_EMAILS` |

**Supabase:** CapeX already has a Supabase project. Running `database/supabase/0001_leads.sql` there adds a separate `leads` table with RLS on, and touches nothing else. Decide whether to use that project or a fresh one before running it.

## Placeholders still on the site (highlighted in yellow)

| Page | Placeholder |
| --- | --- |
| Home | Trip count (~350) |
| Home, staff transport | PrDP / background-check wording |
| Staff transport | Monthly report format |
| Staff transport | Advance vs arrears billing |
| Events | Public example pricing |
| Events | Maximum group size |
| Rides | Cancellation and refund policy wording |
| Rides | GK Fusion tour prices |
| Convoi OS | "1 week → 2 hrs" claim |
| Convoi OS | Standard price and minimum |
| Convoi OS | Extra-module price |
| Convoi OS | POPIA line (confirm after security phase B) |
| Privacy | Date |
| Privacy | Retention periods |
| Privacy | Information Officer name |

## Before launch

1. Create the GitHub repo (Use this template → `capex-site`) and set `src/admin/config.yml` → `backend.repo`.
2. Connect Netlify, add env vars, run the leads SQL.
3. Confirm the stock photo licences (Unsplash = free for commercial use).
4. Work through `LAUNCH-CHECKLIST.md` (DNS in two sessions for capextransport.co.za).
