// /.netlify/functions/dash-auth: dashboard sign-in.
//
// Two methods, either or both:
//   Email code  approved addresses in DASHBOARD_EMAILS get a one-time code by email (needs the email module).
//   Password    DASHBOARD_PASSWORD, a shared fallback for clients without email set up.
// Sessions are signed cookies (DASHBOARD_SECRET), valid for 12 hours. No user table needed.
import crypto from "node:crypto";
import site from "../../src/_data/site.json" with { type: "json" };
import { json, readBody, clean } from "../lib/respond.mjs";
import { emailEnabled, sendEmail, wrapEmail } from "../lib/email.mjs";
import { sign, verify, hashCode, readCookie, cookie, currentUser, allowedEmails, SESSION, CHALLENGE } from "../lib/session.mjs";

const CODE_MINUTES = 10;
const SESSION_HOURS = 12;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

const methods = () => ({
  code: emailEnabled() && allowedEmails().length > 0,
  password: Boolean(process.env.DASHBOARD_PASSWORD),
});

function newCode() {
  let c = "";
  for (let i = 0; i < 8; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

function withCookies(res, ...cookies) {
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

export default async (req) => {
  if (!site.features.dashboard) return json(404, { ok: false, error: "Not found" });
  if (!process.env.DASHBOARD_SECRET) return json(503, { ok: false, error: "Dashboard isn't set up yet (DASHBOARD_SECRET missing)." });

  if (req.method === "GET") {
    const email = currentUser(req);
    return json(200, { ok: true, authed: Boolean(email), email, methods: methods(), siteName: site.name });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const b = (await readBody(req)) || {};
  const action = b.action;

  if (action === "logout") {
    return withCookies(json(200, { ok: true, authed: false }), cookie(SESSION, "", 0), cookie(CHALLENGE, "", 0));
  }

  if (action === "request") {
    const email = clean(b.email, 254).toLowerCase();
    // Same answer whether or not the address is approved, so the list can't be probed.
    const res = json(200, { ok: true, sent: true });
    if (!methods().code || !allowedEmails().includes(email)) return res;

    const code = newCode();
    const challenge = sign({ kind: "challenge", email, h: hashCode(email, code.replace("-", "")), exp: Date.now() + CODE_MINUTES * 60e3 });
    try {
      await sendEmail({
        to: email,
        subject: `${site.name} dashboard sign-in code: ${code}`,
        html: wrapEmail({
          heading: "Your sign-in code",
          paragraphs: [
            `Use this code to open the ${site.name} leads dashboard:`,
            `<strong style="font-size:24px;letter-spacing:3px">${code}</strong>`,
            `It expires in ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
          ],
          signoff: "WorkInFlow",
        }),
        text: `Your ${site.name} dashboard sign-in code: ${code}\nIt expires in ${CODE_MINUTES} minutes.`,
      });
    } catch (err) {
      console.error("dashboard code email failed", err);
      return json(500, { ok: false, error: "We couldn't send the code. Try again in a minute." });
    }
    return withCookies(res, cookie(CHALLENGE, challenge, CODE_MINUTES * 60));
  }

  if (action === "verify") {
    const ch = verify(readCookie(req, CHALLENGE));
    const code = clean(b.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!ch || ch.kind !== "challenge") return json(400, { ok: false, error: "That code has expired. Ask for a new one." });
    if (hashCode(ch.email, code) !== ch.h) return json(400, { ok: false, error: "That code doesn't match. Check the email and try again." });
    const token = sign({ kind: "session", email: ch.email, exp: Date.now() + SESSION_HOURS * 3600e3 });
    return withCookies(json(200, { ok: true, authed: true, email: ch.email }), cookie(SESSION, token, SESSION_HOURS * 3600), cookie(CHALLENGE, "", 0));
  }

  if (action === "password") {
    const expected = process.env.DASHBOARD_PASSWORD || "";
    const given = String(b.password || "");
    const ok = expected && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return json(401, { ok: false, error: "That password isn't right." });
    }
    const who = clean(b.email, 254).toLowerCase() || "team";
    const token = sign({ kind: "session", email: who, exp: Date.now() + SESSION_HOURS * 3600e3 });
    return withCookies(json(200, { ok: true, authed: true, email: who }), cookie(SESSION, token, SESSION_HOURS * 3600));
  }

  return json(400, { ok: false, error: "Unknown action" });
};
