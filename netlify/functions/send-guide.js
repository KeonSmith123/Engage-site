// Netlify Function: send-guide
// Receives { name, email, guideTitle, guideSlug } from a guide gate form
// and sends the guide via Resend. Keeps the Resend API key server-side.
//
// Required environment variables (set in Netlify → Site settings → Environment variables):
//   RESEND_API_KEY     — from https://resend.com/api-keys
//   RESEND_FROM_EMAIL  — a verified sending address, e.g. guides@engage.africapeopleadvisory.com
//   (optional) RESEND_TO_OVERRIDE — if set, all sends go here instead of the real
//     recipient. Useful before a sending domain is verified (Resend's default
//     onboarding@resend.dev address can only send to your own account email).

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
    // Not configured yet — fail clearly rather than pretending to succeed.
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
