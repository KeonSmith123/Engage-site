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

function footer() {
  return `
    <p style="margin:24px 0 0 0;color:#8a9299;font-size:12px;">
      Engage Job Evaluation is a methodology by Africa People Advisory Group (APAG).
    </p>`;
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
      `
        <p>Hi ${escapeHtml(lead.name)},</p>
        <p>If the guide raised questions about how this would apply in your organisation, the most useful next step is usually a practical one.</p>
        <p>The easiest way to understand whether a job evaluation approach works isn't only to read about it — it's to see it applied to your own roles.</p>
        <p>In a short Engage working session, we can evaluate a sample of your roles live, apply a structured methodology in real time, explain how each judgment is reached, and show how the outputs translate into grading.</p>
        <p><a href="${CALENDAR_LINK}" style="color:#0075A0;font-weight:bold;">Book a working session</a></p>
        <p>Regards,<br>The Engage Job Evaluation team &middot; APAG</p>
        ${footer()}
      `
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
      "This is where Engage feels different",
      `
        <p>Hi ${escapeHtml(lead.name)},</p>
        <p>Ahead of your session, here's a quick sense of what to expect.</p>
        <p>Many job evaluation approaches rely heavily on static job descriptions, complex scoring structures, and specialist interpretation that's hard for others to follow. Engage is designed to work differently — the emphasis is on direct role understanding, structured judgement, transparent logic, practical application, and internal usability over time.</p>
        <p style="color:#0075A0;font-weight:bold;">Most importantly, you'll be able to see exactly how decisions are being made.</p>
        <p>During the session, we'll apply the approach to your roles so the discussion stays practical and relevant to your organisation.</p>
        <p>See you soon.</p>
        <p>Regards,<br>The Engage Job Evaluation team &middot; APAG</p>
        ${footer()}
      `
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
      `
        <p>Hi ${escapeHtml(lead.name)},</p>
        <p>Thank you again for the session. It was useful to work through your roles and see the context more clearly.</p>
        <p>What you saw in the session is exactly how the methodology would be applied at broader scale across the organisation. From here, the most practical next step is usually one of the following:</p>
        <p><strong style="color:#0075A0;">Licence-only model</strong><br>For organisations that want to build internal ownership and apply the methodology themselves.</p>
        <p><strong style="color:#0075A0;">Implementation + transition model</strong><br>For organisations that want support with evaluation, rollout, and internal transition.</p>
        <p><strong style="color:#0075A0;">Hybrid approach</strong><br>For organisations that want initial support, followed by internal adoption over time.</p>
        <p>If you'd like to explore which route makes most sense, we can schedule a follow-up discussion.</p>
        <p><a href="${CALENDAR_LINK}" style="color:#0075A0;font-weight:bold;">Book a follow-up call</a></p>
        <p>Regards,<br>The Engage Job Evaluation team &middot; APAG</p>
        ${footer()}
      `
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
      `
        <p>Hi ${escapeHtml(lead.name)},</p>
        <p>I wanted to follow up on the Engage session, in case it's been difficult to come back to.</p>
        <p>In many cases, these discussions sit alongside broader questions around grading consistency, reward alignment, restructuring, internal governance, and role clarity across the organisation.</p>
        <p>If this is still something you're reviewing, we'd be very happy to continue the conversation and look at the most practical next step for your environment. If the timing isn't right, that's absolutely fine as well.</p>
        <p><a href="${CALENDAR_LINK}" style="color:#0075A0;font-weight:bold;">Book a follow-up conversation</a></p>
        <p>Regards,<br>The Engage Job Evaluation team &middot; APAG</p>
        ${footer()}
      `
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
