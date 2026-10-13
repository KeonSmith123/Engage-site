// Scheduled: runs once a day. Sends the day-5 follow-up to guide and demo leads
// created 5 to 12 days ago that haven't had one yet. Resend sends; this decides when.
import { siteUrl, getGuides } from "../lib/respond.mjs";
import { dbEnabled, getStore } from "../lib/store.mjs";
import { emailEnabled, buildEmail, sendEmail } from "../lib/email.mjs";

export const config = { schedule: "@daily" };

const DAY = 864e5;
const FOLLOWUP_AFTER_DAYS = 5;
const GIVE_UP_AFTER_DAYS = 12; // older leads are skipped, e.g. after the module was off for a while

export default async () => {
  if (!dbEnabled() || !emailEnabled()) {
    console.log("send-scheduled: skipped, leads or email module not configured");
    return new Response("skipped");
  }

  const now = Date.now();
  const to = new Date(now - FOLLOWUP_AFTER_DAYS * DAY).toISOString();
  const from = new Date(now - GIVE_UP_AFTER_DAYS * DAY).toISOString();
  const base = siteUrl();

  const store = getStore();
  const [leads, guides] = await Promise.all([store.dueFollowups(from, to), getGuides(base)]);
  let sent = 0;
  let failed = 0;

  for (const lead of leads || []) {
    const key = lead.type === "demo" ? "demoFollowup" : "guideFollowup";
    const guide = guides.find((g) => g.slug === lead.guide_slug);
    try {
      const msg = buildEmail(key, { firstName: lead.first_name, guideTitle: guide ? guide.title : "our guide" }, base);
      await sendEmail({ to: lead.email, ...msg });
      await store.update(lead.id, { followup_sent_at: new Date().toISOString() });
      sent++;
    } catch (err) {
      failed++;
      console.error(`follow-up failed for lead ${lead.id}`, err);
    }
  }

  console.log(`send-scheduled: ${sent} sent, ${failed} failed, ${(leads || []).length} due`);
  return new Response(`sent ${sent}`);
};
