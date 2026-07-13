# Engage Job Evaluation — Website

Marketing & conversion site for **Engage Job Evaluation**, an APAG methodology.
Built by WorkInFlow as a static site with a Git-based CMS.

- **Generator:** [Eleventy (11ty) v3](https://www.11ty.dev/) — Nunjucks + Markdown
- **CMS:** [Decap CMS](https://decapcms.org/) (formerly Netlify CMS)
- **Host:** Netlify (static output + CMS auth via Git Gateway / Netlify Identity)

Think of it like a printed magazine: Eleventy is the printing press that turns
content + templates into finished pages once, ahead of time. There is no live
server doing work per visitor, so the site is fast, cheap, and hard to break.

---

## Running it locally

You need Node.js 18+.

```bash
npm install        # one-time: installs Eleventy
npm run build      # builds the site into _site/
npm run serve      # builds + serves with live reload at http://localhost:8080
npm run clean      # removes _site/
```

The built site lands in `_site/` (git-ignored). Netlify runs `npm run build`
and publishes `_site/` automatically on every push.

---

## Repository structure

```
.eleventy.js                 Eleventy config (input src/, output _site/)
package.json                 scripts + Eleventy dependency
src/
  _data/site.json            global site data: name, nav, brand strings, URLs
  _includes/
    layouts/base.njk         the page shell (head, header, footer hooks)
    layouts/guide.njk        guide detail template
    layouts/case-study.njk   case-study detail template
    partials/header.njk      data-driven nav (active states)
    partials/footer.njk      footer
  assets/
    css/tokens.css           design tokens — single source of truth (do not hard-code hex)
    css/styles.css           components & layout (ported verbatim from the approved build)
    css/overrides.css        SPA→multipage resets + Chunk 3 collection styles
    js/main.js               nav active fallback, FAQ accordion, case-study filter
    img/                     CMS-uploaded media lands here
  admin/
    index.html               Decap CMS entry point (/admin/)
    config.yml               CMS collections & fields
  index.njk                  Home
  overview.njk  how-it-works.njk  the-process.njk  book-demo.njk  faq.njk
  guides.njk                 Guides hub (lists the guide collection)
  case-studies.njk           Case studies hub (filterable grid)
  guides/
    guides.11tydata.js       applies layout/permalink/tags + draft handling
    *.md                     10 guide entries
  case-studies/
    case-studies.11tydata.js applies layout/permalink/tags + draft handling
    *.md                     8 case-study entries (4 live, 4 draft)
```

---

## Editing content (Decap CMS)

Once deployed to Netlify with Identity + Git Gateway enabled, editors go to
**`/admin/`**, log in, and edit content through a friendly UI. Saving commits
markdown back to the repo, which triggers a Netlify rebuild. To trial the CMS
locally, run `npx decap-server` alongside `npm run serve` (the config already
sets `local_backend: true`).

### Guides (10 entries)

Each guide has a title, summary, category, read time, **order** (lower = first),
and two switches:

- **Gated** — when on, the public page shows an email-capture panel instead of
  the body. All 10 guides currently ship **gated** (matches APAG's confirmed
  list of gated assets — the four ungated assets, the overview flyer, the
  comparison page, the sample grade grid, and the FAQ, are separate site pages
  rather than entries in this collection). The email delivery itself is
  wired in the lead-automation phase — the toggle and panel are already in place.
- **Draft** — when on, the guide does not render and does not appear in any list.

### Case studies (8 entries)

Four are **live**:

- Climate Finance Institution (East Africa) · Medical Research NGO (South Africa)
  · Logistics Group South Africa · Container Solutions Provider (South Africa)

Four are **draft** (hidden from the site) pending approved quotes and logos from APAG:

- Development Bank · Large Bank · Financial Services Organisation · State-Owned Entity

All client names and logos have been anonymised at APAG's request — case
studies are titled by sector/region instead of by company name, and the
`logo`/`image` fields are cleared. If a client later approves being named
publicly, restore their name in `title` and add their logo path back into
`logo`/`image` on that entry only.

Each case study uses structured fields — Region, Sector, a scope/meta line, an
abstract, and the four narrative sections (Context, Business challenge, Our
approach, Outcome), plus an optional client quote. To publish a draft: open
it, add the real quote/logo, untick **Draft**, save. It appears on the hub
immediately on the next build, sorted by its **order** value.

The region/sector filter bar was removed from the case-studies hub at APAG's
request; `regionTag`/`sectorTag` fields remain in the front matter (harmless,
unused) in case filtering is reintroduced later.

---

## How drafts & ordering work (technical)

The directory-data files (`*.11tydata.js`) compute, per entry:

- `permalink: false` when `draft: true` → the page is never written.
- `eleventyExcludeFromCollections: true` when `draft: true` → it never appears in
  a listing.

Collections `guide` and `caseStudy` are defined in `.eleventy.js`, filtered to
non-drafts and sorted by `order`. So drafts are invisible in every sense until
the flag is cleared — no stray URLs, no leaks.

---

## Outstanding items (pending APAG)

These are content/config confirmations only; none block the build:

- **Grade-band naming** — the methodology copy uses placeholder band labels; swap
  in the real Engage grade-band names when confirmed.
- **Live subdomain + DNS** — `src/_data/site.json` uses the placeholder
  `engage.africapeopleadvisory.com`. Update `url` once the subdomain is final.
- **Client logos** — cleared at APAG's request (case studies are anonymised).
  Only re-add a logo if that specific client has approved being named publicly.
- **Real quotes** — BRD, CBZ, Apollo, GridCo, Topshell and Logistics quote fields
  are empty/editable; RGF and Aurum carry approved quotes already.
- **Book a demo** — the demo page holds a placeholder for the HubSpot Meetings embed.

## Lead automation setup (HubSpot + Resend)

Both hooks referenced above are now wired up — they just need real credentials.

**HubSpot Meetings (Book a demo page)**
1. Create a Meetings link in HubSpot (Free tier works).
2. Paste the link into `hubspotMeetingUrl` in `src/_data/site.json`.
3. Leave it empty to show the placeholder box instead (routes to email).

**Resend (gated guide delivery)**
1. Create a Resend account and, ideally, verify a sending domain (a few DNS
   records) — without one, Resend's default address can only send to your
   own account email, which is fine for internal testing but not a live demo.
2. In Netlify → Site settings → Environment variables, add:
   - `RESEND_API_KEY` — from resend.com/api-keys
   - `RESEND_FROM_EMAIL` — e.g. `guides@engage.africapeopleadvisory.com`
   - `RESEND_TO_OVERRIDE` *(optional)* — routes all sends to one inbox while
     testing, before a domain is verified
3. Redeploy. The form on every gated guide page posts to
   `netlify/functions/send-guide.js`, which calls Resend server-side (the API
   key never touches the browser).

Which guides are gated is a per-guide checkbox in Decap CMS (`Gated (require
email)`) — no code changes needed to flip one on or off.

---

Built by **WorkInFlow** · info@workinflow.co.za · workinflow.co.za
