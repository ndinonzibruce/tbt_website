// Fall Bible Conference 2026 popup — shows once per browser session on any
// page of the site. Real event details, kept in sync by hand with events.html
// and js/whats-coming.js. Update FBC_INFO below if price/dates/link change,
// or if the conference is over, just delete the <script> tags including this
// file from the pages (or set FBC_INFO.enabled to false).
(function () {
  var FBC_INFO = {
    enabled: true,
    dates: "Sep 4–6, 2026",
    location: "Camp Burton, Burton, OH",
    price: "From $150",
    registerUrl: "https://old-north-church-17379.churchcenter.com/registrations/events/3576984"
  };

  if (!FBC_INFO.enabled) return;
  if (sessionStorage.getItem("fbcPopupSeen")) return;

  document.addEventListener("DOMContentLoaded", function () {
    sessionStorage.setItem("fbcPopupSeen", "1");

    var overlay = document.createElement("div");
    overlay.className = "fbc-popup-overlay";
    overlay.innerHTML =
      '<div class="fbc-popup-card" role="dialog" aria-modal="true" aria-labelledby="fbc-popup-heading">' +
        '<button class="fbc-popup-close" aria-label="Close">✕</button>' +
        '<div class="fbc-popup-banner">' +
          '<div class="fbc-popup-eyebrow">Fall Bible Conference 2026</div>' +
          '<h2 id="fbc-popup-heading">Have you signed up for FBC yet?</h2>' +
          '<p class="fbc-popup-detail">' + FBC_INFO.dates + ' · ' + FBC_INFO.location + '</p>' +
        '</div>' +
        '<div class="fbc-popup-content">' +
          '<p class="fbc-popup-body">"Family Matters — But Not the Way You Think." A weekend of talks, singing, and workshop groups in the book of Ruth. Come curious, come as you are.</p>' +
          '<p class="fbc-popup-price">' + FBC_INFO.price + '</p>' +
          '<p class="fbc-popup-scholarship">Cost shouldn\'t keep you away — scholarships are available. <a href="sms:+12342977413?&body=" target="_blank" rel="noopener">Text our team →</a></p>' +
          '<a class="btn btn-gold btn-lg fbc-popup-register" href="' + FBC_INFO.registerUrl + '" target="_blank" rel="noopener">Register now →</a>' +
          '<button class="fbc-popup-dismiss">Not right now</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() {
      overlay.classList.remove("visible");
      setTimeout(function () { overlay.remove(); }, 200);
    }

    overlay.querySelector(".fbc-popup-close").addEventListener("click", close);
    overlay.querySelector(".fbc-popup-dismiss").addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    requestAnimationFrame(function () {
      overlay.classList.add("visible");
    });
  });
})();
