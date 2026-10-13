// Generic webhook: POSTs every new lead as JSON to LEAD_WEBHOOK_URL.
// Works with Zapier, Make, n8n, Pipedrive/Zoho/Salesforce intake URLs, or a client's own system,
// so a client's CRM never has to be hard-coded into the site.
// Optional LEAD_WEBHOOK_SECRET is sent as the X-Webhook-Secret header.

export const configured = () => Boolean(process.env.LEAD_WEBHOOK_URL);

export async function sendLead(lead) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.LEAD_WEBHOOK_SECRET) headers["X-Webhook-Secret"] = process.env.LEAD_WEBHOOK_SECRET;
  const r = await fetch(process.env.LEAD_WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ event: "lead.created", lead }),
  });
  if (!r.ok) throw new Error(`Webhook ${r.status}`);
}
