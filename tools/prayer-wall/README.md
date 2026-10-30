# TBT prayer wall: setup

Status: set up and deployed (Google account ndinonzibruce@gmail.com, sheet "TBT Prayer Wall"). The address is already in `js/prayer-config.js`.
The steps below are for rebuilding it or moving it to a different account.

The website pages (`/prayer` and the "Pray for Each Other" section on `/band`) read and write to a
Google Sheet through a small Google Apps Script. Until the script's address is pasted into
`js/prayer-config.js`, the prayer page shows "opening soon" and the band section stays hidden.

## One-time setup (about 5 minutes, signed in as the TBT Google account)

1. Go to sheets.google.com and start a **Blank spreadsheet**. Name it "TBT Prayer Wall".
2. **Extensions → Apps Script.**
3. Delete the starter code, paste in everything from `Code.gs`, and click **Save**.
4. In the function dropdown pick **setup**, click **Run**, and approve the permissions
   (Google warns the app is unverified because you wrote it: Advanced → Go to project → Allow).
5. **Deploy → New deployment →** gear icon → **Web app**.
   Execute as: **Me**. Who has access: **Anyone**. Click **Deploy** and copy the **Web app URL**.
6. Paste that URL between the quotes in `js/prayer-config.js` and push.

If you ever change `Code.gs`, redeploy with **Deploy → Manage deployments → pencil → New version**.

## Answered prayers, topics, and the private link

- After posting, a poster gets a private link (also remembered on their phone) to **mark their request answered** with an optional one-line update, **undo** that, or **remove** the request.
- Only a scrambled version of that link is kept (the **TokenHash** column). Requests posted before this feature have none; mark those answered in the sheet yourself.
- To do it yourself in the sheet: set **Answered** to `yes` and write the **Update**, or set **Status** to `hidden`.
- Answered requests stay on the wall for 14 days after being answered (or until the normal 30 days, whichever is later).
- Topics are Health, Family, School, Faith (change `TOPICS` at the top of `Code.gs` and the chips in `prayer.html`/`js/prayer.js`).
- After editing `Code.gs`: paste it in, run `setup` once (it only rewrites the header row), then **Deploy → Manage deployments → pencil → New version**.

## Running it

- Every new request is emailed to `NOTIFY_EMAIL` (top of `Code.gs`).
- To hide a request, change its **Status** cell to `hidden` in the sheet. Set it back to `live` to restore it.
- Requests marked `team` in **Visibility** never appear on the site.
- A request reported 3 times is hidden automatically. Wall requests older than 30 days drop off (they stay in the sheet).
- Links, email addresses, and phone numbers are rejected, and a flood of submissions is slowed down.

## Testing without Google

- Logic tests: `osascript -l JavaScript tools/prayer-wall/test.js`
- Pages against a local stand-in: `python3 tools/serve.py 8125` and `python3 tools/prayer-wall/mock_server.py 8787`,
  then open `http://localhost:8125/prayer?endpoint=http://localhost:8787/`
