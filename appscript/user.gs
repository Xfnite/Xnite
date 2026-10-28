// === CONFIG ===
// PostgREST base URL (must end with a trailing slash)
// const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';
// Name of the table/resource exposed by PostgREST for users.
// IMPORTANT: this Prisma schema has no @@map on the User model, so Prisma
// creates the actual Postgres table as "User" (capital U, exact case).
// PostgREST resource paths are case-sensitive, so this must stay 'User'.
const POSTGREST_TABLE = 'User';

// Auth: PostgREST typically expects a JWT bearer token (role/claims baked into it).
// Store it in Script Properties (File > Project properties > Script properties)
// under the key POSTGREST_TOKEN so it isn't hardcoded here.
function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}

const USER_SHEET_NAME = 'User';

const USER_COL = {
  ID: 1,
  EMAIL: 2,
  IS_DASHBOARD_COMPLETED: 3,
  FIRST_NAME: 4,
  LAST_NAME: 5,
  NAME: 6,
  STATUS: 7,
  PHONE: 8,
  FACEBOOK: 9,
  PASSWORD: 10,
  USERNAME: 11,
  GUSER: 12,
  GEMAIL: 13,
  GPASSWORD: 14,
  ROLE: 15,
  REFERER: 16,
  CREATED_AT: 17,
  UPDATED_AT: 18,
  HAS_COMPLETED_PRE_COURSE: 19,
  IS_REGISTERED: 20,
  IS_RULES_AND_GUIDELINES_COMPLETED: 21,
  HAS_CLICKED_LAND_COVER_TRAINING: 22,
  HAS_CLICKED_TRANSPORTATION_TRAINING: 23,
  LINKED_RECRUITER_EMAIL: 24,
  GROUP_ID: 25,
  TEAM_ID: 26
};

const USER_HEADER_ROW = 1;
const USER_TOTAL_COLUMNS = 26; // bump whenever you add more columns

// Maps internal field names -> actual Postgres column names.
// Derived from the Prisma schema's User model. No @map is used on the
// User model fields, so columns are camelCase exactly as declared in
// Prisma - EXCEPT group_id and team_id, whose Prisma field names are
// themselves lowercase/underscored, so that's their literal column name too.
const USER_COLUMN_MAP = {
  id:                                'id',
  email:                             'email',
  firstName:                         'firstName',
  lastName:                          'lastName',
  name:                              'name',
  status:                            'status',
  phone:                             'phone',
  facebook:                          'facebook',
  password:                          'password',
  username:                          'username',
  gingerUsername:                    'gingerUsername',
  gingerEmail:                       'gingerEmail',
  gingerPassword:                    'gingerPassword',
  role:                              'role',
  refererEmail:                      'refererEmail',
  hasCompletedPreCourse:             'hasCompletedPreCourse',
  isDashboardCompleted:              'isDashboardCompleted',
  isRegistered:                      'isRegistered',
  isRulesAndGuidelinesCompleted:     'isRulesAndGuidelinesCompleted',
  hasClickedLandCoverTraining:       'hasClickedLandCoverTraining',
  hasClickedTransportationTraining:  'hasClickedTransportationTraining',
  linkedRecruiterEmail:              'linkedRecruiterEmail',
  groupId:                           'group_id',
  teamId:                            'team_id'
};

// Fields that are String? (nullable/optional) in Prisma. Blank sheet values
// for these get sent as null instead of '' - important for gingerEmail and
// gingerUsername (both @unique) and refererEmail (a foreign key to
// Referal.email), where an empty string would either collide across rows
// or fail the FK check.
const USER_NULLABLE_STRING_FIELDS = [
  'phone', 'facebook', 'password', 'username', 'gingerUsername', 'gingerEmail',
  'gingerPassword', 'refererEmail', 'firstName', 'lastName',
  'linkedRecruiterEmail'
];

// Fields that are Int? in Prisma - blank sheet values become null, not ''.
const USER_NULLABLE_INT_FIELDS = ['groupId', 'teamId'];

const USER_BOOLEAN_FIELDS = [
  'hasCompletedPreCourse', 'isDashboardCompleted', 'isRegistered',
  'isRulesAndGuidelinesCompleted', 'hasClickedLandCoverTraining',
  'hasClickedTransportationTraining'
];

function onUserEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== USER_SHEET_NAME) return;

  const row = e.range.getRow();
  if (row <= USER_HEADER_ROW) return;

  if (isUserScriptWriteback_(e)) return;

  const rowData = getUserRowData_(sheet, row);
  const oldRowData = getOldUserRowData_(e, sheet, row);

  const action = determineUserAction_(rowData, oldRowData);
  if (!action) return;

  const response = sendUserToPostgrest_(action, rowData, oldRowData);

  if (response && response.success) {
    applyUserResponse_(sheet, row, response, action);
  } else {
    flagUserError_(sheet, row, response);
  }
}

function getUserRowData_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, USER_TOTAL_COLUMNS).getValues()[0];
  return {
    id:                                   values[USER_COL.ID - 1],
    email:                                values[USER_COL.EMAIL - 1],
    firstName:                            values[USER_COL.FIRST_NAME - 1],
    lastName:                             values[USER_COL.LAST_NAME - 1],
    name:                                 values[USER_COL.NAME - 1],
    status:                               values[USER_COL.STATUS - 1],
    phone:                                values[USER_COL.PHONE - 1],
    facebook:                             values[USER_COL.FACEBOOK - 1],
    password:                             values[USER_COL.PASSWORD - 1],
    username:                             values[USER_COL.USERNAME - 1],
    gingerUsername:                       values[USER_COL.GUSER - 1],
    gingerEmail:                          values[USER_COL.GEMAIL - 1],
    gingerPassword:                       values[USER_COL.GPASSWORD - 1],
    role:                                 values[USER_COL.ROLE - 1],
    refererEmail:                         values[USER_COL.REFERER - 1],
    createdAt:                            values[USER_COL.CREATED_AT - 1],
    updatedAt:                            values[USER_COL.UPDATED_AT - 1],
    hasCompletedPreCourse:                values[USER_COL.HAS_COMPLETED_PRE_COURSE - 1],
    isDashboardCompleted:                 values[USER_COL.IS_DASHBOARD_COMPLETED - 1],
    isRegistered:                         values[USER_COL.IS_REGISTERED - 1],
    isRulesAndGuidelinesCompleted:        values[USER_COL.IS_RULES_AND_GUIDELINES_COMPLETED - 1],
    hasClickedLandCoverTraining:          values[USER_COL.HAS_CLICKED_LAND_COVER_TRAINING - 1],
    hasClickedTransportationTraining:     values[USER_COL.HAS_CLICKED_TRANSPORTATION_TRAINING - 1],
    linkedRecruiterEmail:                 values[USER_COL.LINKED_RECRUITER_EMAIL - 1],
    groupId:                              values[USER_COL.GROUP_ID - 1],
    teamId:                               values[USER_COL.TEAM_ID - 1]
  };
}

function getOldUserRowData_(e, sheet, row) {
  const current = getUserRowData_(sheet, row);
  const editedCol = e.range.getColumn();
  const oldValue = e.oldValue !== undefined ? e.oldValue : '';

  const keys = [
    'id', 'email', 'isDashboardCompleted', 'firstName', 'lastName', 'name',
    'status', 'phone', 'facebook', 'password', 'username', 'gingerUsername', 'gingerEmail',
    'gingerPassword', 'role', 'refererEmail', 'createdAt', 'updatedAt',
    'hasCompletedPreCourse', 'isRegistered',
    'isRulesAndGuidelinesCompleted', 'hasClickedLandCoverTraining',
    'hasClickedTransportationTraining', 'linkedRecruiterEmail',
    'groupId', 'teamId'
  ];

  const old = Object.assign({}, current);
  const key = keys[editedCol - 1];
  if (key) old[key] = oldValue;
  return old;
}

function determineUserAction_(current, old) {
  const isRowEmpty = !current.email && !current.name && !current.firstName &&
                     !current.lastName && !current.status;

  if (isRowEmpty && old.id) return 'delete';
  if (!current.id && current.email) return 'create';

  if (current.id) {
    const fields = [
      'email', 'firstName', 'lastName', 'name', 'status', 'phone',
      'facebook', 'password', 'username', 'gingerUsername', 'gingerEmail',
      'gingerPassword', 'role', 'refererEmail', 'hasCompletedPreCourse',
      'isDashboardCompleted', 'isRegistered', 'isRulesAndGuidelinesCompleted',
      'hasClickedLandCoverTraining', 'hasClickedTransportationTraining',
      'linkedRecruiterEmail', 'groupId', 'teamId'
    ];
    const changed = fields.some(f => String(current[f]) !== String(old[f]));
    if (changed) return 'update';
  }

  return null;
}

function isUserReactivation_(current, old) {
  const newStatus = String(current.status || '').trim().toLowerCase();
  const oldStatus = String(old.status || '').trim().toLowerCase();
  return newStatus === 'active' && oldStatus !== 'active';
}

// Builds a flat row object keyed by real DB column names, ready to send
// straight to PostgREST as the JSON body.
function buildUserRow_(current, forUpdate) {
  const row = {};
  Object.keys(USER_COLUMN_MAP).forEach(key => {
    if (key === 'id' && !forUpdate) return; // let DB generate id on insert
    const col = USER_COLUMN_MAP[key];
    let value = current[key];

    if (USER_BOOLEAN_FIELDS.indexOf(key) !== -1) {
      value = Boolean(value);
    } else if (USER_NULLABLE_INT_FIELDS.indexOf(key) !== -1) {
      const n = parseInt(value, 10);
      value = isNaN(n) ? null : n;
    } else if (USER_NULLABLE_STRING_FIELDS.indexOf(key) !== -1) {
      const str = (value === undefined || value === null) ? '' : String(value).trim();
      value = str === '' ? null : str;
    } else {
      // required-ish fields (email, name, role, status): keep as-is
      value = value || '';
    }

    row[col] = value;
  });
  return row;
}

function applyUserResponse_(sheet, row, response, action) {
  userScriptWritebackInProgress_(true);
  try {
    if (action === 'delete') {
      sheet.getRange(row, 1, 1, USER_TOTAL_COLUMNS).clearContent();
      return;
    }

    const record = response.record || {};
    if (record.id)        sheet.getRange(row, USER_COL.ID).setValue(record.id);
    if (record.createdAt) sheet.getRange(row, USER_COL.CREATED_AT).setValue(record.createdAt);
    if (record.updatedAt) sheet.getRange(row, USER_COL.UPDATED_AT).setValue(record.updatedAt);

    clearUserError_(sheet, row);
  } finally {
    userScriptWritebackInProgress_(false);
  }
}

function flagUserError_(sheet, row, response) {
  const note = response && response.error
    ? `Sync failed: ${response.error}`
    : 'Sync failed: unknown error';
  sheet.getRange(row, USER_COL.EMAIL).setNote(note);
}

function clearUserError_(sheet, row) {
  sheet.getRange(row, USER_COL.EMAIL).clearNote();
}

function userScriptWritebackInProgress_(setTo) {
  const props = PropertiesService.getScriptProperties();
  if (setTo === undefined) {
    return props.getProperty('USER_WRITEBACK_IN_PROGRESS') === 'true';
  }
  props.setProperty('USER_WRITEBACK_IN_PROGRESS', setTo ? 'true' : 'false');
}

function isUserScriptWriteback_(e) {
  return userScriptWritebackInProgress_();
}

// Routes to the right PostgREST call depending on the action, and normalizes
// the result into the { success, record, error } shape the rest of the
// script expects (mirrors what the old n8n webhook used to return).
function sendUserToPostgrest_(action, current, old) {
  const resourceUrl = POSTGREST_BASE_URL + POSTGREST_TABLE;
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
    payload = buildUserRow_(current, false);
  } else if (action === 'update') {
    method = 'patch';
    url = resourceUrl + '?id=eq.' + encodeURIComponent(current.id);
    payload = buildUserRow_(current, true);
    delete payload[USER_COLUMN_MAP.id]; // id is in the filter, not the body

    // Prisma's @updatedAt is client-side only, so PostgREST writes never bump
    // it - set it explicitly.
    const nowIso = new Date().toISOString();
    payload.updatedAt = nowIso;

    // Reactivation: the server's daily deactivation job (server/app.js,
    // runAccountDeactivationJob) deactivates Active users whose lastLogin is
    // older than 30 days (or null with createdAt older than 30 days). Reset
    // lastLogin so a reactivated user isn't deactivated again the next run.
    if (isUserReactivation_(current, old)) {
      payload.lastLogin = nowIso;
    }
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
      // return=representation gives back an array of affected rows
      const record = Array.isArray(parsed) ? parsed[0] : parsed;
      return { success: true, record: record || {} };
    } else {
      // PostgREST error bodies look like: { code, message, details, hint }
      let errMsg = text;
      try {
        const errJson = JSON.parse(text);
        errMsg = errJson.message || text;
      } catch (parseErr) {
        // leave errMsg as raw text
      }
      return { success: false, error: `HTTP ${code}: ${errMsg}` };
    }
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}