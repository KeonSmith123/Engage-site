// HubSpot integration. Needs HUBSPOT_TOKEN: a private app access token with
// read access to contacts and meetings (and write access to contacts for the lead hook).
const API = "https://api.hubapi.com";

export const configured = () => Boolean(process.env.HUBSPOT_TOKEN);

async function hs(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`HubSpot ${r.status}: ${await r.text()}`);
  return r.json();
}

// Meetings starting on or after `from`, with the first associated contact's details.
// Read-only: nothing is written back to HubSpot from here.
export async function listBookings({ from }) {
  const search = await hs("/crm/v3/objects/meetings/search", {
    filterGroups: [{ filters: [{ propertyName: "hs_meeting_start_time", operator: "GTE", value: String(Date.parse(from)) }] }],
    properties: ["hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time", "hs_meeting_outcome"],
    sorts: [{ propertyName: "hs_meeting_start_time", direction: "ASCENDING" }],
    limit: 100,
  });
  const meetings = search.results || [];
  if (!meetings.length) return [];

  const assoc = await hs("/crm/v4/associations/meetings/contacts/batch/read", {
    inputs: meetings.map((m) => ({ id: m.id })),
  });
  const contactOf = {};
  for (const a of assoc.results || []) {
    const to = a.to && a.to[0];
    if (to) contactOf[a.from.id] = String(to.toObjectId);
  }

  const ids = [...new Set(Object.values(contactOf))];
  const contacts = {};
  if (ids.length) {
    const read = await hs("/crm/v3/objects/contacts/batch/read", {
      properties: ["email", "firstname", "lastname", "company"],
      inputs: ids.map((id) => ({ id })),
    });
    for (const c of read.results || []) contacts[c.id] = c.properties || {};
  }

  return meetings.map((m) => {
    const p = m.properties || {};
    const c = contacts[contactOf[m.id]] || {};
    return {
      id: `hubspot-${m.id}`,
      provider: "hubspot",
      title: p.hs_meeting_title || "Meeting",
      start: p.hs_meeting_start_time ? new Date(p.hs_meeting_start_time).toISOString() : null,
      end: p.hs_meeting_end_time ? new Date(p.hs_meeting_end_time).toISOString() : null,
      status: (p.hs_meeting_outcome || "scheduled").toLowerCase(),
      name: [c.firstname, c.lastname].filter(Boolean).join(" "),
      email: (c.email || "").toLowerCase(),
      company: c.company || "",
    };
  });
}

// Lead hook: create or update the contact in HubSpot, keyed by email.
export async function upsertContact(lead) {
  await hs("/crm/v3/objects/contacts/batch/upsert", {
    inputs: [{
      idProperty: "email",
      id: lead.email,
      properties: { email: lead.email, firstname: lead.first_name || "", lastname: lead.last_name || "", company: lead.company || "" },
    }],
  });
}
