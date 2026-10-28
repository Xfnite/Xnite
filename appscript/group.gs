// === CONFIG ===
// const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';
// PostgREST table name (case-sensitive to match Prisma)
const POSTGREST_GROUP_TABLE = 'Group';

function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}

const GROUP_SHEET_NAME = 'Group';

// Map your columns exactly as you want them in the Sheet
const GROUP_COL = {
  ID: 1,
  GROUP_ID: 2,
  GROUP_NAME: 3,
  GROUP_TYPE: 4,
  MANAGER_EMAIL: 5,
  OWNER_EMAIL: 6,
  CHECKER_LINK: 7,
  JUDGER_LINK: 8,
  CREATED_AT: 9,
  UPDATED_AT: 10
};

const GROUP_HEADER_ROW = 1;
const GROUP_TOTAL_COLUMNS = 10;

// Maps internal field names -> actual Postgres column names.
const GROUP_COLUMN_MAP = {
  id:           'id',
  groupName:    'groupName',
  groupId:      'groupId',
  groupType:    'groupType',
  managerEmail: 'managerEmail',
  ownerEmail:   'ownerEmail',
  checkerLink:  'checkerLink',
  judgerLink:   'judgerLink',
  createdAt:    'createdAt',
  updatedAt:    'updatedAt'
};

// Fields that are String? (nullable/optional) in Prisma.
const GROUP_NULLABLE_STRING_FIELDS = [
  'managerEmail', 'ownerEmail', 'checkerLink', 'judgerLink'
];

// Fields that are Int (or Int?) in Prisma
const GROUP_INT_FIELDS = ['groupId'];


// === MAIN TRIGGER (Use this if syncing ONLY Groups) ===
function onGroupEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== GROUP_SHEET_NAME) return;

  const row = e.range.getRow();
  if (row <= GROUP_HEADER_ROW) return;

  if (isGroupScriptWriteback_(e)) return;

  const rowData = getGroupRowData_(sheet, row);
  const oldRowData = getOldGroupRowData_(e, sheet, row);

  const action = determineGroupAction_(rowData, oldRowData);
  if (!action) return;

  const response = sendGroupToPostgrest_(action, rowData, oldRowData);

  if (response && response.success) {
    applyGroupResponse_(sheet, row, response, action);
  } else {
    flagGroupError_(sheet, row, response);
  }
}

function getGroupRowData_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, GROUP_TOTAL_COLUMNS).getValues()[0];
  return {
    id:           values[GROUP_COL.ID - 1],
    groupName:    values[GROUP_COL.GROUP_NAME - 1],
    groupId:      values[GROUP_COL.GROUP_ID - 1],
    groupType:    values[GROUP_COL.GROUP_TYPE - 1],
    managerEmail: values[GROUP_COL.MANAGER_EMAIL - 1],
    ownerEmail:   values[GROUP_COL.OWNER_EMAIL - 1],
    checkerLink:  values[GROUP_COL.CHECKER_LINK - 1],
    judgerLink:   values[GROUP_COL.JUDGER_LINK - 1],
    createdAt:    values[GROUP_COL.CREATED_AT - 1],
    updatedAt:    values[GROUP_COL.UPDATED_AT - 1]
  };
}

function getOldGroupRowData_(e, sheet, row) {
  const current = getGroupRowData_(sheet, row);
  const editedCol = e.range.getColumn();
  const oldValue = e.oldValue !== undefined ? e.oldValue : '';

  const keys = [
    'id', 'groupName', 'groupId', 'groupType', 'managerEmail', 
    'ownerEmail', 'checkerLink', 'judgerLink', 'createdAt', 'updatedAt'
  ];

  const old = Object.assign({}, current);
  const key = keys[editedCol - 1];
  if (key) old[key] = oldValue;
  return old;
}

function determineGroupAction_(current, old) {
  const isRowEmpty = !current.groupName && !current.groupId && !current.groupType;

  if (isRowEmpty && old.id) return 'delete';
  // groupId is Int, so check if it's set
  if (!current.id && (current.groupName || current.groupId)) return 'create';

  if (current.id) {
    const fields = [
      'groupName', 'groupId', 'groupType', 'managerEmail', 
      'ownerEmail', 'checkerLink', 'judgerLink'
    ];
    const changed = fields.some(f => String(current[f]) !== String(old[f]));
    if (changed) return 'update';
  }

  return null;
}

function buildGroupRow_(current, forUpdate) {
  const row = {};
  Object.keys(GROUP_COLUMN_MAP).forEach(key => {
    if (key === 'id' && !forUpdate) return;
    if (key === 'createdAt' || key === 'updatedAt') return; // DB handles these

    const col = GROUP_COLUMN_MAP[key];
    let value = current[key];

    if (GROUP_INT_FIELDS.indexOf(key) !== -1) {
      const n = parseInt(value, 10);
      value = isNaN(n) ? null : n;
    } else if (GROUP_NULLABLE_STRING_FIELDS.indexOf(key) !== -1) {
      const str = (value === undefined || value === null) ? '' : String(value).trim();
      value = str === '' ? null : str;
    } else {
      value = value || '';
    }

    row[col] = value;
  });
  return row;
}

function applyGroupResponse_(sheet, row, response, action) {
  groupScriptWritebackInProgress_(true);
  try {
    if (action === 'delete') {
      sheet.getRange(row, 1, 1, GROUP_TOTAL_COLUMNS).clearContent();
      return;
    }

    const record = response.record || {};
    if (record.id)        sheet.getRange(row, GROUP_COL.ID).setValue(record.id);
    if (record.createdAt) sheet.getRange(row, GROUP_COL.CREATED_AT).setValue(record.createdAt);
    if (record.updatedAt) sheet.getRange(row, GROUP_COL.UPDATED_AT).setValue(record.updatedAt);

    clearGroupError_(sheet, row);
  } finally {
    groupScriptWritebackInProgress_(false);
  }
}

function flagGroupError_(sheet, row, response) {
  const note = response && response.error
    ? `Sync failed: ${response.error}`
    : 'Sync failed: unknown error';
  sheet.getRange(row, GROUP_COL.GROUP_NAME).setNote(note);
}

function clearGroupError_(sheet, row) {
  sheet.getRange(row, GROUP_COL.GROUP_NAME).clearNote();
}

function groupScriptWritebackInProgress_(setTo) {
  const props = PropertiesService.getScriptProperties();
  if (setTo === undefined) {
    return props.getProperty('GROUP_WRITEBACK_IN_PROGRESS') === 'true';
  }
  props.setProperty('GROUP_WRITEBACK_IN_PROGRESS', setTo ? 'true' : 'false');
}

function isGroupScriptWriteback_(e) {
  return groupScriptWritebackInProgress_();
}

function sendGroupToPostgrest_(action, current, old) {
  const resourceUrl = POSTGREST_BASE_URL + POSTGREST_GROUP_TABLE;
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
    payload = buildGroupRow_(current, false);
  } else if (action === 'update') {
    method = 'patch';
    url = resourceUrl + '?id=eq.' + encodeURIComponent(current.id);
    payload = buildGroupRow_(current, true);
    delete payload[GROUP_COLUMN_MAP.id];
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
      if (action === 'delete') {
        return { success: true };
      }
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : [];
      } catch (parseErr) {
        return { success: false, error: 'Bad JSON from PostgREST: ' + text };
      }
      const record = Array.isArray(parsed) ? parsed[0] : parsed;
      return { success: true, record: record || {} };
    } else {
      let errMsg = text;
      try {
        const errJson = JSON.parse(text);
        errMsg = errJson.message || text;
      } catch (parseErr) {}
      return { success: false, error: `HTTP ${code}: ${errMsg}` };
    }
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}
