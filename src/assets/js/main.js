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

// 3. Case-studies hub filter (progressive — all cards show if JS is off).
//    Buttons carry data-filter; cards carry data-tags (space-separated).
(function () {
  var bar = document.querySelector("[data-cs-filter]");
  if (!bar) return;
  var cards = Array.prototype.slice.call(
    document.querySelectorAll("[data-cs-card]")
  );
  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-filter]");
    if (!btn) return;
    var f = btn.getAttribute("data-filter");
    bar.querySelectorAll("[data-filter]").forEach(function (b) {
      b.classList.toggle("active", b === btn);
    });
    cards.forEach(function (c) {
      var tags = (c.getAttribute("data-tags") || "").split(" ");
      var show = f === "all" || tags.indexOf(f) !== -1;
      c.style.display = show ? "" : "none";
    });
  });
})();

// 4. Guide gate: name + email → Netlify Function → Resend.
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

// 5. How It Works: click-to-expand pillars and five-grid cards.
window.togglePillar = function (head) {
  var pillar = head.closest(".pillar");
  if (pillar) pillar.classList.toggle("open");
};
window.toggleGridCard = function (card) {
  card.classList.toggle("open");
};
