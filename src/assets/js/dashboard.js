/* ==========================================================================
   Leads dashboard (WorkInFlow starter).
   - Talks only to /.netlify/functions/dash-auth and dash-data (no database keys in the browser).
   - Add ?demo to the URL to see it with generated sample data (nothing is saved).
   - All text from the data goes in with textContent, never innerHTML.
   ========================================================================== */
(function () {
  "use strict";

  var app = document.getElementById("dash-app");
  if (!app) return;

  var DEMO = /[?&]demo(=|&|$)/.test(location.search) || window.WIF_DASH_DEMO === true;
  var API = { auth: "/.netlify/functions/dash-auth", data: "/.netlify/functions/dash-data" };
  var DAY = 864e5;
  var TYPES = [
    { key: "guide", label: "Guide downloads", short: "Guide download", color: "var(--s-guide)" },
    { key: "demo", label: "Demo requests", short: "Demo request", color: "var(--s-demo)" },
    { key: "contact", label: "Contact messages", short: "Contact message", color: "var(--s-contact)" },
  ];
  var TYPE = {};
  TYPES.forEach(function (t) { TYPE[t.key] = t; });
  var STATUSES = ["new", "contacted", "qualified", "won", "lost"];
  var RANGES = [
    { key: "7d", label: "7 days", days: 7 },
    { key: "30d", label: "30 days", days: 30 },
    { key: "90d", label: "90 days", days: 90 },
    { key: "12m", label: "12 months", days: 365 },
    { key: "all", label: "All time", days: null },
  ];

  var state = {
    leads: [], bookings: [], meta: {},
    range: "90d", type: "all", q: "",
    sort: { key: "created_at", dir: -1 },
    tab: "table", limit: 50, allBookings: false,
  };

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { add(el, x); });
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  var NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------- formatting ---------- */
  var fmtDate = function (iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  };
  var fmtShort = function (d) { return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }); };
  var fmtTime = function (iso) { return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }); };
  var fmtNum = function (n) { return Number(n).toLocaleString("en-ZA"); };
  var fullName = function (l) { return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email; };
  var typeOf = function (l) { return TYPE[l.type] ? l.type : "contact"; };
  var guideTitle = function (slug) {
    if (!slug) return "";
    var map = state.meta.guides || {};
    return map[slug] || slug.replace(/[-_]+/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); });
  };
  var details = function (l) {
    if (l.type === "guide") return guideTitle(l.guide_slug);
    if (l.type === "demo") return "Demo request";
    return l.message || "";
  };

  /* ---------- API ---------- */
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        j._status = r.status;
        return j;
      });
    });
  }

  function toast(msg) {
    var t = h("div", { class: "toast", role: "status", text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  /* ---------- boot ---------- */
  function boot() {
    if (DEMO) {
      document.querySelector("[data-demo-banner]").hidden = false;
      var d = demoData();
      state.leads = d.leads; state.bookings = d.bookings; state.meta = d.meta;
      showUser(d.meta.user);
      return render();
    }
    if (document.body.getAttribute("data-enabled") !== "true") {
      clear(app);
      return add(app, h("div", { class: "login" }, h("h1", { text: "Dashboard is switched off" }), h("p", { text: "Turn on features.dashboard in site.json to use it." })));
    }
    api("GET", API.auth).then(function (r) {
      if (r._status >= 500 || r.ok === false) return renderSetupError(r.error);
      if (r.authed) { showUser(r.email); load(); }
      else renderLogin(r.methods || {});
    }).catch(function () { renderSetupError("Couldn't reach the server."); });
  }

  function showUser(email) {
    var u = document.querySelector("[data-user]");
    u.hidden = false;
    document.querySelector("[data-user-email]").textContent = email || "";
  }

  function renderSetupError(msg) {
    clear(app);
    add(app, h("div", { class: "login" }, h("h1", { text: "Dashboard not available" }), h("p", { text: msg || "Something isn't set up yet." })));
  }

  document.querySelector("[data-logout]").addEventListener("click", function () {
    if (DEMO) { location.href = location.pathname; return; }
    api("POST", API.auth, { action: "logout" }).then(function () { location.reload(); });
  });

  /* ---------- login ---------- */
  function renderLogin(methods) {
    clear(app);
    var siteName = document.body.getAttribute("data-site-name");
    var box = h("div", { class: "login" }, h("h1", { text: siteName + " leads" }));
    add(app, box);

    if (!methods.code && !methods.password) {
      add(box, h("p", { text: "Sign-in isn't configured yet. Set DASHBOARD_EMAILS (with the email module on) or DASHBOARD_PASSWORD in Netlify." }));
      return;
    }
    var err = h("p", { class: "login-error", role: "alert", hidden: true });
    function fail(m) { err.textContent = m; err.hidden = false; }

    function codeStep(email) {
      clear(box);
      var input = h("input", { class: "dash-input code-input", name: "code", autocomplete: "one-time-code", required: true, maxlength: "9", placeholder: "ABCD-EFGH" });
      var btn = h("button", { class: "dash-btn", type: "submit", text: "Sign in" });
      add(box, [
        h("h1", { text: "Check your email" }),
        h("p", { text: "If " + email + " is on the approved list, a sign-in code is on its way. It expires in 10 minutes." }),
        h("form", { onsubmit: function (e) {
          e.preventDefault(); err.hidden = true; btn.disabled = true;
          api("POST", API.auth, { action: "verify", code: input.value }).then(function (r) {
            btn.disabled = false;
            if (r.ok && r.authed) { showUser(r.email); load(); } else fail(r.error || "That didn't work.");
          });
        } }, h("label", {}, "Code", input), err, btn),
        h("div", { class: "login-alt" }, h("button", { type: "button", text: "Use a different email", onclick: function () { renderLogin(methods); } })),
      ]);
      input.focus();
    }

    if (methods.code) {
      var email = h("input", { class: "dash-input", type: "email", name: "email", autocomplete: "email", required: true });
      var send = h("button", { class: "dash-btn", type: "submit", text: "Email me a sign-in code" });
      add(box, [
        h("p", { text: "Enter your work email and we'll send you a one-time code." }),
        h("form", { onsubmit: function (e) {
          e.preventDefault(); err.hidden = true; send.disabled = true;
          api("POST", API.auth, { action: "request", email: email.value }).then(function (r) {
            send.disabled = false;
            if (r.ok) codeStep(email.value); else fail(r.error || "Couldn't send the code.");
          });
        } }, h("label", {}, "Email", email), err, send),
      ]);
    }
    if (methods.password) {
      var pw = h("input", { class: "dash-input", type: "password", name: "password", autocomplete: "current-password", required: true });
      var go = h("button", { class: "dash-btn", type: "submit", text: "Sign in" });
      var pwForm = h("form", { onsubmit: function (e) {
        e.preventDefault(); err.hidden = true; go.disabled = true;
        api("POST", API.auth, { action: "password", password: pw.value }).then(function (r) {
          go.disabled = false;
          if (r.ok && r.authed) { showUser(r.email); load(); } else fail(r.error || "That didn't work.");
        });
      } }, h("label", {}, "Password", pw), methods.code ? null : err, go);
      if (methods.code) {
        pwForm.hidden = true;
        add(box, h("div", { class: "login-alt" }, h("button", { type: "button", text: "Sign in with the team password instead", onclick: function (e) { pwForm.hidden = false; e.target.parentNode.remove(); pw.focus(); } })));
        add(box, pwForm);
      } else {
        add(box, [h("p", { text: "Enter the dashboard password." }), pwForm]);
      }
    }
  }

  /* ---------- data ---------- */
  function load() {
    if (app.firstChild && app.querySelector(".kpis")) app.classList.add("stale");
    else { clear(app); add(app, h("p", { class: "dash-loading", text: "Loading leads…" })); }
    api("GET", API.data).then(function (r) {
      app.classList.remove("stale");
      if (r._status === 401) return api("GET", API.auth).then(function (a) { renderLogin(a.methods || {}); });
      if (!r.ok) return renderSetupError(r.error);
      state.leads = r.leads || []; state.bookings = r.bookings || []; state.meta = r.meta || {};
      render();
    });
  }

  function rangeBounds() {
    var now = Date.now();
    var rg = RANGES.filter(function (x) { return x.key === state.range; })[0];
    if (!rg.days) {
      var first = state.leads.reduce(function (m, l) { var t = Date.parse(l.created_at); return t < m ? t : m; }, now);
      return { from: first, to: now, prevFrom: null, days: Math.max(1, Math.ceil((now - first) / DAY)) };
    }
    return { from: now - rg.days * DAY, to: now, prevFrom: now - 2 * rg.days * DAY, days: rg.days };
  }

  function matchesSearch(l) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return [fullName(l), l.email, l.company, guideTitle(l.guide_slug), l.message, l.notes].join(" ").toLowerCase().indexOf(q) > -1;
  }
  function inWindow(l, from, to) {
    var t = Date.parse(l.created_at);
    return t >= from && t <= to;
  }
  function scoped(opts) {
    opts = opts || {};
    var b = rangeBounds();
    var from = opts.prev ? b.prevFrom : b.from, to = opts.prev ? b.from : b.to;
    return state.leads.filter(function (l) {
      return inWindow(l, from, to) && matchesSearch(l) && (opts.ignoreType || state.type === "all" || typeOf(l) === state.type);
    });
  }

  /* ---------- main render ---------- */
  function render() {
    clear(app);
    add(app, [filters(), kpis(), h("div", { class: "row row-2-1" }, trendCard(), h("div", { class: "row", style: "margin:0" }, topGuidesCard(), bookingsCard())), leadsSection()]);
  }

  function filters() {
    var seg = h("div", { class: "seg", role: "group", "aria-label": "Date range" });
    RANGES.forEach(function (r) {
      add(seg, h("button", { type: "button", "aria-pressed": String(state.range === r.key), text: r.label, onclick: function () { state.range = r.key; state.limit = 50; render(); } }));
    });
    var search = h("input", { class: "dash-input grow", type: "search", placeholder: "Search name, email, company, guide…", value: state.q, "aria-label": "Search leads" });
    var timer;
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = search.value.trim(); state.limit = 50;
        var pos = search.selectionStart; render();
        var again = app.querySelector('input[type="search"]'); again.focus(); again.setSelectionRange(pos, pos);
      }, 200);
    });
    return h("div", { class: "filters" }, seg, search,
      h("button", { class: "dash-btn dash-btn-quiet", type: "button", text: "Export CSV", onclick: exportCsv }),
      DEMO ? null : h("button", { class: "dash-btn dash-btn-quiet", type: "button", text: "Refresh", onclick: load }));
  }

  /* ---------- stat tiles (also the type filter) ---------- */
  function kpis() {
    var cur = scoped({ ignoreType: true }), prev = rangeBounds().prevFrom ? scoped({ ignoreType: true, prev: true }) : null;
    function count(list, type) { return list.filter(function (l) { return type === "all" || typeOf(l) === type; }).length; }
    function tile(key, label, color) {
      var n = count(cur, key);
      var deltaEl = null;
      if (prev) {
        var p = count(prev, key), diff = n - p;
        var txt = diff === 0 ? "No change vs previous " + rangeLabel() : (diff > 0 ? "▲ " : "▼ ") + fmtNum(Math.abs(diff)) + (p ? " (" + Math.round(Math.abs(diff) / p * 100) + "%)" : "") + " vs previous " + rangeLabel();
        deltaEl = h("p", { class: "kpi-delta " + (diff > 0 ? "up" : diff < 0 ? "down" : ""), text: txt });
      }
      var active = state.type === key;
      return h("button", {
        type: "button", class: "kpi", "aria-pressed": String(active),
        style: "text-align:left;cursor:pointer;" + (active ? "border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)" : ""),
        title: key === "all" ? "Show all lead types" : "Show only " + label.toLowerCase(),
        onclick: function () { state.type = key; state.limit = 50; render(); },
      }, h("p", { class: "kpi-label" }, color ? h("i", { class: "kpi-key", style: "background:" + color }) : null, label),
        h("p", { class: "kpi-value", text: fmtNum(n) }), deltaEl);
    }
    var open = state.leads.filter(function (l) { return ["new", "contacted", "qualified"].indexOf(l.status) > -1; });
    var fresh = open.filter(function (l) { return l.status === "new"; }).length;
    return h("div", { class: "kpis" },
      tile("all", "All leads"),
      TYPES.map(function (t) { return tile(t.key, t.label, t.color); }),
      h("div", { class: "kpi" }, h("p", { class: "kpi-label", text: "Open pipeline (all time)" }), h("p", { class: "kpi-value", text: fmtNum(open.length) }),
        h("p", { class: "kpi-delta", text: fmtNum(fresh) + " not yet contacted" })));
  }
  function periodText() { return state.range === "all" ? "All time" : "Last " + rangeLabel().toLowerCase(); }
  function rangeLabel() {
    var r = RANGES.filter(function (x) { return x.key === state.range; })[0];
    return r.key === "12m" ? "12 months" : r.label;
  }

  /* ---------- trend chart: stacked columns by type ---------- */
  function buckets() {
    var b = rangeBounds(), unit = b.days <= 31 ? "day" : b.days <= 120 ? "week" : "month";
    function start(t) {
      var d = new Date(t); d.setHours(0, 0, 0, 0);
      if (unit === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      if (unit === "month") d.setDate(1);
      return d;
    }
    function next(d) {
      var n = new Date(d);
      if (unit === "day") n.setDate(n.getDate() + 1);
      else if (unit === "week") n.setDate(n.getDate() + 7);
      else n.setMonth(n.getMonth() + 1);
      return n;
    }
    var list = [], idx = {};
    for (var d = start(b.from); d.getTime() <= b.to; d = next(d)) {
      var k = d.getTime();
      idx[k] = list.length;
      list.push({ start: d, end: next(d), counts: { guide: 0, demo: 0, contact: 0 }, total: 0 });
    }
    scoped().forEach(function (l) {
      var i = idx[start(Date.parse(l.created_at)).getTime()];
      if (i === undefined) return;
      list[i].counts[typeOf(l)]++; list[i].total++;
    });
    return { unit: unit, list: list };
  }

  function niceMax(v) {
    if (v <= 4) return { max: 4, step: 1 };
    var raw = v / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    step = Math.max(1, Math.round(step));
    return { max: Math.ceil(v / step) * step, step: step };
  }

  function roundTop(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return "M" + x + " " + (y + hgt) + "V" + (y + r) + "Q" + x + " " + y + " " + (x + r) + " " + y + "H" + (x + w - r) + "Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + r) + "V" + (y + hgt) + "Z";
  }

  function trendCard() {
    var data = buckets(), list = data.list;
    var shown = state.type === "all" ? TYPES : TYPES.filter(function (t) { return t.key === state.type; });
    var unitWord = { day: "day", week: "week", month: "month" }[data.unit];
    var card = h("section", { class: "card", "aria-label": "Leads over time" },
      h("div", { class: "card-head" },
        h("div", {}, h("h2", { class: "card-title", text: "Leads per " + unitWord }), h("p", { class: "card-sub", text: periodText() + (state.type === "all" ? ", by type" : ", " + TYPE[state.type].label.toLowerCase()) })),
        shown.length > 1 ? h("ul", { class: "legend" }, shown.map(function (t) { return h("li", {}, h("i", { style: "background:" + t.color }), t.label); })) : null));
    var box = h("div", { class: "chart" });
    add(card, box);
    var total = list.reduce(function (a, b) { return a + b.total; }, 0);
    if (!total) { add(box, h("p", { class: "empty", text: "No leads in this period." })); return card; }
    requestAnimationFrame(function () { drawTrend(box, list, shown, data.unit); });
    return card;
  }

  function drawTrend(box, list, shown, unit) {
    clear(box);
    var W = Math.max(300, box.clientWidth || 640), H = 280, m = { l: 34, r: 8, t: 18, b: 26 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var totals = list.map(function (b) { return shown.reduce(function (a, t) { return a + b.counts[t.key]; }, 0); });
    var peak = Math.max.apply(null, totals), nm = niceMax(peak);
    var y = function (v) { return m.t + ph - (v / nm.max) * ph; };
    var band = pw / list.length, bw = Math.max(2, Math.min(24, band * 0.7));
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Leads per " + unit + " chart" });

    for (var v = 0; v <= nm.max; v += nm.step) {
      svg.appendChild(s("line", { class: v === 0 ? "base" : "grid", x1: m.l, x2: W - m.r, y1: Math.round(y(v)) + 0.5, y2: Math.round(y(v)) + 0.5 }));
      var tk = s("text", { class: "tick", x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }); tk.textContent = fmtNum(v); svg.appendChild(tk);
    }
    var every = Math.max(1, Math.ceil(list.length / Math.max(2, Math.floor(pw / 64))));
    var peakIdx = totals.indexOf(peak);

    list.forEach(function (b, i) {
      var cx = m.l + band * i + band / 2, x = cx - bw / 2;
      var base = m.t + ph, segs = shown.filter(function (t) { return b.counts[t.key] > 0; });
      segs.forEach(function (t, si) {
        var hgt = (b.counts[t.key] / nm.max) * ph;
        var top = base - hgt;
        var isTop = si === segs.length - 1;
        var drawH = Math.max(1, hgt - (si > 0 ? 2 : 0)); // 2px surface gap above the segment below
        var p = isTop ? s("path", { d: roundTop(x, top, bw, drawH, 4), fill: t.color })
                      : s("rect", { x: x, y: top, width: bw, height: drawH, fill: t.color });
        svg.appendChild(p);
        base = top;
      });
      if (i % every === 0) {
        var lb = s("text", { class: "tick", x: cx, y: H - 8, "text-anchor": "middle" });
        lb.textContent = unit === "month" ? b.start.toLocaleDateString("en-ZA", { month: "short", year: "2-digit" }) : fmtShort(b.start);
        svg.appendChild(lb);
      }
      if (i === peakIdx && peak > 0) {
        var cap = s("text", { class: "cap", x: cx, y: y(peak) - 6, "text-anchor": "middle" }); cap.textContent = fmtNum(peak); svg.appendChild(cap);
      }
      var hit = s("rect", { class: "hit", x: m.l + band * i, y: m.t, width: band, height: ph, tabindex: "0", "aria-label": periodLabel(b, unit) + ": " + totals[i] + " leads" });
      function show(ev) {
        var rows = shown.map(function (t) { return { name: t.label, value: b.counts[t.key], color: t.color }; });
        if (shown.length > 1) rows.push({ name: "Total", value: totals[i] });
        showTip(periodLabel(b, unit), rows, ev, hit);
      }
      hit.addEventListener("pointermove", show);
      hit.addEventListener("focus", show);
      hit.addEventListener("pointerleave", hideTip);
      hit.addEventListener("blur", hideTip);
      svg.appendChild(hit);
    });
    box.appendChild(svg);
  }

  function periodLabel(b, unit) {
    if (unit === "day") return b.start.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
    if (unit === "week") return "Week of " + fmtShort(b.start);
    return b.start.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  }

  var tip = document.querySelector("[data-tooltip]");
  function showTip(title, rows, ev, anchor) {
    clear(tip);
    add(tip, h("div", { class: "tt-title", text: title }));
    rows.forEach(function (r) {
      add(tip, h("div", { class: "tt-row" },
        h("span", { class: "tt-key", style: r.color ? "background:" + r.color : "" }),
        h("span", { class: "tt-val", text: fmtNum(r.value) }),
        h("span", { class: "tt-name", text: r.name })));
    });
    tip.hidden = false;
    var x, yy;
    if (ev && ev.clientX !== undefined && ev.type === "pointermove") { x = ev.clientX; yy = ev.clientY; }
    else { var rc = anchor.getBoundingClientRect(); x = rc.left + rc.width / 2; yy = rc.top + 20; }
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = x + 14 + tw > window.innerWidth ? x - tw - 14 : x + 14;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, Math.min(window.innerHeight - th - 8, yy - th / 2)) + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- top guides ---------- */
  function topGuidesCard() {
    var counts = {};
    scoped({ ignoreType: true }).forEach(function (l) {
      if (typeOf(l) !== "guide") return;
      var k = l.guide_slug || "(unknown)";
      counts[k] = (counts[k] || 0) + 1;
    });
    var rows = Object.keys(counts).map(function (k) { return { slug: k, n: counts[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var card = h("section", { class: "card", "aria-label": "Top guides" },
      h("div", { class: "card-head" }, h("h2", { class: "card-title", text: "Top guides" }), h("p", { class: "card-sub", text: "Downloads, " + periodText().toLowerCase() })));
    if (!rows.length) { add(card, h("p", { class: "empty", text: "No guide downloads in this period." })); return card; }
    var max = rows[0].n;
    add(card, h("div", { class: "bars" }, rows.map(function (r) {
      return h("div", { class: "bar-row" },
        h("span", { class: "bar-name", text: guideTitle(r.slug), title: guideTitle(r.slug) }),
        h("span", { class: "bar-val", text: fmtNum(r.n) }),
        h("div", { class: "bar-track" }, h("div", { class: "bar-fill", style: "width:" + Math.max(1, (r.n / max) * 100) + "%" })));
    })));
    return card;
  }

  /* ---------- bookings (read-only, from the booking provider) ---------- */
  function bookingsCard() {
    var b = state.meta.booking || {};
    var card = h("section", { class: "card", "aria-label": "Bookings" });
    var head = h("div", { class: "card-head" }, h("h2", { class: "card-title", text: "Demo bookings" }));
    add(card, head);
    if (!b.provider || b.provider === "none") {
      add(card, h("p", { class: "note", text: "No booking calendar on this site. Demo requests still show in the leads list." }));
      return card;
    }
    if (!b.supported) {
      add(card, h("p", { class: "note", text: "This site's calendar (" + b.provider + ") can't be read automatically. Demo requests from the website gate show in the leads list." }));
      return card;
    }
    if (!b.connected) {
      add(card, h("p", { class: "note", text: "Add " + b.tokenVar + " in Netlify to show " + b.label + " bookings here. Until then, demo requests show in the leads list." }));
      return card;
    }
    if (b.error) { add(card, h("p", { class: "note", text: b.error })); return card; }

    var leadByEmail = {};
    state.leads.forEach(function (l) { if (l.email) leadByEmail[l.email] = l; });
    var list = state.bookings.filter(function (x) { return state.allBookings || leadByEmail[x.email]; });
    var now = Date.now();
    var upcoming = list.filter(function (x) { return Date.parse(x.start) >= now; }).sort(function (a, c) { return Date.parse(a.start) - Date.parse(c.start); });
    var past = list.filter(function (x) { return Date.parse(x.start) < now; }).sort(function (a, c) { return Date.parse(c.start) - Date.parse(a.start); });

    var cb = h("input", { type: "checkbox", onchange: function () { state.allBookings = !cb.checked; render(); } });
    cb.checked = !state.allBookings;
    add(head, h("p", { class: "card-sub", text: fmtNum(upcoming.length) + " upcoming · from " + b.label }));
    add(card, h("label", { class: "toggle" }, cb, "Website leads only"));

    if (!list.length) { add(card, h("p", { class: "empty", text: "No bookings in the last 30 days or the next 90." })); return card; }
    add(card, h("div", { class: "bookings", style: "margin-top:0.5rem" }, upcoming.concat(past).map(function (x) {
      var d = new Date(x.start), lead = leadByEmail[x.email];
      return h("div", { class: "booking" + (Date.parse(x.start) < now ? " past" : ""), style: lead ? "cursor:pointer" : "", onclick: lead ? function () { openDrawer(lead); } : null },
        h("div", { class: "booking-date" }, h("b", { text: String(d.getDate()) }), h("span", { text: d.toLocaleDateString("en-ZA", { month: "short" }) })),
        h("div", { class: "booking-main" },
          h("p", { text: (x.name || x.email || "Unknown guest") + (x.company || (lead && lead.company) ? ", " + (x.company || lead.company) : "") }),
          h("p", { class: "muted", text: fmtTime(x.start) + " · " + x.title + (lead ? "" : " · not from the website") })));
    })));
    return card;
  }

  /* ---------- leads: table and pipeline ---------- */
  function sortedLeads() {
    var list = scoped().slice(), k = state.sort.key, dir = state.sort.dir;
    var val = function (l) {
      if (k === "name") return fullName(l).toLowerCase();
      if (k === "status") return STATUSES.indexOf(l.status);
      if (k === "created_at") return Date.parse(l.created_at);
      return String(l[k] || "").toLowerCase();
    };
    return list.sort(function (a, b) { var x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  }

  function leadsSection() {
    var list = sortedLeads();
    var tabs = h("div", { class: "tabs", role: "tablist" },
      ["table", "pipeline"].map(function (t) {
        return h("button", { role: "tab", type: "button", "aria-selected": String(state.tab === t), text: t === "table" ? "All leads (" + fmtNum(list.length) + ")" : "Pipeline",
          onclick: function () { state.tab = t; render(); } });
      }));
    return h("section", { class: "card", "aria-label": "Leads" }, tabs, state.tab === "table" ? leadsTable(list) : pipeline(list));
  }

  function leadsTable(list) {
    if (!list.length) return h("p", { class: "empty", text: "No leads match these filters." });
    function th(key, label) {
      var sorted = state.sort.key === key;
      return h("th", { scope: "col", "aria-sort": sorted ? (state.sort.dir > 0 ? "ascending" : "descending") : null },
        key ? h("button", { type: "button", text: label, onclick: function () {
          state.sort = { key: key, dir: sorted ? -state.sort.dir : (key === "created_at" ? -1 : 1) }; render();
        } }) : label);
    }
    var rows = list.slice(0, state.limit).map(function (l) {
      var t = TYPE[typeOf(l)];
      return h("tr", { tabindex: "0", onclick: function () { openDrawer(l); }, onkeydown: function (e) { if (e.key === "Enter") openDrawer(l); } },
        h("td", { class: "num", text: fmtDate(l.created_at) }),
        h("td", { class: "clip", text: fullName(l) }),
        h("td", { class: "clip", text: l.company || "—" }),
        h("td", { class: "clip", text: l.email }),
        h("td", {}, h("span", { class: "chip" }, h("i", { style: "background:" + t.color }), t.short)),
        h("td", { class: "clip", text: details(l) || "—", title: details(l) }),
        h("td", {}, h("span", { class: "status", text: l.status })),
        h("td", { class: "num" }, l.followup_sent_at ? h("span", { class: "tick-ok", title: "Follow-up sent " + fmtDate(l.followup_sent_at), text: "✓" }) : "—"));
    });
    var wrap = h("div", {}, h("div", { class: "table-wrap" }, h("table", { class: "leads" },
      h("thead", {}, h("tr", {}, th("created_at", "Date"), th("name", "Name"), th("company", "Company"), th("email", "Email"), th("type", "Type"), th(null, "Details"), th("status", "Status"), th(null, "Follow-up"))),
      h("tbody", {}, rows))));
    if (list.length > state.limit) {
      add(wrap, h("div", { class: "more" }, h("button", { class: "dash-btn dash-btn-quiet", type: "button", text: "Show more (" + fmtNum(list.length - state.limit) + " left)", onclick: function () { state.limit += 100; render(); } })));
    }
    return wrap;
  }

  function pipeline(list) {
    var board = h("div", { class: "board" });
    STATUSES.forEach(function (st) {
      var items = list.filter(function (l) { return l.status === st; });
      var col = h("div", { class: "col", "data-status": st },
        h("div", { class: "col-head" }, st, h("span", { text: fmtNum(items.length) })));
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drop"); });
      col.addEventListener("dragleave", function () { col.classList.remove("drop"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault(); col.classList.remove("drop");
        var id = e.dataTransfer.getData("text/plain");
        var lead = state.leads.filter(function (l) { return l.id === id; })[0];
        if (lead && lead.status !== st) setLead(lead, { status: st });
      });
      items.slice(0, 50).forEach(function (l) { add(col, leadCard(l)); });
      if (items.length > 50) add(col, h("p", { class: "col-more", text: "+" + fmtNum(items.length - 50) + " more. Narrow the filters to see them." }));
      add(board, col);
    });
    return h("div", {}, h("p", { class: "card-sub", style: "margin-bottom:0.75rem", text: "Drag a card to move it, or use its menu. Filters above apply here too." }), board);
  }

  function leadCard(l) {
    var t = TYPE[typeOf(l)];
    var sel = h("select", { "aria-label": "Status for " + fullName(l), onclick: function (e) { e.stopPropagation(); }, onchange: function () { setLead(l, { status: sel.value }); } },
      STATUSES.map(function (st) { var o = h("option", { value: st, text: st.charAt(0).toUpperCase() + st.slice(1) }); if (st === l.status) o.selected = true; return o; }));
    var card = h("div", { class: "lead-card", draggable: "true", tabindex: "0",
      onclick: function () { openDrawer(l); }, onkeydown: function (e) { if (e.key === "Enter" && e.target === card) openDrawer(l); } },
      h("b", { text: fullName(l) }),
      h("span", { class: "muted", text: (l.company || l.email) }),
      h("div", { class: "foot" }, h("span", { class: "chip" }, h("i", { style: "background:" + t.color }), fmtDate(l.created_at)), sel));
    card.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", l.id); card.classList.add("dragging"); });
    card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
    return card;
  }

  /* ---------- saving ---------- */
  function setLead(lead, patch, done) {
    var before = { status: lead.status, notes: lead.notes };
    Object.keys(patch).forEach(function (k) { lead[k] = patch[k]; });
    render();
    if (DEMO) { if (done) done(true); return; }
    api("PATCH", API.data, Object.assign({ id: lead.id }, patch)).then(function (r) {
      if (!r.ok) {
        lead.status = before.status; lead.notes = before.notes; render();
        toast(r.error || "Couldn't save that change.");
        if (done) done(false, r.error);
      } else if (done) done(true);
    });
  }

  /* ---------- lead drawer ---------- */
  var drawerEls = null;
  function closeDrawer() {
    if (!drawerEls) return;
    drawerEls.forEach(function (el) { el.remove(); });
    drawerEls = null;
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  function openDrawer(l) {
    closeDrawer();
    var t = TYPE[typeOf(l)];
    var booking = state.bookings.filter(function (b) { return b.email && b.email === l.email; }).sort(function (a, b) { return Date.parse(b.start) - Date.parse(a.start); })[0];
    var status = h("select", { class: "dash-select" }, STATUSES.map(function (st) {
      var o = h("option", { value: st, text: st.charAt(0).toUpperCase() + st.slice(1) }); if (st === l.status) o.selected = true; return o;
    }));
    var notes = h("textarea", { class: "dash-textarea", placeholder: "Call notes, next steps…" });
    notes.value = l.notes || "";
    var msg = h("span", { role: "status" });
    var save = h("button", { class: "dash-btn", type: "button", text: "Save", onclick: function () {
      save.disabled = true; msg.textContent = ""; msg.className = "";
      var patch = {};
      if (status.value !== l.status) patch.status = status.value;
      if (notes.value !== (l.notes || "")) patch.notes = notes.value;
      if (!Object.keys(patch).length) { save.disabled = false; msg.className = "saved"; msg.textContent = "Nothing changed"; return; }
      setLead(l, patch, function (ok, err) {
        save.disabled = false;
        msg.className = ok ? "saved" : "err"; msg.textContent = ok ? "Saved" : (err || "Not saved");
      });
    } });

    function row(label, value) { return value ? [h("dt", { text: label }), h("dd", {}, value)] : null; }
    var scrim = h("div", { class: "scrim", onclick: closeDrawer });
    var drawer = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": "Lead details" },
      h("div", { class: "drawer-head" },
        h("div", {}, h("h2", { text: fullName(l) }), h("p", { class: "card-sub", text: l.company || "" })),
        h("button", { class: "dash-btn dash-btn-quiet", type: "button", text: "Close", onclick: closeDrawer })),
      h("span", { class: "chip", style: "justify-self:start" }, h("i", { style: "background:" + t.color }), t.short),
      h("dl", {},
        row("Email", h("a", { href: "mailto:" + l.email, text: l.email })),
        row("Received", fmtDate(l.created_at) + ", " + fmtTime(l.created_at)),
        row("Guide", l.type === "guide" ? guideTitle(l.guide_slug) : ""),
        row("Message", l.message),
        row("Came from", l.source_page),
        row("Follow-up email", l.type === "contact" ? "" : (l.followup_sent_at ? "Sent " + fmtDate(l.followup_sent_at) : "Not sent yet")),
        row("Booking", booking ? booking.title + ", " + fmtDate(booking.start) + " " + fmtTime(booking.start) : ""),
        row("Spam score", l.recaptcha_score !== null && l.recaptcha_score !== undefined && l.recaptcha_score !== "" ? String(l.recaptcha_score) + " (1.0 = human)" : "")),
      h("label", {}, "Status", status),
      h("label", {}, "Notes", notes),
      h("div", { class: "drawer-actions" }, save, h("a", { class: "dash-btn dash-btn-quiet", href: "mailto:" + l.email, text: "Email " + (l.first_name || "them") }), msg));
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    drawerEls = [scrim, drawer];
    status.focus();
  }

  /* ---------- CSV export ---------- */
  function exportCsv() {
    if (window.WIF_DASH_NO_DOWNLOAD) { toast("CSV export downloads a file on the live dashboard. It's switched off in this preview."); return; }
    var cols = ["created_at", "first_name", "last_name", "email", "company", "type", "guide", "status", "followup_sent_at", "notes", "message", "source_page"];
    var esc = function (v) { v = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.join(",")].concat(sortedLeads().map(function (l) {
      return cols.map(function (c) { return esc(c === "guide" ? guideTitle(l.guide_slug) : l[c]); }).join(",");
    }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "leads-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- demo data (?demo) ---------- */
  function demoData() {
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    var firsts = ["Thandi", "Sipho", "Amara", "Kwame", "Lerato", "Johan", "Fatima", "Tendai", "Grace", "Neo", "Chipo", "Musa", "Aisha", "Pieter", "Nomvula", "Kofi", "Zanele", "David", "Wanjiru", "Tariq"];
    var lasts = ["Mokoena", "Dlamini", "Okafor", "Mensah", "Naidoo", "van Wyk", "Abubakar", "Moyo", "Otieno", "Botha", "Banda", "Nkosi", "Hassan", "Pretorius", "Achieng", "Asante"];
    var companies = ["Kestrel Logistics", "Baobab Health", "Savanna Bank", "Lakeview Mining", "Umoja Insurance", "Highveld Foods", "Atlas Engineering", "Coastline Retail", "Meridian Energy", "Riverbend Group", "Nile Capital", "Summit Telecom"];
    var guides = { "intro-to-job-evaluation": "Introduction to modern job evaluation", "implementation-checklist": "Implementation checklist", "governance-guide": "Governance guide", "regrading-decisions": "Regrading decision guide", "growing-organisations": "Job evaluation for growing organisations", "committee-guide": "Committee guide" };
    var slugs = Object.keys(guides), weights = [5, 3, 2, 2, 1, 1], bag = [];
    slugs.forEach(function (sl, i) { for (var k = 0; k < weights[i]; k++) bag.push(sl); });
    var now = Date.now(), leads = [], bookings = [];
    for (var i = 0; i < 260; i++) {
      var age = Math.pow(rnd(), 1.35) * 200 * DAY; // skewed recent: a site that is growing
      var created = new Date(now - age);
      var r = rnd(), type = r < 0.62 ? "guide" : r < 0.87 ? "demo" : "contact";
      var f = pick(firsts), la = pick(lasts), co = pick(companies);
      var days = age / DAY;
      var st = days < 3 ? "new" : pick(days < 20 ? ["new", "new", "contacted", "contacted", "qualified"] : ["contacted", "qualified", "won", "lost", "lost", "contacted"]);
      var lead = {
        id: "demo-" + i, created_at: created.toISOString(), type: type, first_name: f, last_name: la,
        email: (f + "." + la).toLowerCase().replace(/[^a-z.]/g, "") + "@" + co.toLowerCase().split(" ")[0] + ".co.za",
        company: co, guide_slug: type === "guide" ? pick(bag) : "",
        message: type === "contact" ? pick(["Can we get pricing for 300 roles?", "Do you work in Kenya?", "Interested in a refresher for our committee."]) : "",
        source_page: type === "guide" ? "/guides/" : type === "demo" ? "/book-demo/" : "/contact/",
        status: st, notes: st === "qualified" ? "Budget confirmed for Q1. Send proposal." : "",
        followup_sent_at: type !== "contact" && days > 5 ? new Date(created.getTime() + 5 * DAY).toISOString() : null,
        recaptcha_score: (0.7 + rnd() * 0.3).toFixed(1),
      };
      leads.push(lead);
      if (type === "demo" && rnd() < 0.75 && days < 40) {
        var start = new Date(created.getTime() + (days < 12 ? 6 + Math.floor(rnd() * 10) : 2 + Math.floor(rnd() * 8)) * DAY); start.setHours(9 + Math.floor(rnd() * 7), rnd() < 0.5 ? 0 : 30, 0, 0);
        bookings.push({ id: "b" + i, provider: "hubspot", title: "Demo session", start: start.toISOString(), end: new Date(start.getTime() + 3600e3).toISOString(), status: "scheduled", name: f + " " + la, email: lead.email, company: co });
      }
    }
    [3, 6, 11].forEach(function (d, k) {
      var st2 = new Date(now + d * DAY); st2.setHours(10 + k, 0, 0, 0);
      bookings.push({ id: "x" + k, provider: "hubspot", title: "Client check-in", start: st2.toISOString(), end: st2.toISOString(), status: "scheduled", name: "Existing client " + (k + 1), email: "client" + k + "@example.com", company: "" });
    });
    leads.sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
    return { leads: leads, bookings: bookings, meta: { siteName: "Demo", user: "demo@workinflow.co.za", store: "demo", guides: guides, booking: { provider: "hubspot", label: "HubSpot", supported: true, connected: true, tokenVar: "HUBSPOT_TOKEN" } } };
  }

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (app.querySelector(".kpis")) render(); }, 200);
  });

  boot();
})();
