// Engage Job Evaluation, site script.
// The SPA showPage() logic from the demo is intentionally gone; routing
// is now real pages. This stays minimal.

// 0. Mobile nav toggle (hamburger). Closes on outside click, Escape,
// or when a link inside it is clicked (full page nav still needs this
// so the menu isn't left visually "open" for an instant on slow loads).
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.getElementById("nav-links");
  if (!toggle || !links) return;

  function setOpen(open) {
    toggle.classList.toggle("open", open);
    links.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  window.toggleNav = function (btn) {
    setOpen(!links.classList.contains("open"));
  };

  links.addEventListener("click", function (e) {
    if (e.target.closest("a")) setOpen(false);
  });

  document.addEventListener("click", function (e) {
    if (!links.classList.contains("open")) return;
    if (e.target.closest("nav")) return;
    setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
})();

// 1. Mark the current nav link active as a fallback to the server-rendered class.
(function () {
  var path = window.location.pathname;
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (!href || href === "/") return;
    if (path.indexOf(href) === 0) a.classList.add("active");
  });
})();

// 2. FAQ accordion: CSS keys off .faq-item.open, so we just toggle that class.
window.toggleFaq = function (el) {
  var item = el.closest(".faq-item");
  if (item) item.classList.toggle("open");
};

// 3. Guide gate: name + email → Netlify Function → Resend.
(function () {
  // If arriving from the emailed link (?unlocked=1), skip the gate entirely.
  if (window.location.search.indexOf("unlocked=1") !== -1) {
    var gateEl = document.getElementById("guide-gate");
    var contentEl = document.getElementById("guide-content");
    if (gateEl) gateEl.style.display = "none";
    if (contentEl) contentEl.style.display = "block";
  }
  var form = document.getElementById("gate-form");
  if (!form) return;

  var errorEl = document.getElementById("gate-error");
  var submitBtn = document.getElementById("gate-submit");
  var gate = document.getElementById("guide-gate");
  var success = document.getElementById("guide-gate-success");
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = document.getElementById("gate-name").value.trim();
    var email = document.getElementById("gate-email").value.trim();

    if (!name || !emailRe.test(email)) {
      errorEl.textContent = "Please enter your name and a valid email address.";
      errorEl.style.display = "block";
      return;
    }

    errorEl.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    fetch("/.netlify/functions/send-guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        guideTitle: form.getAttribute("data-guide-title"),
        guideSlug: form.getAttribute("data-guide-slug"),
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed");
        gate.style.display = "none";
        success.style.display = "block";
      })
      .catch(function () {
        errorEl.textContent =
          "Something went wrong, please try again, or email info@workinflow.co.za.";
        errorEl.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Send me the guide";
      });
  });
})();

// 3b. Overview: Engage-vs-traditional comparison accordion.
window.toggleCompare = function (el) {
  var box = el.closest(".eng-compare");
  if (!box) return;
  var open = box.classList.toggle("open");
  el.setAttribute("aria-expanded", open ? "true" : "false");
  var lbl = el.querySelector(".label");
  if (lbl) lbl.textContent = open ? "Hide the full side-by-side" : "See the full side-by-side";
};

// 3c. Insights hub: Guides / Webinars sub-category tabs.
window.showInsights = function (which) {
  var names = ["guides", "webinars"];
  names.forEach(function (n) {
    var tab = document.getElementById("tab-" + n);
    var panel = document.getElementById("panel-" + n);
    var on = n === which;
    if (tab) {
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (panel) panel.hidden = !on;
  });
  if (history.replaceState) {
    history.replaceState(null, "", which === "webinars" ? "#webinars" : "#guides");
  }
};
(function () {
  if (!document.getElementById("tab-webinars")) return;
  if (window.location.hash === "#webinars") window.showInsights("webinars");
})();

// 4. How It Works: click-to-expand pillars and five-grid cards.
window.togglePillar = function (head) {
  var pillar = head.closest(".pillar");
  if (pillar) pillar.classList.toggle("open");
};
window.toggleGridCard = function (card) {
  card.classList.toggle("open");
};

// 5. Landing: animated count-up for the trust-stats band.
(function () {
  var nums = document.querySelectorAll(".trust-num");
  if (!nums.length) return;
  nums.forEach(function (el) {
    var target = parseInt(el.getAttribute("data-count-to"), 10);
    // No numeric target (e.g. a static value like "88+" or "Annual") → leave the text as authored.
    if (isNaN(target)) return;
    var suffix = el.getAttribute("data-suffix") || "";
    var start = null, duration = 1200;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      el.textContent = Math.floor(progress * target).toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString() + suffix;
    }
    requestAnimationFrame(step);
  });
})();

// 6. Landing: client logo carousel (arrows + dots).
// Was hardcoded to 5 visible logos regardless of viewport, on a phone
// that rendered as five unreadable slivers. visible now recalculates
// on load and resize (5 desktop / 3 tablet / 2 phone), each logo's
// flex-basis is set directly so it always matches what the transform
// math expects, and the dots are rebuilt whenever the count changes.
(function () {
  var track = document.getElementById("engage-carousel-track");
  var dotsWrap = document.getElementById("engage-carousel-dots");
  if (!track || !dotsWrap) return;
  var items = Array.prototype.slice.call(track.children);
  var total = items.length;
  var visible = 5;
  var maxIndex = 0;
  var index = 0;

  function visibleForWidth() {
    var w = window.innerWidth;
    if (w <= 560) return 2;
    if (w <= 860) return 3;
    return 5;
  }

  function rebuildDots() {
    dotsWrap.innerHTML = "";
    var pageCount = maxIndex + 1;
    for (var i = 0; i < pageCount; i++) {
      var dot = document.createElement("button");
      dot.setAttribute("aria-label", "Go to client " + (i + 1));
      dot.style.cssText = "width:10px;height:10px;border-radius:50%;border:1px solid var(--border);background:white;cursor:pointer;padding:0;";
      dot.addEventListener("click", (function (n) { return function () { go(n); }; })(i));
      dotsWrap.appendChild(dot);
    }
  }

  function layout() {
    var newVisible = visibleForWidth();
    var changed = newVisible !== visible;
    visible = newVisible;
    items.forEach(function (el) {
      el.style.flex = "0 0 " + (100 / visible) + "%";
    });
    maxIndex = Math.max(0, total - visible);
    index = Math.min(index, maxIndex);
    if (changed) rebuildDots();
    update();
  }

  function update() {
    track.style.transform = "translateX(-" + (index * (100 / visible)) + "%)";
    Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
      var active = i === index;
      d.style.background = active ? "var(--apag-green)" : "white";
      d.style.borderColor = active ? "var(--apag-green)" : "var(--border)";
    });
  }
  function go(n) { index = Math.max(0, Math.min(maxIndex, n)); update(); restartAuto(); }
  window.engageCarouselMove = function (dir) { go(index + dir); };

  // Auto-rotate: advances one page at a time and loops back to the start.
  // Pauses on hover/focus and respects prefers-reduced-motion.
  var AUTO_MS = 4000;
  var timer = null;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function startAuto() {
    if (reduceMotion || maxIndex <= 0) return;
    stopAuto();
    timer = setInterval(function () {
      index = index >= maxIndex ? 0 : index + 1;
      update();
    }, AUTO_MS);
  }
  function stopAuto() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function restartAuto() { stopAuto(); startAuto(); }

  var section = track.closest(".client-carousel-section") || track.parentElement;
  section.addEventListener("mouseenter", stopAuto);
  section.addEventListener("mouseleave", startAuto);
  section.addEventListener("focusin", stopAuto);
  section.addEventListener("focusout", startAuto);

  layout();
  startAuto();
  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layout(); restartAuto(); }, 150);
  });
})();

// 7. Landing: homepage hero explainer (Vimeo click-to-play facade).
// The player iframe is only injected on click, so the homepage stays
// fast. The poster is Vimeo's own thumbnail, fetched via oEmbed (works
// for unlisted /hash links too) so CMS editors never upload a still;
// if the fetch fails, the brand-gradient box stays as the fallback.
// Mirrors the webinar embed, but deferred rather than eager.
(function () {
  var btn = document.querySelector(".hero-video-play");
  if (!btn) return;

  var url = btn.getAttribute("data-vimeo-url");
  var embed = btn.getAttribute("data-vimeo-embed");
  if (!embed) return;

  if (url) {
    var api =
      "https://vimeo.com/api/oembed.json?url=" + encodeURIComponent(url) + "&width=900";
    fetch(api)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.thumbnail_url) {
          btn.style.backgroundImage = "url('" + d.thumbnail_url + "')";
          btn.classList.add("has-thumb");
        }
      })
      .catch(function () { /* keep the gradient fallback */ });
  }

  btn.addEventListener("click", function () {
    var frame = btn.closest(".hero-video");
    if (!frame) return;
    var iframe = document.createElement("iframe");
    iframe.src = embed + "&autoplay=1";
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("title", "Engage, 60-second explainer");
    frame.appendChild(iframe);
    frame.classList.add("is-playing");
  });
})();


// 8. Sub-page anchor nav: move the active underline to the section in view.
// Inert on pages without an .anchor-nav (guarded return). Offset is read from
// the fixed nav's own position so it stays correct if the header height changes.
(function () {
  var nav = document.querySelector(".anchor-nav");
  if (!nav) return;
  var links = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  if (!links.length) return;
  var map = links
    .map(function (a) { return { a: a, sec: document.getElementById(a.getAttribute("href").slice(1)) }; })
    .filter(function (m) { return m.sec; });
  if (!map.length) return;

  function offset() { return nav.getBoundingClientRect().bottom + 8; }
  function setActive(a) {
    links.forEach(function (l) { l.classList.toggle("active", l === a); });
  }
  function update() {
    var off = offset();
    var current = map[0];
    for (var i = 0; i < map.length; i++) {
      if (map[i].sec.getBoundingClientRect().top - off <= 1) current = map[i];
      else break;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = map[map.length - 1];
    }
    setActive(current.a);
  }

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) { requestAnimationFrame(function () { update(); ticking = false; }); ticking = true; }
  }, { passive: true });
  window.addEventListener("resize", update);

  // Click: set active immediately and smooth-scroll with the fixed-nav offset.
  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      var sec = document.getElementById(a.getAttribute("href").slice(1));
      if (!sec) return;
      e.preventDefault();
      var y = sec.getBoundingClientRect().top + window.scrollY - offset() + 2;
      window.scrollTo({ top: y, behavior: "smooth" });
      setActive(a);
    });
  });

  update();
})();
