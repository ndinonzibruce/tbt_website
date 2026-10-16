// Builds calendar/tbt.ics (the subscribable "TBT calendar" feed) from the same
// data that powers the website's What's Coming Up cards.
// Run from the repo root:  node tools/build_calendar.js
//   (or on a Mac without Node:  osascript -l JavaScript tools/build_calendar.js)
var HORIZON_DAYS = 150;

var IS_NODE = typeof require !== "undefined" && typeof process !== "undefined";
function readFile(p) {
  if (IS_NODE) return require("fs").readFileSync(p, "utf8");
  ObjC.import("Foundation");
  return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError($(p), 4, $()));
}
function writeFile(p, s) {
  if (IS_NODE) return require("fs").writeFileSync(p, s);
  ObjC.import("Foundation");
  $(s).writeToFileAtomicallyEncodingError($(p), true, 4, $());
}

var g = (function () { return this; })() || globalThis;
(0, eval)(readFile("js/add-to-calendar.js"));
(0, eval)(readFile("js/whats-coming.js"));

var items = getWhatsComingItems(HORIZON_DAYS).filter(function (i) { return !i.standing && i.time !== "All week"; });
var events = [];
items.forEach(function (i) { events = events.concat(TBTCal.expand(i)); });
writeFile("calendar/tbt.ics", TBTCal.icsText(events, "The Bible Talks (YSU)"));
console.log("Wrote calendar/tbt.ics with " + events.length + " events");
