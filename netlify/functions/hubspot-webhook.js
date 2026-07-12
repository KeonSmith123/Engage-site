// Netlify Function: hubspot-webhook
// Receives a HubSpot Private App webhook whenever a contact's
// "engagements_last_meeting_booked" property changes (i.e. they booked
// via the Meetings tool). Looks up the contact + their most recent
// meeting, logs a lead row, and sends the demo confirmation email.
const crypto = require("crypto");
const { neon } = require("@netlify/neon");

const HUBSPOT_APP_SECRET = process.env.HUBSPOT_APP_SECRET;
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const signature = event.headers["x-hubspot-signature-v3"];
  const timestamp = event.headers["x-hubspot-request-timestamp"];
  const rawBody = event.body || "";

  if (!signature || !timestamp) {
    console.error("Missing HubSpot signature headers");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > 5 * 60 * 1000 || age < -5 * 60 * 1000) {
    console.error("HubSpot webhook timestamp outside tolerance window");
    return { statusCode: 401, body: "Unauthorized" };
  }

  const host = event.headers["x-forwarded-host"] || event.headers.host;
  const requestUri = `https://${host}${event.path}`;
  const signedString = `POST${requestUri}${rawBody}${timestamp}`;
  const expectedSignature = crypto
    .createHmac("sha256", HUBSPOT_APP_SECRET)
    .update(signedString, "utf8")
    .digest("base64");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  const validSignature =
    sigBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(sigBuffer, expectedBuffer);

  if (!validSignature) {
    console.error("HubSpot webhook signature mismatch");
    return { statusCode: 401, body: "Unauthorized" };
  }

  let events;
  try {
    events = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const sql = neon();
  const siteUrl = process.env.URL || "https://engage.africapeopleadvisory.com";
  const calendarLink = `${siteUrl}/book-demo/`;

  for (const evt of events) {
    if (evt.subscriptionType !== "contact.propertyChange") continue;
    if (evt.propertyName !== "engagements_last_meeting_booked") continue;

    const contactId = evt.objectId;
    if (!contactId) continue;

    try {
      const contactRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname`,
        { headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` } }
      );
      if (!contactRes.ok) {
        console.error("Failed to fetch HubSpot contact:", await contactRes.text());
        continue;
      }
      const contact = await contactRes.json();
      const email = contact.properties.email;
      const name =
        [contact.properties.firstname, contact.properties.lastname]
          .filter(Boolean)
          .join(" ") || "there";

      if (!email) {
        console.error("Contact has no email, skipping:", contactId);
        continue;
      }

      let meetingTime = null;
      const assocRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/meetings`,
        { headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` } }
      );
      if (assocRes.ok) {
        const assoc = await assocRes.json();
        const meetingId = assoc.results && assoc.results[0] && assoc.results[0].id;
        if (meetingId) {
          const meetingRes = await fetch(
            `https://api.hubapi.com/crm/v3/objects/meetings/${meetingId}?properties=hs_meeting_start_time`,
            { headers: { Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}` } }
          );
          if (meetingRes.ok) {
            const meeting = await meetingRes.json();
            meetingTime = meeting.properties.hs_meeting_start_time || null;
          }
        }
      }

      const existing = await sql`
        SELECT id FROM leads WHERE email = ${email} AND source = 'demo'
        ORDER BY created_at DESC LIMIT 1
      `;

      if (existing.length > 0) {
        await sql`
          UPDATE leads
          SET meeting_time = ${meetingTime}, name = ${name}
          WHERE id = ${existing[0].id}
        `;
      } else {
        await sql`
          INSERT INTO leads (email, name, source, meeting_time)
          VALUES (${email}, ${name}, 'demo', ${meetingTime})
        `;
      }

      if (RESEND_API_KEY) {
        const already = await sql`
          SELECT email1_sent_at FROM leads
          WHERE email = ${email} AND source = 'demo'
          ORDER BY created_at DESC LIMIT 1
        `;
        if (!already[0] || !already[0].email1_sent_at) {
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `Engage Job Evaluation <${FROM_EMAIL}>`,
              to: [process.env.RESEND_TO_OVERRIDE || email],
              subject: "Your Engage session is confirmed",
              html: wrapEmail(
                "A quick note on what to expect and how to prepare",
                `
                <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Your <strong>Engage Job Evaluation</strong> session is confirmed. Thank you for booking time with us.</p>
                <p style="margin:0 0 16px 0;color:#0075A0;font-size:17px;line-height:1.6;font-weight:bold;">This will be a working session, not a standard presentation.</p>
                <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">In the session, we will:</p>
                <ul style="margin:12px 0 20px 0;padding-left:22px;color:#59595C;font-size:16px;line-height:1.6;">
                  <li style="margin:0 0 8px 0;padding:0;">evaluate a sample of your roles live</li>
                  <li style="margin:0 0 8px 0;padding:0;">apply the methodology in real time</li>
                  <li style="margin:0 0 8px 0;padding:0;">explain how decisions are reached</li>
                  <li style="margin:0 0 8px 0;padding:0;">show how the outputs translate into grading</li>
                </ul>
                <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">To get the most value from the discussion, it would help to have the following available:</p>
                <ul style="margin:12px 0 20px 0;padding-left:22px;color:#59595C;font-size:16px;line-height:1.6;">
                  <li style="margin:0 0 8px 0;padding:0;">5–10 role titles</li>
                  <li style="margin:0 0 8px 0;padding:0;">a basic reporting structure</li>
                  <li style="margin:0 0 8px 0;padding:0;">any current grading information, if available</li>
                  <li style="margin:0 0 8px 0;padding:0;">any specific grading or reward concerns you want to explore</li>
                </ul>
                ${button(calendarLink, "View your booking")}
                <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Looking forward to the discussion.</p>
                <p style="margin:0 0 16px 0;color:#59595C;font-size:16px;line-height:1.6;">Regards,<br><strong>Engage Job Evaluation team</strong> &middot; APAG</p>
              `
              ),
            }),
          });
          if (resendRes.ok) {
            await sql`
              UPDATE leads SET email1_sent_at = now()
              WHERE email = ${email} AND source = 'demo'
            `;
          } else {
            console.error("Resend error (demo confirmation):", await resendRes.text());
          }
        }
      }
    } catch (err) {
      console.error("Error processing HubSpot webhook event:", err.message, err.stack);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
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
