// POST /.netlify/functions/booking-gate
// Demo gate: verify reCAPTCHA, store the demo lead (with company), notify the team,
// and return the booking calendar URL prefilled with the visitor's details.
import site from "../../src/_data/site.json" with { type: "json" };
import { json, readBody, clean, isEmail } from "../lib/respond.mjs";
import { verifyRecaptcha } from "../lib/recaptcha.mjs";
import { dbEnabled, getStore } from "../lib/store.mjs";
import { runLeadHooks } from "../lib/integrations/index.mjs";
import { emailEnabled, notifyTeam } from "../lib/email.mjs";

// Prefill parameters per provider. Any other provider (an iframe or a link to Google Calendar,
// Microsoft Bookings, Cal.com...) can set its own in site.json → booking.prefill, e.g.
//   "prefill": { "name": "name", "email": "email" }   (param name → value key)
const PREFILL = {
  hubspot: { firstName: "firstName", lastName: "lastName", email: "email" },
  calendly: { name: "fullName", email: "email" },
};

function prefilledUrl(values) {
  const url = new URL(site.booking.url);
  const map = site.booking.prefill || PREFILL[site.booking.provider] || {};
  for (const [param, key] of Object.entries(map)) {
    if (values[key]) url.searchParams.set(param, values[key]);
  }
  return url.href;
}

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!site.features.booking || !site.booking || !site.booking.url || site.booking.provider === "none") {
    return json(503, { ok: false, error: "Online booking isn't set up yet. Please contact us to arrange a time." });
  }

  const b = await readBody(req);
  if (!b) return json(400, { ok: false, error: "Invalid request." });
  if (b.website) return json(200, { ok: true }); // honeypot

  const firstName = clean(b.firstName, 80);
  const lastName = clean(b.lastName, 80);
  const email = clean(b.email, 254).toLowerCase();
  const company = clean(b.company, 160);

  if (!firstName || !lastName || !isEmail(email) || !company) {
    return json(400, { ok: false, error: "Please fill in your name, work email and company." });
  }

  const rc = await verifyRecaptcha(b.recaptchaToken, b.recaptchaVersion === "v2" ? "v2" : "v3", context?.ip);
  if (!rc.ok) {
    return json(400, { ok: false, challenge: Boolean(rc.challenge), error: "We couldn't confirm you're not a robot. Please try again." });
  }

  const row = {
    type: "demo",
    first_name: firstName,
    last_name: lastName,
    email,
    company,
    source_page: clean(req.headers.get("referer") || "", 500) || null,
    recaptcha_score: rc.score,
  };

  if (dbEnabled()) {
    try {
      await getStore().insert(row);
    } catch (err) {
      console.error("insertLead failed", err); // don't block the visitor from booking
    }
  }

  if (emailEnabled()) {
    try {
      await notifyTeam(`Demo request: ${firstName} ${lastName}, ${company}`, { Name: `${firstName} ${lastName}`, Email: email, Company: company }, email);
    } catch (err) {
      console.error("notifyTeam failed", err);
    }
  }

  await runLeadHooks({ ...row, created_at: new Date().toISOString() });

  return json(200, {
    ok: true,
    provider: site.booking.provider,
    bookingUrl: prefilledUrl({ firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email, company }),
  });
};
