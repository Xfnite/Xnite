// === CONFIG ===
// Prisma has no @@map on PaymentMethodHistory, so the Postgres table keeps the
// exact model casing. PostgREST resource paths are case-sensitive.
const POSTGREST_PAYMENT_HISTORY_TABLE = 'PaymentMethodHistory';

const PAYMENT_HISTORY_SHEET_NAME = 'PaymentMethodHistory';

// Column indices (1-based). Old values are grouped before new values so a row
// reads left-to-right as "what it was" -> "what it became".
const PAYMENT_HISTORY_COL = {
  ID: 1,
  EMAIL: 2,
  OLD_PAYEE_NAME: 3,
  OLD_LAST_NAME: 4,
  OLD_PAYEE_UID: 5,
  OLD_PAYMENT_METHOD: 6,
  OLD_QR_IMAGE_URL: 7,
  NEW_PAYEE_NAME: 8,
  NEW_LAST_NAME: 9,
  NEW_PAYEE_UID: 10,
  NEW_PAYMENT_METHOD: 11,
  NEW_QR_IMAGE_URL: 12,
  CHANGED_AT: 13
};

const PAYMENT_HISTORY_HEADER_ROW = 1;
const PAYMENT_HISTORY_TOTAL_COLUMNS = 13;

const PAYMENT_HISTORY_HEADERS = [
  'id',
  'email',
  'oldPayeeName',
  'oldLastName',
  'oldPayeeUid',
  'oldPaymentMethod',
  'oldQrImageUrl',
  'newPayeeName',
  'newLastName',
  'newPayeeUid',
  'newPaymentMethod',
  'newQrImageUrl',
  'changedAt'
];


// NOTE: syncPaymentMethodHistoryFromPostgrest() lives in action.gs with the
// other table syncs. This file keeps the column map and helpers.
//
// This table is deliberately pull-only: it is an append-only audit trail, and
// editing a payout record from a spreadsheet would destroy the evidence it
// exists to preserve. Edits here affect the sheet only and are overwritten on
// the next sync.

function ensurePaymentHistorySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PAYMENT_HISTORY_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PAYMENT_HISTORY_SHEET_NAME);
  }

  if (sheet.getLastRow() < PAYMENT_HISTORY_HEADER_ROW) {
    sheet.getRange(PAYMENT_HISTORY_HEADER_ROW, 1, 1, PAYMENT_HISTORY_TOTAL_COLUMNS)
      .setValues([PAYMENT_HISTORY_HEADERS])
      .setFontWeight('bold');
    sheet.setFrozenRows(PAYMENT_HISTORY_HEADER_ROW);
  }

  return sheet;
}

/**
 * Convenience view: the payout history for one user, newest first.
 * Returns an array of records without touching the sheet.
 */
function getPaymentHistoryForEmail_(email) {
  const url = POSTGREST_BASE_URL + POSTGREST_PAYMENT_HISTORY_TABLE +
    '?email=eq.' + encodeURIComponent(email) + '&order=changedAt.desc';
  const token = getPostgrestToken_();

  const resp = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error("Failed to fetch payment history for " + email + ": " + resp.getContentText());
  }

  return JSON.parse(resp.getContentText());
}
