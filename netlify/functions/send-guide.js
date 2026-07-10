// Netlify Function: send-guide
// Receives { name, email, guideTitle, guideSlug } from a guide gate form,
// sends the guide via Resend, and logs the lead to Netlify DB so the
// scheduled follow-up function (send-scheduled.js) can pick it up later.
const { neon } = require("@netlify/neon");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }
  const name = (payload.name || "").trim();
  const email = (payload.email || "").trim();
  const guideTitle = (payload.guideTitle || "the guide").trim();
  const guideSlug = (payload.guideSlug || "").trim();
  if (!name || !EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "A valid name and email are required." }) };
  }
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const recipient = process.env.RESEND_TO_OVERRIDE || email;
  if (!RESEND_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Email delivery is not configured yet. Please try again later." }),
    };
  }
  const siteUrl = process.env.URL || "https://engage.africapeopleadvisory.com";
  const guideUrl = guideSlug ? `${siteUrl}/guides/${guideSlug}/?unlocked=1` : siteUrl;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Engage Job Evaluation <${FROM_EMAIL}>`,
        to: [recipient],
        subject: `Your guide: ${guideTitle}`,
        html: `
          <p>Hi ${escapeHtml(name)},</p>
          <p>Thanks for requesting <strong>${escapeHtml(guideTitle)}</strong>. You can read it here:</p>
          <p><a href="${guideUrl}">${guideUrl}</a></p>
          <p>— The Engage Job Evaluation team</p>
        `,
      }),
    });
    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("Resend error:", resendRes.status, detail);
      return { statusCode: 502, body: JSON.stringify({ error: "Email failed to send." }) };
    }

    // Log the lead to Netlify DB so send-scheduled.js can follow up on day 5.
    // Best-effort: if this fails, we still return success since the guide
    // email itself already went out successfully.
    console.log("DB URL present:", !!process.env.NETLIFY_DATABASE_URL);
    try {
      const sql = neon();
      const result = await sql`
        INSERT INTO leads (email, name, source, guide_slug, email1_sent_at)
        VALUES (${email}, ${name}, 'guide', ${guideSlug}, now())
        RETURNING id
      `;
      console.log("Lead inserted successfully, id:", result[0] ? result[0].id : "unknown");
    } catch (dbErr) {
      console.error("Failed to log lead to Netlify DB:", dbErr.message, dbErr.stack);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("send-guide function error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected server error." }) };
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
