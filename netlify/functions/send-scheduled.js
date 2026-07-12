// Netlify Scheduled Function: send-scheduled
// Runs daily. Checks the leads table for anyone due a delayed email and
// sends it via Resend, stamping the matching emailN_sent_at column so
// nothing goes out twice.
const { neon } = require("@netlify/neon");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const SITE_URL = process.env.URL || "https://engage.africapeopleadvisory.com";
const CALENDAR_LINK = `${SITE_URL}/book-demo/`;

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Engage Job Evaluation <${FROM_EMAIL}>`,
      to: [process.env.RESEND_TO_OVERRIDE || to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error(`Resend error sending "${subject}" to ${to}:`, await res.text());
    return false;
  }
  return true;
}

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

exports.config = { schedule: "@daily" };

exports.handler = async () => {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set, skipping scheduled send.");
    return { statusCode: 200 };
  }

  const sql = neon();
  let sentCount = 0;

  // --- Workflow 1, Email 2: guide leads, 5+ days after email 1 ---
  const guideFollowUps = await sql`
    SELECT id, email, name, guide_slug FROM leads
    WHERE source = 'guide'
      AND email1_sent_at IS NOT NULL
      AND email2_sent_at IS NULL
      AND email1_sent_at <= now() - interval '5 days'
  `;
  for (const lead of guideFollowUps) {
    const ok = await sendEmail(
      lead.email,
      "Let's apply this to your roles",
      wrapEmail(
        "The fastest way to assess fit is to see the approach in practice",
        `
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Hi ${escapeHtml(lead.name)},</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">If the guide raised questions about how this would apply in your organisation, the most useful next step is usually a practical one.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">The easiest way to understand whether a job evaluation approach works isn't only to read about it — it's to see it applied to your own roles.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">In a short Engage working session, we can:</p>
        <ul style="margin:12px 0 20px 0;padding-left:22px;color:#59595C;font-size:16px;line-height:1.6;">
          <li style="margin:0 0 8px 0;padding:0;">evaluate a sample of your roles live</li>
          <li style="margin:0 0 8px 0;padding:0;">apply a structured methodology in real time</li>
          <li style="margin:0 0 8px 0;padding:0;">explain how each judgment is reached</li>
          <li style="margin:0 0 8px 0;padding:0;">show how the outputs translate into grading</li>
        </ul>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">This isn't a generic presentation. It's a practical session designed to help you assess whether the approach is right for your organisation.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">You'll leave with real outputs, greater clarity on role size and comparison, a practical view of how the methodology works, and a better sense of whether it fits your environment.</p>
        ${button(CALENDAR_LINK, "Book a working session")}
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Regards,<br><strong>Engage Job Evaluation team</strong> &middot; APAG</p>
      `
      )
    );
    if (ok) {
      await sql`UPDATE leads SET email2_sent_at = now() WHERE id = ${lead.id}`;
      sentCount++;
    }
  }

  // --- Workflow 2, Email 2: demo leads, meeting 1-2 days away ---
  const preSession = await sql`
    SELECT id, email, name FROM leads
    WHERE source = 'demo'
      AND email2_sent_at IS NULL
      AND meeting_time IS NOT NULL
      AND meeting_time BETWEEN now() + interval '1 day' AND now() + interval '2 days'
  `;
  for (const lead of preSession) {
    const ok = await sendEmail(
      lead.email,
      "What you'll see in the session",
      wrapEmail(
        "This is where Engage feels different",
        `
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Hi ${escapeHtml(lead.name)},</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Ahead of your session, here's a quick sense of what to expect.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Many job evaluation approaches rely heavily on static job descriptions, complex scoring structures, and specialist interpretation that's hard for others to follow.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Engage is designed to work differently. The emphasis is on:</p>
        <ul style="margin:12px 0 20px 0;padding-left:22px;color:#59595C;font-size:16px;line-height:1.6;">
          <li style="margin:0 0 8px 0;padding:0;">direct role understanding</li>
          <li style="margin:0 0 8px 0;padding:0;">structured judgement</li>
          <li style="margin:0 0 8px 0;padding:0;">transparent logic</li>
          <li style="margin:0 0 8px 0;padding:0;">practical application</li>
          <li style="margin:0 0 8px 0;padding:0;">internal usability over time</li>
        </ul>
        <p style="margin:0 0 16px 0;color:#0075A0;font-size:17px;line-height:1.6;font-weight:bold;">Most importantly, you'll be able to see exactly how decisions are being made.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">That matters because transparency is one of the main things that builds trust in job evaluation. During the session, we'll apply the approach to your roles so the discussion stays practical and relevant to your organisation.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">See you soon.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Regards,<br><strong>Engage Job Evaluation team</strong> &middot; APAG</p>
      `
      )
    );
    if (ok) {
      await sql`UPDATE leads SET email2_sent_at = now() WHERE id = ${lead.id}`;
      sentCount++;
    }
  }

  // --- Workflow 2, Email 3: demo leads, meeting happened in the last 24hrs ---
  const postSession = await sql`
    SELECT id, email, name FROM leads
    WHERE source = 'demo'
      AND email3_sent_at IS NULL
      AND meeting_time IS NOT NULL
      AND meeting_time BETWEEN now() - interval '1 day' AND now()
  `;
  for (const lead of postSession) {
    const ok = await sendEmail(
      lead.email,
      "Your Engage session — next steps",
      wrapEmail(
        "A few observations and the most practical next move",
        `
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Hi ${escapeHtml(lead.name)},</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Thank you again for the session. It was useful to work through your roles and see the context more clearly.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">What you saw in the session is exactly how the methodology would be applied at broader scale across the organisation.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">From here, the most practical next step is usually one of the following:</p>
        <div style="margin:8px 0 4px 0;color:#0075A0;font-size:16px;font-weight:bold;">Licence-only model</div>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">For organisations that want to build internal ownership and apply the methodology themselves.</p>
        <div style="margin:8px 0 4px 0;color:#0075A0;font-size:16px;font-weight:bold;">Implementation + transition model</div>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">For organisations that want support with evaluation, rollout, and internal transition.</p>
        <div style="margin:8px 0 4px 0;color:#0075A0;font-size:16px;font-weight:bold;">Hybrid approach</div>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">For organisations that want initial support, followed by internal adoption over time.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">If you'd like to explore which route makes most sense for your organisation, we can schedule a follow-up discussion.</p>
        ${button(CALENDAR_LINK, "Book a follow-up call")}
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Regards,<br><strong>Engage Job Evaluation team</strong> &middot; APAG</p>
      `
      )
    );
    if (ok) {
      await sql`UPDATE leads SET email3_sent_at = now() WHERE id = ${lead.id}`;
      sentCount++;
    }
  }

  // --- Workflow 2, Email 4: 5+ days after email 3, unconditional ---
  const finalFollowUp = await sql`
    SELECT id, email, name FROM leads
    WHERE source = 'demo'
      AND email3_sent_at IS NOT NULL
      AND email4_sent_at IS NULL
      AND email3_sent_at <= now() - interval '5 days'
  `;
  for (const lead of finalFollowUp) {
    const ok = await sendEmail(
      lead.email,
      "Following up on your Engage session",
      wrapEmail(
        "Happy to continue the conversation if the timing is right",
        `
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Hi ${escapeHtml(lead.name)},</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">I wanted to follow up on the Engage session, in case it's been difficult to come back to.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">In many cases, these discussions sit alongside broader questions around:</p>
        <ul style="margin:12px 0 20px 0;padding-left:22px;color:#59595C;font-size:16px;line-height:1.6;">
          <li style="margin:0 0 8px 0;padding:0;">grading consistency</li>
          <li style="margin:0 0 8px 0;padding:0;">reward alignment</li>
          <li style="margin:0 0 8px 0;padding:0;">restructuring</li>
          <li style="margin:0 0 8px 0;padding:0;">internal governance</li>
          <li style="margin:0 0 8px 0;padding:0;">role clarity across the organisation</li>
        </ul>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">If this is still something you're reviewing, we'd be very happy to continue the conversation and look at the most practical next step for your environment. If the timing isn't right, that's absolutely fine as well.</p>
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">If useful, you can book a short follow-up conversation here:</p>
        ${button(CALENDAR_LINK, "Book a follow-up conversation")}
        <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Regards,<br><strong>Engage Job Evaluation team</strong> &middot; APAG</p>
      `
      )
    );
    if (ok) {
      await sql`UPDATE leads SET email4_sent_at = now() WHERE id = ${lead.id}`;
      sentCount++;
    }
  }

  console.log(`send-scheduled run complete. Emails sent: ${sentCount}`);
  return { statusCode: 200, body: JSON.stringify({ sent: sentCount }) };
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
