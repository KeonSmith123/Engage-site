/* ==========================================================================
   main.js: one guarded IIFE per behaviour.
   Each block checks its elements exist before doing anything, so a page
   without that feature costs nothing. Add new behaviour as a new block at
   the end, labelled with the date and change-request number.
   ========================================================================== */

/* --- Mobile nav ----------------------------------------------------------- */
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();

/* --- YouTube: best thumbnail + click to play ----------------------------- */
/* YouTube returns a 120x90 placeholder (HTTP 200) when a size doesn't exist,
   so each size is probed with a real image load and checked for width. */
(function () {
  var videos = document.querySelectorAll(".video[data-youtube-id]");
  if (!videos.length) return;

  function probe(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img.naturalWidth > 120 ? url : null); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  videos.forEach(function (box) {
    var id = box.getAttribute("data-youtube-id");
    var thumb = box.querySelector(".video-thumb");
    var base = "https://i.ytimg.com/vi/" + id + "/";

    if (thumb) {
      probe(base + "maxresdefault.jpg").then(function (u) {
        return u || probe(base + "sddefault.jpg");
      }).then(function (u) { if (u) thumb.src = u; });
    }

    var play = box.querySelector(".video-play");
    if (!play) return;
    play.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.title = play.getAttribute("aria-label") || "Video";
      box.innerHTML = "";
      box.appendChild(iframe);
      if (window.gtag) window.gtag("event", "video_play", { video_id: id });
    });
  });
})();

/* --- Lead forms: reCAPTCHA v3, v2 fallback, submit, success ------------- */
(function () {
  var forms = document.querySelectorAll("form[data-wif-form]");
  if (!forms.length) return;

  var cfg = (window.WIF && window.WIF.recaptcha) || {};
  var bookingCfg = (window.WIF && window.WIF.booking) || {};

  function v3Token(action) {
    if (!cfg.enabled || !cfg.siteKey || !window.grecaptcha) return Promise.resolve(null);
    return new Promise(function (resolve) {
      window.grecaptcha.ready(function () {
        window.grecaptcha.execute(cfg.siteKey, { action: action }).then(resolve, function () { resolve(null); });
      });
    });
  }

  function showError(form, msg) {
    var el = form.querySelector("[data-error]");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError(form) {
    var el = form.querySelector("[data-error]");
    if (el) { el.hidden = true; el.textContent = ""; }
  }

  // provider (site.json → booking.provider):
  //   hubspot  → HubSpot Meetings embed script
  //   calendly → Calendly inline iframe
  //   iframe   → any calendar page that allows embedding (Google appointment pages, Cal.com, Microsoft Bookings…)
  //   link     → a button that opens the calendar in a new tab (for calendars that block embedding)
  function revealBooking(url, provider) {
    var host = document.querySelector("[data-booking-embed]");
    if (!host || !url) return;
    provider = provider || bookingCfg.provider;
    host.hidden = false;
    host.innerHTML = "";

    if (provider === "link") {
      var a = document.createElement("a");
      a.className = "btn";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open the calendar to choose a time";
      host.appendChild(a);
    } else if (provider === "iframe") {
      var fr = document.createElement("iframe");
      fr.src = url;
      fr.title = "Choose a time";
      host.appendChild(fr);
    } else if (provider === "hubspot") {
      // Build the container now (not hidden on load): HubSpot's script measures it when it runs.
      var c = document.createElement("div");
      c.className = "meetings-iframe-container";
      c.setAttribute("data-src", url + (url.indexOf("?") > -1 ? "&" : "?") + "embed=true");
      host.appendChild(c);
      var s = document.createElement("script");
      s.src = "https://static.hsappstatic.net/MeetingsEmbed/ex/MeetingsEmbedCode.js";
      s.async = true;
      host.appendChild(s);
    } else if (provider === "calendly") {
      var f = document.createElement("iframe");
      f.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "embed_type=Inline&embed_domain=" + encodeURIComponent(location.hostname);
      f.title = "Choose a time";
      host.appendChild(f);
    }
    host.style.minHeight = provider === "link" ? "0" : "";
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onSuccess(form, body) {
    form.hidden = true;
    var ok = form.nextElementSibling;
    if (ok && ok.hasAttribute("data-success")) ok.hidden = false;

    var type = form.getAttribute("data-wif-form");
    if (window.gtag) window.gtag("event", type === "demo" ? "book_demo" : "generate_lead", { form_type: type });

    if (body && body.bookingUrl) revealBooking(body.bookingUrl, body.provider);
  }

  function send(form, extra) {
    var btn = form.querySelector('button[type="submit"]');
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === "string" ? v.trim() : v; });
    Object.keys(extra || {}).forEach(function (k) { data[k] = extra[k]; });

    if (btn) btn.disabled = true;
    return fetch(form.getAttribute("data-endpoint"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { res: res, body: body }; });
      })
      .then(function (r) {
        if (r.res.ok && r.body.ok) return onSuccess(form, r.body);

        if (r.body.challenge && cfg.v2SiteKey && window.grecaptcha) return showChallenge(form);

        showError(form, r.body.error || "Something went wrong. Please try again, or email us directly.");
      })
      .catch(function () {
        showError(form, "We couldn't reach the server. Check your connection and try again.");
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  // Low v3 score: show the v2 checkbox instead of blocking the visitor outright.
  function showChallenge(form) {
    var box = form.querySelector("[data-challenge]");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<p class="muted">One more step: please confirm you\'re not a robot.</p><div></div>';
    window.grecaptcha.render(box.lastChild, {
      sitekey: cfg.v2SiteKey,
      callback: function (token) {
        send(form, { recaptchaToken: token, recaptchaVersion: "v2" });
      },
    });
  }

  forms.forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError(form);
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var action = form.getAttribute("data-wif-form");
      v3Token(action).then(function (token) {
        send(form, token ? { recaptchaToken: token, recaptchaVersion: "v3" } : {});
      });
    });
  });
})();

/* --- CapeX · 2026-10-04 · Preselect "What do you need?" from ?service= (e.g. /contact/?service=events) --- */
(function () {
  var select = document.querySelector('select[name="service"]');
  if (!select || !window.URLSearchParams) return;
  var want = (new URLSearchParams(location.search).get("service") || "").toLowerCase();
  if (!want) return;
  var map = { staff: "Staff", events: "Event", event: "Event", rides: "Private", transfer: "Private", branding: "Fleet branding", software: "Convoi", demo: "Convoi", partner: "Partner", call: "Discovery", tour: "Private", tours: "Private" };
  var key = (map[want] || want).toLowerCase();
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value.toLowerCase().indexOf(key) === 0) { select.selectedIndex = i; break; }
  }
})();

/* --- CapeX · 2026-10-04 · Rides fare calculator: R20 + R8.50/km, min R120, nearest R10 --- */
(function () {
  var form = document.querySelector("[data-fare-calc]");
  if (!form) return;
  var km = form.querySelector('input[name="km"]');
  var out = form.querySelector("[data-fare]");
  var note = form.querySelector("[data-fare-note]");
  var book = form.querySelector("[data-fare-book]");
  var base = book ? book.getAttribute("href").split("?")[0] : "";
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  function update() {
    var d = Math.max(1, Math.min(400, parseFloat(km.value) || 0));
    var fare = Math.max(120, Math.round((20 + 8.5 * d) / 10) * 10);
    var rand = "R" + String(fare).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    out.textContent = rand;
    if (note) note.textContent = "About " + d + " km · per trip, up to 4 passengers";
    if (book) book.setAttribute("href", base + "?text=" + encodeURIComponent("Hi CapeX, I'd like to book a private trip of about " + d + " km (" + rand + "). Pick-up, drop-off, date and time: "));
  }
  km.addEventListener("input", update);
})();

/* --- CapeX · 2026-10-12 · Promos: show banners/pop-ups until their end date; remember dismissals per visitor --- */
(function () {
  var els = document.querySelectorAll("[data-promo]");
  if (!els.length) return;
  var now = new Date();
  var today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  function dismissed(id) { try { return localStorage.getItem("promo-closed-" + id) === "1"; } catch (e) { return false; } }
  function remember(id) { try { localStorage.setItem("promo-closed-" + id, "1"); } catch (e) {} }
  Array.prototype.forEach.call(els, function (el) {
    var id = el.getAttribute("data-promo");
    var end = el.getAttribute("data-promo-end");
    if ((end && today > end) || dismissed(id)) { el.remove(); return; }
    var isPop = el.classList.contains("promo-pop");
    function close() { remember(id); el.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    Array.prototype.forEach.call(el.querySelectorAll("[data-promo-close]"), function (b) { b.addEventListener("click", close); });
    if (isPop) {
      setTimeout(function () { el.hidden = false; document.addEventListener("keydown", onKey); }, 4000);
    } else {
      el.hidden = false;
    }
  });
})();

/* --- CapeX · 2026-10-12 · Convoi OS: fleet-type tabs (all panels stay visible without JS) --- */
(function () {
  var list = document.querySelector("[data-cv-tabs]");
  if (!list) return;
  var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
  function show(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { show(t, false); });
    t.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (n) { e.preventDefault(); show(n, true); }
    });
  });
  show(tabs[0], false);
})();

/* --- CapeX · 2026-10-12 · Buttons that preselect an option in the form they jump to (data-pick-intent) --- */
(function () {
  var links = document.querySelectorAll("[data-pick-intent]");
  if (!links.length) return;
  Array.prototype.forEach.call(links, function (a) {
    a.addEventListener("click", function () {
      var want = a.getAttribute("data-pick-intent");
      var selects = document.querySelectorAll("select");
      for (var i = 0; i < selects.length; i++) {
        for (var j = 0; j < selects[i].options.length; j++) {
          if (selects[i].options[j].text === want) { selects[i].selectedIndex = j; return; }
        }
      }
    });
  });
})();
