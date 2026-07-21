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
