// POST /.netlify/functions/lead
// Guide downloads and contact messages: verify reCAPTCHA, store the lead, email the guide, notify the team.
import { json, readBody, clean, isEmail, siteUrl, getGuides } from "../lib/respond.mjs";
import { verifyRecaptcha } from "../lib/recaptcha.mjs";
import { dbEnabled, getStore } from "../lib/store.mjs";
import { runLeadHooks } from "../lib/integrations/index.mjs";
import { emailEnabled, buildEmail, sendEmail, notifyTeam } from "../lib/email.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const b = await readBody(req);
  if (!b) return json(400, { ok: false, error: "Invalid request." });
  if (b.website) return json(200, { ok: true }); // honeypot filled: a bot. Pretend it worked.

  if (!dbEnabled() && !emailEnabled()) {
    return json(503, { ok: false, error: "This form isn't set up yet. Please email us directly." });
  }

  const type = b.type === "contact" ? "contact" : "guide";
  const firstName = clean(b.firstName, 80);
  const lastName = clean(b.lastName, 80);
  const email = clean(b.email, 254).toLowerCase();
  const company = clean(b.company, 160);
  const note = clean(b.message, 5000);

  // CapeX: service tag, phone and "detail:<label>" fields from the quote forms are folded
  // into the message, so the leads table and dashboard need no schema change.
  const service = clean(b.service, 120);
  const phone = clean(b.phone, 40);
  const details = Object.keys(b)
    .filter((k) => k.startsWith("detail:"))
    .slice(0, 20)
    .map((k) => [clean(k.slice(7), 80), clean(b[k], 1000)])
    .filter(([label, value]) => label && value);
  const header = [
    service && `Service: ${service}`,
    phone && `Mobile: ${phone}`,
    ...details.map(([label, value]) => `${label}: ${value}`),
  ].filter(Boolean);
  const message = [header.join("\n"), note].filter(Boolean).join("\n\n").slice(0, 6000);

  if (!firstName || !isEmail(email)) {
    return json(400, { ok: false, error: "Please add your name and a valid email address." });
  }
  if (type === "contact" && !note && !details.length) return json(400, { ok: false, error: "Please add a message." });

  const rc = await verifyRecaptcha(b.recaptchaToken, b.recaptchaVersion === "v2" ? "v2" : "v3", context?.ip);
  if (!rc.ok) {
    return json(400, { ok: false, challenge: Boolean(rc.challenge), error: "We couldn't confirm you're not a robot. Please try again." });
  }

  const base = siteUrl(req);
  let guide = null;
  if (type === "guide") {
    const slug = clean(b.guide, 120);
    guide = (await getGuides(base)).find((g) => g.slug === slug);
    if (!guide) return json(400, { ok: false, error: "We couldn't find that guide. Please refresh and try again." });
  }

  let stored = false;
  let emailed = false;
  const row = {
    type,
    first_name: firstName,
    last_name: lastName || null,
    email,
    company: company || null,
    message: message || null,
    guide_slug: guide ? guide.slug : null,
    source_page: clean(req.headers.get("referer") || "", 500) || null,
    recaptcha_score: rc.score,
  };

  if (dbEnabled()) {
    try {
      await getStore().insert(row);
      stored = true;
    } catch (err) {
      console.error("insertLead failed", err);
    }
  }

  if (emailEnabled()) {
    try {
      if (guide) {
        const link = new URL(guide.file || guide.url, base).href;
        await sendEmail({ to: email, ...buildEmail("guide", { firstName, guideTitle: guide.title, buttonUrl: link }, base) });
      }
      emailed = true;
    } catch (err) {
      console.error("send guide email failed", err);
    }

    try {
      await notifyTeam(
        guide
          ? `New guide download: ${guide.title}`
          : `${service ? `New ${service.toLowerCase()} request` : "New message"} from ${firstName} ${lastName}`.trim(),
        { Name: `${firstName} ${lastName}`.trim(), Email: email, Mobile: phone, Company: company, Guide: guide && guide.title, Message: message },
        email
      );
    } catch (err) {
      console.error("notifyTeam failed", err);
    }
  }

  await runLeadHooks({ ...row, guide_title: guide ? guide.title : null, created_at: new Date().toISOString() });

  if (!stored && !emailed) {
    return json(500, { ok: false, error: "Something went wrong on our side. Please email us directly." });
  }
  return json(200, { ok: true });
};
