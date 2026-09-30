// POST { token, action, secondFactorToken? } -> { success, score, action, lowScore }
//
// v3 flow: verify the invisible token, return the score.
// Soft-fallback flow: if a low-score submission then passes a visible v2
// challenge, the browser sends that token as `secondFactorToken` and this
// function verifies THAT instead — v2 verification has no `score` field,
// a `success: true` response is sufficient on its own.
//
// Requires RECAPTCHA_SECRET_KEY set in Netlify's environment variables
// (Site settings -> Environment variables). Never hardcode it here.

// On a pass, the gate's { name, email, company } (sent as `lead`) is recorded
// as a demo lead so company is captured before the HubSpot booking
// (CR-01 1.3). hubspot-webhook.js later finds this row by email and adds the
// meeting time. The contact is also upserted in HubSpot, best-effort, so the
// company shows on Deon's contact record without changing his meeting form.
const { neon } = require("@netlify/neon");

const SCORE_THRESHOLD = 0.5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: "RECAPTCHA_SECRET_KEY not configured" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Invalid JSON body" }) };
  }

  const { token, action, secondFactorToken, lead } = payload;

  if (secondFactorToken) {
    const result = await verifyWithGoogle(secondFactorToken, secret);
    if (result.success) await recordDemoLead(lead);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: !!result.success }),
    };
  }

  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: "Missing token" }) };
  }

  const result = await verifyWithGoogle(token, secret);

  if (!result.success) {
    return { statusCode: 200, body: JSON.stringify({ success: false, score: 0, lowScore: true }) };
  }

  if (action && result.action && result.action !== action) {
    // action mismatch can indicate the token was captured elsewhere
    return { statusCode: 200, body: JSON.stringify({ success: false, score: 0, lowScore: true }) };
  }

  const score = typeof result.score === "number" ? result.score : 0;
  const lowScore = score < SCORE_THRESHOLD;
  if (!lowScore) await recordDemoLead(lead);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, score, action: result.action, lowScore }),
  };
};

async function verifyWithGoogle(token, secret) {
  const params = new URLSearchParams({ secret, response: token });
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.json();
}

// Never throws: a logging failure must not block someone from booking.
async function recordDemoLead(lead) {
  if (!lead || typeof lead !== "object") return;
  const email = String(lead.email || "").trim().slice(0, 254);
  const name = String(lead.name || "").trim().slice(0, 200);
  const company = String(lead.company || "").trim().slice(0, 200) || null;
  if (!EMAIL_RE.test(email) || !name) return;

  try {
    const sql = neon();
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT`;
    // Reuse the latest demo row only if it's still open (no meeting yet, or
    // a meeting still ahead); otherwise this is a new booking, so a new row.
    const open = await sql`
      SELECT id FROM leads
      WHERE email = ${email} AND source = 'demo'
        AND (meeting_time IS NULL OR meeting_time > now())
      ORDER BY created_at DESC LIMIT 1
    `;
    if (open.length > 0) {
      await sql`UPDATE leads SET name = ${name}, company = ${company} WHERE id = ${open[0].id}`;
    } else {
      await sql`
        INSERT INTO leads (email, name, source, company)
        VALUES (${email}, ${name}, 'demo', ${company})
      `;
    }
  } catch (err) {
    console.error("recordDemoLead DB error:", err.message);
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return;
  const parts = name.split(/\s+/);
  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: [{
          idProperty: "email",
          id: email,
          properties: {
            email,
            firstname: parts[0],
            lastname: parts.slice(1).join(" "),
            ...(company ? { company } : {}),
          },
        }],
      }),
    });
    if (!res.ok) console.error("HubSpot contact upsert failed:", res.status, await res.text());
  } catch (err) {
    console.error("HubSpot contact upsert error:", err.message);
  }
}
