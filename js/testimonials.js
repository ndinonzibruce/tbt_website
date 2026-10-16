// Rotates the "What our students say" cards, three at a time.
// Without JS every card simply shows. Rotation pauses while a card is
// expanded, hovered, or focused so nobody loses their place mid-read.
(function () {
  var grid = document.getElementById("testimonials");
  if (!grid) return;
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".testimonial-card"));
  var SHOW = window.matchMedia("(max-width: 720px)").matches ? 1 : window.matchMedia("(max-width: 1040px)").matches ? 2 : 3;
  if (cards.length <= SHOW) return;
  var start = Math.floor(Math.random() * Math.ceil(cards.length / SHOW)) * SHOW;
  var paused = false;

  function render() {
    cards.forEach(function (c, i) {
      var offset = (i - start + cards.length) % cards.length;
      c.classList.toggle("is-hidden", offset >= SHOW);
    });
  }
  function next() {
    if (paused || grid.querySelector("details[open]")) return;
    grid.classList.add("is-fading");
    setTimeout(function () {
      start = (start + SHOW) % cards.length;
      render();
      grid.classList.remove("is-fading");
    }, 450);
  }

  ["mouseenter", "focusin"].forEach(function (ev) { grid.addEventListener(ev, function () { paused = true; }); });
  ["mouseleave", "focusout"].forEach(function (ev) { grid.addEventListener(ev, function () { paused = false; }); });

  render();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(next, 12000);
})();
