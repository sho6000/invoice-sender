/**
 * All the settings you'd normally put in a .env file, in one place.
 * Apps Script has no .env support, so this plain script file is the
 * equivalent — edit values here, leave Code.gs alone.
 *
 * Set DRY_RUN to true to create a Gmail draft instead of sending, and to
 * skip marking the month as sent. Flip it back to false once a test send
 * looks right.
 *
 * Set FORCE_RUN to true while testing manually on a day that isn't the
 * actual last day of the month — it bypasses that date check. Set it back
 * to false before relying on the daily trigger, otherwise every daily run
 * would re-send regardless of date.
 */
const DRY_RUN = false;
const FORCE_RUN = true;

const CONFIG = {
  // IANA timezone used for every computed date.
  timezone: 'Asia/Kolkata',

  // From the Sheet's URL: docs.google.com/spreadsheets/d/<THIS>/edit
  spreadsheetId: '1Q4iIIIIIIIIIIiiiiIiIiiIiiiiiii',

  // Exact tab name, case-sensitive, as it appears at the bottom of the sheet.
  tabName: 'inv-shoun',

  // Cell references (top-left cell if merged) for the three fields updated each month.
  cells: {
    invoiceNumber: 'D2',
    invoiceDate: 'D3',
    period: 'D6',
  },

  invoice: {
    numberPrefix: 'INV_',           // current cell value is INV_07 -> next is INV_08
    numberPadding: 2,               // digits after the prefix, e.g. 2 -> 07, 08, ... 99, 100
    dateFormat: 'dd-MM-yyyy',       // sheet cell style, e.g. 31-10-2026
    docDateFormat: 'd MMMM yyyy',   // Doc letter / email style, e.g. 31 October 2026
    // 'run_date': the job now runs daily and only proceeds on the last
    // calendar day of the month (see isLastDayOfMonth_ in Code.gs), so the
    // run date IS the invoice date. Use 'last_day_prev_month' instead only
    // if you switch back to a trigger that fires on the 1st of the month.
    dateRule: 'run_date',
  },

  doc: {
    // From the Doc's URL: docs.google.com/document/d/<THIS>/edit
    templateId: '1TUil000000000000000000000000000',
    copyNamePattern: 'Declaration of GST Non-Enrollment - {month_name}',
    // Maps literal text in the Doc to a field computed by buildPlaceholders_().
    placeholders: {
      '{{DATE}}': 'doc_date',
    },
  },

  // Drive folder (from its URL: drive.google.com/drive/folders/<THIS>)
  // where the monthly Doc copy and both PDFs get archived.
  archiveFolderId: '10HHhhhhhhhHHHHHHHHHHHHHHHH',

  // Filenames aren't configured here: the Sheet PDF is named after the
  // spreadsheet's own file title + the invoice number digits (e.g.
  // "Invoice-Shoun-08"), and the Doc PDF reuses the Doc copy's own name —
  // see exportSheetPdf_ and the 'Export Doc PDF' step in Code.gs.
  sheetPdf: {
    portrait: true,
    fitToWidth: true,
    gridlines: false,
  },

  email: {
    to: ['test1@gmail.com'],
    cc: [],
    bcc: [],
    subject: 'Consultancy Invoice - {month_name}',
    bodyTemplateFile: 'email', // edit email.html, not this file
  },

  notify: {
    enabled: true,   // set true to get a one-line email on every outcome
    recipient: 'test2@gmail.com',    // email address to notify, if enabled
  },
};
