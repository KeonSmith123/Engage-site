// Signed, stateless cookies for the dashboard login. No session table needed.
// DASHBOARD_SECRET signs everything; change it to log everyone out.
import crypto from "node:crypto";

const secret = () => {
  const s = process.env.DASHBOARD_SECRET;
  if (!s || s.length < 32) throw new Error("DASHBOARD_SECRET must be set (32+ characters)");
  return s;
};

const b64 = (s) => Buffer.from(s).toString("base64url");
const unb64 = (s) => Buffer.from(s, "base64url").toString();
const hmac = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

export function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = hmac(body);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(unb64(body));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const hashCode = (email, code) => hmac(`code:${email}:${code}`);

export function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function cookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export const SESSION = "wif_dash";
export const CHALLENGE = "wif_dash_code";

// Returns the signed-in email, or null.
export function currentUser(req) {
  const s = verify(readCookie(req, SESSION));
  return s && s.kind === "session" ? s.email : null;
}

export function allowedEmails() {
  return (process.env.DASHBOARD_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
