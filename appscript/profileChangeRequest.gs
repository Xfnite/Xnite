// === CONFIG ===
// Prisma has no @@map on ProfileChangeRequest, so Postgres holds the table with
// the exact model casing. PostgREST paths are case-sensitive — keep it as-is.
const POSTGREST_PROFILE_CHANGE_TABLE = 'ProfileChangeRequest';

const PROFILE_CHANGE_SHEET_NAME = 'ProfileChangeRequest';

// Column indices (1-based)
const PROFILE_CHANGE_COL = {
  ID: 1,
  USER_EMAIL: 2,
  NAME: 3,
  NUMBER: 4,
  REFERER: 5,
  REQUESTED_FIRST_NAME: 6,
  REQUESTED_LAST_NAME: 7,
  REQUESTED_FACEBOOK: 8,
  STATUS: 9,
  REJECTION_REASON: 10,
  REVIEWED_BY: 11,
  REVIEWED_AT: 12,
  CREATED_AT: 13,
  UPDATED_AT: 14
};

const PROFILE_CHANGE_HEADER_ROW = 1;
const PROFILE_CHANGE_TOTAL_COLUMNS = 14;

const PROFILE_CHANGE_HEADERS = [
  'id',
  'userEmail',
  'name',
  'number',
  'referer',
  'requestedFirstName',
  'requestedLastName',
  'requestedFacebook',
  'status',
  'rejectionReason',
  'reviewedBy',
  'reviewedAt',
  'createdAt',
  'updatedAt'
];

const PROFILE_CHANGE_COLUMN_MAP = {
  id:                 'id',
  userEmail:          'userEmail',
  requestedFirstName: 'requestedFirstName',
  requestedLastName:  'requestedLastName',
  requestedFacebook:  'requestedFacebook',
  status:             'status',
  rejectionReason:    'rejectionReason',
  reviewedBy:         'reviewedBy',
  reviewedAt:         'reviewedAt',
  createdAt:          'createdAt',
  updatedAt:          'updatedAt'
};

// Every optional column in the Prisma model — blank cells must send null, not ''
const PROFILE_CHANGE_NULLABLE_STRING_FIELDS = [
  'requestedFirstName',
  'requestedLastName',
  'requestedFacebook',
  'rejectionReason',
  'reviewedBy',
  'reviewedAt'
];

const PROFILE_CHANGE_VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];


// === MAIN TRIGGER ===
function onProfileChangeRequestEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== PROFILE_CHANGE_SHEET_NAME) return;

  const row = e.range.getRow();
  if (row <= PROFILE_CHANGE_HEADER_ROW) return;

  if (isProfileChangeScriptWriteback_(e)) return;

  const col = e.range.getColumn();
  if (col === PROFILE_CHANGE_COL.NAME || col === PROFILE_CHANGE_COL.NUMBER || col === PROFILE_CHANGE_COL.REFERER) {
    profileChangeScriptWritebackInProgress_(true);
    try {
      e.range.setValue(e.oldValue !== undefined ? e.oldValue : "");
      e.source.toast("This column is read-only and cannot be modified.", "Read-Only Column");
    } finally {
      profileChangeScriptWritebackInProgress_(false);
    }
    return;
  }

  const rowData = getProfileChangeRowData_(sheet, row);
  const oldRowData = getOldProfileChangeRowData_(e, sheet, row);

  const action = determineProfileChangeAction_(rowData, oldRowData);
  if (!action) return;

  // Reject unknown statuses before they reach the DB
  if (action !== 'delete' && rowData.status) {
    const status = String(rowData.status).trim().toUpperCase();
    if (PROFILE_CHANGE_VALID_STATUSES.indexOf(status) === -1) {
      flagProfileChangeError_(sheet, row, {
        error: `Invalid status "${rowData.status}". Use one of: ${PROFILE_CHANGE_VALID_STATUSES.join(', ')}`
      });
      return;
    }
    rowData.status = status;
  }

  // Stamp the reviewer whenever a decision is made in the sheet
  const statusChanged = String(rowData.status) !== String(oldRowData.status);
  if (action === 'update' && statusChanged && rowData.status !== 'PENDING') {
    if (!rowData.reviewedBy) rowData.reviewedBy = getReviewerEmail_();
    if (!rowData.reviewedAt) rowData.reviewedAt = new Date().toISOString();
  }

  const response = sendProfileChangeToPostgrest_(action, rowData, oldRowData);

  if (response && response.success) {
    // Approving only records a decision — the User row still has to be updated
    if (action === 'update' && statusChanged && rowData.status === 'APPROVED') {
      const applied = applyApprovedProfileChangeToUser_(rowData);
      if (!applied.success) {
        flagProfileChangeError_(sheet, row, {
          error: 'Request approved, but applying it to the User failed: ' + applied.error
        });
        applyProfileChangeResponse_(sheet, row, response, action, true);
        return;
      }
    }
    applyProfileChangeResponse_(sheet, row, response, action);
  } else {
    flagProfileChangeError_(sheet, row, response);
  }
}

function getReviewerEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

function getProfileChangeRowData_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, PROFILE_CHANGE_TOTAL_COLUMNS).getValues()[0];
  return {
    id:                 values[PROFILE_CHANGE_COL.ID - 1],
    userEmail:          values[PROFILE_CHANGE_COL.USER_EMAIL - 1],
    requestedFirstName: values[PROFILE_CHANGE_COL.REQUESTED_FIRST_NAME - 1],
    requestedLastName:  values[PROFILE_CHANGE_COL.REQUESTED_LAST_NAME - 1],
    requestedFacebook:  values[PROFILE_CHANGE_COL.REQUESTED_FACEBOOK - 1],
    status:             values[PROFILE_CHANGE_COL.STATUS - 1],
    rejectionReason:    values[PROFILE_CHANGE_COL.REJECTION_REASON - 1],
    reviewedBy:         values[PROFILE_CHANGE_COL.REVIEWED_BY - 1],
    reviewedAt:         values[PROFILE_CHANGE_COL.REVIEWED_AT - 1],
    createdAt:          values[PROFILE_CHANGE_COL.CREATED_AT - 1],
    updatedAt:          values[PROFILE_CHANGE_COL.UPDATED_AT - 1]
  };
}

function getOldProfileChangeRowData_(e, sheet, row) {
  const current = getProfileChangeRowData_(sheet, row);
  const editedCol = e.range.getColumn();
  const oldValue = e.oldValue !== undefined ? e.oldValue : '';

  const keys = [
    'id', 'userEmail', 'name', 'number', 'referer',
    'requestedFirstName', 'requestedLastName', 'requestedFacebook',
    'status', 'rejectionReason', 'reviewedBy', 'reviewedAt', 'createdAt', 'updatedAt'
  ];
  const old = Object.assign({}, current);
  const key = keys[editedCol - 1];
  if (key) old[key] = oldValue;
  return old;
}

function determineProfileChangeAction_(current, old) {
  const isRowEmpty = !current.userEmail &&
                     !current.requestedFirstName &&
                     !current.requestedLastName &&
                     !current.requestedFacebook &&
                     !current.status;

  if (isRowEmpty && old.id) return 'delete';
  if (!current.id && current.userEmail) return 'create';

  if (current.id) {
    const fields = [
      'userEmail', 'requestedFirstName', 'requestedLastName', 'requestedFacebook',
      'status', 'rejectionReason', 'reviewedBy', 'reviewedAt'
    ];
    const changed = fields.some(f => String(current[f]) !== String(old[f]));
    if (changed) return 'update';
  }

  return null;
}

function buildProfileChangeRow_(current, forUpdate) {
  const row = {};
  Object.keys(PROFILE_CHANGE_COLUMN_MAP).forEach(key => {
    if (key === 'id' && !forUpdate) return;
    if (key === 'createdAt' || key === 'updatedAt') return; // Handled by DB

    const col = PROFILE_CHANGE_COLUMN_MAP[key];
    let value = current[key];

    if (PROFILE_CHANGE_NULLABLE_STRING_FIELDS.indexOf(key) !== -1) {
      if (value instanceof Date) {
        value = value.toISOString();
      } else {
        const str = (value === undefined || value === null) ? '' : String(value).trim();
        value = str === '' ? null : str;
      }
    } else if (key === 'status') {
      const str = (value === undefined || value === null) ? '' : String(value).trim().toUpperCase();
      value = str === '' ? 'PENDING' : str;
    } else {
      value = value || '';
    }

    row[col] = value;
  });
  return row;
}

/**
 * An APPROVED request is only a decision record. This copies the approved
 * values onto the User row so the change actually takes effect.
 */
function applyApprovedProfileChangeToUser_(current) {
  const email = String(current.userEmail || '').trim();
  if (!email) return { success: false, error: 'Missing userEmail' };

  const payload = {};
  const firstName = String(current.requestedFirstName || '').trim();
  const lastName = String(current.requestedLastName || '').trim();
  const facebook = String(current.requestedFacebook || '').trim();

  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (facebook) payload.facebook = facebook;

  // Keep the denormalised `name` column in step with first/last
  if (firstName || lastName) {
    payload.name = [firstName, lastName].filter(String).join(' ').trim();
  }

  if (Object.keys(payload).length === 0) {
    return { success: false, error: 'Nothing to apply — all requested fields are blank' };
  }

  const token = getPostgrestToken_();
  const headers = {
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const url = POSTGREST_BASE_URL + 'User?email=eq.' + encodeURIComponent(email);

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    const text = resp.getContentText();

    if (code >= 200 && code < 300) {
      let parsed;
      try { parsed = text ? JSON.parse(text) : []; } catch (err) { parsed = []; }
      if (Array.isArray(parsed) && parsed.length === 0) {
        return { success: false, error: `No User row matched ${email}` };
      }
      return { success: true };
    }

    let errMsg = text;
    try {
      const errJson = JSON.parse(text);
      errMsg = errJson.message || text;
    } catch (err) {}
    return { success: false, error: `HTTP ${code}: ${errMsg}` };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function applyProfileChangeResponse_(sheet, row, response, action, keepExistingNote) {
  profileChangeScriptWritebackInProgress_(true);
  try {
    if (action === 'delete') {
      sheet.getRange(row, 1, 1, PROFILE_CHANGE_TOTAL_COLUMNS).clearContent();
      return;
    }

    const record = response.record || {};
    if (record.id)         sheet.getRange(row, PROFILE_CHANGE_COL.ID).setValue(record.id);
    if (record.status)     sheet.getRange(row, PROFILE_CHANGE_COL.STATUS).setValue(record.status);
    if (record.reviewedBy) sheet.getRange(row, PROFILE_CHANGE_COL.REVIEWED_BY).setValue(record.reviewedBy);
    if (record.reviewedAt) sheet.getRange(row, PROFILE_CHANGE_COL.REVIEWED_AT).setValue(record.reviewedAt);
    if (record.createdAt)  sheet.getRange(row, PROFILE_CHANGE_COL.CREATED_AT).setValue(record.createdAt);
    if (record.updatedAt)  sheet.getRange(row, PROFILE_CHANGE_COL.UPDATED_AT).setValue(record.updatedAt);

    if (!keepExistingNote) clearProfileChangeError_(sheet, row);
  } finally {
    profileChangeScriptWritebackInProgress_(false);
  }
}

function flagProfileChangeError_(sheet, row, response) {
  const note = response && response.error
    ? `Sync failed: ${response.error}`
    : 'Sync failed: unknown error';
  sheet.getRange(row, PROFILE_CHANGE_COL.USER_EMAIL).setNote(note);
}

function clearProfileChangeError_(sheet, row) {
  sheet.getRange(row, PROFILE_CHANGE_COL.USER_EMAIL).clearNote();
}

function profileChangeScriptWritebackInProgress_(setTo) {
  const props = PropertiesService.getScriptProperties();
  if (setTo === undefined) {
    return props.getProperty('PROFILE_CHANGE_WRITEBACK_IN_PROGRESS') === 'true';
  }
  props.setProperty('PROFILE_CHANGE_WRITEBACK_IN_PROGRESS', setTo ? 'true' : 'false');
}

function isProfileChangeScriptWriteback_(e) {
  return profileChangeScriptWritebackInProgress_();
}

function sendProfileChangeToPostgrest_(action, current, old) {
  const resourceUrl = POSTGREST_BASE_URL + POSTGREST_PROFILE_CHANGE_TABLE;
  const token = getPostgrestToken_();

  const baseHeaders = {
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  if (token) {
    baseHeaders['Authorization'] = 'Bearer ' + token;
  }

  let url = resourceUrl;
  let method = 'post';
  let payload = null;

  if (action === 'create') {
    method = 'post';
    payload = buildProfileChangeRow_(current, false);
  } else if (action === 'update') {
    method = 'patch';
    url = resourceUrl + '?id=eq.' + encodeURIComponent(current.id);
    payload = buildProfileChangeRow_(current, true);
    delete payload[PROFILE_CHANGE_COLUMN_MAP.id];
  } else if (action === 'delete') {
    method = 'delete';
    url = resourceUrl + '?id=eq.' + encodeURIComponent(old.id || current.id);
  } else {
    return { success: false, error: 'Unknown action: ' + action };
  }

  const options = {
    method: method,
    contentType: 'application/json',
    headers: baseHeaders,
    muteHttpExceptions: true
  };
  if (payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  try {
    const resp = UrlFetchApp.fetch(url, options);
    const code = resp.getResponseCode();
    const text = resp.getContentText();

    if (code >= 200 && code < 300) {
      if (action === 'delete') return { success: true };
      let parsed;
      try { parsed = text ? JSON.parse(text) : []; } catch (e) { return { success: false, error: 'Bad JSON: ' + text }; }
      const record = Array.isArray(parsed) ? parsed[0] : parsed;
      return { success: true, record: record || {} };
    } else {
      let errMsg = text;
      try {
        const errJson = JSON.parse(text);
        errMsg = errJson.message || text;
      } catch (e) {}
      return { success: false, error: `HTTP ${code}: ${errMsg}` };
    }
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}


// NOTE: syncProfileChangeRequestsFromPostgrest() lives in action.gs with the
// other table syncs. This file keeps the column map, edit trigger and helpers.

function ensureProfileChangeSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROFILE_CHANGE_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PROFILE_CHANGE_SHEET_NAME);
  }

  if (sheet.getLastRow() < PROFILE_CHANGE_HEADER_ROW) {
    sheet.getRange(PROFILE_CHANGE_HEADER_ROW, 1, 1, PROFILE_CHANGE_TOTAL_COLUMNS)
      .setValues([PROFILE_CHANGE_HEADERS])
      .setFontWeight('bold');
    sheet.setFrozenRows(PROFILE_CHANGE_HEADER_ROW);
  }

  return sheet;
}
