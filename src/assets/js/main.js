// Engage Job Evaluation — site script.
// The SPA showPage() logic from the demo is intentionally gone; routing
// is now real pages. This stays minimal.

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
          "Something went wrong — please try again, or email info@workinflow.co.za.";
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
    var suffix = el.getAttribute("data-suffix") || "";
    var start = null, duration = 1200;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      el.textContent = Math.floor(progress * target) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  });
})();

// 6. Landing: client logo carousel (5 visible, arrows + dots).
(function () {
  var track = document.getElementById("engage-carousel-track");
  var dotsWrap = document.getElementById("engage-carousel-dots");
  if (!track || !dotsWrap) return;
  var total = track.children.length;
  var visible = 5;
  var maxIndex = Math.max(0, total - visible);
  var index = 0;
  for (var i = 0; i < total; i++) {
    var dot = document.createElement("button");
    dot.setAttribute("aria-label", "Go to client " + (i + 1));
    dot.style.cssText = "width:10px;height:10px;border-radius:50%;border:1px solid var(--border);background:white;cursor:pointer;padding:0;";
    dot.addEventListener("click", (function (n) { return function () { go(n); }; })(i));
    dotsWrap.appendChild(dot);
  }
  function update() {
    track.style.transform = "translateX(-" + (index * (100 / visible)) + "%)";
    Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
      var active = i === index;
      d.style.background = active ? "var(--apag-green)" : "white";
      d.style.borderColor = active ? "var(--apag-green)" : "var(--border)";
    });
  }
  function go(n) { index = Math.max(0, Math.min(maxIndex, n)); update(); }
  window.engageCarouselMove = function (dir) { go(index + dir); };
  update();
})();
