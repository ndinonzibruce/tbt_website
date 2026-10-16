// Add-to-calendar helpers, shared by the Events page, event pages, the
// "What's Coming Up" cards, and tools/build_calendar.js (which writes the
// subscribable feed at calendar/tbt.ics). All times are America/New_York.
(function (root) {
  var TZ = "America/New_York";
  var FEED_URL = "https://tbtysu.org/calendar/tbt.ics";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(iso) { return iso.replace(/-/g, ""); }
  function addDays(iso, n) {
    var p = iso.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  // "3:55pm" | "6–9pm" | "11:30am–2pm" | "Noon" | "All day" | "" -> {allDay} or {sh, sm, eh, em}
  function parseTime(str) {
    str = (str || "").trim();
    if (!str || /all (day|week)/i.test(str)) return { allDay: true };
    if (/^noon$/i.test(str)) return { sh: 12, sm: 0, eh: 13, em: 0 };
    var parts = str.split(/\s*[–-]\s*/);
    function clock(s, mer) {
      var m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (!m) return null;
      var h = +m[1], mi = +(m[2] || 0), ap = (m[3] || mer || "").toLowerCase();
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      return { h: h, m: mi, explicit: !!m[3] };
    }
    var endMer = parts[1] ? (parts[1].match(/am|pm/i) || [""])[0] : "";
    var s = clock(parts[0], endMer);
    if (!s) return { allDay: true };
    var e = parts[1] ? clock(parts[1]) : null;
    if (e && !s.explicit && s.h * 60 + s.m >= e.h * 60 + e.m) s.h -= 12; // "11–1pm" means 11am
    if (!e) { e = { h: s.h + 1, m: s.m }; }
    return { sh: s.h, sm: s.m, eh: e.h, em: e.m };
  }

  // One calendar entry can describe two things ("Service + Sunday School", "9:15 & 10:55am").
  function expand(item) {
    var title = item.title || "", time = item.time || "";
    var titles = title.split(/\s\+\s/), times = time.split(/\s*&\s*/);
    var out = [];
    if (titles.length > 1 && titles.length === times.length) {
      var mer = (times[times.length - 1].match(/am|pm/i) || [""])[0];
      titles.forEach(function (t, i) {
        out.push({ title: t, time: /am|pm/i.test(times[i]) ? times[i] : times[i] + mer, date: item.date, endDate: item.endDate, location: item.venue || item.location, desc: item.desc });
      });
    } else {
      out.push({ title: title, time: time, date: item.date, endDate: item.endDate, location: item.venue || item.location, desc: item.desc });
    }
    return out.map(function (ev) {
      var t = parseTime(ev.time);
      ev.allDay = !!t.allDay;
      if (!t.allDay) { ev.sh = t.sh; ev.sm = t.sm; ev.eh = t.eh; ev.em = t.em; }
      return ev;
    });
  }

  function dtParts(ev) {
    if (ev.allDay) {
      var last = ev.endDate || ev.date; // endDate is the last day of a multi-day event
      return { start: ymd(ev.date), end: ymd(addDays(last, 1)) };
    }
    return {
      start: ymd(ev.date) + "T" + pad(ev.sh) + pad(ev.sm) + "00",
      end: ymd(ev.date) + "T" + pad(ev.eh) + pad(ev.em) + "00"
    };
  }

  function googleUrl(ev) {
    var p = dtParts(ev);
    var q = "action=TEMPLATE&text=" + encodeURIComponent(ev.title) +
      "&dates=" + p.start + "/" + p.end +
      (ev.allDay ? "" : "&ctz=" + encodeURIComponent(TZ)) +
      "&details=" + encodeURIComponent((ev.desc ? ev.desc + "\n\n" : "") + "The Bible Talks · tbtysu.org") +
      (ev.location ? "&location=" + encodeURIComponent(ev.location) : "");
    return "https://calendar.google.com/calendar/render?" + q;
  }

  function esc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) {
    var out = [], bytes = 0, cur = "";
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join("\r\n ");
  }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  var VTIMEZONE = [
    "BEGIN:VTIMEZONE", "TZID:" + TZ,
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE"
  ];

  function icsText(events, calName) {
    var now = new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + "Z";
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Bible Talks//tbtysu.org//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    if (calName) { L.push("X-WR-CALNAME:" + esc(calName), "X-WR-TIMEZONE:" + TZ, "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"); }
    L = L.concat(VTIMEZONE);
    events.forEach(function (ev) {
      var p = dtParts(ev);
      L.push("BEGIN:VEVENT");
      L.push("UID:" + ymd(ev.date) + "-" + slug(ev.title) + "@tbtysu.org");
      L.push("DTSTAMP:" + stamp);
      if (ev.allDay) { L.push("DTSTART;VALUE=DATE:" + p.start, "DTEND;VALUE=DATE:" + p.end); }
      else { L.push("DTSTART;TZID=" + TZ + ":" + p.start, "DTEND;TZID=" + TZ + ":" + p.end); }
      L.push("SUMMARY:" + esc(ev.title));
      if (ev.location) L.push("LOCATION:" + esc(ev.location));
      L.push("DESCRIPTION:" + esc((ev.desc ? ev.desc + "\n\n" : "") + "The Bible Talks · tbtysu.org"));
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }

  var TBTCal = { parseTime: parseTime, expand: expand, googleUrl: googleUrl, icsText: icsText, feedUrl: FEED_URL, slug: slug };
  root.TBTCal = TBTCal;
  if (typeof document === "undefined") return;

  // ---- Browser UI: <div class="add-cal" data-title data-date data-time ...> ----
  function render(container, item, staticIcs) {
    var evs = expand(item);
    if (!evs.length) return;
    var d = document.createElement("details");
    d.className = "cal-add";
    var sum = document.createElement("summary");
    sum.textContent = "Add to calendar";
    var menu = document.createElement("div");
    menu.className = "cal-add-menu";
    evs.forEach(function (ev) {
      var g = document.createElement("a");
      g.href = googleUrl(ev); g.target = "_blank"; g.rel = "noopener";
      g.textContent = evs.length > 1 ? "Google Calendar: " + ev.title : "Google Calendar";
      menu.appendChild(g);
    });
    var ics = document.createElement("a");
    ics.textContent = "Apple / Outlook (.ics)";
    if (staticIcs) { ics.href = staticIcs; }
    else {
      ics.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(icsText(evs));
      ics.download = slug(item.title) + ".ics";
    }
    menu.appendChild(ics);
    d.appendChild(sum); d.appendChild(menu);
    container.appendChild(d);
  }
  TBTCal.render = render;

  function init() {
    var nodes = document.querySelectorAll(".add-cal[data-title]");
    Array.prototype.forEach.call(nodes, function (n) {
      render(n, { title: n.dataset.title, date: n.dataset.date, endDate: n.dataset.endDate, time: n.dataset.time, venue: n.dataset.location, desc: n.dataset.desc }, n.dataset.ics);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : this);
