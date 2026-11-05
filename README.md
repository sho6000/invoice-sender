# Invoice Sender

Sends a monthly consultancy invoice email with two PDF attachments (the
invoice itself and a non-GST declaration), with no human step, running
entirely inside Google.

See [`CLAUDE.md`](CLAUDE.md) for the original project brief and how this
version works internally.

**Implementation:** [`apps-script/`](apps-script/) — a Google Apps Script
project (no Cloud Console, no OAuth client, no secrets to store).

**Setup instructions:** [`apps-script/README-apps-script.md`](apps-script/README-apps-script.md)
