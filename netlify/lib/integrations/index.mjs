// Integration registry. Nothing about a client's tools is hard-coded in the functions:
//
//   Booking calendar   site.json → booking.provider: "hubspot" | "calendly" | "iframe" | "link" | "none"
//                      The dashboard's bookings panel reads from the same provider when its token is set.
//   Lead hooks         LEAD_HOOKS env var, comma-separated: "hubspot", "webhook" (or empty for none).
//                      Each new lead is passed to every hook listed. A failing hook never blocks the visitor.
//
// To add a provider: write a module with configured() + listBookings() and/or a hook function,
// then register it below. No other file changes.
import site from "../../../src/_data/site.json" with { type: "json" };
import * as hubspot from "./hubspot.mjs";
import * as calendly from "./calendly.mjs";
import * as webhook from "./webhook.mjs";

const BOOKING_SOURCES = {
  hubspot: { label: "HubSpot", tokenVar: "HUBSPOT_TOKEN", configured: hubspot.configured, listBookings: hubspot.listBookings },
  calendly: { label: "Calendly", tokenVar: "CALENDLY_TOKEN", configured: calendly.configured, listBookings: calendly.listBookings },
};

const LEAD_HOOKS = {
  hubspot: { configured: hubspot.configured, run: hubspot.upsertContact },
  webhook: { configured: webhook.configured, run: webhook.sendLead },
};

// What the dashboard should show about bookings for this site.
export function bookingSource() {
  const provider = (site.features && site.features.booking && site.booking && site.booking.provider) || "none";
  const src = BOOKING_SOURCES[provider];
  if (!src) return { provider, label: null, connected: false, supported: false };
  return { provider, label: src.label, connected: src.configured(), supported: true, tokenVar: src.tokenVar, list: src.listBookings };
}

export async function runLeadHooks(lead) {
  const names = (process.env.LEAD_HOOKS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  await Promise.all(
    names.map(async (name) => {
      const hook = LEAD_HOOKS[name];
      if (!hook) return console.warn(`Unknown lead hook "${name}"`);
      if (!hook.configured()) return console.warn(`Lead hook "${name}" listed but not configured`);
      try {
        await hook.run(lead);
      } catch (err) {
        console.error(`Lead hook "${name}" failed`, err);
      }
    })
  );
}
