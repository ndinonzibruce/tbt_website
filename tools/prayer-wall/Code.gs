// TBT Prayer Wall: Google Apps Script backend.
// Stores requests in the spreadsheet this script is attached to, and serves them
// to tbtysu.org/prayer. Setup steps are in tools/prayer-wall/README.md.
//
// To hide a request: change its Status cell to "hidden". To bring it back: "live".
// Requests marked "team" in Visibility are never shown on the website.
// A poster gets a private link (a secret token, stored here only as a hash) that lets
// them mark their own request answered or remove it. You can do the same in the sheet:
// set Answered to "yes" and fill in Update, or set Status to "hidden".

var NOTIFY_EMAIL = "bchimani@oldnorthchurch.org"; // gets an email for each new request, report, and answered prayer; "" turns this off
var SHEET_NAME = "Requests";
var WALL_DAYS = 30;          // unanswered requests older than this drop off the public wall (they stay in the sheet)
var ANSWERED_DAYS = 14;      // an answered request stays on the wall this long after it is marked answered
var WALL_LIMIT = 80;         // newest requests shown on the wall
var MIN_LEN = 5;
var MAX_LEN = 500;
var MAX_UPDATE_LEN = 200;
var TOPICS = ["Health", "Family", "School", "Faith"];
var HIDE_AFTER_REPORTS = 3;  // a request reported this many times is hidden automatically
var MAX_PER_HOUR = 40;       // brake against floods of submissions
var MIN_FILL_MS = 3000;      // a human takes longer than this to fill in the form

var COLS = ["ID", "Time", "Name", "Request", "Visibility", "Status", "Prayed", "Reports", "Topic", "Answered", "Update", "AnsweredAt", "TokenHash"];
var C = { ID: 0, TIME: 1, NAME: 2, TEXT: 3, VIS: 4, STATUS: 5, PRAYED: 6, REPORTS: 7, TOPIC: 8, ANSWERED: 9, UPDATE: 10, ANSWERED_AT: 11, TOKEN: 12 };

// ---------- run once from the editor (safe to run again after an update) ----------
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]);
  sh.setFrozenRows(1);
  sh.setColumnWidth(4, 520);
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
    else if (body.action === "pray") result = bump(body.id, C.PRAYED + 1, false);
    else if (body.action === "report") result = bump(body.id, C.REPORTS + 1, true);
    else if (body.action === "answer") result = answer(body, Date.now());
    else if (body.action === "remove") result = removeOwn(body);
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
function cleanName(raw, anon) {
  if (anon) return "Anonymous";
  var first = String(raw || "").trim().split(/\s+/)[0] || "";
  first = first.replace(/[^A-Za-zÀ-ɏ'\-]/g, "").slice(0, 20);
  return first || "Anonymous";
}

function cleanText(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

function cleanTopic(raw) {
  return TOPICS.indexOf(raw) !== -1 ? raw : "";
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
  return {
    ok: true,
    text: text,
    name: cleanName(body.name, body.anon),
    visibility: body.visibility === "team" ? "team" : "public",
    topic: cleanTopic(body.topic)
  };
}

// ---------- private link token ----------
function newToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 32);
}

function hashToken(token) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token));
  return bytes.map(function (b) { return ("0" + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join("");
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
  sheet().appendRow([id, time, v.name, v.text, v.visibility, "live", 0, 0, v.topic, "", "", "", hashToken(token)]);
  cache.put(bucket, String(count + 1), 3600);
  notify((v.visibility === "team" ? "[TEAM ONLY] " : "") + "New prayer request from " + v.name,
    v.text + "\n\nVisibility: " + v.visibility + (v.topic ? "\nTopic: " + v.topic : "") + "\nTo hide it, set Status to \"hidden\" in the sheet.");
  return { ok: true, id: id, token: token, name: v.name, text: v.text, ts: time, prayed: 0, visibility: v.visibility, topic: v.topic, answered: false, update: "" };
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
  notify("Prayer answered", String(hit.row[C.TEXT]) + "\n\nUpdate: " + (update || "(none)"));
  return { ok: true, answered: true, update: update, answeredAt: at };
}

// The poster removes their own request. The row stays in the sheet with Status "removed".
function removeOwn(body) {
  var hit = ownedRow(body.id, body.token);
  if (!hit) return { ok: false, error: "That link doesn't match this request." };
  sheet().getRange(hit.index + 2, C.STATUS + 1).setValue("removed");
  return { ok: true };
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
    prayed: Number(r[C.PRAYED]) || 0, topic: String(r[C.TOPIC] || ""),
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

function notify(subject, message) {
  if (!NOTIFY_EMAIL) return;
  try { MailApp.sendEmail(NOTIFY_EMAIL, "TBT prayer wall: " + subject, message); } catch (e) {}
}

function raw(json) { return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON); }
function out(obj) { return raw(JSON.stringify(obj)); }
