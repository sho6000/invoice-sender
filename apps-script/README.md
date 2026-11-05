# Invoice Sender — apps-script

Same automation as the Python/GitHub Actions project, but running entirely
inside Google: no Cloud Console, no OAuth client, no secrets to store.
Authorization is a single "Allow" click tied to your own Google account.

## Before you start

Have these ready — you'll paste their IDs into `Config.gs` in step 3:

| You need | Where to get it |
|---|---|
| An invoice Google Sheet | Must be a native Google Sheet (not uploaded `.xlsx`). Note its tab name and which cells hold the invoice number, date, and period. |
| A Google Doc template | Must be a native Google Doc (not uploaded `.docx` — see step 4). Put the literal text `{{DATE}}` wherever the date should go. |
| A Drive folder | Empty folder to archive each month's generated PDFs. |
| A recipient email address | Who the invoice gets sent to. |

Every ID below comes from a Drive URL:
- Sheet ID: `docs.google.com/spreadsheets/d/`**`<THIS>`**`/edit`
- Doc ID: `docs.google.com/document/d/`**`<THIS>`**`/edit`
- Folder ID: `drive.google.com/drive/folders/`**`<THIS>`**

This repo's `Config.gs` ships with placeholder values (`1Q4iIIII...`,
`test1@gmail.com`, etc.) — every one of those needs replacing with your own
before the script will work. None of them are real secrets, so it's safe to
have them in a public repo.

## Setup (about 10 minutes)

1. **Create the script project.**
   Go to [script.google.com](https://script.google.com) → **New project**.
   (You can also open it from **Extensions → Apps Script** inside the
   Sheet itself — either way works, since the script addresses the Sheet
   by ID rather than assuming it's bound to it.)

2. **Paste in the code.**
   - Delete the default empty `Code.gs` content and paste in
     [`Code.gs`](Code.gs).
   - Add a new script file: click the **+** next to "Files" → **Script**
     → name it `config` (Apps Script adds `.gs` automatically).
     Paste in the contents of [`Config.gs`](Config.gs). This is the
     settings file — the one you edit for first-time setup and any later
     changes. `Code.gs` has the logic and shouldn't normally need touching.
   - Click the gear icon (**Project Settings**) → check **"Show
     appsscript.json manifest file in editor"**.
   - Open `appsscript.json` in the editor and replace its contents with
     [`appsscript.json`](appsscript.json) from this folder.
   - Add a new HTML file: **+** next to "Files" → **HTML** → name it
     `email` (the `.html` extension is added automatically).
     Paste in the contents of [`email.html`](email.html). This is
     the email body — edit wording here, not in `Code.gs`.

   You should end up with four files: `code.gs`, `config.gs`,
   `email.html`, and `appsscript.json`. Apps Script shares one global
   scope across all `.gs` files in a project, so `code.gs` can use
   `CONFIG` and `DRY_RUN` from `config.gs` without any import statement.
   The `.gs` filenames themselves (`code` vs `config`) don't matter to
   the code — only the `email.html` filename matters, since `config.gs`
   references it by name (`bodyTemplateFile: 'email'`).

3. **Fill in the settings in config.gs.**
   Replace every placeholder value with your own, using the table from
   "Before you start":
   - `spreadsheetId` — your Sheet's ID.
   - `tabName` — the exact tab name (case-sensitive) at the bottom of
     the Sheet.
   - `cells.invoiceNumber` / `invoiceDate` / `period` — which cells in
     that tab hold each value, e.g. `D2`, `D3`, `D6`.
   - `invoice.numberPrefix` / `numberPadding` — match whatever's
     currently in the invoice number cell (e.g. `INV_07` → prefix
     `INV_`, padding `2`).
   - `doc.templateId` — your Doc template's ID.
   - `archiveFolderId` — your archive folder's ID.
   - `email.to` — the real recipient address(es).
   - `notify.recipient` — your own address, if you want run notifications
     (see step 8).

   This is the only file you should need to edit now or later — for a
   new recipient, a moved file, or a different cell, change it here.

4. **Confirm the Doc template has its placeholder.**
   The Doc must contain the literal text `{{DATE}}` (and `{{INVOICE_NO}}`
   if you want the number in the letter too) — the script fails loudly if
   it can't find it. It must also be a real **Google Doc**, not an
   uploaded Word file or any other txt format — `DocumentApp` can only edit native Google Docs. If
   you started from a `.docx`, open it in Drive and use **File → Save as
   Google Docs** first, then point `templateId` at that new file.

5. **Do a dry run.**
   - At the top of `config.gs`, set `const DRY_RUN = true;`
   - Since the script only proceeds on the actual last day of the month
     (see step 7), also set `const FORCE_RUN = true;` so a test run works
     on any day. **Remember to set this back to `false` before step 7.**
   - In the editor toolbar, select the function `runMonthlyInvoice` from
     the dropdown next to **Run**, then click **Run**.
   - The first run prompts you to authorize — review the permissions
     (Sheets, Docs, Drive, Gmail) and click **Allow**.
   - Check **Executions** (left sidebar, clock icon) for the log output,
     and check Gmail **Drafts** for the created draft with both PDFs
     attached.

6. **Send a real test.**
   - Set `DRY_RUN = false` (keep `FORCE_RUN = true` for now), run
     `runMonthlyInvoice` again.
   - Check the actual email arrives correctly.
   - Run it a third time — it should log "already sent" and do nothing,
     confirming idempotency works.
   - To reset and test again, run the `resetState` function once (clears
     the stored month/invoice-number state).
   - **Before moving to step 7, run `resetState` one final time.**
     Your test send already stored `sentMonth` for the current calendar
     month — if you leave that in place, the real trigger will see that
     month as "already sent" and skip it on the actual last day. Resetting
     wipes that test state so the real first run starts clean.

7. **Schedule it.**
   - Set `const FORCE_RUN = false;` in `config.gs` — important, otherwise
     every daily run would re-send regardless of date.
   - Left sidebar → **Triggers** (clock icon) → **+ Add Trigger**.
   - Function: `runMonthlyInvoice`
   - Event source: **Time-driven**
   - Type: **Day timer** (not "Month timer" — Apps Script's month timer
     can only target a fixed day number 1–28, not "the last day," which
     varies by month. Instead the script runs daily and only actually
     does anything on the real last day of the month — see
     `isLastDayOfMonth_` in `code.gs`.)
   - Time of day: pick an hour-long window around when you want it to
     send (e.g. **9am–10am** for a morning send, or 11pm–midnight for
     end-of-day). Triggers fire sometime within the chosen window, not
     at an exact minute.
   - Failure notification settings: **Notify me immediately** — since
     this only runs once a month, you want to know right away if it
     fails rather than waiting for a daily/weekly digest.
   - Save.

8. **Optional: failure notifications.**
   Set `CONFIG.notify.enabled = true` and `CONFIG.notify.recipient` to an
   email address to get a one-line email on every outcome (sent, skipped,
   dry run, failed). Leave `enabled: false` (current default) to stay
   silent for now.

9. **Optional: get a failure alert even if the script throws before
   `notify_()` runs.**
   In the Triggers list, click the trigger's three-dot menu → there's no
   built-in per-trigger email alert in the new Apps Script UI, but Apps
   Script does email the script owner automatically after repeated
   consecutive failures. For a guaranteed per-run alert, keep
   `CONFIG.notify.enabled = true` — the script's own `catch` block always
   attempts a failure notification before re-throwing.

## Safety: what files this script can touch

Both the master Sheet and the master Doc template are **never edited
directly** — every month the script makes a fresh copy of each (into the
archive folder), edits the copy, exports it to PDF, and then trashes the
copy afterwards, keeping only the two PDFs. The master files stay exactly
as they are, permanently reusable.

On top of that, the code has an explicit **allowlist guard**
(`assertAllowedId_` in `code.gs`): every place the script opens a file or
folder by ID checks it against the three IDs in `config.gs`
(`spreadsheetId`, `doc.templateId`, `archiveFolderId`) first, and throws
immediately if it's ever pointed at anything else. This means the code
itself is provably limited to those three locations, even against a
future accidental edit.

One honest caveat: this guard controls what the *code* does, not what
Google's *permission grant* technically allows. The authorization scopes
in `appsscript.json` (`drive`, `documents`, `spreadsheets`, `gmail.send`)
are broad Google categories — Google has no OAuth scope that means "only
these specific file IDs," so the consent screen you approve will still
say it can access all of Drive. In practice, the allowlist guard means it
never will touch anything else, but that's enforced by this code, not by
the permission itself. If you need the *permission* itself scoped down
too, the only real way is running this under a separate Google account
that has nothing shared with it except these three files/folder — ask if
you want that set up instead.