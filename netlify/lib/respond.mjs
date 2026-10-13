// Small helpers shared by every function.

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function readBody(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export const clean = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const isEmail = (v) =>
  typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

// The site's own base URL. Netlify sets URL; SITE_URL overrides it.
export const siteUrl = (req) =>
  (process.env.SITE_URL || process.env.URL || (req ? new URL(req.url).origin : "")).replace(/\/$/, "");

// Guides published by the build (src/guides-index.njk). Emails only ever link to these.
export async function getGuides(base) {
  try {
    const r = await fetch(`${base}/guides-index.json`);
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}
