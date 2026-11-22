// Prayer wall: shows requests, lets people say "I prayed", report a request, and share one.
// Posters get a private link so they can mark their own request answered or remove it.
// Used by /prayer (form, tabs, topics, "Pray through them") and by the homepage and /band
// (a short read-only list).
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

  var LIMIT = wall ? parseInt(wall.getAttribute("data-limit") || "80", 10) : 0;
  var FULL = !!(wall && wall.getAttribute("data-full")); // the full wall page, not a short list
  var loadedAt = Date.now();
  var state = { requests: [], answered: [], prayers: 0, focus: false };

  var store = {
    list: function (k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } },
    add: function (k, v) { try { var a = this.list(k); if (a.indexOf(v) === -1) { a.push(v); localStorage.setItem(k, JSON.stringify(a.slice(-300))); } } catch (e) {} },
    mine: function () { try { return JSON.parse(localStorage.getItem("tbtMine") || "{}"); } catch (e) { return {}; } },
    setMine: function (id, token) { try { var m = this.mine(); m[id] = token; localStorage.setItem("tbtMine", JSON.stringify(m)); } catch (e) {} },
    dropMine: function (id) { try { var m = this.mine(); delete m[id]; localStorage.setItem("tbtMine", JSON.stringify(m)); } catch (e) {} }
  };

  // The name a person chose to show when they pray, remembered on this device only.
  function savedName() { try { return JSON.parse(localStorage.getItem("tbtPrayerName") || "{}"); } catch (e) { return {}; } }
  function saveName(first, last) { try { localStorage.setItem("tbtPrayerName", JSON.stringify({ first: first, last: last })); } catch (e) {} }
  // "Prayed for by Maria S., Jon K. and 3 others" (latest three names; everyone else is counted).
  function prayedByText(names, count) {
    if (!names || !names.length) return "";
    var shown = names.slice(-3), others = Math.max(0, (count || 0) - shown.length);
    var list = shown.length > 1 ? shown.slice(0, -1).join(", ") + (others ? ", " : " and ") + shown[shown.length - 1] : shown[0];
    return "Prayed for by " + list + (others ? " and " + others + (others === 1 ? " other" : " others") : "");
  }
  // First name and last name boxes, filled from the saved name. Returns { box, first, last }.
  function nameFields() {
    var saved = savedName(), box = el("div", "pray-name-fields");
    var f = el("input"); f.type = "text"; f.maxLength = 20; f.placeholder = "First name"; f.autocomplete = "given-name"; f.setAttribute("aria-label", "First name"); f.value = saved.first || "";
    var l = el("input"); l.type = "text"; l.maxLength = 30; l.placeholder = "Last name"; l.autocomplete = "family-name"; l.setAttribute("aria-label", "Last name"); l.value = saved.last || "";
    box.appendChild(f); box.appendChild(l);
    return { box: box, first: f, last: l };
  }

  // A private link from another device looks like /prayer#mine=ID:TOKEN. Remember it, then clean the address bar.
  var hm = /^#mine=([A-Za-z0-9]+):([0-9a-f]+)$/.exec(location.hash);
  if (hm) { store.setMine(hm[1], hm[2]); try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }

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
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago";
    if (s < 86400) { var h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
    var d = Math.round(s / 86400);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  // ---------- card looks: a color and a font the poster picks ----------
  var LOOKS = ["cream", "night", "ocean", "gold", "wine", "sage", "peach", "ink"];
  var LOOK_NAMES = { cream: "Cream", night: "Night", ocean: "Ocean", gold: "Gold", wine: "Wine", sage: "Sage", peach: "Peach", ink: "Ink" };
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
  // Older requests have no look saved, so they get a steady one worked out from their ID.
  function lookOf(r) { return LOOKS.indexOf(r.look) !== -1 ? r.look : LOOKS[hash(String(r.id)) % LOOKS.length]; }
  function sizeOf(t) { var n = String(t).length; return n <= 70 ? "xl" : n <= 160 ? "l" : n <= 300 ? "m" : "s"; }
  function initials(name) { if (!name || name === "Anonymous") return "?"; var p = name.split(" "); return (p[0].charAt(0) + (p[1] ? p[1].charAt(0) : "")).toUpperCase(); }
  function stamp(iso) { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

  // The extra fonts load only once there is a card to show, so pages without one never pay for them.
  var fontsAdded = false;
  function loadFonts() {
    if (fontsAdded) return; fontsAdded = true;
    var l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Oswald:wght@500;600&family=Playfair+Display:ital,wght@0,700;1,600&display=swap";
    document.head.appendChild(l);
  }

  // The colored square with the request on it.
  function face(text, look, extra) {
    loadFonts();
    var f = el("div", "prayer-face look-" + look + " size-" + sizeOf(text) + (extra ? " " + extra : ""));
    f.appendChild(el("p", "prayer-text", text));
    return f;
  }

  // ---------- one request card ----------
  function card(r) {
    var art = el("article", "prayer-card" + (r.answered ? " is-answered" : ""));
    art.setAttribute("data-id", r.id);

    var head = el("div", "prayer-head");
    var av = el("div", "prayer-avatar" + (r.name === "Anonymous" ? " is-anon" : ""));
    av.appendChild(el("span", null, initials(r.name)));
    head.appendChild(av);
    var who = el("div", "prayer-who");
    who.appendChild(el("b", "prayer-name", r.name));
    var sub = el("small", "prayer-sub", (r.topic ? r.topic + " \u00b7 " : "") + ago(r.ts));
    sub.title = stamp(r.ts);
    who.appendChild(sub);
    head.appendChild(who);
    art.appendChild(head);

    var pic = face(r.text, lookOf(r));
    if (r.answered) pic.appendChild(el("span", "prayer-badge", "Answered"));
    art.appendChild(pic);
    if (r.answered && r.update) {
      var up = el("p", "prayer-update");
      up.appendChild(el("b", null, "Answered: "));
      up.appendChild(document.createTextNode(r.update));
      art.appendChild(up);
    }

    var by = el("div", "prayer-prayedby");
    function showBy() { var t = prayedByText(r.prayedBy, count); by.textContent = t; by.hidden = !t; }
    var actions = el("div", "prayer-actions");
    var pray = el("button", "pray-btn");
    pray.type = "button";
    var likes = el("div", "prayer-likes");
    var count = r.prayed || 0;
    var done = store.list("tbtPrayed").indexOf(r.id) !== -1;
    function label() {
      pray.textContent = "\ud83d\ude4f " + (done ? "You prayed" : "I prayed");
      var others = done ? count - 1 : count;
      likes.textContent = done
        ? (others > 0 ? "You and " + others + (others === 1 ? " other" : " others") + " prayed" : "You prayed")
        : (count > 0 ? count + (count === 1 ? " person prayed" : " people prayed") : "Be the first to pray");
      showBy();
    }
    label();
    if (done) pray.disabled = true;
    pray.addEventListener("click", function () {
      if (pray.disabled) return;
      pray.disabled = true; count += 1; done = true; label();
      store.add("tbtPrayed", r.id);
      api({ action: "pray", id: r.id }).then(function (res) { if (res && res.ok && res.count) { count = res.count; label(); } }).catch(function () {});
      offerName(r, art, function (names) { r.prayedBy = names; showBy(); });
    });
    actions.appendChild(pray);

    var token = store.mine()[r.id];
    if (!token) {
      var report = el("button", "report-btn", "Report");
      report.type = "button";
      report.addEventListener("click", function () {
        if (!window.confirm("Report this request? It is hidden automatically once enough people flag it.")) return;
        store.add("tbtReported", r.id);
        art.hidden = true;
        api({ action: "report", id: r.id }).catch(function () {});
      });
      actions.appendChild(report);
    }
    art.appendChild(actions);
    art.appendChild(likes);
    art.appendChild(by);
    var time = el("div", "prayer-time", stamp(r.ts));
    art.appendChild(time);
    if (token && FULL) art.appendChild(ownerControls(r, token, art));
    return art;
  }

  // After "I prayed", offer to add a name. Optional: "No thanks" just closes it.
  function offerName(r, art, onNames) {
    var panel = el("div", "pray-name-panel");
    panel.appendChild(el("p", "pray-name-ask", "Want them to know it was you? Add your name (optional). It shows on the wall as your first name and last initial."));
    var nf = nameFields(); panel.appendChild(nf.box);
    var row = el("div", "pray-name-row");
    var add = el("button", "pray-btn", "Add my name"); add.type = "button";
    var no = el("button", "owner-link", "No thanks"); no.type = "button";
    row.appendChild(add); row.appendChild(no); panel.appendChild(row);
    var note = el("p", "pray-name-note"); panel.appendChild(note);
    no.addEventListener("click", function () { panel.remove(); });
    add.addEventListener("click", function () {
      var first = nf.first.value.trim(), last = nf.last.value.trim();
      if (!first) { note.textContent = "Please enter your first name, or tap No thanks."; nf.first.focus(); return; }
      add.disabled = true;
      api({ action: "prayname", id: r.id, name: first, last: last }).then(function (res) {
        if (res && res.ok) { saveName(first, last); onNames(res.names || []); panel.textContent = ""; panel.appendChild(el("p", "pray-name-ask", "Thank you. Your name was added.")); }
        else { add.disabled = false; note.textContent = (res && res.error) || "That didn't go through. Please try again."; }
      }).catch(function () { add.disabled = false; note.textContent = "That didn't go through. Please try again."; });
    });
    art.appendChild(panel);
  }

  // ---------- the poster's own controls ----------
  function ownerControls(r, token, art) {
    var box = el("div", "prayer-owner");
    var msg = el("p", "prayer-owner-msg");
    msg.setAttribute("role", "status");
    var row = el("div", "prayer-owner-row");

    var mark = el("button", "owner-btn", r.answered ? "Undo answered" : "Mark as answered");
    mark.type = "button";
    var rm = el("button", "owner-link", "Remove my request");
    rm.type = "button";

    var panel = el("div", "prayer-owner-panel");
    panel.hidden = true;
    var ta = el("textarea");
    ta.maxLength = 200; ta.rows = 2; ta.placeholder = "How did God answer? (optional, 200 characters)";
    ta.setAttribute("aria-label", "How was this prayer answered");
    var ok = el("button", "owner-btn", "Mark answered"); ok.type = "button";
    var cancel = el("button", "owner-link", "Cancel"); cancel.type = "button";
    panel.appendChild(ta);
    var prow = el("div", "prayer-owner-row"); prow.appendChild(ok); prow.appendChild(cancel); panel.appendChild(prow);

    mark.addEventListener("click", function () {
      msg.textContent = "";
      if (r.answered) {
        mark.disabled = true;
        api({ action: "answer", id: r.id, token: token, undo: true }).then(function (res) {
          if (res && res.ok) { setAnswered(r.id, false, ""); } else { msg.textContent = (res && res.error) || "That didn't go through."; mark.disabled = false; }
        }).catch(function () { msg.textContent = "That didn't go through. Please try again."; mark.disabled = false; });
      } else { panel.hidden = !panel.hidden; if (!panel.hidden) ta.focus(); }
    });
    cancel.addEventListener("click", function () { panel.hidden = true; });
    ok.addEventListener("click", function () {
      ok.disabled = true; msg.textContent = "";
      api({ action: "answer", id: r.id, token: token, update: ta.value }).then(function (res) {
        if (res && res.ok) { setAnswered(r.id, true, res.update || ""); }
        else { msg.textContent = (res && res.error) || "That didn't go through."; ok.disabled = false; }
      }).catch(function () { msg.textContent = "That didn't go through. Please try again."; ok.disabled = false; });
    });
    rm.addEventListener("click", function () {
      if (!window.confirm("Remove your request from the wall? This can't be undone.")) return;
      api({ action: "remove", id: r.id, token: token }).then(function (res) {
        if (res && res.ok) { store.dropMine(r.id); drop(r.id); }
        else { msg.textContent = (res && res.error) || "That didn't go through."; }
      }).catch(function () { msg.textContent = "That didn't go through. Please try again."; });
    });

    row.appendChild(mark); row.appendChild(rm);
    box.appendChild(row); box.appendChild(panel); box.appendChild(msg);
    return box;
  }

  function findIn(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return i; return -1; }
  function setAnswered(id, answered, update) {
    var from = answered ? state.requests : state.answered, to = answered ? state.answered : state.requests;
    var i = findIn(from, id);
    if (i === -1) return;
    var item = from.splice(i, 1)[0];
    item.answered = answered; item.update = update || "";
    to.unshift(item);
    render();
  }
  function drop(id) {
    var i = findIn(state.requests, id); if (i !== -1) state.requests.splice(i, 1);
    i = findIn(state.answered, id); if (i !== -1) state.answered.splice(i, 1);
    render();
  }

  // ---------- rendering ----------
  function notHidden(list) {
    var hidden = store.list("tbtReported");
    return list.filter(function (r) { return hidden.indexOf(r.id) === -1; });
  }
  // Requests and answered prayers share one wall, newest first.
  function everything() {
    return notHidden(state.requests.concat(state.answered)).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  }

  function render() {
    if (!wall) return;
    var list = everything();
    if (!FULL) list = list.slice(0, LIMIT);
    var fbtn = document.getElementById("prayer-focus-btn");
    var open = notHidden(state.requests);
    if (fbtn) fbtn.hidden = !open.length;
    var panel = document.getElementById("prayer-focus");
    if (FULL && state.focus && open.length) { wall.hidden = true; if (panel) { panel.hidden = false; renderFocus(); } return; }
    state.focus = false;
    wall.hidden = false; if (panel) panel.hidden = true;

    wall.textContent = "";
    if (!list.length) { wall.appendChild(el("p", "prayer-empty", "No requests yet. Be the first to share one.")); return; }
    list.forEach(function (r) { wall.appendChild(card(r)); });
  }

  // ---------- "Pray through them" ----------
  var queue = [], qi = 0;
  function startFocus() {
    var list = notHidden(state.requests);
    var prayed = store.list("tbtPrayed");
    var fresh = list.filter(function (r) { return prayed.indexOf(r.id) === -1; });
    var rest = list.filter(function (r) { return prayed.indexOf(r.id) !== -1; });
    queue = fresh.concat(rest); qi = 0; state.focus = true; render();
    var p = document.getElementById("prayer-focus"); if (p && p.scrollIntoView) p.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function renderFocus() {
    var panel = document.getElementById("prayer-focus");
    panel.textContent = "";
    if (qi >= queue.length) {
      panel.appendChild(el("p", "prayer-focus-done", "That's all of them. Thank you for praying."));
      var back = el("button", "btn btn-ghost btn-md", "Back to the wall"); back.type = "button";
      back.addEventListener("click", function () { state.focus = false; render(); });
      panel.appendChild(back); return;
    }
    var r = queue[qi];
    var bar = el("div", "prayer-focus-bar"); var fill = el("i"); fill.style.width = Math.round((qi / queue.length) * 100) + "%"; bar.appendChild(fill);
    panel.appendChild(bar);
    panel.appendChild(el("div", "prayer-focus-count", "Request " + (qi + 1) + " of " + queue.length));
    panel.appendChild(face(r.text, lookOf(r), "is-focus"));
    panel.appendChild(el("div", "prayer-focus-by", r.name + " · " + (r.topic ? r.topic + " · " : "") + ago(r.ts)));
    var showName = el("label", "prayer-check"); var showBox = el("input"); showBox.type = "checkbox";
    showName.appendChild(showBox); showName.appendChild(el("span", "", "Show my name (first name and last initial) so they know I prayed"));
    var nf = nameFields(); nf.box.hidden = true;
    showBox.addEventListener("change", function () { nf.box.hidden = !showBox.checked; if (showBox.checked && !nf.first.value) nf.first.focus(); });
    panel.appendChild(showName); panel.appendChild(nf.box);
    var focusNote = el("p", "pray-name-note"); panel.appendChild(focusNote);
    var row = el("div", "prayer-focus-row");
    var pray = el("button", "btn btn-gold btn-lg", "I prayed"); pray.type = "button";
    pray.addEventListener("click", function () {
      var first = nf.first.value.trim(), last = nf.last.value.trim(), withName = showBox.checked;
      if (withName && !first) { focusNote.textContent = "Please enter your first name, or untick the box."; nf.first.focus(); return; }
      if (store.list("tbtPrayed").indexOf(r.id) === -1) {
        store.add("tbtPrayed", r.id); r.prayed = (r.prayed || 0) + 1; state.prayers += 1;
        var msg = { action: "pray", id: r.id };
        if (withName) { msg.name = first; msg.last = last; saveName(first, last); }
        api(msg).catch(function () {});
      }
      qi += 1; renderFocus();
    });
    var next = el("button", "btn btn-ghost btn-lg", "Next →"); next.type = "button";
    next.addEventListener("click", function () { qi += 1; renderFocus(); });
    row.appendChild(pray); row.appendChild(next); panel.appendChild(row);
    var exit = el("button", "owner-link", "Back to the list"); exit.type = "button";
    exit.addEventListener("click", function () { state.focus = false; render(); });
    panel.appendChild(exit);
  }
  var fbtn0 = document.getElementById("prayer-focus-btn");
  if (fbtn0) fbtn0.addEventListener("click", function () { startFocus(); });

  // ---------- loading ----------
  function load() {
    if (!wall) return Promise.resolve();
    return fetch(ENDPOINT + (ENDPOINT.indexOf("?") === -1 ? "?" : "&") + "action=list")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!(res && res.ok)) throw new Error("bad");
        state.requests = res.requests || []; state.answered = res.answered || []; state.prayers = res.prayers || 0;
        render();
      })
      .catch(function () {
        wall.textContent = "";
        wall.appendChild(el("p", "prayer-empty", "The prayer wall couldn't load right now. Please try again in a bit."));
      });
  }
  load();
  if (wall) setInterval(function () {
    var a = document.activeElement;
    if (document.visibilityState === "visible" && !state.focus && !(a && a.matches && a.matches("textarea, input"))) load();
  }, 90000);

  // ---------- the share form ----------
  if (!form) return;
  var text = form.querySelector("textarea");
  var counter = document.getElementById("prayer-count");
  var msg = document.getElementById("prayer-msg");
  var send = form.querySelector("button[type=submit]");
  var manage = document.getElementById("prayer-manage");
  // Picking a look: a row of swatches and a live preview of the card.
  var looksBox = document.getElementById("pf-looks"), preview = document.getElementById("pf-preview");
  function currentLook() { var c = form.querySelector("input[name=look]:checked"); return c ? c.value : LOOKS[0]; }
  function drawPreview() {
    if (!preview) return;
    var t = text.value.trim() || "Your request will look like this.";
    preview.textContent = "";
    preview.appendChild(face(t, currentLook()));
  }
  if (looksBox) {
    var pick = 0; // cream, the calmest look, is the starting point
    LOOKS.forEach(function (k, i) {
      var lab = el("label", "look-opt");
      var inp = el("input"); inp.type = "radio"; inp.name = "look"; inp.value = k; inp.checked = i === pick;
      inp.setAttribute("aria-label", LOOK_NAMES[k]);
      inp.addEventListener("change", drawPreview);
      var sw = el("span", "look-swatch look-" + k); sw.appendChild(el("i", null, "Aa")); sw.title = LOOK_NAMES[k];
      lab.appendChild(inp); lab.appendChild(sw); looksBox.appendChild(lab);
    });
    loadFonts();
    drawPreview();
  }
  text.addEventListener("input", function () { counter.textContent = text.value.length + " / 500"; drawPreview(); });

  // First and last name are always required.
  var firstIn = form.querySelector("#pf-name"), lastIn = form.querySelector("#pf-last");
  form.addEventListener("reset", function () {
    setTimeout(function () {
      var radios = form.querySelectorAll("input[name=look]");
      if (radios.length) { radios[0].checked = true; drawPreview(); }
    }, 0);
  });

  function showManage(res) {
    if (!manage || !res.token) return;
    var link = location.origin + "/prayer#mine=" + res.id + ":" + res.token;
    manage.textContent = "";
    manage.appendChild(el("p", "prayer-manage-title", "Your private link"));
    manage.appendChild(el("p", "prayer-hint", "This phone will remember your request, so you can mark it answered or remove it right here. To do that from another device, save this link. Don't share it. Anyone who has it can change your request."));
    var input = el("input"); input.type = "text"; input.readOnly = true; input.value = link; input.setAttribute("aria-label", "Your private link");
    input.addEventListener("focus", function () { input.select(); });
    var copy = el("button", "btn btn-ghost btn-md", "Copy link"); copy.type = "button";
    copy.addEventListener("click", function () {
      var done = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy link"; }, 2200); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { input.select(); });
      else input.select();
    });
    var row = el("div", "prayer-manage-row"); row.appendChild(input); row.appendChild(copy); manage.appendChild(row);
    manage.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.className = "prayer-msg"; msg.textContent = "";
    if (manage) manage.hidden = true;
    var fd = new FormData(form);
    if (!String(fd.get("name") || "").trim() || !String(fd.get("last") || "").trim()) {
      msg.className = "prayer-msg err";
      msg.textContent = "Please enter your first and last name.";
      (String(fd.get("name") || "").trim() ? lastIn : firstIn).focus();
      return;
    }
    send.disabled = true; send.textContent = "Sending…";
    api({
      action: "submit",
      name: fd.get("name"),
      last: fd.get("last"),
      text: fd.get("text"),
      topic: fd.get("topic"),
      look: fd.get("look"),
      visibility: fd.get("visibility"),
      website: fd.get("website"),
      elapsed: Date.now() - loadedAt
    }).then(function (res) {
      if (res && res.ok) {
        var team = res.visibility === "team";
        store.setMine(res.id, res.token);
        msg.className = "prayer-msg ok";
        msg.textContent = team ? "Thank you. Your request was sent to the TBT team. It won't appear on the site." : "Thank you. Your request is on the wall.";
        form.reset(); counter.textContent = "0 / 500";
        showManage(res);
        if (!team && wall) {
          state.requests.unshift({ id: res.id, name: res.name, text: res.text, ts: res.ts, prayed: 0, topic: res.topic || "", look: res.look || "", answered: false, update: "" });
          render();
        }
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
