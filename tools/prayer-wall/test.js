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
  appendRow: function (r) { if (data.length === 0 && r[0] === "ID") { this.headers = r; return; } data.push(r.map(function (v) { return (typeof v === "string" && /^[0-9]+(e[0-9]+)?$/i.test(v)) ? Number(v) : v; })); },
  setFrozenRows: function () {}, setColumnWidth: function () {},
  getRange: function (r, c, nr, nc) {
    return {
      getValues: function () { return data.slice(r - 2, r - 2 + nr).map(function (x) { return x.slice(c - 1, c - 1 + nc); }); },
      setValue: function (v) { data[r - 2][c - 1] = v; },
      setValues: function (vals) { for (var i = 0; i < vals.length; i++) { if (r === 1) { return; } for (var j = 0; j < vals[i].length; j++) data[r - 2 + i][c - 1 + j] = vals[i][j]; } }
    };
  }
};
var SpreadsheetApp = { getActiveSpreadsheet: function () { return { getSheetByName: function () { return sheetObj; }, insertSheet: function () { return sheetObj; } }; } };
var CacheService = { getScriptCache: function () { return { get: function (k) { return cacheStore[k] || null; }, put: function (k, v) { cacheStore[k] = v; }, remove: function (k) { delete cacheStore[k]; } }; } };
var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
var Utilities = {
  getUuid: function () { uuidN++; return ("00000000" + uuidN.toString(16)).slice(-8) + "-aaaa-bbbb-cccc-dddddddddddd"; },
  DigestAlgorithm: { SHA_256: "sha256" },
  computeDigest: function (alg, str) { var h = []; for (var i = 0; i < 32; i++) { var x = 0; for (var k = 0; k < str.length; k++) x = (x * 31 + str.charCodeAt(k) * (i + 7)) % 251; h.push(i % 2 ? x : x - 128); } return h; }
};
var Logger = { log: function () {} };
var propStore = {};
var PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return propStore[k] || null; }, setProperty: function (k, v) { propStore[k] = String(v); } }; } };
var failMail = false;
var MailApp = { sendEmail: function (a, b, c) { if (failMail) throw new Error("quota"); if (typeof a === "object") mails.push({ to: a.to, bcc: a.bcc, s: a.subject, m: a.body }); else mails.push({ to: a, s: b, m: c }); } };
var ContentService = { MimeType: { JSON: "json" }, createTextOutput: function (t) { return { text: t, setMimeType: function () { return this; } }; } };

(0, eval)(readFile("tools/prayer-wall/Code.gs"));

var pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log("FAIL: " + name); } }
function post(o) { return JSON.parse(doPost({ postData: { contents: JSON.stringify(o) } }).text); }
function full() { cacheStore = {}; return JSON.parse(doGet({ parameter: { action: "list" } }).text); }
function list() { return full().requests; }
var ok = { action: "submit", name: "Maddie Smith", text: "Please pray for my exams this week.", visibility: "public", elapsed: 9000 };

var r = post(ok);
check("valid submit ok", r.ok && r.name === "Maddie");
check("last name stripped", r.name === "Maddie");
check("listed on wall", list().length === 1 && list()[0].text.indexOf("exams") > -1);
check("email sent to Pastor", mails.length === 1 && mails[0].to === "bchimani@oldnorthchurch.org");

check("anon uses Anonymous", post({ action: "submit", name: "Zed", anon: true, text: "Pray for my grandmother's surgery.", elapsed: 9000 }).name === "Anonymous");
check("empty name -> Anonymous", post({ action: "submit", text: "Pray for peace in my family.", elapsed: 9000 }).name === "Anonymous");
check("weird name cleaned", /^[A-Za-z]+$/.test(post({ action: "submit", name: "J0$h<script>", text: "Pray for a job interview.", elapsed: 9000 }).name));

var team = post({ action: "submit", name: "Sam", last: "Lee", text: "Private struggle I need help with.", visibility: "team", elapsed: 9000 });
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

// ---- topics, private link, answered, remove ----
var tp = post({ action: "submit", name: "Tess", text: "Please pray for my finals this week.", topic: "School", visibility: "public", elapsed: 9000 });
check("submit returns a token", tp.ok && /^[0-9a-f]{32}$/.test(tp.token));
check("token is not stored in the clear", JSON.stringify(data).indexOf(tp.token) === -1);
check("topic saved and listed", list().filter(function (x) { return x.id === tp.id; })[0].topic === "School");
check("bad topic ignored", post({ action: "submit", text: "Please pray for my sister today.", topic: "<b>x</b>", elapsed: 9000 }).topic === "");
check("answer with wrong token refused", post({ action: "answer", id: tp.id, token: "nope", update: "Passed" }).ok === false);
check("answer with no token refused", post({ action: "answer", id: tp.id, update: "Passed" }).ok === false);
check("answer with another request's token refused", post({ action: "answer", id: tp.id, token: team.token || "x", update: "Passed" }).ok === false);
check("update with a link refused", post({ action: "answer", id: tp.id, token: tp.token, update: "see http://spam.example" }).ok === false);
check("update too long refused", post({ action: "answer", id: tp.id, token: tp.token, update: new Array(300).join("a") }).ok === false);
var an = post({ action: "answer", id: tp.id, token: tp.token, update: "I passed. Thank you for praying." });
check("owner can mark answered", an.ok && an.answered === true);
var f = full();
check("answered leaves the needs-prayer list", !f.requests.some(function (x) { return x.id === tp.id; }));
check("answered appears in the answered list with its update", f.answered.some(function (x) { return x.id === tp.id && x.update.indexOf("passed") > -1 && x.answered === true; }));
check("answered email sent", mails.some(function (m) { return m.s.indexOf("Prayer answered") > -1; }));
check("can still pray for an answered request", post({ action: "pray", id: tp.id }).ok === true);
check("prayer total is reported", typeof full().prayers === "number" && full().prayers > 0);
var row = data.filter(function (r) { return r[0] === tp.id; })[0];
row[1] = new Date(Date.now() - 31 * 86400000).toISOString(); row[11] = new Date(Date.now() - 2 * 86400000).toISOString();
check("answered 2 days ago stays on the wall even when posted 31 days ago", full().answered.some(function (x) { return x.id === tp.id; }));
row[11] = new Date(Date.now() - 20 * 86400000).toISOString();
check("answered 20 days ago (posted 31) drops off", !full().answered.some(function (x) { return x.id === tp.id; }));
row[1] = new Date(Date.now() - 5 * 86400000).toISOString();
check("owner can undo answered", post({ action: "answer", id: tp.id, token: tp.token, undo: true }).answered === false && list().some(function (x) { return x.id === tp.id; }));
check("remove with wrong token refused", post({ action: "remove", id: tp.id, token: "nope" }).ok === false);
check("owner can remove", post({ action: "remove", id: tp.id, token: tp.token }).ok === true);
check("removed request is off the wall", !list().some(function (x) { return x.id === tp.id; }) && !full().answered.some(function (x) { return x.id === tp.id; }));
check("removed row is kept in the sheet", data.some(function (r) { return r[0] === tp.id && r[5] === "removed"; }));
check("team-only request can be marked answered by its owner", post({ action: "answer", id: team.id, token: team.token, update: "Resolved" }).ok === true);

// ---- notification emails: Pastor Bruce plus three staff on blind copy ----
var STAFF = ["oelias@oldnorthchurch.org", "cmercer@oldnorthchurch.org", "ahodge@oldnorthchurch.org"];
function bccOk(m) { return m.bcc && STAFF.every(function (a) { return m.bcc.split(",").indexOf(a) !== -1; }) && m.bcc.indexOf("bchimani") === -1; }
var newPublic = mails.filter(function (m) { return m.s.indexOf("New prayer request") > -1 && m.s.indexOf("[TEAM ONLY]") === -1; });
var newTeam = mails.filter(function (m) { return m.s.indexOf("[TEAM ONLY]") > -1; });
var reports = mails.filter(function (m) { return m.s.indexOf("reported") > -1; });
var answeredMails = mails.filter(function (m) { return m.s.indexOf("Prayer answered") > -1; });
check("every notification type was sent", newPublic.length && newTeam.length && reports.length && answeredMails.length);
check("every email goes to Pastor Bruce as the main recipient", mails.every(function (m) { return m.to === "bchimani@oldnorthchurch.org"; }));
check("all three staff are blind-copied on public requests", newPublic.every(bccOk));
check("all three staff are blind-copied on team-only requests", newTeam.every(bccOk));
check("all three staff are blind-copied on reports", reports.every(bccOk));
check("all three staff are blind-copied on answered prayers", answeredMails.every(bccOk));
check("staff addresses are not exposed in the To line", mails.every(function (m) { return m.to.indexOf("oelias") === -1 && m.to.indexOf(",") === -1; }));

// ---- leaders: weekly summary of PUBLIC items only, never instant emails, never anything private ----
var LEADERS = ["Aeccourt7@gmail.com", "mtlessons@gmail.com", "shelbie1224@gmail.com", "andrew.lund55@gmail.com"];
function hasLeader(str) { return LEADERS.some(function (a) { return String(str || "").toLowerCase().indexOf(a.toLowerCase()) !== -1; }); }
check("leader list has all 16 leaders", NOTIFY_LEADERS.length === 16 && NOTIFY_LEADERS.every(function (a) { return /@/.test(a); }));
check("NO instant email (new, team-only, report, answered) ever reaches a leader", mails.every(function (m) { return !hasLeader(m.to) && !hasLeader(m.bcc); }));
var instantCount = mails.length;
// fresh baseline, then add one public, one team-only, one hidden, one answered-public, one answered-team
var realStart = SUMMARY_STARTS_AT; SUMMARY_STARTS_AT = 0; var now0 = Date.now(); propStore.digestSince = String(now0 - 1000); data.length = data.length; mails.length = 0;
var dPub = post({ action: "submit", name: "Pia", text: "DIGESTPUBLIC please pray for my sister.", topic: "Family", visibility: "public", elapsed: 9000 });
var dTeam = post({ action: "submit", name: "Tom", last: "Park", text: "DIGESTTEAMONLY a private struggle.", visibility: "team", elapsed: 9000 });
var dHide = post({ action: "submit", name: "Hal", text: "DIGESTHIDDEN something that gets reported.", visibility: "public", elapsed: 9000 });
post({ action: "report", id: dHide.id }); post({ action: "report", id: dHide.id }); post({ action: "report", id: dHide.id });
var dAns = post({ action: "submit", name: "Ann", text: "DIGESTANSWERED please pray for my interview.", visibility: "public", elapsed: 9000 });
post({ action: "answer", id: dAns.id, token: dAns.token, update: "DIGESTUPDATE I got the job." });
post({ action: "answer", id: dTeam.id, token: dTeam.token, update: "DIGESTTEAMUPDATE resolved." });
var beforeDigest = mails.length;
propStore.digestSince = String(now0 - 1000);
sendLeaderDigest();
var digestMail = mails[mails.length - 1];
check("summary was sent as one email", mails.length === beforeDigest + 1 && digestMail.s.indexOf("weekly summary") > -1);
check("subject counts new and answered", /\(\d+ new, \d+ answered\)/.test(digestMail.s));
check("digest goes to every leader on blind copy", NOTIFY_LEADERS.every(function (a) { return digestMail.bcc.split(",").indexOf(a) !== -1; }));
check("digest To line is Pastor Bruce only (no leader address exposed)", digestMail.to === "bchimani@oldnorthchurch.org");
check("digest does not include the staff", STAFF.every(function (a) { return digestMail.bcc.indexOf(a) === -1; }));
check("summary includes the new public request with its name", digestMail.m.indexOf("DIGESTPUBLIC") > -1 && digestMail.m.indexOf("Pia: DIGESTPUBLIC") > -1);
check("summary has no topic labels", digestMail.m.indexOf("(Family)") === -1 && digestMail.m.indexOf("Family") === -1);
check("digest includes the answered public request and its update", digestMail.m.indexOf("DIGESTANSWERED") > -1 && digestMail.m.indexOf("DIGESTUPDATE") > -1);
check("digest NEVER includes the team-only request", digestMail.m.indexOf("DIGESTTEAMONLY") === -1);
check("digest NEVER includes a team-only request's answered update", digestMail.m.indexOf("DIGESTTEAMUPDATE") === -1);
check("digest does not include a request that was hidden by reports", digestMail.m.indexOf("DIGESTHIDDEN") === -1);
check("summary points to the wall", digestMail.m.indexOf("tbtysu.org/prayer") > -1);
check("summary says it is weekly", digestMail.m.indexOf("once a week") > -1 && digestMail.m.indexOf("once a day") === -1);
var afterFirst = mails.length; sendLeaderDigest();
check("a second digest right away sends nothing", mails.length === afterFirst);
var instants = mails.slice(0, beforeDigest);
check("the instant emails around the digest still go only to Bruce and staff", instants.length > 0 && instants.every(function (m) { return !hasLeader(m.to) && !hasLeader(m.bcc); }));
check("team-only instant email still reached staff", instants.some(function (m) { return m.s.indexOf("[TEAM ONLY]") > -1 && bccOk(m); }));
// failure keeps items for next time
var w0 = Date.now(); while (Date.now() - w0 < 6) {} cacheStore = {}; post({ action: "submit", name: "Zoe", text: "DIGESTRETRY please pray for my finals.", visibility: "public", elapsed: 9000 });
var w1 = Date.now(); while (Date.now() - w1 < 6) {} failMail = true; var sinceBefore = propStore.digestSince; sendLeaderDigest(); failMail = false;
check("a failed digest does not advance the clock", propStore.digestSince === sinceBefore);
var n2 = mails.length; sendLeaderDigest();
check("the next digest delivers what the failed one missed", mails.length === n2 + 1 && mails[mails.length - 1].m.indexOf("DIGESTRETRY") > -1);
SUMMARY_STARTS_AT = Date.now() + 86400000 * 5;
var q0 = mails.length; propStore.digestSince = String(Date.now() - 86400000); cacheStore = {}; var w2 = Date.now(); while (Date.now() - w2 < 6) {} post({ action: "submit", name: "Quin", text: "BEFORESTART please pray for my trip.", visibility: "public", elapsed: 9000 });
sendLeaderDigest({ type: "time-driven" });
check("the scheduled run stays quiet before the start date", mails.length === q0 + 1 && !mails.slice(q0).some(function (m) { return m.m.indexOf("BEFORESTART") > -1 && hasLeader(m.bcc); }));
var sinceHeld = propStore.digestSince; sendLeaderSummaryNow();
check("sendLeaderSummaryNow works before the start date and includes the waiting request", mails[mails.length - 1].m.indexOf("BEFORESTART") > -1 && hasLeader(mails[mails.length - 1].bcc));
check("the start date does not move the clock while it holds back", sinceHeld === String(Number(sinceHeld)));
SUMMARY_STARTS_AT = 0;

// ---- first and last name ----
cacheStore = {}; mails.length = 0;
var n1 = post({ action: "submit", name: "Tess", last: "Brooks", text: "NAMETEST1 pray for my sister.", elapsed: 9000 });
check("first and last name are shown together", n1.ok && n1.name === "Tess Brooks");
cacheStore = {}; check("the wall lists the full name", list().some(function (x) { return x.id === n1.id && x.name === "Tess Brooks"; }));
check("staff email shows the full name", mails.some(function (m) { return m.s.indexOf("Tess Brooks") > -1; }));
cacheStore = {}; check("last name is optional", post({ action: "submit", name: "Sam", text: "NAMETEST2 pray for my finals.", elapsed: 9000 }).name === "Sam");
cacheStore = {}; check("multi-word last names work", post({ action: "submit", name: "Ana", last: "De La Cruz", text: "NAMETEST3 pray for my mom.", elapsed: 9000 }).name === "Ana De La Cruz");
cacheStore = {}; check("apostrophes and hyphens are kept", post({ action: "submit", name: "Liam", last: "O'Neil-Smith", text: "NAMETEST4 pray for my job.", elapsed: 9000 }).name === "Liam O'Neil-Smith");
cacheStore = {}; check("digits and markup are stripped from a last name", /^Kai [A-Za-z ]+$/.test(post({ action: "submit", name: "Kai", last: "Br00ks<b>x</b>", text: "NAMETEST5 pray for my sister.", elapsed: 9000 }).name));
cacheStore = {}; check("Anonymous hides both names", post({ action: "submit", name: "Zed", last: "Young", anon: true, text: "NAMETEST6 pray for my parents.", elapsed: 9000 }).name === "Anonymous");
cacheStore = {}; check("a last name with no first name is ignored", post({ action: "submit", last: "Young", text: "NAMETEST7 pray for peace today.", elapsed: 9000 }).name === "Anonymous");
cacheStore = {}; check("a very long last name is cut to 30 characters", post({ action: "submit", name: "Max", last: new Array(60).join("a"), text: "NAMETEST8 pray for my roommate.", elapsed: 9000 }).name.length <= 20 + 1 + 30);
cacheStore = {}; check("an old page that sends only a full name in the first field still shows just the first name", post({ action: "submit", name: "Rob Banks", text: "NAMETEST9 pray for my brother.", elapsed: 9000 }).name === "Rob");

// ---- team-only requests require a first and last name ----
cacheStore = {}; var tNoLast = post({ action: "submit", name: "Ivy", text: "TEAMNAME1 please help me with something private.", visibility: "team", elapsed: 9000 });
check("team-only without a last name is refused", tNoLast.ok === false && /first and last name/.test(tNoLast.error));
cacheStore = {}; check("team-only without a first name is refused", post({ action: "submit", last: "Stone", text: "TEAMNAME2 please help me with something private.", visibility: "team", elapsed: 9000 }).ok === false);
cacheStore = {}; check("team-only with no names at all is refused", post({ action: "submit", text: "TEAMNAME3 please help me with something private.", visibility: "team", elapsed: 9000 }).ok === false);
cacheStore = {}; check("Anonymous cannot be used for a team-only request", post({ action: "submit", anon: true, text: "TEAMNAME4 please help me with something private.", visibility: "team", elapsed: 9000 }).ok === false);
cacheStore = {}; var tOk = post({ action: "submit", name: "Ivy", last: "Stone", anon: true, text: "TEAMNAME5 please help me with something private.", visibility: "team", elapsed: 9000 });
check("team-only with first and last name is accepted", tOk.ok === true && tOk.name === "Ivy Stone");
check("team-only ignores the Anonymous box and keeps the real name", tOk.name !== "Anonymous");
check("the refused team-only requests were not saved", !data.some(function (r) { return String(r[3]).indexOf("TEAMNAME1") > -1 || String(r[3]).indexOf("TEAMNAME2") > -1 || String(r[3]).indexOf("TEAMNAME3") > -1 || String(r[3]).indexOf("TEAMNAME4") > -1; }));
check("the team-only request is saved with the full name and never listed", data.some(function (r) { return r[3].indexOf("TEAMNAME5") > -1 && r[2] === "Ivy Stone" && r[4] === "team"; }) && !list().some(function (x) { return x.text.indexOf("TEAMNAME5") > -1; }));
cacheStore = {}; check("public requests still allow no name and Anonymous", post({ action: "submit", text: "PUBNAME1 please pray for my week ahead.", elapsed: 9000 }).name === "Anonymous");
// card looks
cacheStore = {}; var lk = post({ action: "submit", name: "Lia", text: "LOOK1 please pray for my week ahead.", look: "ocean", elapsed: 9000 });
check("a valid look is saved and returned", lk.ok === true && lk.look === "ocean" && data.some(function (r) { return r[3].indexOf("LOOK1") > -1 && r[13] === "ocean"; }));
check("the look is on the wall", full().requests.some(function (x) { return x.text.indexOf("LOOK1") > -1 && x.look === "ocean"; }));
cacheStore = {}; var lk2 = post({ action: "submit", name: "Lia", text: "LOOK2 please pray for my week ahead.", look: "<script>", elapsed: 9000 });
check("an unknown look is dropped, not rejected", lk2.ok === true && lk2.look === "" && data.some(function (r) { return r[3].indexOf("LOOK2") > -1 && r[13] === ""; }));
cacheStore = {}; check("no look is fine", post({ action: "submit", name: "Lia", text: "LOOK3 please pray for my week ahead.", elapsed: 9000 }).look === "");
check("older rows with no look column still list", (function () { data[0].length = 13; return full().requests.every(function (x) { return typeof x.look === "string"; }); })());
cacheStore = {}; check("every allowed look is accepted", LOOKS.every(function (k, i) { cacheStore = {}; return post({ action: "submit", name: "Lia", text: "LOOKALL" + i + " please pray for my week ahead.", look: k, elapsed: 9000 }).look === k; }));
check("ids survive Sheets number coercion", /^r/.test(id) && post({ action: "pray", id: id }).ok === true);
console.log(pass + " passed, " + fail + " failed");
