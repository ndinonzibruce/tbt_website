#!/usr/bin/env python3
"""Builds the shareable event pages, their link-preview (Open Graph) images and
their one-tap calendar files.

Run from the repo root:  python3 tools/build_events.py

For each event below it writes:
  <slug>/index.html           shareable page with its own title/description/preview image
  images/og-<slug>.jpg        1200x630 preview card shown when the link is texted/posted
  calendar/<slug>.ics         one-tap "add to calendar" file
Update the EVENTS list (dates, price, registration status) and re-run.
"""
import datetime, html, json, os, re, subprocess, tempfile
from PIL import Image

SITE = "https://tbtysu.org"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CHURCH = "Old North Church"
CHURCH_ADDR = "7105 Herbert Rd, Canfield, OH 44406"

EVENTS = [
    dict(
        slug="game-night", title="Game Night", kind="Plug",
        date="2026-10-30", end_date=None, time="6–9pm", start_h=(18, 0), end_h=(21, 0), tz="-04:00",
        place=CHURCH, address=CHURCH_ADDR, price="Free", price_num="0",
        blurb="A night of games and hanging out together at Old North Church. Sign up with your Quad, your Home Group, or individually. Bring a friend, whether or not they'd call themselves a Christian.",
        share_desc="A night of games and hanging out together. Bring a friend.",
        photo="event-gamenight.jpg", reg_status="waitlist", reg_url="https://old-north.cls.co/QwVp",
    ),
    dict(
        slug="christmas-party", title="Christmas Party", kind="Plug",
        date="2026-12-11", end_date=None, time="7–9pm", start_h=(19, 0), end_h=(21, 0), tz="-05:00",
        place=CHURCH, address=CHURCH_ADDR, price="$10", price_num="10",
        blurb="Celebrating the semester together before the break at Old North Church.",
        share_desc="Celebrating the semester together before the break.",
        photo="event-christmasparty.jpg", reg_status="soon", reg_url=None,
    ),
    dict(
        slug="crosscon", title="CrossCon 2027", kind="Conference",
        date="2026-12-30", end_date="2027-01-02", time=None, start_h=None, end_h=None, tz=None,
        place="The Dome at America's Center", address="701 Convention Plaza, St. Louis, MO 63101", price="$250", price_num="250",
        blurb="\u201cThis Day, That Day.\u201d A conference for 18\u201325 year olds in St. Louis, with speakers including John Piper, Kevin DeYoung, David Platt, and more. Join The Bible Talks there. Registration is $250.",
        share_desc="\u201cThis Day, That Day.\u201d Join The Bible Talks at CrossCon in St. Louis.",
        photo="event-crosscon.jpg", reg_status="open",
        reg_url="https://old-north-church-17379.churchcenter.com/registrations/signups/3912673",
    ),
]

e = html.escape


def d(iso):
    return datetime.date.fromisoformat(iso)


def date_label(ev, short=False):
    s = d(ev["date"])
    if ev["end_date"]:
        t = d(ev["end_date"])
        a = s.strftime("%b %-d")
        b = t.strftime("%-d") if t.month == s.month else t.strftime("%b %-d")
        return f"{a}\u2013{b}" if short else f"{s.strftime('%A')}, {a} \u2013 {t.strftime('%A')}, {t.strftime('%b %-d')}"
    return s.strftime("%b %-d") if short else s.strftime("%A, %b %-d")


def when_line(ev):
    return date_label(ev) + (f" \u00b7 {ev['time']}" if ev["time"] else "")


# ---------- calendar file ----------
def ics(ev):
    def fold(l):
        out, cur, n = [], "", 0
        for ch in l:
            b = len(ch.encode())
            if n + b > (74 if out else 75):
                out.append(cur); cur, n = "", 0
            cur += ch; n += b
        out.append(cur)
        return "\r\n ".join(out)
    esc = lambda s: s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ymd = ev["date"].replace("-", "")
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Bible Talks//tbtysu.org//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
         "BEGIN:VTIMEZONE", "TZID:America/New_York",
         "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
         "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
         "END:VTIMEZONE", "BEGIN:VEVENT", f"UID:{ymd}-{ev['slug']}@tbtysu.org", f"DTSTAMP:{now}"]
    if ev["start_h"]:
        sh, eh = ev["start_h"], ev["end_h"]
        L += [f"DTSTART;TZID=America/New_York:{ymd}T{sh[0]:02d}{sh[1]:02d}00", f"DTEND;TZID=America/New_York:{ymd}T{eh[0]:02d}{eh[1]:02d}00"]
    else:
        last = d(ev["end_date"] or ev["date"]) + datetime.timedelta(days=1)
        L += [f"DTSTART;VALUE=DATE:{ymd}", f"DTEND;VALUE=DATE:{last.strftime('%Y%m%d')}"]
    L += [f"SUMMARY:{esc(ev['title'])}", f"LOCATION:{esc(ev['place'] + ', ' + ev['address'])}",
          f"DESCRIPTION:{esc(ev['blurb'] + chr(10) + chr(10) + 'More: ' + SITE + '/' + ev['slug'] + '/')}",
          f"URL:{SITE}/{ev['slug']}/", "END:VEVENT", "END:VCALENDAR"]
    open(f"calendar/{ev['slug']}.ics", "w", newline="").write("\r\n".join(fold(l) for l in L) + "\r\n")


# ---------- preview image ----------
CARD = """<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#0B0B0C;font-family:'Nunito Sans',sans-serif;position:relative;color:#F5F2EA}
.bg{position:absolute;inset:0;background:url('%(photo)s') center/cover}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,11,12,.96) 0%,rgba(11,11,12,.88) 46%,rgba(11,11,12,.35) 100%)}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.kind{font-weight:700;font-size:24px;letter-spacing:.28em;text-transform:uppercase;color:#D4B072}
h1{font-family:'Montserrat',sans-serif;font-weight:800;font-size:%(size)spx;line-height:1.02;letter-spacing:-.02em;margin-top:22px;max-width:760px}
.when{font-weight:700;font-size:44px;color:#D4B072;margin-top:30px}
.where{font-weight:600;font-size:30px;color:#CFC8BE;margin-top:10px}
.foot{display:flex;align-items:center;gap:16px}
.foot img{height:56px}
.foot span{font-family:'Montserrat',sans-serif;font-weight:800;font-size:24px;letter-spacing:.14em}
.tag{margin-left:auto;font-size:26px;color:#D4B072;font-weight:700}
</style>
<div class="bg"></div><div class="shade"></div>
<div class="wrap"><div><div class="kind">%(kind)s</div><h1>%(title)s</h1>
<div class="when">%(when)s</div><div class="where">%(where)s</div></div>
<div class="foot"><img src="%(icon)s"><span>THE BIBLE TALKS</span><div class="tag">tbtysu.org/%(slug)s</div></div></div>"""


def og_image(ev):
    root = os.getcwd()
    if ev["end_date"]:
        when = date_label(ev, short=True)
        where = f"{ev['place']} \u00b7 St. Louis, MO"
    else:
        when = f"{d(ev['date']).strftime('%a, %b %-d')} \u00b7 {ev['time']}"
        where = f"{ev['place']} \u00b7 Canfield, OH"
    where += f" \u00b7 {ev['price']}"
    size = 104 if len(ev["title"]) <= 12 else (88 if len(ev["title"]) <= 16 else 76)
    vals = dict(photo=f"file://{root}/images/{ev['photo']}", icon=f"file://{root}/images/icon.png", kind=e(ev["kind"]),
                title=e(ev["title"]), when=e(when), where=e(where), size=size, slug=ev["slug"])
    page = CARD
    for k, v in vals.items():
        page = page.replace(f"%({k})s", str(v)).replace(f"%({k})spx", f"{v}px")
    with tempfile.TemporaryDirectory() as t:
        src, png = os.path.join(t, "card.html"), os.path.join(t, "card.png")
        open(src, "w").write(page)
        subprocess.run([CHROME, "--headless", "--hide-scrollbars", "--window-size=1200,630", "--virtual-time-budget=8000",
                        f"--screenshot={png}", f"file://{src}"], check=True, capture_output=True)
        Image.open(png).convert("RGB").save(f"images/og-{ev['slug']}.jpg", "JPEG", quality=86, optimize=True)


# ---------- page ----------
def shell_parts():
    s = open("events.html").read()
    head_fonts = re.search(r'<link rel="preconnect".*?rel="stylesheet" />', s, re.S).group(0)
    top = s[s.index('<a class="skip-link"'):s.index("<main")]
    foot = s[s.index("<footer"):s.index("</footer>") + len("</footer>")]
    fix = lambda h: re.sub(r'(href|src)="(?!https?:|/|#|mailto:|sms:|tel:|\.\./)([^"]+)"', r'\1="../\2"', h)
    return head_fonts, fix(top), fix(foot)


def action_block(ev):
    if ev["reg_status"] == "open":
        reg = f'<a class="btn btn-gold btn-lg" href="{e(ev["reg_url"])}" target="_blank" rel="noopener">Register</a>'
    elif ev["reg_status"] == "waitlist":
        reg = f'<a class="btn btn-gold btn-lg" href="{e(ev["reg_url"])}" target="_blank" rel="noopener">Join the waitlist</a>'
    else:
        reg = '<span class="btn btn-inactive btn-lg">Link coming soon</span>'
    loc = f"{ev['place']}, {ev['address']}"
    cal = (f'<div class="add-cal" data-title="{e(ev["title"])}" data-date="{ev["date"]}"'
           + (f' data-end-date="{ev["end_date"]}"' if ev["end_date"] else "")
           + (f' data-time="{e(ev["time"])}"' if ev["time"] else ' data-time="All day"')
           + f' data-location="{e(loc)}" data-desc="{e(ev["share_desc"])}" data-ics="../calendar/{ev["slug"]}.ics"></div>')
    share = (f'<button type="button" class="btn btn-ghost btn-lg share-btn" data-title="{e(ev["title"])} \u2014 The Bible Talks" '
             f'data-text="{e(ev["share_desc"])}" data-url="{SITE}/{ev["slug"]}/">Share this</button>')
    return f'<div class="event-actions">{reg}{share}{cal}</div>'


def jsonld(ev):
    loc = {"@type": "Place", "name": ev["place"], "address": ev["address"]}
    if ev["start_h"]:
        s = f"{ev['date']}T{ev['start_h'][0]:02d}:{ev['start_h'][1]:02d}:00{ev['tz']}"
        en = f"{ev['date']}T{ev['end_h'][0]:02d}:{ev['end_h'][1]:02d}:00{ev['tz']}"
    else:
        s, en = ev["date"], ev["end_date"] or ev["date"]
    data = {"@context": "https://schema.org", "@type": "Event", "name": ev["title"], "description": ev["blurb"], "startDate": s, "endDate": en,
            "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode", "eventStatus": "https://schema.org/EventScheduled",
            "location": loc, "image": f"{SITE}/images/og-{ev['slug']}.jpg",
            "organizer": {"@type": "Organization", "name": "The Bible Talks", "url": SITE}}
    if ev["reg_status"] == "open":
        data["offers"] = {"@type": "Offer", "price": ev["price_num"], "priceCurrency": "USD", "url": ev["reg_url"], "availability": "https://schema.org/InStock"}
    elif ev["price_num"] == "0":  # free, registration full: no Offer block
        data["isAccessibleForFree"] = True
    return json.dumps(data, ensure_ascii=False, indent=2)


def page(ev, fonts, top, foot):
    url = f"{SITE}/{ev['slug']}/"
    t = f"{ev['title']} \u2014 The Bible Talks"
    desc = f"{when_line(ev)} \u00b7 {ev['place']} \u00b7 {ev['price']}. {ev['share_desc']}"
    img = f"{SITE}/images/og-{ev['slug']}.jpg"
    facts = [("When", when_line(ev)), ("Where", f"{ev['place']}<br><span>{e(ev['address'])}</span>"), ("Cost", e(ev["price"]))]
    facts_html = "".join(f'<div class="event-fact"><div class="fact-label">{a}</div><div class="fact-value">{b if "<br>" in b else e(b)}</div></div>' for a, b in facts)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{e(t)}</title>
<meta name="description" content="{e(desc)}" />
<link rel="canonical" href="{url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="The Bible Talks" />
<meta property="og:title" content="{e(ev['title'])} \u00b7 {e(date_label(ev, True))}" />
<meta property="og:description" content="{e(desc)}" />
<meta property="og:image" content="{img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="{e(ev['title'])}, {e(when_line(ev))}, {e(ev['place'])}" />
<meta property="og:url" content="{url}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{e(ev['title'])} \u00b7 {e(date_label(ev, True))}" />
<meta name="twitter:description" content="{e(desc)}" />
<meta name="twitter:image" content="{img}" />
{fonts}
<link rel="icon" type="image/png" href="../images/favicon.png?v=6" />
<link rel="apple-touch-icon" href="../images/apple-touch-icon.png?v=6" />
<link rel="stylesheet" href="../css/styles.css?v=21" />
<script type="application/ld+json">
{jsonld(ev)}
</script>
</head>
<body>
{top}<main id="main">

  <section class="section section-tight-top" style="padding-bottom:0;">
    <div class="eyebrow-row">
      <span class="eyebrow-rule"></span>
      <span class="eyebrow-text">{e(ev['kind'])}</span>
    </div>
    <h1 class="page-h1">{e(ev['title'])}</h1>
    <p style="font-size:18px;line-height:1.7;color:var(--body-text);margin:28px 0 0;max-width:760px;">{e(ev['blurb'])}</p>
  </section>

  <section class="section" style="padding-top:48px;">
    <div class="event-facts">{facts_html}</div>
    {action_block(ev)}
    <p class="event-note"><a href="/events">\u2190 All events</a> \u00b7 Plugs are announced on Instagram first. <a href="https://instagram.com/thebibletalksysu" target="_blank" rel="noopener">Follow us there \u2192</a></p>
  </section>

</main>

{foot}

<script src="../js/main.js"></script>
<script src="../js/add-to-calendar.js"></script>
<script>
document.getElementById("year").textContent = new Date().getFullYear();
document.querySelectorAll(".share-btn").forEach(function (b) {{
  b.addEventListener("click", function () {{
    var data = {{ title: b.dataset.title, text: b.dataset.text, url: b.dataset.url }};
    if (navigator.share) {{ navigator.share(data).catch(function () {{}}); return; }}
    var done = function () {{ b.textContent = "Link copied"; setTimeout(function () {{ b.textContent = "Share this"; }}, 2200); }};
    if (navigator.clipboard) navigator.clipboard.writeText(data.url).then(done, function () {{ window.prompt("Copy this link", data.url); }});
    else window.prompt("Copy this link", data.url);
  }});
}});
</script>
<script data-goatcounter="https://thebibletalksysu.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>
</body>
</html>
"""


if __name__ == "__main__":
    os.makedirs("calendar", exist_ok=True)
    fonts, top, foot = shell_parts()
    for ev in EVENTS:
        os.makedirs(ev["slug"], exist_ok=True)
        open(f"{ev['slug']}/index.html", "w").write(page(ev, fonts, top, foot))
        ics(ev)
        og_image(ev)
        print("built", ev["slug"])
