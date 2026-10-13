// Email through Resend's REST API. Copy lives in src/_data/emails.json (editable in the CMS).
import emails from "../../src/_data/emails.json" with { type: "json" };
import site from "../../src/_data/site.json" with { type: "json" };

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fill = (tpl, vars) => String(tpl ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");

const abs = (url, base) => {
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
};

// Shared layout for every email: table-based so it holds up in Outlook and Gmail.
export function wrapEmail({ heading, paragraphs, button, buttonUrl, signoff, base }) {
  const color = site.emailColor || "#0075a0";
  const logo = site.emailLogo
    ? `<img src="${esc(abs(site.emailLogo, base))}" alt="${esc(site.name)}" height="36" style="display:block;height:36px;border:0">`
    : `<strong style="font-size:18px;color:${color}">${esc(site.name)}</strong>`;
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join("");
  const cta = button && buttonUrl
    ? `<p style="margin:24px 0"><a href="${esc(buttonUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px">${esc(button)}</a></p>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f4f5f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1d1d1f">
<tr><td style="padding:28px 32px 8px">${logo}</td></tr>
<tr><td style="padding:8px 32px 28px">
<h1 style="font-size:22px;line-height:1.3;margin:12px 0 18px">${esc(heading)}</h1>
${body}${cta}
<p style="margin:24px 0 0">${esc(signoff)}</p>
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #e3e3e6;font-size:12px;color:#59595c">${esc(emails.disclaimer || "")}</td></tr>
</table>
</td></tr></table></body></html>`;
}

// Build { subject, html, text } from a template key in emails.json.
export function buildEmail(key, vars, base) {
  const t = emails[key];
  if (!t) throw new Error(`No email template "${key}"`);
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  const paragraphs = (t.body || []).map((p) => fill(esc(p), safe));
  const buttonUrl = vars.buttonUrl || abs(t.buttonUrl, base);
  const signoff = key.startsWith("demo") && process.env.DEMO_SIGNOFF_NAME ? process.env.DEMO_SIGNOFF_NAME : emails.signoff;

  const html = wrapEmail({ heading: fill(t.heading, vars), paragraphs, button: t.button, buttonUrl, signoff, base });
  const text = [
    fill(t.heading, vars),
    "",
    ...(t.body || []).map((p) => fill(p, vars)),
    "",
    buttonUrl ? `${t.button}: ${buttonUrl}` : "",
    "",
    signoff,
    "",
    emails.disclaimer || "",
  ].join("\n");

  return { subject: fill(t.subject, vars), html, text };
}

export async function sendEmail({ to, subject, html, text, replyTo }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo || process.env.EMAIL_REPLY_TO || undefined,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

// Internal notification to the client's team (NOTIFY_EMAIL, comma-separated).
export async function notifyTeam(subject, fields, replyTo) {
  const to = (process.env.NOTIFY_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length) return;
  const rows = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#59595c;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px"><p><strong>${esc(subject)}</strong></p><table>${rows}</table></div>`;
  const text = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  await sendEmail({ to, subject, html, text, replyTo });
}
