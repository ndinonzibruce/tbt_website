document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll(".team-bio-toggle").forEach((btn) => {
    const bio = btn.nextElementSibling;
    if (!bio || !bio.classList.contains("team-bio-full")) return;
    const openLabel = btn.textContent;
    btn.addEventListener("click", () => {
      const open = bio.hidden;
      bio.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Hide ↑" : openLabel;
    });
  });

  // A floating link to the prayer wall on every page except the wall itself.
  if (!/^\/prayer(\.html)?\/?$/.test(location.pathname)) {
    const fab = document.createElement("a");
    fab.className = "prayer-fab";
    fab.href = "/prayer";
    fab.innerHTML = '<span aria-hidden="true">\u{1F64F}</span> Prayer wall';
    document.body.appendChild(fab);
  }

  const backToTop = document.createElement("button");
  backToTop.className = "back-to-top";
  backToTop.setAttribute("aria-label", "Back to top");
  backToTop.textContent = "↑";
  document.body.appendChild(backToTop);

  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    backToTop.classList.toggle("visible", window.scrollY > 600);
  });
});
