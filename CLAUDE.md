# Invoice Sender

Sends a monthly consultancy invoice email (invoice PDF + non-GST
declaration PDF) with no human step. Implemented as a **Google Apps
Script** project — not Python/GitHub Actions (that version existed
earlier and was deleted; the original brief for it is kept below for
historical context — don't resurrect that approach unless explicitly
asked).

## Where the real code lives

Everything that matters is in `apps-script/`:

- `Code.gs` — all logic. Shouldn't normally need edits.
- `Config.gs` — all settings (IDs, cells, formats, recipient, testing
  flags). This is what a first-time setup or a later config change edits.
- `email.html` — the email body template.
- `appsscript.json` — OAuth scopes manifest.
- `README-apps-script.md` — full setup/testing walkthrough; read this
  before explaining setup steps to the user.

This repo is **not connected to the live Apps Script project** by any
sync mechanism (no clasp, no deploy script). Editing files here does
nothing to the user's actual script at script.google.com — changes have
to be manually copy-pasted into the Apps Script editor by the user. Any
instructions involving a code change must include telling the user to
copy the updated file over.

## How the automation works

- Runs on a **daily** time-driven trigger, but self-gates: only actually
  proceeds if today is the real last day of the month
  (`isLastDayOfMonth_`), handling 28/29/30/31 correctly.
- The master Sheet (`inv-shoun` tab) and master Doc template are **never
  edited directly** — each run makes a fresh copy of both into the
  archive folder, edits the copy, exports it to PDF, then trashes the
  copy afterwards (keeps only the two PDFs). This mirrors on purpose: the
  Doc needs a reusable `{{DATE}}` placeholder preserved, so it was always
  copy-first; the Sheet was changed to match that pattern on request.
- Numbering (`INV_07` → `INV_08`, prefix `INV_`, 2-digit padding) is
  tracked via `PropertiesService` (`lastInvoiceNo`) once there's any
  history — the master Sheet's cell is only ever read once, as a
  bootstrap before the first successful run. It never advances once the
  script starts tracking its own state.
- Code-level allowlist guard (`assertAllowedId_`) refuses to open any
  Drive file/folder ID except the three in `Config.gs`
  (`spreadsheetId`, `doc.templateId`, `archiveFolderId`). This restricts
  what the *code* can touch, not what the OAuth scope technically permits
  (Google has no scope for "only these specific IDs" — the `drive` scope
  granted is broad; see the Safety section in `README-apps-script.md`).
- Writes to Sheet cells force plain-text format (`setNumberFormat('@')`)
  before `setValue()`, to stop the sheet's locale from reinterpreting a
  `dd-MM-yyyy` date as `MM-dd-yyyy`.
- The Doc template **must be a native Google Doc**, not an uploaded Word
  file — `DocumentApp` can't open non-native files, which caused a real
  "document is inaccessible" bug earlier. If a new template is ever
  swapped in, check it opens via `testOriginalDocAccess` first.
- Notifications (`CONFIG.notify`) are optional on both channels (Slack
  doesn't exist in this version — only an email notify channel). No
  validation forces one to be on.

## Testing flags (`Config.gs`)

- `DRY_RUN` — `true` creates a Gmail draft instead of sending, and skips
  marking the month as sent.
- `FORCE_RUN` — `true` bypasses the last-day-of-month gate, for manual
  testing on any day. **Must be `false`** before relying on the daily
  trigger, or it would send on whatever day the trigger first fires each
  month instead of the actual last day.
- `resetState()` — run manually from the editor to clear all tracked
  state (`preparedMonth`, `sentMonth`, `lastInvoiceNo`, etc.) for a clean
  test cycle.

Check `Config.gs` for the current values of these before assuming either
is in its "safe for production" state — they get flipped on and off
constantly during testing and are easy to forget.

## No automated tests

There's no pytest equivalent for this version — Apps Script has no
practical local test runner. Verification relies on the dry-run + manual
test sequence in `README-apps-script.md` (dry run → real send → confirm
idempotent skip).

---

## Appendix: original project brief (historical, Python/GitHub Actions)

The content below is the original brief Shoun wrote on 4 Nov 2026, asking
for a Python/GitHub Actions implementation. That implementation was built,
then fully deleted in favor of the Apps Script version above, because the
Google Cloud Console/OAuth client setup was too much friction. Kept here
only so the reasoning and original requirements aren't lost — none of the
file paths, commands, or workflow details below reflect the current
project.

### Overview

Build a GitHub Actions project that sends a monthly invoice email with two PDF attachments, with no human step, and notifies the owner after every run.
Each month the job must:
1. Update the invoice Google Sheet: increment the invoice number and set the invoice date.
2. Export that Sheet as PDF.
3. Copy a Google Doc template, fill in the date (and invoice number if used), and export the copy as PDF.
4. Send an email from the owner's Gmail account using a fixed template, with both PDFs attached.
5. Notify the owner of success, or of failure with the step that broke.

Out of scope: generating invoice amounts, payment tracking, multiple clients. Keep it a small, readable Python project that one person can maintain.

Instruction to Claude Code: build the whole repository described here, including the README setup guide in the section below. Where a value is marked TODO, leave it as a clearly named placeholder in the config file, not hardcoded.

### Architecture

GitHub's scheduler starts a short-lived runner once a month; the Python script talks to Google APIs, sends the email, and exits. Nothing runs between months, and no part depends on Shoun's laptop.

### Inputs to fill in

Shoun fills these in before handing the brief to Claude Code; anything left blank becomes a TODO in config.yaml.

| Input | Value | Notes |
|---|---|---|
| Recipient (To) | TODO | One or more addresses |
| CC / BCC | TODO | Optional |
| Email subject template | TODO | e.g. Invoice {invoice_no} for {month_year} |
| Email body template | TODO | Plain text or HTML; placeholders {invoice_no}, {month_year}, {invoice_date} |
| Invoice Sheet ID | TODO | From the Sheet URL, after converting the .xlsx to a Google Sheet |
| Sheet tab name | TODO | e.g. Invoice |
| Invoice number cell | TODO | e.g. F4 |
| Invoice date cell | TODO | e.g. F5 |
| Invoice number format | TODO | e.g. INV-{n:03d}; current value e.g. INV-042 |
| Date format | TODO | e.g. %d %B %Y → 1 December 2026 |
| Which date | TODO | Run date (1st of month) or last day of previous month |
| Doc template ID | TODO | Master doc containing {{DATE}} (and optionally {{INVOICE_NO}}) |
| Archive folder ID | TODO | Drive folder for monthly Doc copies and PDFs |
| PDF file names | TODO | e.g. Invoice-{invoice_no}.pdf, Letter-{month_year}.pdf |
| Send schedule | 1st of month, 09:30 IST | Cron 0 4 1 * * (UTC) |
| Notification channel | TODO | Email, Slack, or both |
| Notification recipient | TODO | Email address and/or Slack channel |
| Timezone | Asia/Kolkata | Used for all dates |

### Google access design

Default: one OAuth refresh token for Shoun's Google Workspace account, stored as GitHub Secrets. This is the simplest setup that works with files in My Drive.
- OAuth client type: Desktop app, consent screen user type Internal (COSS Workspace), so refresh tokens do not expire after 7 days.
- Scopes: `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/documents`, `https://www.googleapis.com/auth/spreadsheets`.
- gmail.send is send-only: the job cannot read, search or delete mail.
- Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
- Provide scripts/get_refresh_token.py, run once locally, which opens the browser consent flow and prints the refresh token.

Optional hardening (document in README, do not build unless asked): move the Sheet, Doc template and archive folder into a Shared Drive, share only those with a service account, and keep OAuth for gmail.send only. A Shared Drive is required because service accounts have no My Drive storage, so copying the Doc template into a personal folder fails. COSS's Workspace may also block service account key creation; that needs admin approval.

### Repository structure

Private GitHub repo, suggested name invoice-autopilot, Python 3.12.

```
invoice-autopilot/
├── .github/workflows/
│   └── monthly-invoice.yml     # schedule + manual trigger
├── invoice_autopilot/
│   ├── __init__.py
│   ├── main.py                 # orchestrates the steps, CLI flags
│   ├── config.py               # loads + validates config.yaml
│   ├── google_auth.py          # refresh token -> credentials
│   ├── sheet.py                # read/increment number, set date, export PDF
│   ├── doc.py                  # copy template, replace placeholders, export PDF
│   ├── mailer.py               # build MIME with attachments, send via Gmail API
│   ├── notify.py               # Slack webhook and/or email notification
│   └── state.py                # last-sent month (idempotency)
├── scripts/
│   └── get_refresh_token.py    # one-time local OAuth consent
├── templates/
│   ├── email_body.html         # or .txt
│   └── email_subject.txt
├── tests/                      # unit tests with Google APIs mocked
├── config.yaml                 # non-secret settings (IDs, cells, formats)
├── requirements.txt
└── README.md                   # setup guide
```

Libraries: google-api-python-client, google-auth, google-auth-oauthlib, PyYAML, requests; pytest for tests. No other dependencies.

### Configuration file

All non-secret settings live in config.yaml, validated at startup; a missing or TODO value stops the run with a clear error before any Google call. Secrets come only from environment variables.

```yaml
timezone: Asia/Kolkata

invoice:
  number_format: "INV-{n:03d}"     # TODO
  number_regex: "INV-(\\d+)"        # TODO: parses the current value
  date_format: "%d %B %Y"          # TODO
  date_rule: run_date              # run_date | last_day_prev_month

sheet:
  spreadsheet_id: TODO
  tab_name: TODO
  invoice_number_cell: TODO        # e.g. F4
  invoice_date_cell: TODO          # e.g. F5
  pdf:
    filename: "Invoice-{invoice_no}.pdf"
    portrait: true
    fit_to_width: true
    gridlines: false

doc:
  template_id: TODO
  copy_name: "Letter - {month_year}"
  placeholders:
    "{{DATE}}": invoice_date
    "{{INVOICE_NO}}": invoice_no
  pdf:
    filename: "Letter-{month_year}.pdf"

archive:
  folder_id: TODO                  # Doc copies + both PDFs saved here

email:
  to: [TODO]
  cc: []
  bcc: []
  subject_template: templates/email_subject.txt
  body_template: templates/email_body.html

notify:
  slack: true                      # uses SLACK_WEBHOOK_URL secret
  email_to: [TODO]                 # sent via the same Gmail account
```

Secrets (GitHub Actions secrets → env vars): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, SLACK_WEBHOOK_URL (only if Slack is on).

Template placeholders available everywhere: {invoice_no}, {invoice_date}, {month_year} (e.g. December 2026), {month_short} (e.g. Dec-2026).

### Script behaviour

python -m invoice_autopilot.main runs these steps in order and stops at the first failure.

CLI flags: --dry-run (create a Gmail draft instead of sending, do not mark the month as sent), --force (send even if this month is already marked sent), --month YYYY-MM (override the billing month, for testing or a late send).

1. Load and validate config. Fail fast on missing values, malformed cell refs or a missing secret.
2. Authenticate. Build google.oauth2.credentials.Credentials from the refresh token and refresh it; on invalid_grant, fail with a message that the token was revoked or expired.
3. Check state (see Idempotency). If this month is already sent and --force is not set, exit successfully with a "skipped" notification.
4. Work out values. Billing month and invoice date in Asia/Kolkata per date_rule. Invoice number: reuse the number prepared for this month if state has one; otherwise read the number cell, parse with number_regex, add 1, format with number_format.
5. Record prepared state (month + invoice number) before changing any file, so a rerun reuses the same number.
6. Update the Sheet via Sheets API values.update (valueInputOption=USER_ENTERED) on the number and date cells. Read both cells back and confirm they match.
7. Export the Sheet PDF. Use the export URL `https://docs.google.com/spreadsheets/d/{id}/export?format=pdf&gid={tab_gid}&portrait=...&fitw=...&gridlines=...` with the bearer token, so only the invoice tab is exported with fixed layout. Look up tab_gid from spreadsheets.get. Check the response is application/pdf and non-empty.
8. Copy the Doc template with Drive files.copy into the archive folder, named per copy_name. Never edit the template itself.
9. Fill placeholders in the copy with one Docs API batchUpdate of replaceAllText requests. Fail if any placeholder had zero occurrences.
10. Export the Doc PDF with Drive files.export (application/pdf).
11. Archive PDFs. Upload both PDFs to the archive folder; skip upload of a file with the same name already there.
12. Build the email. Render subject and body templates; MIME multipart with both PDFs (application/pdf, filenames from config). Base64url-encode the raw message.
13. Send via Gmail users.messages.send (or users.drafts.create in dry run). Keep the returned message ID.
14. Record sent state (month, invoice number, message ID, timestamp).
15. Notify success with invoice number, recipients, send time and links to the archived PDFs.

Logging: one line per step to stdout (shows in the Actions log). Never log tokens, the email body or PDF contents. Retry Google API calls on 429/5xx with exponential backoff, max 5 attempts.

### GitHub Actions workflow

One workflow file, .github/workflows/monthly-invoice.yml, with a schedule and a manual trigger. Pin actions to major versions and Python to 3.12.

```yaml
name: Monthly invoice

on:
  schedule:
    - cron: '0 4 1 * *'          # 1st of month, 04:00 UTC = 09:30 IST
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Create a Gmail draft instead of sending'
        type: boolean
        default: true
      force:
        description: 'Send even if this month was already sent'
        type: boolean
        default: false
      month:
        description: 'Billing month YYYY-MM (blank = current)'
        type: string
        default: ''

concurrency:
  group: monthly-invoice
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  send:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12', cache: 'pip' }
      - run: pip install -r requirements.txt
      - name: Run invoice autopilot
        env:
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          GOOGLE_REFRESH_TOKEN: ${{ secrets.GOOGLE_REFRESH_TOKEN }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: >
          python -m invoice_autopilot.main
          ${{ inputs.dry_run && '--dry-run' || '' }}
          ${{ inputs.force && '--force' || '' }}
          ${{ inputs.month && format('--month {0}', inputs.month) || '' }}
      - name: Alert on failure
        if: failure()
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: python -m invoice_autopilot.notify --failure --run-url "$RUN_URL"
```

Notes for Claude Code:
- Scheduled runs have no inputs, so the expressions above must resolve to an empty flag list (a real send). Verify this behaviour.
- concurrency stops a manual run and the scheduled run from sending at the same time.
- The failure step is a backstop for crashes before the script's own notifier runs; the script should also catch exceptions and send a failure alert naming the step, then exit non-zero.
- GitHub may start scheduled runs 10–30 minutes late; that is acceptable.

### Idempotency, state and safety

The invoice is sent at most once per month, and a rerun after a failure reuses the same invoice number.

State storage: Drive appProperties on the invoice spreadsheet file (invisible to people, no repo writes needed).

| Key | Example | Set at |
|---|---|---|
| prepared_month | 2026-12 | Step 5, before any file change |
| prepared_invoice_no | INV-043 | Step 5 |
| sent_month | 2026-12 | Step 14, after Gmail confirms |
| sent_invoice_no | INV-043 | Step 14 |
| sent_message_id | 18c2… | Step 14 |
| sent_at | 2026-12-01T09:31:04+05:30 | Step 14 |

Rules:
- sent_month == billing month and no --force → skip, notify "already sent".
- prepared_month == billing month → reuse prepared_invoice_no; set the Sheet cell to that value instead of incrementing.
- Dry run never writes sent_* keys, and does write prepared_*, so a later real run uses the same number.
- Never edit the Doc template; always work on a copy.
- Never delete files. Never send to any address not in config.yaml.
- Fail before sending if either PDF is missing, empty or not a PDF, or if any placeholder was not replaced.
- Repo is private; only the owner (and at most one backup maintainer) has write access, because anyone with write access can read secrets through a workflow change.

### Notifications

Every run ends with exactly one notification: sent, skipped, dry run, or failed. Channels per notify in config; Slack via incoming webhook, email via the same Gmail send credential.

| Outcome | Message |
|---|---|
| Sent | ✅ Invoice INV-043 sent to accounts@client.com at 09:31 IST, 1 Dec 2026. PDFs: [links to archive]. Run: [link] |
| Skipped | ℹ️ Invoice for Dec 2026 already sent (INV-043). No email sent. Run: [link] |
| Dry run | 🧪 Dry run: Gmail draft created for INV-043. Check it before the real send. Draft: [link] |
| Failed | ❌ Invoice run failed at step "Export Sheet PDF": [short error]. Nothing was sent. Run: [link] |

- A failure after Gmail confirmed sending (steps 14–15) must say the email was sent, so the owner does not resend.
- If the notification itself fails, log it and exit non-zero so the GitHub run shows red; GitHub's own failed-run email is the last fallback.
- Notification email subject is prefixed [Invoice Autopilot] so it can be filtered.

### Testing and dry run

Go live only after a dry run produces a correct Gmail draft and a test send to Shoun's own address looks right.

Unit tests (pytest, Google APIs mocked):
- Invoice number parse and increment, including zero-padding and rollover (INV-099 → INV-100).
- Date rules in Asia/Kolkata, including a run on the 1st and last_day_prev_month across a year boundary.
- State logic: already sent → skip; prepared → reuse number; --force overrides.
- Placeholder replacement fails when a placeholder is missing.
- MIME message has both attachments with the right names and types.
- Config validation rejects TODO values.

Add a CI workflow (tests.yml) that runs pytest on every push; it must not use any secrets.

Manual test sequence, in order:
1. Point email.to at Shoun's own address and use a copy of the Sheet and Doc.
2. Run the workflow manually with dry_run: true → check the Gmail draft, both PDFs and the notification.
3. Run with dry_run: false → check the received email.
4. Run again → confirm it skips and notifies "already sent".
5. Switch config to the real recipient and real files; reset the test state keys.

### One-time setup (README content)

The README must walk Shoun through these steps in this order, with exact clicks and commands; total about one hour.

**Prepare the files**
- [ ] Upload the .xlsx to Drive, open it, choose File → Save as Google Sheets; check the layout. Note the spreadsheet ID and the invoice tab name.
- [ ] In the Google Doc, replace the date with {{DATE}} (and the invoice number with {{INVOICE_NO}} if it appears). This is the master template.
- [ ] Create an archive folder in Drive; note its ID.

**Google Cloud**
- [ ] Create a project at console.cloud.google.com (e.g. invoice-autopilot).
- [ ] Enable Gmail API, Google Drive API, Google Sheets API, Google Docs API.
- [ ] OAuth consent screen: user type Internal, add the four scopes.
- [ ] Create an OAuth client ID, type Desktop app; download the JSON.
- [ ] Locally: pip install -r requirements.txt then python scripts/get_refresh_token.py client_secret.json; approve in the browser; copy the printed refresh token. Delete the JSON afterwards.
- [ ] If project creation or Internal apps are blocked, ask the COSS Workspace admin.

**Slack (optional)**
- [ ] Create an incoming webhook for the chosen channel; copy the URL.

**GitHub**
- [ ] Create a private repo and push the project.
- [ ] Settings → Secrets and variables → Actions: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, SLACK_WEBHOOK_URL.
- [ ] Fill every TODO in config.yaml and the email templates; commit.
- [ ] Run the manual test sequence from the Testing section.

### Acceptance criteria

The project is done when all of these hold:
- [ ] A scheduled run on the 1st sends one email with both PDFs and posts a success notification, with no human step.
- [ ] The Sheet shows the new invoice number and date; the PDF shows only the invoice tab.
- [ ] The Doc PDF shows the correct date; the template still contains its placeholders.
- [ ] A second run in the same month sends nothing and reports "already sent".
- [ ] A run that fails midway sends no email, alerts with the failing step, and a rerun reuses the same invoice number.
- [ ] Dry run creates a draft, sends nothing, and does not mark the month as sent.
- [ ] No secret, token or invoice content appears in logs.
- [ ] pytest passes in CI without secrets.
- [ ] The README lets someone new complete setup without asking questions.

### Maintenance and failure modes

No monthly work is needed; the owner acts only on a failure alert or a change in recipient, template or files.

| Symptom | Likely cause | Fix |
|---|---|---|
| invalid_grant at auth | Token revoked, password/security change, app removed, or consent screen left in Testing | Rerun get_refresh_token.py, update GOOGLE_REFRESH_TOKEN |
| File not found / 403 | Sheet, Doc or folder moved, deleted or unshared | Restore access or update the ID in config.yaml |
| Placeholder not found | Someone edited the Doc template | Put {{DATE}} back in the template |
| Number parse error | Invoice number cell format changed | Fix the cell or number_regex |
| Schedule stopped firing | Workflow disabled, repo archived, or Actions turned off for the org | Re-enable in the Actions tab |
| Deprecation warnings in logs | GitHub runner or action version retired | Bump actions/* versions and Python |

Ownership: emails send from Shoun's account. If Shoun changes role or leaves COSS, hand over by generating a new refresh token from the new sender's account and updating the secrets and README.
