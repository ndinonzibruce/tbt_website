// TBT Prayer Wall: Google Apps Script backend.
// Stores requests in the spreadsheet this script is attached to, and serves them
// to tbtysu.org/prayer. Setup steps are in tools/prayer-wall/README.md.
//
// To hide a request: change its Status cell to "hidden". To bring it back: "live".
// Requests marked "team" in Visibility are never shown on the website.

var NOTIFY_EMAIL = "bchimani@oldnorthchurch.org"; // gets an email for each new request and report; "" turns this off
var SHEET_NAME = "Requests";
var WALL_DAYS = 30;          // requests older than this drop off the public wall (they stay in the sheet)
var WALL_LIMIT = 50;         // newest requests shown on the wall
var MIN_LEN = 5;
var MAX_LEN = 500;
var HIDE_AFTER_REPORTS = 3;  // a request reported this many times is hidden automatically
var MAX_PER_HOUR = 40;       // brake against floods of submissions
var MIN_FILL_MS = 3000;      // a human takes longer than this to fill in the form

var COLS = ["ID", "Time", "Name", "Request", "Visibility", "Status", "Prayed", "Reports"];
var C = { ID: 0, TIME: 1, NAME: 2, TEXT: 3, VIS: 4, STATUS: 5, PRAYED: 6, REPORTS: 7 };

// ---------- run once from the editor ----------
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLS);
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 520);
  }
}

// ---------- web app entry points ----------
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "list";
    if (action !== "list") return out({ ok: false, error: "unknown action" });
    var cache = CacheService.getScriptCache();
    var hit = cache.get("wall");
    if (hit) return raw(hit);
    var json = JSON.stringify({ ok: true, requests: wallRequests(Date.now()) });
    cache.put("wall", json, 60);
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
    else result = { ok: false, error: "unknown action" };
    if (result.ok) CacheService.getScriptCache().remove("wall");
    return out(result);
  } catch (err) {
    return out({ ok: false, error: "server error" });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------- logic ----------
function cleanName(raw, anon) {
  if (anon) return "Anonymous";
  var first = String(raw || "").trim().split(/\s+/)[0] || "";
  first = first.replace(/[^A-Za-zÀ-ɏ'\-]/g, "").slice(0, 20);
  return first || "Anonymous";
}

function cleanText(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
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
    visibility: body.visibility === "team" ? "team" : "public"
  };
}

function sheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function rows() {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, COLS.length).getValues();
}

function submit(body, now) {
  var cache = CacheService.getScriptCache();
  var bucket = "rate_" + Math.floor(now / 3600000);
  var count = Number(cache.get(bucket) || 0);
  if (count >= MAX_PER_HOUR) return { ok: false, error: "We're getting a lot of requests right now. Please try again in a bit." };

  var all = rows();
  var recent = all.slice(-50).map(function (r) { return String(r[C.TEXT]).toLowerCase(); });
  var v = validate(body, recent);
  if (!v.ok) return v;

  var id = Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  var time = new Date(now).toISOString();
  sheet().appendRow([id, time, v.name, v.text, v.visibility, "live", 0, 0]);
  cache.put(bucket, String(count + 1), 3600);
  notify((v.visibility === "team" ? "[TEAM ONLY] " : "") + "New prayer request from " + v.name,
    v.text + "\n\nVisibility: " + v.visibility + "\nTo hide it, set Status to \"hidden\" in the sheet.");
  return { ok: true, id: id, name: v.name, text: v.text, ts: time, prayed: 0, visibility: v.visibility };
}

// column is 1-based. For reports, the request is hidden once enough people flag it.
function bump(id, column, isReport) {
  var sh = sheet(), data = rows();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][C.ID]) !== String(id)) continue;
    if (data[i][C.VIS] !== "public") return { ok: false, error: "not found" };
    var n = Number(data[i][column - 1] || 0) + 1;
    sh.getRange(i + 2, column).setValue(n);
    if (isReport) {
      if (n >= HIDE_AFTER_REPORTS && data[i][C.STATUS] === "live") {
        sh.getRange(i + 2, C.STATUS + 1).setValue("hidden");
      }
      notify("Prayer request reported (" + n + ")", String(data[i][C.TEXT]) + "\n\nReports so far: " + n +
        (n >= HIDE_AFTER_REPORTS ? "\nIt has been hidden automatically." : ""));
    }
    return { ok: true, count: n };
  }
  return { ok: false, error: "not found" };
}

function isOnWall(row, now) {
  if (row[C.VIS] !== "public" || row[C.STATUS] !== "live") return false;
  var t = new Date(row[C.TIME]).getTime();
  return !isNaN(t) && now - t <= WALL_DAYS * 86400000;
}

function wallRequests(now) {
  return rows().filter(function (r) { return isOnWall(r, now); })
    .map(function (r) {
      return { id: String(r[C.ID]), name: String(r[C.NAME]), text: String(r[C.TEXT]), ts: new Date(r[C.TIME]).toISOString(), prayed: Number(r[C.PRAYED]) || 0 };
    })
    .sort(function (a, b) { return a.ts < b.ts ? 1 : -1; })
    .slice(0, WALL_LIMIT);
}

function notify(subject, message) {
  if (!NOTIFY_EMAIL) return;
  try { MailApp.sendEmail(NOTIFY_EMAIL, "TBT prayer wall: " + subject, message); } catch (e) {}
}

function raw(json) { return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON); }
function out(obj) { return raw(JSON.stringify(obj)); }
