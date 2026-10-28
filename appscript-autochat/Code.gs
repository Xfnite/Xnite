/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STANDALONE AUTOMATED CHAT GOOGLE APPS SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * How to Use:
 * 1. Open your separate Google Sheet for Automated Chat.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any default code and paste this ENTIRE file into Code.gs.
 * 4. Save and run "onOpen" or refresh your Google Sheet to see the "🤖 AutoChat Menu".
 * 5. Click "🤖 AutoChat Menu" > "Install AutoChat Triggers".
 *
 * Supported Sheet Tabs:
 *  - "Novice"      -> chatType: "applicants"
 *  - "Challengers" -> chatType: "passers"
 *  - "OG"          -> chatType: "old"
 *  - "Checker"     -> chatType: "checker"
 *  - "Judger"      -> chatType: "judger"
 *  - "IC"          -> chatType: "inner-council"
 *
 * Supported Sheet Columns (Header row):
 *  ID | messageTemplate | startHour | endHour | runsPerDay | lastRunDate | isActive | createdAt | updatedAt
 * ─────────────────────────────────────────────────────────────────────────────
 */

// === CONFIG ===
const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';
const POSTGREST_AUTOMATED_CHAT_TABLE = 'AutomatedChatMessage';

function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}

// Tab Name -> chatType string mapping
const AUTOMATED_CHAT_TAB_MAP = {
  'Novice': 'applicants',
  'Challengers': 'passers',
  'OG': 'old',
  'Checker': 'checker',
  'Judger': 'judger',
  'IC': 'inner-council'
};

const AUTOMATED_CHAT_HEADER_ROW = 1;

// Field / Sheet Header -> DB Column Map
const AUTOMATED_CHAT_COLUMN_MAP = {
  id:          'id',
  chatType:    'chatType',
  message:     'message',
  senderName:  'senderName',
  senderRole:  'senderRole',
  frequency:   'frequency',
  startTime:   'startTime',
  endTime:     'endTime',
  lastSentAt:  'lastSentAt',
  isActive:    'isActive',
  createdAt:   'createdAt',
  updatedAt:   'updatedAt'
};

const AUTOMATED_CHAT_NULLABLE_STRING_FIELDS = [
  'senderName', 'senderRole'
];

const AUTOMATED_CHAT_INT_FIELDS = [
  'frequency'
];

const AUTOMATED_CHAT_BOOLEAN_FIELDS = [
  'isActive'
];

const AUTOMATED_CHAT_TIMESTAMP_FIELDS = [
  'startTime', 'endTime', 'lastSentAt'
];

// === CUSTOM MENU FOR STANDALONE SHEET ===
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🤖 AutoChat Menu')
    .addItem('Install AutoChat Triggers', 'installAutoChatTriggers')
    .addItem('Remove AutoChat Triggers', 'removeAutoChatTriggers')
    .addSeparator()
    .addItem('Run AutoChat Sync Now', 'syncAutomatedChatFromPostgrest')
    .addToUi();
}

// === TRIGGERS INSTALLATION ===
function installAutoChatTriggers() {
  removeAutoChatTriggers();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.newTrigger('onAutomatedChatEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger('syncAutomatedChatFromPostgrest')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  SpreadsheetApp.getUi().alert('AutoChat triggers installed successfully!\nEdits on tabs (Novice, Challengers, OG, Checker, Judger, IC) will now sync automatically.');
}

function removeAutoChatTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    const fn = trigger.getHandlerFunction();
    if (fn === 'onAutomatedChatEdit' || fn === 'syncAutomatedChatFromPostgrest') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  SpreadsheetApp.getUi().alert('AutoChat triggers removed.');
}

// === REAL-TIME EDIT TRIGGER ===
function onAutomatedChatEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const tabName = sheet.getName();

  if (!AUTOMATED_CHAT_TAB_MAP[tabName]) return;

  const row = e.range.getRow();
  if (row <= AUTOMATED_CHAT_HEADER_ROW) return;

  if (isAutomatedChatScriptWriteback_()) return;

  const colMap = getAutomatedChatColMap_(sheet);
  const chatType = AUTOMATED_CHAT_TAB_MAP[tabName];

  const rowData = getAutomatedChatRowData_(sheet, row, colMap, chatType);
  const oldRowData = getOldAutomatedChatRowData_(e, sheet, row, colMap, chatType);

  const action = determineAutomatedChatAction_(rowData, oldRowData);
  if (!action) return;

  const response = sendAutomatedChatToPostgrest_(action, rowData, oldRowData);

  if (response && response.success) {
    applyAutomatedChatResponse_(sheet, row, response, action, colMap);
  } else {
    flagAutomatedChatError_(sheet, row, response, colMap);
  }
}

// === BULK SYNC FROM DATABASE ===
function syncAutomatedChatFromPostgrest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const url = POSTGREST_BASE_URL + POSTGREST_AUTOMATED_CHAT_TABLE;
  const token = getPostgrestToken_();

  const options = {
    method: "get",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    console.error("Failed to fetch AutomatedChatMessage data: " + response.getContentText());
    return;
  }

  const allRecords = JSON.parse(response.getContentText());
  if (!allRecords) return;

  Object.keys(AUTOMATED_CHAT_TAB_MAP).forEach(tabName => {
    const targetChatType = AUTOMATED_CHAT_TAB_MAP[tabName];
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;

    const tabRecords = allRecords.filter(r => r.chatType === targetChatType);
    const colMap = getAutomatedChatColMap_(sheet);
    const totalCols = Math.max(Object.keys(colMap).length, sheet.getLastColumn(), 10);

    const mapDbToRow = (rec) => {
      const row = new Array(totalCols).fill("");
      const setVal = (header, val) => {
        const idx = colMap[header];
        if (idx) row[idx - 1] = val !== undefined && val !== null ? val : "";
      };

      setVal('ID', rec.id ?? "");
      setVal('id', rec.id ?? "");

      // Map DB message -> messageTemplate or message in Sheet
      setVal('messageTemplate', rec.message ?? "");
      setVal('MessageTemplate', rec.message ?? "");
      setVal('message', rec.message ?? "");
      setVal('Message', rec.message ?? "");

      setVal('senderName', rec.senderName ?? "");
      setVal('SenderName', rec.senderName ?? "");
      setVal('senderRole', rec.senderRole ?? "");
      setVal('SenderRole', rec.senderRole ?? "");

      // Map DB frequency -> runsPerDay or frequency in Sheet
      setVal('runsPerDay', rec.frequency ?? "");
      setVal('RunsPerDay', rec.frequency ?? "");
      setVal('frequency', rec.frequency ?? "");
      setVal('Frequency', rec.frequency ?? "");

      // Map DB startTime/endTime -> startHour/endHour or startTime/endTime in Sheet (Formatted in PH Time)
      const phStartTime = formatToPHT_(rec.startTime);
      setVal('startHour', phStartTime);
      setVal('StartHour', phStartTime);
      setVal('startTime', phStartTime);
      setVal('StartTime', phStartTime);

      const phEndTime = formatToPHT_(rec.endTime);
      setVal('endHour', phEndTime);
      setVal('EndHour', phEndTime);
      setVal('endTime', phEndTime);
      setVal('EndTime', phEndTime);

      // Map DB lastSentAt -> lastRunDate or lastSentAt in Sheet (Formatted in PH Time)
      const phLastSentAt = formatToPHT_(rec.lastSentAt);
      setVal('lastRunDate', phLastSentAt);
      setVal('LastRunDate', phLastSentAt);
      setVal('lastSentAt', phLastSentAt);
      setVal('LastSentAt', phLastSentAt);

      setVal('isActive', rec.isActive !== undefined ? (rec.isActive ? "TRUE" : "FALSE") : "TRUE");
      setVal('IsActive', rec.isActive !== undefined ? (rec.isActive ? "TRUE" : "FALSE") : "TRUE");
      setVal('createdAt', rec.createdAt ?? "");
      setVal('CreatedAt', rec.createdAt ?? "");
      setVal('updatedAt', rec.updatedAt ?? "");
      setVal('UpdatedAt', rec.updatedAt ?? "");

      return row;
    };

    const lastRow = sheet.getLastRow();
    const existingRecordsMap = new Map();
    const idColIdx = colMap['ID'] || colMap['id'] || 1;

    if (lastRow > AUTOMATED_CHAT_HEADER_ROW) {
      const idRange = sheet.getRange(AUTOMATED_CHAT_HEADER_ROW + 1, idColIdx, lastRow - AUTOMATED_CHAT_HEADER_ROW, 1);
      const idValues = idRange.getValues();

      for (let i = 0; i < idValues.length; i++) {
        const rowId = idValues[i][0];
        if (rowId) {
          existingRecordsMap.set(rowId.toString(), i + AUTOMATED_CHAT_HEADER_ROW + 1);
        }
      }
    }

    const rowsToAppend = [];

    tabRecords.forEach(rec => {
      const rowData = mapDbToRow(rec);
      const recIdStr = rec.id ? rec.id.toString() : null;

      if (recIdStr && existingRecordsMap.has(recIdStr)) {
        const rowIndex = existingRecordsMap.get(recIdStr);
        sheet.getRange(rowIndex, 1, 1, totalCols).setValues([rowData]);
      } else {
        rowsToAppend.push(rowData);
      }
    });

    if (rowsToAppend.length > 0) {
      sheet.getRange(lastRow + 1, 1, rowsToAppend.length, totalCols).setValues(rowsToAppend);
    }
  });
}

// === HELPER FUNCTIONS ===
function getAutomatedChatColMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 15);
  const headers = sheet.getRange(AUTOMATED_CHAT_HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const colMap = {};
  headers.forEach((h, idx) => {
    if (h && String(h).trim() !== '') {
      colMap[String(h).trim()] = idx + 1;
    }
  });
  return colMap;
}

function getAutomatedChatRowData_(sheet, row, colMap, chatType) {
  const lastCol = Math.max(sheet.getLastColumn(), 15);
  const values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  const getValue = (...headers) => {
    for (const h of headers) {
      const colIdx = colMap[h];
      if (colIdx && colIdx <= values.length && values[colIdx - 1] !== '') {
        return values[colIdx - 1];
      }
    }
    return '';
  };

  return {
    id:          getValue('ID', 'id'),
    chatType:    chatType,
    message:     getValue('messageTemplate', 'MessageTemplate', 'message', 'Message', 'text'),
    senderName:  getValue('senderName', 'SenderName'),
    senderRole:  getValue('senderRole', 'SenderRole'),
    frequency:   getValue('runsPerDay', 'RunsPerDay', 'frequency', 'Frequency'),
    startTime:   getValue('startHour', 'StartHour', 'startTime', 'StartTime'),
    endTime:     getValue('endHour', 'EndHour', 'endTime', 'EndTime'),
    lastSentAt:  getValue('lastRunDate', 'LastRunDate', 'lastSentAt', 'LastSentAt'),
    isActive:    getValue('isActive', 'IsActive') !== '' ? getValue('isActive', 'IsActive') : true,
    createdAt:   getValue('createdAt', 'CreatedAt'),
    updatedAt:   getValue('updatedAt', 'UpdatedAt')
  };
}

function getOldAutomatedChatRowData_(e, sheet, row, colMap, chatType) {
  const current = getAutomatedChatRowData_(sheet, row, colMap, chatType);
  const editedCol = e.range.getColumn();
  const oldValue = e.oldValue !== undefined ? e.oldValue : '';

  const old = Object.assign({}, current);

  Object.keys(colMap).forEach(header => {
    if (colMap[header] === editedCol) {
      const keyLower = header.charAt(0).toLowerCase() + header.slice(1);
      if (keyLower === 'iD') old.id = oldValue;
      else if (header === 'messageTemplate' || header === 'MessageTemplate') old.message = oldValue;
      else if (header === 'runsPerDay' || header === 'RunsPerDay') old.frequency = oldValue;
      else if (header === 'startHour' || header === 'StartHour') old.startTime = oldValue;
      else if (header === 'endHour' || header === 'EndHour') old.endTime = oldValue;
      else if (header === 'lastRunDate' || header === 'LastRunDate') old.lastSentAt = oldValue;
      else if (old[keyLower] !== undefined) old[keyLower] = oldValue;
    }
  });

  return old;
}

function determineAutomatedChatAction_(current, old) {
  const isRowEmpty = !current.message && !current.senderName && !current.frequency &&
                     current.isActive === '' && !current.startTime;

  if (isRowEmpty && old.id) return 'delete';
  if (!current.id && (current.message || current.frequency || current.senderName)) return 'create';

  if (current.id) {
    const fields = [
      'message', 'senderName', 'senderRole', 'frequency', 'startTime', 'endTime', 'isActive'
    ];
    const changed = fields.some(f => String(current[f]) !== String(old[f]));
    if (changed) return 'update';
  }

  return null;
}

function formatTimestamp_(val) {
  if (val === undefined || val === null || val === '') return null;
  if (val instanceof Date) {
    return val.toISOString();
  }
  const str = String(val).trim();
  if (str === '') return null;

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return str;
}

function formatToPHT_(val) {
  if (val === undefined || val === null || val === '') return '';
  let str = String(val).trim();
  if (str === '') return '';

  // If string has date format without timezone offset (no Z or + / - offset at end), append Z to force UTC
  if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
    str = str.replace(' ', 'T') + 'Z';
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return String(val);
  return Utilities.formatDate(parsed, "Asia/Manila", "M/d/yyyy H:mm:ss");
}

function buildAutomatedChatRow_(current, forUpdate) {
  const row = {};

  // For inserts, if no ID exists in the sheet, generate a new UUID
  if (!forUpdate) {
    row.id = (current.id && String(current.id).trim() !== '') ? String(current.id).trim() : Utilities.getUuid();
  }

  Object.keys(AUTOMATED_CHAT_COLUMN_MAP).forEach(key => {
    if (key === 'id') return; // Handled explicitly above

    const col = AUTOMATED_CHAT_COLUMN_MAP[key];
    let value = current[key];

    if (AUTOMATED_CHAT_BOOLEAN_FIELDS.indexOf(key) !== -1) {
      value = Boolean(value);
    } else if (AUTOMATED_CHAT_INT_FIELDS.indexOf(key) !== -1) {
      const n = parseInt(value, 10);
      value = isNaN(n) ? null : n;
    } else if (AUTOMATED_CHAT_TIMESTAMP_FIELDS.indexOf(key) !== -1) {
      value = formatTimestamp_(value);
    } else if (AUTOMATED_CHAT_NULLABLE_STRING_FIELDS.indexOf(key) !== -1) {
      const str = (value === undefined || value === null) ? '' : String(value).trim();
      value = str === '' ? null : str;
    } else {
      value = value !== undefined && value !== null ? value : '';
    }

    row[col] = value;
  });
  return row;
}

function applyAutomatedChatResponse_(sheet, row, response, action, colMap) {
  automatedChatScriptWritebackInProgress_(true);
  try {
    const idCol = colMap['ID'] || colMap['id'] || 1;

    if (action === 'delete') {
      const lastCol = Math.max(sheet.getLastColumn(), 15);
      sheet.getRange(row, 1, 1, lastCol).clearContent();
      return;
    }

    const record = response.record || {};
    if (record.id && idCol) {
      sheet.getRange(row, idCol).setValue(record.id);
    }
    const createdCol = colMap['createdAt'] || colMap['CreatedAt'];
    if (record.createdAt && createdCol) {
      sheet.getRange(row, createdCol).setValue(record.createdAt);
    }
    const updatedCol = colMap['updatedAt'] || colMap['UpdatedAt'];
    if (record.updatedAt && updatedCol) {
      sheet.getRange(row, updatedCol).setValue(record.updatedAt);
    }

    clearAutomatedChatError_(sheet, row, colMap);
  } finally {
    automatedChatScriptWritebackInProgress_(false);
  }
}

function flagAutomatedChatError_(sheet, row, response, colMap) {
  const note = response && response.error
    ? `Sync failed: ${response.error}`
    : 'Sync failed: unknown error';
  const idCol = colMap['ID'] || colMap['id'] || 1;
  sheet.getRange(row, idCol).setNote(note);
}

function clearAutomatedChatError_(sheet, row, colMap) {
  const idCol = colMap['ID'] || colMap['id'] || 1;
  sheet.getRange(row, idCol).clearNote();
}

function automatedChatScriptWritebackInProgress_(setTo) {
  const props = PropertiesService.getScriptProperties();
  if (setTo === undefined) {
    return props.getProperty('AUTOMATED_CHAT_WRITEBACK_IN_PROGRESS') === 'true';
  }
  props.setProperty('AUTOMATED_CHAT_WRITEBACK_IN_PROGRESS', setTo ? 'true' : 'false');
}

function isAutomatedChatScriptWriteback_() {
  return automatedChatScriptWritebackInProgress_();
}

function sendAutomatedChatToPostgrest_(action, current, old) {
  const resourceUrl = POSTGREST_BASE_URL + POSTGREST_AUTOMATED_CHAT_TABLE;
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
    payload = buildAutomatedChatRow_(current, false);
  } else if (action === 'update') {
    method = 'patch';
    url = resourceUrl + '?id=eq.' + encodeURIComponent(current.id);
    payload = buildAutomatedChatRow_(current, true);
    delete payload[AUTOMATED_CHAT_COLUMN_MAP.id];
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

  Logger.log(`[AutoChat Sync] Request: ${method.toUpperCase()} ${url}`);
  if (payload) Logger.log(`[AutoChat Sync] Payload: ${JSON.stringify(payload)}`);

  try {
    const resp = UrlFetchApp.fetch(url, options);
    const code = resp.getResponseCode();
    const text = resp.getContentText();

    Logger.log(`[AutoChat Sync] Response HTTP ${code}: ${text}`);

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
        errMsg = errJson.message || errJson.details || text;
      } catch (e) {}
      const fullError = `HTTP ${code} [${method.toUpperCase()} ${url}]: ${errMsg || '(empty response)'}`;
      Logger.log(`[AutoChat Sync] Error: ${fullError}`);
      return { success: false, error: fullError };
    }
  } catch (err) {
    const errText = `Fetch Failed [${url}]: ${err.toString()}`;
    Logger.log(`[AutoChat Sync] Exception: ${errText}`);
    return { success: false, error: errText };
  }
}
