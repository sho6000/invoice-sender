/**
 * Invoice Sender — Google Apps Script version.
 *
 * Sends a monthly invoice email with two PDF attachments (the Sheet's
 * invoice tab + a filled-in Doc letter), with no human step. Runs entirely
 * inside Google via a time-driven trigger — see README-apps-script.md for
 * one-time setup.
 *
 * All settings live in Config.gs, not here — edit that file, not this one.
 */

/**
 * Entry point. Wire this to a DAILY time-driven trigger (see README) —
 * Apps Script's "Month timer" trigger can only target a fixed day number
 * (1-28), not "the last day of the month" (which varies, 28-31). Running
 * daily and self-gating here is the reliable way to land on the actual
 * last day every time.
 */
function runMonthlyInvoice() {
  const now = new Date();
  if (!FORCE_RUN && !isLastDayOfMonth_(now)) {
    Logger.log('Not the last day of the month (' + Utilities.formatDate(now, CONFIG.timezone, 'yyyy-MM-dd') + '), skipping.');
    return;
  }

  const props = PropertiesService.getScriptProperties();
  let step = 'Check state';

  try {
    const billing = computeBilling_();
    const billingMonth = billing.billingMonth;
    const invoiceDate = billing.invoiceDate;

    const sentMonth = props.getProperty('sentMonth');
    if (sentMonth === billingMonth) {
      const sentInvoiceNo = props.getProperty('sentInvoiceNo');
      Logger.log('Invoice for ' + billingMonth + ' already sent (' + sentInvoiceNo + '). Skipping.');
      notify_('Skipped', 'Invoice for ' + billingMonth + ' already sent (' + sentInvoiceNo + '). No email sent.');
      return;
    }

    step = 'Work out invoice number';
    const ss = SpreadsheetApp.openById(assertAllowedId_(CONFIG.spreadsheetId, 'master spreadsheet'));
    const sheet = ss.getSheetByName(CONFIG.tabName);
    if (!sheet) {
      throw new Error('no tab named "' + CONFIG.tabName + '" found in the spreadsheet');
    }

    const preparedMonth = props.getProperty('preparedMonth');
    let invoiceNo;
    if (preparedMonth === billingMonth) {
      invoiceNo = props.getProperty('preparedInvoiceNo');
    } else {
      // The master sheet is never edited (see below), so once there's any
      // history, the last-used number (stored here) is the source of
      // truth, not the master's cell — which never advances. The master
      // cell is only read as a one-time bootstrap before any run has
      // ever completed.
      const lastInvoiceNo = props.getProperty('lastInvoiceNo');
      const currentN = lastInvoiceNo
        ? parseInvoiceNumber_(lastInvoiceNo)
        : parseInvoiceNumber_(sheet.getRange(CONFIG.cells.invoiceNumber).getDisplayValue());
      invoiceNo = formatInvoiceNumber_(currentN + 1);
    }

    step = 'Record prepared state';
    props.setProperty('preparedMonth', billingMonth);
    props.setProperty('preparedInvoiceNo', invoiceNo);

    const placeholders = buildPlaceholders_(invoiceNo, invoiceDate);
    const invoiceNoDigits = invoiceNo.replace(CONFIG.invoice.numberPrefix, '');

    step = 'Copy Sheet template';
    const archiveFolder = DriveApp.getFolderById(assertAllowedId_(CONFIG.archiveFolderId, 'archive folder'));
    // Mirrors the Doc template: the master spreadsheet is never edited —
    // a fresh copy is made and edited instead, named after the master's
    // own file title + the invoice number digits, e.g. "Invoice-Shoun-08".
    const sheetCopyName = ss.getName() + '-' + invoiceNoDigits;
    const sheetCopyFile = DriveApp.getFileById(assertAllowedId_(CONFIG.spreadsheetId, 'master spreadsheet')).makeCopy(sheetCopyName, archiveFolder);
    const sheetCopySs = SpreadsheetApp.openById(sheetCopyFile.getId());
    const sheetCopyTab = sheetCopySs.getSheetByName(CONFIG.tabName);
    if (!sheetCopyTab) {
      throw new Error('no tab named "' + CONFIG.tabName + '" found in the copied spreadsheet');
    }

    step = 'Update Sheet';
    // Force plain-text format before writing: these cells hold
    // pre-formatted text (e.g. Period contains "... to ..."), and
    // setValue() would otherwise let the sheet's locale reinterpret a
    // DD-MM-YYYY date as MM-DD-YYYY or reject it outright.
    setTextCell_(sheetCopyTab, CONFIG.cells.invoiceNumber, invoiceNo);
    setTextCell_(sheetCopyTab, CONFIG.cells.invoiceDate, placeholders.invoice_date);
    setTextCell_(sheetCopyTab, CONFIG.cells.period, placeholders.period);
    SpreadsheetApp.flush();

    step = 'Export Sheet PDF';
    const sheetPdfBlob = exportSheetPdf_(sheetCopyFile.getId(), sheetCopyTab);
    // Same name as the Sheet copy that was just created above.
    sheetPdfBlob.setName(sheetCopyName + '.pdf');
    if (sheetPdfBlob.getBytes().length === 0) {
      throw new Error('sheet PDF export is empty');
    }

    step = 'Copy Doc template';
    const copyName = formatTemplate_(CONFIG.doc.copyNamePattern, placeholders);
    const docCopyFile = DriveApp.getFileById(assertAllowedId_(CONFIG.doc.templateId, 'doc template')).makeCopy(copyName, archiveFolder);

    step = 'Fill Doc placeholders';
    const doc = openDocWithRetry_(docCopyFile.getId());
    const body = doc.getBody();
    Object.keys(CONFIG.doc.placeholders).forEach(function (marker) {
      const field = CONFIG.doc.placeholders[marker];
      const value = placeholders[field];
      const found = body.findText(escapeRegex_(marker));
      if (!found) {
        throw new Error('placeholder ' + marker + ' was not found in the Doc template copy');
      }
      body.replaceText(escapeRegex_(marker), value);
    });
    doc.saveAndClose();

    step = 'Export Doc PDF';
    const docPdfBlob = DriveApp.getFileById(docCopyFile.getId()).getAs('application/pdf');
    // Same name as the Doc copy that was just created above.
    docPdfBlob.setName(copyName + '.pdf');
    if (docPdfBlob.getBytes().length === 0) {
      throw new Error('doc PDF export is empty');
    }

    step = 'Archive PDFs';
    archivePdf_(archiveFolder, sheetPdfBlob);
    archivePdf_(archiveFolder, docPdfBlob);

    step = 'Send email';
    const subject = formatTemplate_(CONFIG.email.subject, placeholders);
    const bodyRaw = HtmlService.createHtmlOutputFromFile(CONFIG.email.bodyTemplateFile).getContent();
    const htmlBody = formatTemplate_(bodyRaw, placeholders);
    const mailOptions = {
      htmlBody: htmlBody,
      cc: CONFIG.email.cc.join(','),
      bcc: CONFIG.email.bcc.join(','),
      attachments: [sheetPdfBlob, docPdfBlob],
    };

    if (DRY_RUN) {
      GmailApp.createDraft(CONFIG.email.to.join(','), subject, '', mailOptions);
      notify_('Dry run', 'Dry run: Gmail draft created for ' + invoiceNo + '. Check it before the real send.');
      Logger.log('Dry run complete for ' + invoiceNo + '. Draft created, nothing sent, month not marked sent.');
      return;
    }

    GmailApp.sendEmail(CONFIG.email.to.join(','), subject, '', mailOptions);

    step = 'Clean up copies';
    // Keep only the PDFs in the archive folder — the editable Sheet/Doc
    // copies were only needed to produce them. Trashed, not permanently
    // deleted, so they're recoverable from Drive trash if ever needed.
    // Best-effort: a failure here shouldn't be reported as a failed run,
    // since the email already sent successfully.
    try {
      sheetCopyFile.setTrashed(true);
      docCopyFile.setTrashed(true);
    } catch (cleanupErr) {
      Logger.log('Warning: could not trash intermediate copies: ' + cleanupErr.message);
    }

    step = 'Record sent state';
    props.setProperty('sentMonth', billingMonth);
    props.setProperty('sentInvoiceNo', invoiceNo);
    props.setProperty('sentAt', new Date().toISOString());
    props.setProperty('lastInvoiceNo', invoiceNo);

    step = 'Notify';
    notify_(
      'Sent',
      'Invoice ' + invoiceNo + ' sent to ' + CONFIG.email.to.join(', ') + ' for ' + billingMonth + '.'
    );
    Logger.log('Done: invoice ' + invoiceNo + ' sent for ' + billingMonth + '.');
  } catch (err) {
    const message = 'Invoice run failed at step "' + step + '": ' + err.message;
    Logger.log(message);
    notify_('Failed', message);
    throw err;
  }
}

/**
 * Code-level allowlist: refuses to touch any file/folder ID except the
 * ones explicitly set in Config.gs. This doesn't change what Google's
 * OAuth consent screen grants (the "drive" scope is still broad — Google
 * has no scope that means "only these specific IDs"), but it guarantees
 * the CODE itself can never reach anything else, even by future mistake.
 * Freshly-created copies (sheetCopyFile, docCopyFile) aren't checked here
 * since they're files the script just made itself, inherently scoped to
 * a makeCopy() of an already-allowed source into the allowed folder.
 */
function assertAllowedId_(id, label) {
  const allowed = [CONFIG.spreadsheetId, CONFIG.doc.templateId, CONFIG.archiveFolderId];
  if (allowed.indexOf(id) === -1) {
    throw new Error('Refusing to access "' + label + '" (' + id + ') — not one of the IDs in Config.gs.');
  }
  return id;
}

function openDocWithRetry_(fileId) {
  const delaysMs = [1000, 2000, 4000, 8000];
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return DocumentApp.openById(fileId);
    } catch (e) {
      // A freshly-copied file is sometimes not yet visible to the Docs
      // service for a moment — retry with backoff instead of failing.
      if (attempt === delaysMs.length) {
        throw e;
      }
      Utilities.sleep(delaysMs[attempt]);
    }
  }
}

function isLastDayOfMonth_(date) {
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function computeBilling_() {
  const tz = CONFIG.timezone;
  const now = new Date();
  let invoiceDate;

  if (CONFIG.invoice.dateRule === 'run_date') {
    invoiceDate = now;
  } else {
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    invoiceDate = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
  }

  return {
    billingMonth: Utilities.formatDate(invoiceDate, tz, 'yyyy-MM'),
    invoiceDate: invoiceDate,
  };
}

function parseInvoiceNumber_(displayValue) {
  const re = new RegExp(escapeRegex_(CONFIG.invoice.numberPrefix) + '(\\d+)');
  const match = re.exec(displayValue);
  if (!match) {
    throw new Error('invoice number cell value "' + displayValue + '" does not match the expected format');
  }
  return parseInt(match[1], 10);
}

function formatInvoiceNumber_(n) {
  let digits = String(n);
  while (digits.length < CONFIG.invoice.numberPadding) {
    digits = '0' + digits;
  }
  return CONFIG.invoice.numberPrefix + digits;
}

function buildPlaceholders_(invoiceNo, invoiceDate) {
  const tz = CONFIG.timezone;
  const periodStart = new Date(invoiceDate.getFullYear(), invoiceDate.getMonth(), 1);
  return {
    invoice_no: invoiceNo,
    invoice_date: Utilities.formatDate(invoiceDate, tz, CONFIG.invoice.dateFormat),
    doc_date: Utilities.formatDate(invoiceDate, tz, CONFIG.invoice.docDateFormat),
    month_year: Utilities.formatDate(invoiceDate, tz, 'MMMM yyyy'),
    month_name: Utilities.formatDate(invoiceDate, tz, 'MMMM'),
    month_short: Utilities.formatDate(invoiceDate, tz, 'MMM-yyyy'),
    period:
      Utilities.formatDate(periodStart, tz, CONFIG.invoice.dateFormat) +
      ' to ' +
      Utilities.formatDate(invoiceDate, tz, CONFIG.invoice.dateFormat),
  };
}

function formatTemplate_(template, placeholders) {
  return template.replace(/\{(\w+)\}/g, function (_, key) {
    if (!(key in placeholders)) {
      throw new Error('template uses unknown placeholder {' + key + '}');
    }
    return placeholders[key];
  });
}

function escapeRegex_(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exportSheetPdf_(spreadsheetId, sheet) {
  const gid = sheet.getSheetId();
  const url =
    'https://docs.google.com/spreadsheets/d/' +
    spreadsheetId +
    '/export?format=pdf&gid=' +
    gid +
    '&portrait=' +
    CONFIG.sheetPdf.portrait +
    '&fitw=' +
    CONFIG.sheetPdf.fitToWidth +
    '&gridlines=' +
    CONFIG.sheetPdf.gridlines;

  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('sheet PDF export failed with status ' + response.getResponseCode());
  }
  return response.getBlob();
}

function setTextCell_(sheet, a1, value) {
  const range = sheet.getRange(a1);
  range.setNumberFormat('@'); // plain text, so Sheets never reparses the string
  range.setValue(value);
}

function archivePdf_(folder, blob) {
  const existing = folder.getFilesByName(blob.getName());
  if (existing.hasNext()) {
    return existing.next();
  }
  return folder.createFile(blob);
}

function notify_(outcome, message) {
  if (!CONFIG.notify.enabled || !CONFIG.notify.recipient) {
    return;
  }
  try {
    GmailApp.sendEmail(CONFIG.notify.recipient, '[Invoice Sender] ' + outcome, message);
  } catch (e) {
    Logger.log('failed to send notification: ' + e.message);
  }
}

/** Run manually from the editor to reset state for a fresh test cycle. */
function resetState() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('State cleared.');
}

/**
 * Diagnostic only — does NOT modify anything. Run this manually to check
 * whether DocumentApp can open the ORIGINAL template at all (no copy
 * involved). If this also fails with "inaccessible", the problem isn't
 * about freshly-copied files — it's likely that the template isn't a
 * native Google Doc (e.g. an uploaded .docx Drive just previews), or a
 * permissions/Workspace restriction on the file itself.
 */
function testOriginalDocAccess() {
  const file = DriveApp.getFileById(assertAllowedId_(CONFIG.doc.templateId, 'doc template'));
  Logger.log('File name: ' + file.getName());
  Logger.log('MIME type: ' + file.getMimeType());

  try {
    const doc = DocumentApp.openById(CONFIG.doc.templateId);
    Logger.log('Opened successfully. Doc name via DocumentApp: ' + doc.getName());
  } catch (e) {
    Logger.log('Failed to open: ' + e.message);
  }
}
