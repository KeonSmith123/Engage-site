// /.netlify/functions/dash-data: data for the leads dashboard (signed-in users only).
//   GET    → { leads, bookings, meta }   leads from the store (Supabase or Neon), bookings from the
//                                        booking provider if its token is set (read-only)
//   PATCH  → { id, status?, notes? }     update a lead's pipeline status or notes
import site from "../../src/_data/site.json" with { type: "json" };
import { json, readBody, clean, siteUrl, getGuides } from "../lib/respond.mjs";
import { dbEnabled, getStore } from "../lib/store.mjs";
import { bookingSource } from "../lib/integrations/index.mjs";
import { currentUser } from "../lib/session.mjs";

const DAY = 864e5;

export default async (req) => {
  if (!site.features.dashboard) return json(404, { ok: false, error: "Not found" });
  let user;
  try {
    user = currentUser(req);
  } catch (err) {
    return json(503, { ok: false, error: "Dashboard isn't set up yet." });
  }
  if (!user) return json(401, { ok: false, error: "Please sign in." });
  if (!dbEnabled()) return json(503, { ok: false, error: "No database is connected to this site yet." });

  const store = getStore();

  if (req.method === "PATCH") {
    const b = await readBody(req);
    if (!b || !b.id) return json(400, { ok: false, error: "Missing lead id." });
    const patch = {};
    if (b.status !== undefined) {
      patch.status = clean(b.status, 20);
      if (!["new", "contacted", "qualified", "won", "lost"].includes(patch.status)) return json(400, { ok: false, error: "Unknown status." });
    }
    if (b.notes !== undefined) patch.notes = typeof b.notes === "string" ? b.notes.slice(0, 10000) : "";
    try {
      const lead = await store.update(String(b.id), patch);
      if (!lead) return json(404, { ok: false, error: "Lead not found." });
      return json(200, { ok: true, lead });
    } catch (err) {
      console.error("lead update failed", err);
      const missingColumn = /column .* does not exist|could not find the .* column/i.test(String(err.message));
      return json(500, {
        ok: false,
        error: missingColumn
          ? "This database is missing the status/notes columns. Run the dashboard migration first."
          : "Couldn't save that change.",
      });
    }
  }

  if (req.method !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const [leads, guides] = await Promise.all([store.list(), getGuides(siteUrl(req))]);

  const src = bookingSource();
  const meta = {
    siteName: site.name,
    user,
    store: store.name,
    guides: Object.fromEntries(guides.map((g) => [g.slug, g.title])),
    booking: { provider: src.provider, label: src.label, supported: src.supported, connected: src.connected, tokenVar: src.tokenVar || null },
  };

  let bookings = [];
  if (src.connected) {
    try {
      const now = Date.now();
      bookings = await src.list({ from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 90 * DAY).toISOString() });
    } catch (err) {
      console.error("bookings fetch failed", err);
      meta.booking.error = `Couldn't reach ${src.label}. Check ${src.tokenVar}.`;
    }
  }

  return json(200, { ok: true, leads, bookings, meta });
};
