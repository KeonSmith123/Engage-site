// Calendly integration. Needs CALENDLY_TOKEN (Calendly > Integrations > API & Webhooks > personal access token).
// Optional CALENDLY_EVENT_FILTER: only events whose name contains this text (e.g. "demo").
const API = "https://api.calendly.com";

export const configured = () => Boolean(process.env.CALENDLY_TOKEN);

async function cal(url) {
  const r = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Calendly ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function listBookings({ from, to }) {
  const me = await cal("/users/me");
  const params = new URLSearchParams({
    user: me.resource.uri,
    min_start_time: from,
    status: "active",
    sort: "start_time:asc",
    count: "100",
  });
  if (to) params.set("max_start_time", to);
  const events = (await cal(`/scheduled_events?${params}`)).collection || [];

  const filter = (process.env.CALENDLY_EVENT_FILTER || "").toLowerCase();
  const wanted = filter ? events.filter((e) => (e.name || "").toLowerCase().includes(filter)) : events;

  return Promise.all(
    wanted.map(async (e) => {
      const invitee = ((await cal(`${e.uri}/invitees`)).collection || [])[0] || {};
      return {
        id: `calendly-${e.uri.split("/").pop()}`,
        provider: "calendly",
        title: e.name || "Meeting",
        start: e.start_time,
        end: e.end_time,
        status: e.status || "active",
        name: invitee.name || "",
        email: (invitee.email || "").toLowerCase(),
        company: "",
      };
    })
  );
}
