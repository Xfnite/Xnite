// === CONFIG ===
// const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';
const POSTGREST_REFERAL_TABLE = 'Referal';

function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}

const REFERAL_SHEET_NAME = 'Referal';

// Column indices (1-based)
const REFERAL_COL = {
  ID: 1,
  EMAIL: 2,
  CODE: 3,
  NAME: 4,
  SITENAME: 5,
  STATUS: 6,
  HOW_MANY_USE: 7,
  CREATED_AT: 8,
  UPDATED_AT: 9
};

const REFERAL_HEADER_ROW = 1;
const REFERAL_TOTAL_COLUMNS = 9;

const REFERAL_COLUMN_MAP = {
  id:         'id',
  email:      'email',
  code:       'code',
  name:       'name',
  sitename:   'sitename',
  status:     'status',
  howManyUse: 'howManyUse',
  createdAt:  'createdAt',
  updatedAt:  'updatedAt'
};

const REFERAL_NULLABLE_STRING_FIELDS = ['name'];
const REFERAL_INT_FIELDS = ['howManyUse'];


// === MAIN TRIGGER ===
function onReferalEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== REFERAL_SHEET_NAME) return;

  const row = e.range.getRow();
  if (row <= REFERAL_HEADER_ROW) return;

  if (isReferalScriptWriteback_(e)) return;

  const rowData = getReferalRowData_(sheet, row);
  const oldRowData = getOldReferalRowData_(e, sheet, row);

  const action = determineReferalAction_(rowData, oldRowData);
  if (!action) return;

  const response = sendReferalToPostgrest_(action, rowData, oldRowData);

  if (response && response.success) {
    applyReferalResponse_(sheet, row, response, action);
  } else {
    flagReferalError_(sheet, row, response);
  }
}

function getReferalRowData_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, REFERAL_TOTAL_COLUMNS).getValues()[0];
  return {
    id:         values[REFERAL_COL.ID - 1],
    email:      values[REFERAL_COL.EMAIL - 1],
    code:       values[REFERAL_COL.CODE - 1],
    name:       values[REFERAL_COL.NAME - 1],
    sitename:   values[REFERAL_COL.SITENAME - 1],
    status:     values[REFERAL_COL.STATUS - 1],
    howManyUse: values[REFERAL_COL.HOW_MANY_USE - 1],
    createdAt:  values[REFERAL_COL.CREATED_AT - 1],
    updatedAt:  values[REFERAL_COL.UPDATED_AT - 1]
  };
}

function getOldReferalRowData_(e, sheet, row) {
  const current = getReferalRowData_(sheet, row);
  const editedCol = e.range.getColumn();
  const oldValue = e.oldValue !== undefined ? e.oldValue : '';

  const keys = ['id', 'email', 'code', 'name', 'sitename', 'status', 'howManyUse', 'createdAt', 'updatedAt'];
  const old = Object.assign({}, current);
  const key = keys[editedCol - 1];
  if (key) old[key] = oldValue;
  return old;
}

function determineReferalAction_(current, old) {
  const isRowEmpty = !current.email && !current.code && !current.name && !current.status;

  if (isRowEmpty && old.id) return 'delete';
  if (!current.id && current.email) return 'create';

  if (current.id) {
    const fields = ['email', 'code', 'name', 'sitename', 'status', 'howManyUse'];
    const changed = fields.some(f => String(current[f]) !== String(old[f]));
    if (changed) return 'update';
  }

  return null;
}

function buildReferalRow_(current, forUpdate) {
  const row = {};
  Object.keys(REFERAL_COLUMN_MAP).forEach(key => {
    if (key === 'id' && !forUpdate) return;
    if (key === 'createdAt' || key === 'updatedAt') return; // Handled by DB

    const col = REFERAL_COLUMN_MAP[key];
    let value = current[key];

    if (REFERAL_INT_FIELDS.indexOf(key) !== -1) {
      const n = parseInt(value, 10);
      value = isNaN(n) ? 0 : n;
    } else if (REFERAL_NULLABLE_STRING_FIELDS.indexOf(key) !== -1) {
      const str = (value === undefined || value === null) ? '' : String(value).trim();
      value = str === '' ? null : str;
    } else {
      value = value || '';
    }

    row[col] = value;
  });
  return row;
}

function applyReferalResponse_(sheet, row, response, action) {
  referalScriptWritebackInProgress_(true);
  try {
    if (action === 'delete') {
      sheet.getRange(row, 1, 1, REFERAL_TOTAL_COLUMNS).clearContent();
      return;
    }

    const record = response.record || {};
    if (record.id)        sheet.getRange(row, REFERAL_COL.ID).setValue(record.id);
    if (record.createdAt) sheet.getRange(row, REFERAL_COL.CREATED_AT).setValue(record.createdAt);
    if (record.updatedAt) sheet.getRange(row, REFERAL_COL.UPDATED_AT).setValue(record.updatedAt);

    clearReferalError_(sheet, row);
  } finally {
    referalScriptWritebackInProgress_(false);
  }
}

function flagReferalError_(sheet, row, response) {
  const note = response && response.error
    ? `Sync failed: ${response.error}`
    : 'Sync failed: unknown error';
  sheet.getRange(row, REFERAL_COL.EMAIL).setNote(note);
}

function clearReferalError_(sheet, row) {
  sheet.getRange(row, REFERAL_COL.EMAIL).clearNote();
}

function referalScriptWritebackInProgress_(setTo) {
  const props = PropertiesService.getScriptProperties();
  if (setTo === undefined) {
    return props.getProperty('REFERAL_WRITEBACK_IN_PROGRESS') === 'true';
  }
  props.setProperty('REFERAL_WRITEBACK_IN_PROGRESS', setTo ? 'true' : 'false');
}

function isReferalScriptWriteback_(e) {
  return referalScriptWritebackInProgress_();
}

function sendReferalToPostgrest_(action, current, old) {
  const resourceUrl = POSTGREST_BASE_URL + POSTGREST_REFERAL_TABLE;
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
    payload = buildReferalRow_(current, false);
  } else if (action === 'update') {
    method = 'patch';
    url = resourceUrl + '?id=eq.' + encodeURIComponent(current.id);
    payload = buildReferalRow_(current, true);
    delete payload[REFERAL_COLUMN_MAP.id];
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
