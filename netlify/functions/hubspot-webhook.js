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

  // --- 1. Verify the request actually came from HubSpot (v3 signature) ---
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

  // --- 2. Parse the event batch ---
  let events;
  try {
    events = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const sql = neon();

  for (const evt of events) {
    if (evt.subscriptionType !== "contact.propertyChange") continue;
    if (evt.propertyName !== "engagements_last_meeting_booked") continue;

    const contactId = evt.objectId;
    if (!contactId) continue;

    try {
      // --- 3. Fetch the contact's name/email ---
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

      // --- 4. Fetch their most recent meeting engagement ---
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

      // --- 5. Upsert the lead row ---
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

      // --- 6. Send the confirmation email (best-effort) ---
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
              html: `
                <p>Hi ${escapeHtml(name)},</p>
                <p>Thanks for booking a session with Engage — we're looking forward to it.</p>
                <p>We'll be in touch shortly before your session with a few things to help you get the most out of it.</p>
                <p>— The Engage team</p>
              `,
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
