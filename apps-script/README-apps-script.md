# Invoice Sender — apps-script

Same automation as the Python/GitHub Actions project, but running entirely
inside Google: no Cloud Console, no OAuth client, no secrets to store.
Authorization is a single "Allow" click tied to your own Google account.

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

3. **Check the settings in config.gs.**
   Everything is already filled in — spreadsheet ID, tab name, cells
   (`D2`/`D3`/`D6`), Doc template ID, archive folder, and
   `shounsalaji@gmail.com` as the recipient. If anything changes later
   (a new recipient, a moved file, a different cell), this is the only
   file you should need to edit.

4. **Confirm the Doc template has its placeholder.**
   The Doc must contain the literal text `{{DATE}}` (and `{{INVOICE_NO}}`
   if you want the number in the letter too) — the script fails loudly if
   it can't find it. It must also be a real **Google Doc**, not an
   uploaded Word file — `DocumentApp` can only edit native Google Docs. If
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
   - Time of day: pick a window (e.g. 11pm–midnight), so it fires once
     near the end of the last day.
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

## How it differs from the Python/GitHub version

- **State**: `PropertiesService.getScriptProperties()` instead of Drive
  `appProperties` — same idea (`preparedMonth`/`preparedInvoiceNo`,
  `sentMonth`/`sentInvoiceNo`/`sentAt`, plus `lastInvoiceNo` so numbering
  keeps advancing even though the master Sheet's cell never changes),
  just a different store.
- **Auth**: implicit, tied to whoever owns/runs the script — no client
  ID/secret/refresh token.
- **Retries**: Google API calls aren't retried with backoff here the way
  the Python version does for 429/5xx; the one exception is opening a
  freshly-copied Doc (`openDocWithRetry_`), which retries with increasing
  delays since a brand-new copy can briefly be inaccessible right after
  creation.
- **Tests**: there's no equivalent of the pytest suite — Apps Script
  doesn't have a practical local test runner for this. Rely on the dry
  run + manual test sequence above before trusting the schedule.
