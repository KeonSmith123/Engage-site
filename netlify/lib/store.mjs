// Lead storage: one interface, two backends.
//   Supabase  → set SUPABASE_URL + SUPABASE_SERVICE_KEY
//   Neon / Netlify DB → set NETLIFY_DATABASE_URL (Netlify sets this for Netlify DB) or DATABASE_URL
// Functions and the dashboard call getStore() and never care which one is behind it.
//
// Every row that leaves this file goes through normalizeLead(), so a table with
// slightly different column names (e.g. an older site) still reads correctly.

const TABLE = /^[a-z_][a-z0-9_]*$/i.test(process.env.LEADS_TABLE || "") ? process.env.LEADS_TABLE : "leads";
const STATUSES = ["new", "contacted", "qualified", "won", "lost"];

export const dbEnabled = () => Boolean(supabaseConfigured() || neonUrl());

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}
function neonUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";
}

export function getStore() {
  if (supabaseConfigured()) return supabaseStore;
  if (neonUrl()) return neonStore;
  return null;
}

// ---------------------------------------------------------------------------
// Normalising rows from any schema into the standard lead shape
// ---------------------------------------------------------------------------
const pick = (r, ...keys) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return null;
};

function normalizeType(raw, hasGuide) {
  const t = String(raw || "").toLowerCase();
  if (/demo|book|meeting/.test(t)) return "demo";
  if (/contact|message|enquir/.test(t)) return "contact";
  if (/guide|download|asset|insight|resource/.test(t) || hasGuide) return "guide";
  return t || "other";
}

export function normalizeLead(r) {
  let first = pick(r, "first_name", "firstName", "firstname");
  let last = pick(r, "last_name", "lastName", "lastname");
  const full = pick(r, "name", "full_name", "fullName");
  if (!first && full) {
    const parts = String(full).trim().split(/\s+/);
    first = parts.shift();
    last = last || parts.join(" ") || null;
  }
  const guide = pick(r, "guide_slug", "guide", "asset", "asset_slug", "resource", "guide_title");
  const created = pick(r, "created_at", "createdAt", "created", "submitted_at", "timestamp", "inserted_at");
  const status = String(pick(r, "status", "stage") || "new").toLowerCase();

  return {
    id: String(pick(r, "id", "lead_id", "uuid")),
    created_at: created ? new Date(created).toISOString() : null,
    type: normalizeType(pick(r, "type", "lead_type", "kind", "form", "source"), Boolean(guide)),
    first_name: first || "",
    last_name: last || "",
    email: String(pick(r, "email", "email_address") || "").toLowerCase(),
    company: pick(r, "company", "organisation", "organization", "company_name") || "",
    guide_slug: guide || "",
    message: pick(r, "message", "comments") || "",
    source_page: pick(r, "source_page", "page", "referrer", "referer") || "",
    status: STATUSES.includes(status) ? status : "new",
    notes: pick(r, "notes") || "",
    followup_sent_at: pick(r, "followup_sent_at", "day5_sent_at", "followup_at", "email2_sent_at"),
    recaptcha_score: pick(r, "recaptcha_score", "score"),
  };
}

function cleanPatch(patch) {
  const out = {};
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw new Error("Invalid status");
    out.status = patch.status;
  }
  if (patch.notes !== undefined) out.notes = String(patch.notes).slice(0, 10000);
  if (patch.followup_sent_at !== undefined) out.followup_sent_at = patch.followup_sent_at;
  if (!Object.keys(out).length) throw new Error("Nothing to update");
  return out;
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST over fetch, no client library)
// ---------------------------------------------------------------------------
async function sb(path, { method = "GET", body, prefer } = {}) {
  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const supabaseStore = {
  name: "supabase",
  async insert(row) {
    const rows = await sb(TABLE, { method: "POST", body: row, prefer: "return=representation" });
    return rows && normalizeLead(rows[0]);
  },
  async list({ since } = {}) {
    const q = ["select=*", "order=created_at.desc", "limit=5000"];
    if (since) q.push(`created_at=gte.${since}`);
    return ((await sb(`${TABLE}?${q.join("&")}`)) || []).map(normalizeLead);
  },
  async dueFollowups(from, to) {
    const q = [
      "select=*", "followup_sent_at=is.null", "unsubscribed=is.false", "type=in.(guide,demo)",
      `and=(created_at.gte.${from},created_at.lte.${to})`, "order=created_at.asc", "limit=200",
    ].join("&");
    return ((await sb(`${TABLE}?${q}`)) || []).map(normalizeLead);
  },
  async update(id, patch) {
    const rows = await sb(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: cleanPatch(patch), prefer: "return=representation" });
    return rows && rows[0] ? normalizeLead(rows[0]) : null;
  },
};

// ---------------------------------------------------------------------------
// Neon / Netlify DB (serverless Postgres driver over HTTPS)
// ---------------------------------------------------------------------------
let _sql;
async function sql() {
  if (!_sql) {
    const { neon } = await import("@neondatabase/serverless");
    _sql = neon(neonUrl());
  }
  return _sql;
}

const neonStore = {
  name: "neon",
  async insert(row) {
    const cols = Object.keys(row);
    const db = await sql();
    const rows = await db.query(
      `insert into ${TABLE} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
      cols.map((c) => row[c])
    );
    return rows[0] && normalizeLead(rows[0]);
  },
  async list({ since } = {}) {
    const db = await sql();
    const rows = since
      ? await db.query(`select * from ${TABLE} where created_at >= $1 order by created_at desc limit 5000`, [since])
      : await db.query(`select * from ${TABLE} order by created_at desc limit 5000`);
    return rows.map(normalizeLead);
  },
  async dueFollowups(from, to) {
    const db = await sql();
    const rows = await db.query(
      `select * from ${TABLE}
        where followup_sent_at is null and coalesce(unsubscribed, false) = false
          and type in ('guide', 'demo') and created_at between $1 and $2
        order by created_at asc limit 200`,
      [from, to]
    );
    return rows.map(normalizeLead);
  },
  async update(id, patch) {
    const p = cleanPatch(patch);
    const cols = Object.keys(p);
    const db = await sql();
    const rows = await db.query(
      `update ${TABLE} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")} where id::text = $${cols.length + 1} returning *`,
      [...cols.map((c) => p[c]), String(id)]
    );
    return rows[0] ? normalizeLead(rows[0]) : null;
  },
};
