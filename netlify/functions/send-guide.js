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
        subject: "Here's your Engage guide",
        html: wrapEmail(
          "One idea to keep in mind as you read it",
          `
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Hi ${escapeHtml(name)},</p>
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Here's the resource you requested:</p>
          ${button(guideUrl, "Download your guide")}
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">As you go through it, there's one idea worth keeping in mind:</p>
          <p style="margin:0 0 16px 0;color:#0075A0;font-size:17px;line-height:1.6;font-weight:bold;">Good job evaluation should assess the role — not the person.</p>
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">That sounds obvious, but it's one of the points where many grading systems begin to weaken. Over time, they often become:</p>
          <ul style="margin:12px 0 20px 0;padding-left:22px;color:#59595C;font-size:16px;line-height:1.6;">
            <li style="margin:0 0 8px 0;padding:0;">overly dependent on job descriptions</li>
            <li style="margin:0 0 8px 0;padding:0;">difficult to explain clearly</li>
            <li style="margin:0 0 8px 0;padding:0;">harder to maintain as roles evolve</li>
            <li style="margin:0 0 8px 0;padding:0;">increasingly reliant on specialist interpretation</li>
          </ul>
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">That's why many organisations start revisiting job evaluation only after the framework has already become harder to trust.</p>
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Over the next few days, we'll share a few short ideas on why this happens, what organisations are doing differently, and what a more modern approach can look like in practice.</p>
          <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Regards,<br><strong>Engage Job Evaluation team</strong> &middot; APAG</p>
        `
        ),
      }),
    });
    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("Resend error:", resendRes.status, detail);
      return { statusCode: 502, body: JSON.stringify({ error: "Email failed to send." }) };
    }

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

function wrapEmail(previewText, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Engage</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7f9;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
           style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8ec;border-radius:10px;overflow:hidden;">
      <tr><td style="background-color:#0075A0;padding:22px 32px;">
        <span style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:.3px;">Engage</span><span style="font-family:Helvetica,Arial,sans-serif;font-size:20px;color:#cfe7f0;"> Job Evaluation</span>
      </td></tr>
      <tr><td style="height:4px;background-color:#1FA049;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:22px 32px;background-color:#f4f7f9;border-top:1px solid #e2e8ec;">
        <p style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a9299;line-height:1.5;">Engage Job Evaluation is a methodology by Africa People Advisory Group (APAG).</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#a7adb2;line-height:1.5;">
          You are receiving this because you requested information from Engage.
          <a href="mailto:info@workinflow.co.za?subject=Unsubscribe" style="color:#8a9299;text-decoration:underline;">Unsubscribe</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href, label) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
      <tr><td align="center" bgcolor="#0075A0" style="border-radius:6px;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${label}</a>
      </td></tr>
    </table>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
