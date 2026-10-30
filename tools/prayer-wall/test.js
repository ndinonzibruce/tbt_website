// Tests Code.gs against in-memory stand-ins for Google's services.
// Run from the repo root:  osascript -l JavaScript tools/prayer-wall/test.js   (or: node tools/prayer-wall/test.js)
var IS_NODE = typeof require !== "undefined" && typeof process !== "undefined";
function readFile(p) {
  if (IS_NODE) return require("fs").readFileSync(p, "utf8");
  ObjC.import("Foundation");
  return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError($(p), 4, $()));
}
var data = [], cacheStore = {}, mails = [], uuidN = 0;
var sheetObj = {
  getLastRow: function () { return data.length + 1; },
  appendRow: function (r) { if (data.length === 0 && r[0] === "ID") { this.headers = r; return; } data.push(r.slice()); },
  setFrozenRows: function () {}, setColumnWidth: function () {},
  getRange: function (r, c, nr, nc) {
    return {
      getValues: function () { return data.slice(r - 2, r - 2 + nr).map(function (x) { return x.slice(c - 1, c - 1 + nc); }); },
      setValue: function (v) { data[r - 2][c - 1] = v; }
    };
  }
};
var SpreadsheetApp = { getActiveSpreadsheet: function () { return { getSheetByName: function () { return sheetObj; }, insertSheet: function () { return sheetObj; } }; } };
var CacheService = { getScriptCache: function () { return { get: function (k) { return cacheStore[k] || null; }, put: function (k, v) { cacheStore[k] = v; }, remove: function (k) { delete cacheStore[k]; } }; } };
var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
var Utilities = { getUuid: function () { uuidN++; return "0000000" + uuidN + "-aaaa-bbbb-cccc-dddddddddddd"; } };
var MailApp = { sendEmail: function (to, s, m) { mails.push({ to: to, s: s, m: m }); } };
var ContentService = { MimeType: { JSON: "json" }, createTextOutput: function (t) { return { text: t, setMimeType: function () { return this; } }; } };

(0, eval)(readFile("tools/prayer-wall/Code.gs"));

var pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }
function post(o) { return JSON.parse(doPost({ postData: { contents: JSON.stringify(o) } }).text); }
function list() { cacheStore = {}; return JSON.parse(doGet({ parameter: { action: "list" } }).text).requests; }
var ok = { action: "submit", name: "Maddie Smith", text: "Please pray for my exams this week.", visibility: "public", elapsed: 9000 };

var r = post(ok);
check("valid submit ok", r.ok && r.name === "Maddie");
check("last name stripped", r.name === "Maddie");
check("listed on wall", list().length === 1 && list()[0].text.indexOf("exams") > -1);
check("email sent to Pastor", mails.length === 1 && mails[0].to === "bchimani@oldnorthchurch.org");

check("anon uses Anonymous", post({ action: "submit", name: "Zed", anon: true, text: "Pray for my grandmother's surgery.", elapsed: 9000 }).name === "Anonymous");
check("empty name -> Anonymous", post({ action: "submit", text: "Pray for peace in my family.", elapsed: 9000 }).name === "Anonymous");
check("weird name cleaned", /^[A-Za-z]+$/.test(post({ action: "submit", name: "J0$h<script>", text: "Pray for a job interview.", elapsed: 9000 }).name));

var team = post({ action: "submit", name: "Sam", text: "Private struggle I need help with.", visibility: "team", elapsed: 9000 });
check("team request saved", team.ok && team.visibility === "team");
check("team request NOT on wall", list().every(function (x) { return x.text.indexOf("Private struggle") === -1; }));
check("team request emailed as TEAM ONLY", mails[mails.length - 1].s.indexOf("[TEAM ONLY]") > -1);
check("cannot pray for team request", post({ action: "pray", id: team.id }).ok === false);

check("honeypot rejected", post({ action: "submit", text: "Pray for me please.", website: "http://x", elapsed: 9000 }).ok === false);
check("too-fast rejected", post({ action: "submit", text: "Pray for me please.", elapsed: 500 }).ok === false);
check("missing elapsed rejected", post({ action: "submit", text: "Pray for me please." }).ok === false);
check("too short rejected", post({ action: "submit", text: "hi", elapsed: 9000 }).ok === false);
check("too long rejected", post({ action: "submit", text: new Array(600).join("a "), elapsed: 9000 }).ok === false);
check("link rejected", post({ action: "submit", text: "Pray for me, see https://spam.example", elapsed: 9000 }).ok === false);
check("bare domain rejected", post({ action: "submit", text: "Visit buystuff.com please pray", elapsed: 9000 }).ok === false);
check("email rejected", post({ action: "submit", text: "Pray for me, mail me at a@b.co", elapsed: 9000 }).ok === false);
check("phone rejected", post({ action: "submit", text: "Pray for me, call 330-555-1234 anytime", elapsed: 9000 }).ok === false);
check("duplicate rejected", post(ok).ok === false);
check("normal numbers allowed", post({ action: "submit", text: "Pray for my 3 finals and my 2 jobs this week.", elapsed: 9000 }).ok === true);

var id = list()[0].id;
check("pray counts", post({ action: "pray", id: id }).count === 1 && post({ action: "pray", id: id }).count === 2);
check("pray unknown id fails", post({ action: "pray", id: "nope" }).ok === false);
check("pray shows on wall", list().filter(function (x) { return x.id === id; })[0].prayed === 2);

var rep = post({ action: "submit", name: "Al", text: "Something inappropriate for the wall here.", elapsed: 9000 });
post({ action: "report", id: rep.id }); post({ action: "report", id: rep.id });
check("still live after 2 reports", list().some(function (x) { return x.id === rep.id; }));
post({ action: "report", id: rep.id });
check("auto-hidden after 3 reports", !list().some(function (x) { return x.id === rep.id; }));
check("report email sent", mails.some(function (m) { return m.s.indexOf("reported (3)") > -1; }));

data[0][1] = new Date(Date.now() - 31 * 86400000).toISOString();
check("30+ day old request drops off wall", !list().some(function (x) { return x.id === data[0][0]; }));
data[1][5] = "hidden";
check("hidden status respected", !list().some(function (x) { return x.id === data[1][0]; }));

var many = 0; for (var i = 0; i < 60; i++) { var rr = post({ action: "submit", text: "Unique prayer number " + i + " for the group", elapsed: 9000 }); if (!rr.ok) many++; }
check("hourly brake kicks in", many > 0);
check("wall capped at 50", list().length <= 50);
check("bad action", post({ action: "zzz" }).ok === false);
check("GET unknown action", JSON.parse(doGet({ parameter: { action: "x" } }).text).ok === false);
console.log(pass + " passed, " + fail + " failed");
