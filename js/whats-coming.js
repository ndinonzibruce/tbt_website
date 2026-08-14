// "What's Coming Up" — shared data + engine, used by /band and the homepage.
// Computed fresh from today's date on every page load, so it rolls forward
// automatically with no manual editing required.

var WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// === CHURCH CENTER EVENTS ===================================================
// Real, dated, registration-style events sourced from the ministry's Church
// Center page (https://old-north.cls.co/site/tbt). This array is kept in sync
// automatically by the weekly "TBT weekly events sync" cloud routine, the same
// one that maintains events.html — add/edit/remove entries here to mirror
// whatever's true on Church Center. Safe for automation to touch.
var CHURCH_CENTER_EVENTS = [
  { date: "2026-08-21", title: "Jake and Sam's Farewell Party", time: "5–9pm", desc: "Food truck, swimming, pickleball, and a prayer send-off at 7:30pm. Sevakeen Country Club, Salem, OH.", link: { text: "Register →", href: "https://old-north-church-17379.churchcenter.com/registrations/events/3807183" } },
  { date: "2026-08-23", title: "Campus Kickoff", time: "11:30am–2pm", desc: "Welcome back to campus! Come find out what TBT is all about as we kick off the new school year. No TBT Sunday School this week." },
  { date: "2026-09-04", title: "Fall Bible Conference 2026", time: "Through Sep 6", desc: "“Family Matters — But Not the Way You Think.” Talks, singing, and workshop groups in the book of Ruth at Camp Burton, Burton, OH.", link: { text: "Register →", href: "https://old-north-church-17379.churchcenter.com/registrations/events/3576984" } }
];

// === HAND-MAINTAINED SEMESTER SCHEDULE ======================================
// Sunday School series + the Monday Street Talk / Prayer for Campus / Bible
// Talk & Prayer (James series) rhythm, plus campus-wide dates (IGNITE, first
// day of classes). This comes from Bruce's own semester planning, NOT Church
// Center — the weekly sync routine must never add, remove, or edit entries in
// this array. Update it by hand (or ask Claude) when the semester plan changes.
var SEMESTER_SCHEDULE_EVENTS = [
  { date: "2026-08-09", title: "TBT Sunday School — Better Together, Talk 4", time: "11am", desc: "Forging Biblical Friendships, Part 2. Service at Old North Church is at 9:15am." },
  { date: "2026-08-16", title: "TBT Sunday School — Better Together, Talk 5", time: "11am", desc: "Panel Morning: Friendships That Shaped Us. Service at Old North Church is at 9:15am." },
  { date: "2026-08-20", title: "IGNITE at YSU", time: "3:00pm", desc: "YSU's welcome event for new students — tailgate games, food, and live music by the Kilcawley fountain.", link: { text: "Learn more →", href: "https://ysu.edu/first-year-student-services/ignite" } },
  { date: "2026-08-24", title: "Welcome to TBT!", time: "3:55pm", desc: "Open week on campus — no structured teaching yet, just come say hi before the James series kicks off next Monday." },
  { date: "2026-08-24", title: "First Day of Classes", time: "All day", desc: "Fall semester officially begins at YSU." },
  { date: "2026-08-30", title: "TBT Sunday School — Better Together, Talk 6", time: "11am", desc: "Friends on a Mission — rescheduled from Aug 23 because of Campus Kickoff. Service at Old North Church is at 9:15am." },
  { date: "2026-08-31", title: "Street Talk / Tabling", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-08-31", title: "Bible Talk & Prayer — Wk 1: Brother / Servant", time: "3:55pm", desc: "James 1:1. Williamson Building, Room 2212." },
  { date: "2026-09-07", title: "Labor Day — No Campus", time: "", desc: "No Street Talk, Prayer, or Bible Talk this week." },
  { date: "2026-09-14", title: "Prayer for Campus", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-09-14", title: "Bible Talk & Prayer — Wk 2: Trials / Temptations", time: "3:55pm", desc: "James 1:2–18. Williamson Building, Room 2212." },
  { date: "2026-09-21", title: "Street Talk", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-09-21", title: "Bible Talk & Prayer — Wk 3: Hearer / Doer", time: "3:55pm", desc: "James 1:19–27. Williamson Building, Room 2212." },
  { date: "2026-09-28", title: "Prayer for Campus", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-09-28", title: "Bible Talk & Prayer — Wk 4: Judgment / Mercy", time: "3:55pm", desc: "James 2:1–13. Williamson Building, Room 2212." },
  { date: "2026-10-05", title: "Street Talk", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-10-05", title: "Bible Talk & Prayer — Wk 5: Faith / Works", time: "3:55pm", desc: "James 2:14–26. Williamson Building, Room 2212." },
  { date: "2026-10-12", title: "Prayer for Campus", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-10-12", title: "Bible Talk & Prayer — Wk 6: Blessings / Curses", time: "3:55pm", desc: "James 3:1–12. Williamson Building, Room 2212." },
  { date: "2026-10-19", title: "Street Talk", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-10-19", title: "Bible Talk & Prayer — Wk 7: False Wisdom / True Wisdom", time: "3:55pm", desc: "James 3:13–18. Williamson Building, Room 2212." },
  { date: "2026-10-26", title: "Prayer for Campus", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-10-26", title: "Bible Talk & Prayer — Wk 8: Worldliness / Godliness", time: "3:55pm", desc: "James 4:1–10. Williamson Building, Room 2212." },
  { date: "2026-11-02", title: "Street Talk", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-11-02", title: "Bible Talk & Prayer — Wk 9: Arrogance / Humility", time: "3:55pm", desc: "James 4:11–17. Williamson Building, Room 2212." },
  { date: "2026-11-09", title: "Prayer for Campus", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-11-09", title: "Bible Talk & Prayer — Wk 10: Oppressor / Laborer", time: "3:55pm", desc: "James 5:1–6. Williamson Building, Room 2212." },
  { date: "2026-11-16", title: "Street Talk", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-11-16", title: "Bible Talk & Prayer — Wk 11: Suffering / Comfort", time: "3:55pm", desc: "James 5:7–12. Williamson Building, Room 2212." },
  { date: "2026-11-23", title: "Prayer for Campus", time: "Noon", desc: "Out on YSU campus." },
  { date: "2026-11-23", title: "Bible Talk & Prayer — Wk 12: Faithful / Faithless", time: "3:55pm", desc: "James 5:13–20. Williamson Building, Room 2212." },
  { date: "2026-11-30", title: "Grill the Pastor", time: "3:55pm", desc: "Out on YSU campus." }
];

var ONE_TIME_EVENTS = CHURCH_CENTER_EVENTS.concat(SEMESTER_SCHEDULE_EVENTS);

// Recurring weekly events — occurrences are generated automatically within the horizon window,
// except on dates already covered above by a specific dated entry (see skipDates).
// Hand-maintained, same as SEMESTER_SCHEDULE_EVENTS — the sync routine must not touch this.
var RECURRING_EVENTS = [
  { dow: 0, title: "Sunday Service + TBT Sunday School", time: "9:15 & 11am", desc: "Join the service at Old North Church at 9:15am, then stick around for TBT Sunday School at 11am.", startDate: "2026-08-09", skipDates: ["2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30"] }
];

function wcLocalDate(iso) { return new Date(iso + "T00:00:00"); }
function wcIsoDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function wcNextWeekday(from, targetDow) {
  var d = new Date(from);
  d.setDate(d.getDate() + ((targetDow - d.getDay() + 7) % 7));
  return d;
}

function getWhatsComingItems(horizonDays) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var horizon = new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  var items = ONE_TIME_EVENTS.slice();
  RECURRING_EVENTS.forEach(function (ev) {
    var start = ev.startDate ? wcLocalDate(ev.startDate) : today;
    var skip = ev.skipDates || [];
    for (var d = wcNextWeekday(today, ev.dow); d <= horizon; d.setDate(d.getDate() + 7)) {
      var iso = wcIsoDate(d);
      if (d >= start && skip.indexOf(iso) === -1) {
        items.push({ date: iso, title: ev.title, time: ev.time, desc: ev.desc });
      }
    }
  });

  return items.filter(function (e) {
    var ed = wcLocalDate(e.date);
    return ed >= today && ed <= horizon;
  }).sort(function (a, b) { return a.date.localeCompare(b.date); });
}

function renderWhatsComingUp(containerId, options) {
  options = options || {};
  var horizonDays = options.horizonDays || 16;
  var maxItems = options.maxItems || null;
  var container = document.getElementById(containerId);
  if (!container) return;

  var items = getWhatsComingItems(horizonDays);
  if (maxItems) items = items.slice(0, maxItems);

  items.forEach(function (item) {
    var d = wcLocalDate(item.date);
    var row = document.createElement("div");
    row.className = "week-row";

    var tile = document.createElement("div");
    tile.className = "cal-tile";
    tile.innerHTML =
      '<div class="cal-month">' + MONTH_NAMES[d.getMonth()] + '</div>' +
      '<div class="cal-day">' + d.getDate() + '</div>' +
      '<div class="cal-weekday">' + WEEKDAY_NAMES[d.getDay()] + '</div>';

    var body = document.createElement("div");
    var title = document.createElement("div");
    title.className = "week-title";
    title.textContent = item.title + " ";
    var time = document.createElement("span");
    time.className = "week-time";
    time.textContent = item.time;
    title.appendChild(time);

    var desc = document.createElement("p");
    desc.className = "week-detail";
    desc.textContent = item.desc + " ";
    if (item.link) {
      var a = document.createElement("a");
      a.href = item.link.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = item.link.text;
      desc.appendChild(a);
    }

    body.appendChild(title);
    body.appendChild(desc);
    row.appendChild(tile);
    row.appendChild(body);
    container.appendChild(row);
  });
}
