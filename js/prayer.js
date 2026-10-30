// Prayer wall: shows requests, lets people say "I prayed", report a request, and share one.
// Used by /prayer (form + wall) and /band (a short read-only list).
(function () {
  var ENDPOINT = window.TBT_PRAYER_ENDPOINT || "";
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    var o = new URLSearchParams(location.search).get("endpoint");
    if (o) ENDPOINT = o; // lets us test against a local stand-in
  }

  var wall = document.getElementById("prayer-wall");
  var form = document.getElementById("prayer-form");
  var soon = document.getElementById("prayer-soon");
  if (!wall && !form) return;

  var LIMIT = wall ? parseInt(wall.getAttribute("data-limit") || "50", 10) : 0;
  var loadedAt = Date.now();
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } },
    add: function (k, v) { try { var a = this.get(k); if (a.indexOf(v) === -1) { a.push(v); localStorage.setItem(k, JSON.stringify(a.slice(-300))); } } catch (e) {} }
  };

  if (!ENDPOINT) {
    if (soon) soon.hidden = false;
    if (form) form.hidden = true;
    if (wall) wall.hidden = true;
    var head = document.getElementById("prayer-wall-head");
    if (head) head.hidden = true;
    var sec = document.getElementById("prayer-section");
    if (sec) sec.hidden = true;
    return;
  }

  function api(body) {
    return fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) { var h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
    var d = Math.round(s / 86400);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  function card(r) {
    var el = document.createElement("article");
    el.className = "prayer-card";
    el.setAttribute("data-id", r.id);

    var text = document.createElement("p");
    text.className = "prayer-text";
    text.textContent = r.text;

    var meta = document.createElement("div");
    meta.className = "prayer-meta";
    var who = document.createElement("span");
    who.textContent = r.name + " · " + ago(r.ts);
    meta.appendChild(who);

    var actions = document.createElement("div");
    actions.className = "prayer-actions";

    var pray = document.createElement("button");
    pray.type = "button";
    pray.className = "pray-btn";
    var count = r.prayed || 0;
    function label(done) { pray.textContent = (done ? "You prayed" : "I prayed") + (count ? " · " + count : ""); }
    var done = store.get("tbtPrayed").indexOf(r.id) !== -1;
    label(done);
    if (done) pray.disabled = true;
    pray.addEventListener("click", function () {
      if (pray.disabled) return;
      pray.disabled = true; count += 1; label(true);
      store.add("tbtPrayed", r.id);
      api({ action: "pray", id: r.id }).then(function (res) { if (res && res.ok && res.count) { count = res.count; label(true); } }).catch(function () {});
    });

    var report = document.createElement("button");
    report.type = "button";
    report.className = "report-btn";
    report.textContent = "Report";
    report.addEventListener("click", function () {
      if (!window.confirm("Report this request? It is hidden automatically once enough people flag it.")) return;
      store.add("tbtReported", r.id);
      el.hidden = true;
      api({ action: "report", id: r.id }).catch(function () {});
    });

    actions.appendChild(pray);
    actions.appendChild(report);
    meta.appendChild(actions);
    el.appendChild(text);
    el.appendChild(meta);
    return el;
  }

  function render(list) {
    wall.textContent = "";
    var hidden = store.get("tbtReported");
    var shown = list.filter(function (r) { return hidden.indexOf(r.id) === -1; }).slice(0, LIMIT);
    if (!shown.length) {
      var p = document.createElement("p");
      p.className = "prayer-empty";
      p.textContent = "No requests yet. Be the first to share one.";
      wall.appendChild(p);
      return;
    }
    shown.forEach(function (r) { wall.appendChild(card(r)); });
  }

  function load() {
    if (!wall) return;
    return fetch(ENDPOINT + (ENDPOINT.indexOf("?") === -1 ? "?" : "&") + "action=list")
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.ok) render(res.requests || []); else throw new Error("bad"); })
      .catch(function () {
        wall.textContent = "";
        var p = document.createElement("p");
        p.className = "prayer-empty";
        p.textContent = "The prayer wall couldn't load right now. Please try again in a bit.";
        wall.appendChild(p);
      });
  }
  load();
  if (wall) setInterval(function () { if (document.visibilityState === "visible" && !document.activeElement.matches("textarea, input")) load(); }, 90000);

  if (!form) return;
  var text = form.querySelector("textarea");
  var counter = document.getElementById("prayer-count");
  var msg = document.getElementById("prayer-msg");
  var send = form.querySelector("button[type=submit]");
  text.addEventListener("input", function () { counter.textContent = text.value.length + " / 500"; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.className = "prayer-msg"; msg.textContent = "";
    var fd = new FormData(form);
    send.disabled = true; send.textContent = "Sending…";
    api({
      action: "submit",
      name: fd.get("name"),
      anon: fd.get("anon") === "on",
      text: fd.get("text"),
      visibility: fd.get("visibility"),
      website: fd.get("website"),
      elapsed: Date.now() - loadedAt
    }).then(function (res) {
      if (res && res.ok) {
        var team = res.visibility === "team";
        msg.className = "prayer-msg ok";
        msg.textContent = team ? "Thank you. Your request was sent to the TBT team. It won't appear on the site." : "Thank you. Your request is on the wall.";
        form.reset(); counter.textContent = "0 / 500";
        if (!team && wall) { var first = wall.querySelector(".prayer-empty"); if (first) first.remove(); wall.insertBefore(card(res), wall.firstChild); }
      } else {
        msg.className = "prayer-msg err";
        msg.textContent = (res && res.error && res.error !== "spam" && res.error !== "server error") ? res.error : "That didn't go through. Please try again, or text our team.";
      }
    }).catch(function () {
      msg.className = "prayer-msg err";
      msg.textContent = "That didn't go through. Please check your connection and try again.";
    }).then(function () { send.disabled = false; send.textContent = "Share request"; });
  });
})();
