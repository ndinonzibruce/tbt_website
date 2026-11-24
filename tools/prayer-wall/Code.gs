// TBT Prayer Wall: Google Apps Script backend.
// Stores requests in the spreadsheet this script is attached to, and serves them
// to tbtysu.org/prayer. Setup steps are in tools/prayer-wall/README.md.
//
// To hide a request: change its Status cell to "hidden". To bring it back: "live".
// Requests marked "team" in Visibility are never shown on the website. Everyone gives a first and last name, public or team-only.
// A poster can tick "Email me when someone prays": their email is stored in the Email column (public requests only),
// used for one short email a day (sendPrayerNotifications), and cleared when the request is answered, removed,
// hidden or expires, or when they follow the stop link. It is never sent to the website.
// A poster gets a private link (a secret token, stored here only as a hash) that lets
// them mark their own request answered or remove it. You can do the same in the sheet:
// set Answered to "yes" and fill in Update, or set Status to "hidden".

var NOTIFY_EMAIL = "bchimani@oldnorthchurch.org"; // gets an email for each new request (public and team-only), report, and answered prayer; "" turns this off
var NOTIFY_BCC = ["oelias@oldnorthchurch.org", "cmercer@oldnorthchurch.org", "ahodge@oldnorthchurch.org"]; // TBT staff, blind copied on the same emails
// Church leaders get ONLY a weekly summary (sendLeaderDigest): new public requests and public requests marked
// answered. Never team-only requests, never reports, and never the instant emails above.
var NOTIFY_LEADERS = ["Aeccourt7@gmail.com", "audreyshannon03@gmail.com", "HoslerBrooke02@gmail.com", "David.m.toepfer@gmail.com", "andrew.lund55@gmail.com", "Jasonrachau@gmail.com", "Drokinj@gmail.com", "Lance7058@gmail.com", "mtlessons@gmail.com", "masondebrosse@gmail.com", "mfabianl1025@gmail.com", "Meaganbarbee2020@gmail.com", "michaelschrock1@gmail.com", "michellemschrock@gmail.com", "sarahdrokin@gmail.com", "shelbie1224@gmail.com"];
var SUMMARY_STARTS_AT = Date.parse("2026-11-09T00:00:00-05:00"); // the scheduled weekly summary stays quiet before this date; sendLeaderSummaryNow() works any time
var SHEET_NAME = "Requests";
var WALL_DAYS = 30;          // unanswered requests older than this drop off the public wall (they stay in the sheet)
var ANSWERED_DAYS = 14;      // an answered request stays on the wall this long after it is marked answered
var WALL_LIMIT = 80;         // newest requests shown on the wall
var MIN_LEN = 5;
var MAX_LEN = 500;
var MAX_UPDATE_LEN = 200;
var TOPICS = ["Health", "Family", "School", "Faith"];
var LOOKS = ["cream", "night", "ocean", "gold", "wine", "sage", "peach", "ink"]; // the card colors and fonts a poster can pick (the page, js/prayer.js, draws them)
var HIDE_AFTER_REPORTS = 3;  // a request reported this many times is hidden automatically
var MAX_PER_HOUR = 40;       // brake against floods of submissions
var MIN_FILL_MS = 3000;      // a human takes longer than this to fill in the form

var COLS = ["ID", "Time", "Name", "Request", "Visibility", "Status", "Prayed", "Reports", "Topic", "Answered", "Update", "AnsweredAt", "TokenHash", "PrayedBy", "Look", "Email", "Notified"];
var C = { ID: 0, TIME: 1, NAME: 2, TEXT: 3, VIS: 4, STATUS: 5, PRAYED: 6, REPORTS: 7, TOPIC: 8, ANSWERED: 9, UPDATE: 10, ANSWERED_AT: 11, TOKEN: 12, PRAYED_BY: 13, LOOK: 14, EMAIL: 15, NOTIFIED: 16 };
var SITE_URL = "https://tbtysu.org";
var PRAYER_EMAILS_PER_RUN = 60; // daily "someone prayed" emails per run; Google allows about 100 recipients a day, and staff and leader mail share that
var MAX_PRAYER_NAMES = 40; // names people chose to show when they prayed, kept per request (the card shows the latest few)

// ---------- run once from the editor (safe to run again after an update) ----------
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getMaxColumns && sh.getMaxColumns() < COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), COLS.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]);
  sh.setFrozenRows(1);
  sh.setColumnWidth(4, 520);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("digestSince")) props.setProperty("digestSince", String(Date.now())); // the first digest covers what comes after setup
}

// ---------- web app entry points ----------
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "list";
    if (action !== "list") return out({ ok: false, error: "unknown action" });
    var cache = CacheService.getScriptCache();
    var hit = cache.get("wall2");
    if (hit) return raw(hit);
    var json = JSON.stringify(wallPayload(Date.now()));
    cache.put("wall2", json, 60);
    return raw(json);
  } catch (err) {
    return out({ ok: false, error: "server error" });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    lock.waitLock(10000);
    var result;
    if (body.action === "submit") result = submit(body, Date.now());
    else if (body.action === "pray") result = pray(body);
    else if (body.action === "prayname") result = prayName(body);
    else if (body.action === "report") result = bump(body.id, C.REPORTS + 1, true);
    else if (body.action === "answer") result = answer(body, Date.now());
    else if (body.action === "remove") result = removeOwn(body);
    else if (body.action === "stop") result = stopEmails(body);
    else result = { ok: false, error: "unknown action" };
    if (result.ok) CacheService.getScriptCache().remove("wall2");
    return out(result);
  } catch (err) {
    return out({ ok: false, error: "server error" });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------- cleaning and checks ----------
// Shows the name as the poster typed it: first name plus last name. Returns "" when no usable first name was given.
function cleanName(raw, last) {
  var first = String(raw || "").trim().split(/\s+/)[0] || "";
  first = first.replace(/[^A-Za-z\u00C0-\u024F'\-]/g, "").slice(0, 20);
  if (!first) return "";
  var family = String(last || "").replace(/[^A-Za-z\u00C0-\u024F'\- ]/g, "").replace(/\s+/g, " ").trim().slice(0, 30).trim();
  return family ? first + " " + family : first;
}

function cleanText(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function cleanTopic(raw) {
  return TOPICS.indexOf(raw) !== -1 ? raw : "";
}

// An email address for prayer updates, or "" when it isn't a plausible address.
function cleanEmail(raw) {
  var e = String(raw || "").trim().toLowerCase();
  return e.length <= 100 && /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(e) ? e : "";
}

// A card look the poster picked. Anything else is left blank, and the page picks one from the post's ID.
function cleanLook(raw) {
  return LOOKS.indexOf(raw) !== -1 ? raw : "";
}

// Links, emails and phone numbers have no place on a public wall (privacy and spam).
function hasContactInfo(text) {
  return /https?:|www\.|[A-Za-z0-9-]+\.(com|net|org|edu|io|co|us|me|ly)\b/i.test(text) ||
    /[^\s@]+@[^\s@]+/.test(text) ||
    /(\+?\d[\s.\-()]*){10,}/.test(text);
}

function validate(body, recentTexts) {
  if (body.website) return { ok: false, error: "spam" };
  if (!(Number(body.elapsed) >= MIN_FILL_MS)) return { ok: false, error: "Please take a moment before sending." };
  var text = cleanText(body.text);
  if (text.length < MIN_LEN) return { ok: false, error: "Please write a little more." };
  if (text.length > MAX_LEN) return { ok: false, error: "Please keep it under " + MAX_LEN + " characters." };
  if (hasContactInfo(text)) return { ok: false, error: "Please take out links, email addresses and phone numbers." };
  if (recentTexts.indexOf(text.toLowerCase()) !== -1) return { ok: false, error: "That request is already posted." };
  var visibility = body.visibility === "team" ? "team" : "public";
  // Everyone signs with a first and last name. Anonymous posting is not an option.
  var name = cleanName(body.name, body.last);
  if (!name || name.split(" ").length < 2) return { ok: false, error: "Please enter your first and last name." };
  var email = "";
  if (visibility === "public" && body.notify) {
    email = cleanEmail(body.email);
    if (!email) return { ok: false, error: "Please enter a valid email address, or untick the email box." };
  }
  return {
    ok: true,
    email: email,
    text: text,
    name: name,
    visibility: visibility,
    topic: cleanTopic(body.topic),
    look: cleanLook(body.look)
  };
}

// ---------- private link token ----------
function newToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 32);
}

function toHex(bytes) {
  return bytes.map(function (b) { return ("0" + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join("");
}

function hashToken(token) {
  return toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token)));
}

// The "stop these emails" link carries a signed token for the request, made with a secret only this script knows.
function stopKey() {
  var props = PropertiesService.getScriptProperties(), k = props.getProperty("stopKey");
  if (!k) { k = newToken() + newToken(); props.setProperty("stopKey", k); }
  return k;
}

function stopToken(id) {
  return toHex(Utilities.computeHmacSha256Signature(String(id), stopKey())).slice(0, 24);
}

// ---------- sheet access ----------
function sheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function rows() {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, COLS.length).getValues();
}

function findRow(id) {
  var data = rows();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][C.ID]) === String(id)) return { index: i, row: data[i] };
  }
  return null;
}

function ownedRow(id, token) {
  var hit = findRow(id);
  if (!hit || !token) return null;
  return String(hit.row[C.TOKEN]) === hashToken(token) ? hit : null;
}

// ---------- actions ----------
function submit(body, now) {
  var cache = CacheService.getScriptCache();
  var bucket = "rate_" + Math.floor(now / 3600000);
  var count = Number(cache.get(bucket) || 0);
  if (count >= MAX_PER_HOUR) return { ok: false, error: "We're getting a lot of requests right now. Please try again in a bit." };

  var all = rows();
  var recent = all.slice(-50).map(function (r) { return String(r[C.TEXT]).toLowerCase(); });
  var v = validate(body, recent);
  if (!v.ok) return v;

  // The "r" keeps Sheets from turning an all-digit ID into a number and dropping leading zeros.
  var id = "r" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  var token = newToken();
  var time = new Date(now).toISOString();
  sheet().appendRow([id, time, v.name, v.text, v.visibility, "live", 0, 0, v.topic, "", "", "", hashToken(token), "", v.look, v.email, v.email ? "p0n0" : ""]);
  cache.put(bucket, String(count + 1), 3600);
  notify((v.visibility === "team" ? "[TEAM ONLY] " : "") + "New prayer request from " + v.name,
    v.text + "\n\nVisibility: " + v.visibility + (v.topic ? "\nTopic: " + v.topic : "") + "\nTo hide it, set Status to \"hidden\" in the sheet.");
  return { ok: true, id: id, token: token, name: v.name, text: v.text, ts: time, prayed: 0, visibility: v.visibility, topic: v.topic, look: v.look, notify: !!v.email, answered: false, update: "" };
}

// column is 1-based. For reports, the request is hidden once enough people flag it.
function bump(id, column, isReport) {
  var sh = sheet(), hit = findRow(id);
  if (!hit || hit.row[C.VIS] !== "public") return { ok: false, error: "not found" };
  var n = Number(hit.row[column - 1] || 0) + 1;
  sh.getRange(hit.index + 2, column).setValue(n);
  if (isReport) {
    if (n >= HIDE_AFTER_REPORTS && hit.row[C.STATUS] === "live") sh.getRange(hit.index + 2, C.STATUS + 1).setValue("hidden");
    notify("Prayer request reported (" + n + ")", String(hit.row[C.TEXT]) + "\n\nReports so far: " + n +
      (n >= HIDE_AFTER_REPORTS ? "\nIt has been hidden automatically." : ""));
  }
  return { ok: true, count: n };
}

// ---------- "I prayed", with an optional name ----------
// A name is shown on the wall only when the person chooses to add it: first name plus last initial ("Maria S.").
function prayerName(first, last) {
  var f = String(first || "").trim().split(/\s+/)[0] || "";
  f = f.replace(/[^A-Za-z\u00C0-\u024F'\-]/g, "").slice(0, 20);
  if (!f) return "";
  var l = String(last || "").replace(/[^A-Za-z\u00C0-\u024F]/g, "").charAt(0).toUpperCase();
  return l ? f + " " + l + "." : f;
}

function prayedByList(row) {
  var v = String(row[C.PRAYED_BY] || "");
  return v ? v.split("|") : [];
}

// Adds the name unless it is empty or already listed (repeat taps do nothing). Returns the saved list.
function addPrayerName(hit, body) {
  var names = prayedByList(hit.row), name = prayerName(body.name, body.last);
  if (!name) return names;
  var dup = names.some(function (n) { return n.toLowerCase() === name.toLowerCase(); });
  if (dup || names.length >= MAX_PRAYER_NAMES) return names;
  names.push(name);
  sheet().getRange(hit.index + 2, C.PRAYED_BY + 1).setValue(names.join("|"));
  return names;
}

function pray(body) {
  var res = bump(body.id, C.PRAYED + 1, false);
  if (!res.ok) return res;
  if (body.name) res.names = addPrayerName(findRow(body.id), body);
  return res;
}

function prayName(body) {
  var hit = findRow(body.id);
  if (!hit || hit.row[C.VIS] !== "public") return { ok: false, error: "not found" };
  if (!prayerName(body.name, body.last)) return { ok: false, error: "Please enter your first name." };
  return { ok: true, names: addPrayerName(hit, body) };
}

// The poster marks their own request answered (or undoes it) with the private token.
function answer(body, now) {
  var hit = ownedRow(body.id, body.token);
  if (!hit) return { ok: false, error: "That link doesn't match this request." };
  var sh = sheet(), r = hit.index + 2;
  if (body.undo) {
    sh.getRange(r, C.ANSWERED + 1, 1, 3).setValues([["", "", ""]]);
    return { ok: true, answered: false, update: "" };
  }
  var update = cleanText(body.update);
  if (update.length > MAX_UPDATE_LEN) return { ok: false, error: "Please keep the update under " + MAX_UPDATE_LEN + " characters." };
  if (update && hasContactInfo(update)) return { ok: false, error: "Please take out links, email addresses and phone numbers." };
  var at = new Date(now).toISOString();
  sh.getRange(r, C.ANSWERED + 1, 1, 3).setValues([["yes", update, at]]);
  clearEmail(hit.index);
  notify("Prayer answered", String(hit.row[C.TEXT]) + "\n\nUpdate: " + (update || "(none)"));
  return { ok: true, answered: true, update: update, answeredAt: at };
}

// The poster removes their own request. The row stays in the sheet with Status "removed".
function removeOwn(body) {
  var hit = ownedRow(body.id, body.token);
  if (!hit) return { ok: false, error: "That link doesn't match this request." };
  sheet().getRange(hit.index + 2, C.STATUS + 1).setValue("removed");
  clearEmail(hit.index);
  return { ok: true };
}

// ---------- prayer update emails ----------
function clearEmail(index) {
  sheet().getRange(index + 2, C.EMAIL + 1, 1, 2).setValues([["", ""]]);
}

// The link in every email: forget this request's email address.
function stopEmails(body) {
  var hit = findRow(body.id);
  if (!hit || !body.token || String(body.token) !== stopToken(hit.row[C.ID])) return { ok: false, error: "That stop link doesn't match." };
  clearEmail(hit.index);
  return { ok: true };
}

function parseNotified(v) {
  var m = /^p(\d+)n(\d+)$/.exec(String(v || ""));
  return m ? { p: Number(m[1]), n: Number(m[2]) } : { p: 0, n: 0 };
}

function escapeHtml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function prayerEmail(row, fresh, newNames) {
  var total = Number(row[C.PRAYED]) || 0, text = String(row[C.TEXT]);
  var stop = SITE_URL + "/prayer#stop=" + row[C.ID] + ":" + stopToken(row[C.ID]);
  var who = fresh === 1 ? "1 person prayed" : fresh + " people prayed";
  var incl = newNames.length ? ", including " + (newNames.length > 1 ? newNames.slice(0, -1).join(", ") + " and " + newNames[newNames.length - 1] : newNames[0]) : "";
  var first = String(row[C.NAME]).split(" ")[0];
  var end = /\.$/.test(incl) ? "" : "."; // a last initial already ends in a period
  var line1 = who + " for your request" + incl + end;
  var line2 = "So far, " + (total === 1 ? "1 person has" : total + " people have") + " prayed for it. If God has answered, you can tell everyone from your private link.";
  var foot = "You're getting this because you asked for prayer updates on this request. We use your email for this and nothing else, and we delete it when your request comes off the wall or is marked answered.";
  return {
    subject: "Someone prayed for your request \ud83d\ude4f",
    body: "Hi " + first + ",\n\n" + line1 + "\n\n\"" + text + "\"\n\n" + line2 + "\n\nSee your request: " + SITE_URL + "/prayer\n\n" + foot + "\nStop these emails: " + stop,
    htmlBody: '<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#222;max-width:560px">' +
      "<p>Hi " + escapeHtml(first) + ",</p><p><b>" + escapeHtml(who) + " for your request</b>" + escapeHtml(incl) + end + "</p>" +
      '<p style="border-left:4px solid #B08D4F;background:#f7f2e6;padding:12px 16px;font-style:italic">\u201c' + escapeHtml(text) + "\u201d</p>" +
      "<p>" + escapeHtml(line2) + '</p><p><a href="' + SITE_URL + '/prayer" style="background:#0B0B0C;color:#E7CF98;padding:11px 20px;text-decoration:none;border-radius:4px;font-weight:700;display:inline-block">See your request</a></p>' +
      '<p style="font-size:12.5px;color:#777;border-top:1px solid #e5e2db;padding-top:12px;margin-top:24px">' + escapeHtml(foot) +
      '<br><a href="' + stop + '" style="color:#555">Stop these emails</a></p></div>'
  };
}

// Run once a day by a time trigger. Emails each subscribed poster whose request was prayed for since their last email,
// and forgets the address of any request that is no longer on the wall (answered, removed, hidden, or past its 30 days).
function sendPrayerNotifications(now) {
  now = typeof now === "number" ? now : Date.now();
  var all = rows(), sent = 0, mailed = [];
  for (var i = 0; i < all.length; i++) {
    var r = all[i], email = String(r[C.EMAIL] || "");
    if (!email) continue;
    if (!onWall(r, now) || r[C.ANSWERED] === "yes") { clearEmail(i); continue; }
    var st = parseNotified(r[C.NOTIFIED]), prayed = Number(r[C.PRAYED]) || 0, names = prayedByList(r);
    var fresh = prayed - st.p;
    if (fresh <= 0) continue;
    if (sent >= PRAYER_EMAILS_PER_RUN) break; // the rest go out tomorrow, nothing is lost
    var mail = prayerEmail(r, fresh, names.slice(st.n).slice(-3));
    try {
      MailApp.sendEmail({ to: email, subject: mail.subject, body: mail.body, htmlBody: mail.htmlBody, name: "The Bible Talks Prayer Wall", replyTo: NOTIFY_EMAIL || undefined });
      sheet().getRange(i + 2, C.NOTIFIED + 1).setValue("p" + prayed + "n" + names.length);
      sent++; mailed.push(String(r[C.ID]));
    } catch (e) { Logger.log("prayer email failed: " + e); }
  }
  return mailed;
}

// Run once from the editor: sets up the daily 8pm run (in the script's time zone). Safe to run again.
function installPrayerNotificationTrigger() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "sendPrayerNotifications"; });
  if (!has) ScriptApp.newTrigger("sendPrayerNotifications").timeBased().everyDays(1).atHour(20).create();
  Logger.log(has ? "The daily prayer-update trigger already exists." : "Created the daily prayer-update trigger (about 8pm).");
}

// ---------- what the wall shows ----------
function onWall(row, now) {
  if (row[C.VIS] !== "public" || row[C.STATUS] !== "live") return false;
  var t = new Date(row[C.TIME]).getTime();
  if (isNaN(t)) return false;
  var expires = t + WALL_DAYS * 86400000;
  if (row[C.ANSWERED] === "yes") {
    var a = new Date(row[C.ANSWERED_AT]).getTime();
    if (!isNaN(a)) expires = Math.max(expires, a + ANSWERED_DAYS * 86400000);
  }
  return now <= expires;
}

function shape(r) {
  var answered = r[C.ANSWERED] === "yes";
  return {
    id: String(r[C.ID]), name: String(r[C.NAME]), text: String(r[C.TEXT]), ts: new Date(r[C.TIME]).toISOString(),
    prayed: Number(r[C.PRAYED]) || 0, prayedBy: prayedByList(r), topic: String(r[C.TOPIC] || ""), look: cleanLook(String(r[C.LOOK] || "")),
    answered: answered, update: answered ? String(r[C.UPDATE] || "") : ""
  };
}

function wallPayload(now) {
  var list = rows().filter(function (r) { return onWall(r, now); }).map(shape)
    .sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, WALL_LIMIT);
  var prayers = 0;
  list.forEach(function (x) { prayers += x.prayed; });
  return {
    ok: true,
    requests: list.filter(function (x) { return !x.answered; }),
    answered: list.filter(function (x) { return x.answered; }),
    prayers: prayers
  };
}

// ---------- weekly summary for church leaders (run by a weekly time trigger) ----------
// Only public, live requests are ever included. A team-only, hidden, or removed request cannot appear here.
function digestItems(now, since) {
  var fresh = [], answered = [];
  rows().forEach(function (r) {
    if (r[C.VIS] !== "public" || r[C.STATUS] !== "live") return;
    var t = new Date(r[C.TIME]).getTime();
    var item = { name: String(r[C.NAME]), topic: String(r[C.TOPIC] || ""), text: String(r[C.TEXT]), update: String(r[C.UPDATE] || "") };
    if (!isNaN(t) && t > since && t <= now) fresh.push(item);
    var a = new Date(r[C.ANSWERED_AT]).getTime();
    if (r[C.ANSWERED] === "yes" && !isNaN(a) && a > since && a <= now) answered.push(item);
  });
  return { fresh: fresh, answered: answered };
}

function digestBody(items) {
  var out = ["Here's what has been shared on the TBT prayer wall since the last summary.", ""];
  if (items.fresh.length) {
    out.push("NEW PRAYER REQUESTS");
    items.fresh.forEach(function (x) { out.push("\u2022 " + x.name + ": " + x.text); });
    out.push("");
  }
  if (items.answered.length) {
    out.push("ANSWERED PRAYERS");
    items.answered.forEach(function (x) { out.push("\u2022 " + x.name + ": " + x.text + (x.update ? "\n   Update: " + x.update : "")); });
    out.push("");
  }
  out.push("Pray for them, and tap \"I prayed\" so they know: https://tbtysu.org/prayer");
  out.push("You get this summary once a week because you're a TBT leader. Reply to this email if you'd like to stop.");
  return out.join("\n");
}

function sendLeaderDigest(force) {
  if (!NOTIFY_LEADERS.length) return;
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  if (force !== true && now < SUMMARY_STARTS_AT) return; // the time trigger passes an event object, never true
  var since = Number(props.getProperty("digestSince")) || (now - 7 * 86400000);
  var items = digestItems(now, since);
  if (!items.fresh.length && !items.answered.length) { props.setProperty("digestSince", String(now)); return; }
  var mail = { to: NOTIFY_EMAIL || NOTIFY_LEADERS[0], bcc: NOTIFY_LEADERS.filter(function (a) { return a !== NOTIFY_EMAIL; }).join(","),
    subject: "TBT prayer wall: weekly summary (" + items.fresh.length + " new, " + items.answered.length + " answered)", body: digestBody(items) };
  try { MailApp.sendEmail(mail); props.setProperty("digestSince", String(now)); } catch (e) { Logger.log("digest failed: " + e); } // not advanced on failure, so nothing is lost
}

// Sends the leaders' summary right now, whatever the start date (run from the editor).
function sendLeaderSummaryNow() { sendLeaderDigest(true); }

// Run from the editor to make the next summary cover the last N days (default 7). Sends nothing.
function resetDigestWindow(days) {
  var d = Number(days) || 7;
  PropertiesService.getScriptProperties().setProperty("digestSince", String(Date.now() - d * 86400000));
  Logger.log("The next summary will cover the last " + d + " days.");
}

// Shows what the next digest would say without sending anything (run from the editor, then open the log).
function previewLeaderDigest() {
  var since = Number(PropertiesService.getScriptProperties().getProperty("digestSince")) || (Date.now() - 7 * 86400000);
  var items = digestItems(Date.now(), since);
  Logger.log(items.fresh.length + " new, " + items.answered.length + " answered since " + new Date(since).toISOString() + "\n\n" + digestBody(items));
}

function notify(subject, message) {
  var to = NOTIFY_EMAIL || NOTIFY_BCC[0];
  if (!to) return;
  var bcc = NOTIFY_BCC.filter(function (a) { return a && a !== to; }).join(",");
  var mail = { to: to, subject: "TBT prayer wall: " + subject, body: message };
  if (bcc) mail.bcc = bcc;
  try { MailApp.sendEmail(mail); } catch (e) { Logger.log("notify failed: " + e); }
}

function raw(json) { return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON); }
function out(obj) { return raw(JSON.stringify(obj)); }
