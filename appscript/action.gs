// // === CONFIG ===
// // PostgREST base URL (must end with a trailing slash)
// const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';
// // Name of the table/resource exposed by PostgREST for users.
// // IMPORTANT: this Prisma schema has no @@map on the User model, so Prisma
// // creates the actual Postgres table as "User" (capital U, exact case).
// // PostgREST resource paths are case-sensitive, so this must stay 'User'.
// // const POSTGREST_TABLE = 'User';

// // Auth: PostgREST typically expects a JWT bearer token (role/claims baked into it).
// // Store it in Script Properties (File > Project properties > Script properties)
// // under the key POSTGREST_TOKEN so it isn't hardcoded here.
// // function getPostgrestToken_() {
// //   return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
// // }

// const USER_SHEET_NAME = 'User';

// const USER_COL = {
//   ID: 1,
//   EMAIL: 2,
//   IS_DASHBOARD_COMPLETED: 3,
//   FIRST_NAME: 4,
//   LAST_NAME: 5,
//   NAME: 6,
//   STATUS: 7,
//   PHONE: 8,
//   FACEBOOK: 9,
//   PASSWORD: 10,
//   GUSER: 11,
//   GEMAIL: 12,
//   GPASSWORD: 13,
//   ROLE: 14,
//   REFERER: 15,
//   CREATED_AT: 16,
//   UPDATED_AT: 17,
//   HAS_COMPLETED_PRE_COURSE: 18,
//   IS_REGISTERED: 19,
//   IS_RULES_AND_GUIDELINES_COMPLETED: 20,
//   HAS_CLICKED_LAND_COVER_TRAINING: 21,
//   HAS_CLICKED_TRANSPORTATION_TRAINING: 22,
//   LINKED_RECRUITER_EMAIL: 23,
//   GROUP_ID: 24,
//   TEAM_ID: 25
// };

// const USER_HEADER_ROW = 1;
// const USER_TOTAL_COLUMNS = 25; // bump whenever you add more columns


// === SYNC LOGIC ===
function syncUsersFromPostgrest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USER_SHEET_NAME);
  
  if (!sheet) {
    throw new Error(`Sheet named "${USER_SHEET_NAME}" not found!`);
  }

  // 1. Fetch data from PostgREST
  const url = POSTGREST_BASE_URL + POSTGREST_TABLE;
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
    throw new Error("Failed to fetch data from PostgREST: " + response.getContentText());
  }
  
  const users = JSON.parse(response.getContentText());
  if (!users || users.length === 0) {
    Logger.log("No users found to sync.");
    return;
  }

  // 2. Map PostgREST DB keys to your specific 1-indexed USER_COL positions
  // Array index is USER_COL value - 1 (because JS arrays are 0-indexed)
  const mapDbToRow = (user) => {
    const row = new Array(USER_TOTAL_COLUMNS).fill("");
    
    row[USER_COL.ID - 1] = user.id ?? "";
    row[USER_COL.EMAIL - 1] = user.email ?? "";
    row[USER_COL.IS_DASHBOARD_COMPLETED - 1] = formatBool(user.isDashboardCompleted);
    row[USER_COL.FIRST_NAME - 1] = user.firstName ?? "";
    row[USER_COL.LAST_NAME - 1] = user.lastName ?? "";
    row[USER_COL.NAME - 1] = user.name ?? "";
    row[USER_COL.STATUS - 1] = user.status ?? "";
    row[USER_COL.PHONE - 1] = user.phone ?? "";
    row[USER_COL.FACEBOOK - 1] = user.facebook ?? "";
    row[USER_COL.PASSWORD - 1] = user.password ?? "";
    row[USER_COL.GUSER - 1] = user.gingerUsername ?? "";
    row[USER_COL.GEMAIL - 1] = user.gingerEmail ?? "";
    row[USER_COL.USERNAME - 1] = user.username ?? "";
    row[USER_COL.GPASSWORD - 1] = user.gingerPassword ?? "";
    row[USER_COL.ROLE - 1] = user.role ?? "";
    row[USER_COL.REFERER - 1] = user.refererEmail ?? "";
    row[USER_COL.CREATED_AT - 1] = user.createdAt ?? "";
    row[USER_COL.UPDATED_AT - 1] = user.updatedAt ?? "";
    row[USER_COL.HAS_COMPLETED_PRE_COURSE - 1] = formatBool(user.hasCompletedPreCourse);
    row[USER_COL.IS_REGISTERED - 1] = formatBool(user.isRegistered);
    row[USER_COL.IS_RULES_AND_GUIDELINES_COMPLETED - 1] = formatBool(user.isRulesAndGuidelinesCompleted);
    row[USER_COL.HAS_CLICKED_LAND_COVER_TRAINING - 1] = formatBool(user.hasClickedLandCoverTraining);
    row[USER_COL.HAS_CLICKED_TRANSPORTATION_TRAINING - 1] = formatBool(user.hasClickedTransportationTraining);
    row[USER_COL.LINKED_RECRUITER_EMAIL - 1] = user.linkedRecruiterEmail ?? "";
    row[USER_COL.GROUP_ID - 1] = user.group_id ?? "";
    row[USER_COL.TEAM_ID - 1] = user.team_id ?? "";
    
    return row;
  };

  // Helper to keep booleans clean in the sheet
  const formatBool = (val) => {
    if (val === null || val === undefined) return "";
    return val ? "TRUE" : "FALSE";
  };

  // 3. Read current sheet values into memory
  const lastRow = sheet.getLastRow();
  let sheetValues = [];
  if (lastRow > 0) {
    sheetValues = sheet.getRange(1, 1, lastRow, USER_TOTAL_COLUMNS).getValues();
  }

  // Ensure sheetValues is populated up to USER_HEADER_ROW if sheet is too short
  while (sheetValues.length < USER_HEADER_ROW) {
    sheetValues.push(new Array(USER_TOTAL_COLUMNS).fill(""));
  }

  // 4. Map existing IDs to their 0-indexed row index in sheetValues
  const idToRowIndex = new Map();
  for (let i = USER_HEADER_ROW; i < sheetValues.length; i++) {
    const id = sheetValues[i][USER_COL.ID - 1];
    if (id !== undefined && id !== null && id !== "") {
      idToRowIndex.set(id.toString(), i);
    }
  }

  // 5. Update or append rows in memory
  let updatedCount = 0;
  let appendedCount = 0;
  users.forEach(user => {
    const rowData = mapDbToRow(user);
    const userId = user.id ? user.id.toString() : null;
    
    if (userId && idToRowIndex.has(userId)) {
      const rowIndex = idToRowIndex.get(userId);
      sheetValues[rowIndex] = rowData;
      updatedCount++;
    } else {
      sheetValues.push(rowData);
      appendedCount++;
    }
  });

  // 6. Write back all at once
  if (sheetValues.length > 0) {
    sheet.getRange(1, 1, sheetValues.length, USER_TOTAL_COLUMNS).setValues(sheetValues);
  }

  Logger.log(`Sync complete! Updated ${updatedCount} existing rows and appended ${appendedCount} new rows.`);
}

// ========================================================


// const POSTGREST_GROUP_TABLE = 'Group';
function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}
// const GROUP_SHEET_NAME = 'Group';
// const GROUP_COL = {
//   ID: 1,
//   GROUP_NAME: 2,
//   GROUP_ID: 3,
//   GROUP_TYPE: 4,
//   MANAGER_EMAIL: 5,
//   OWNER_EMAIL: 6,
//   CHECKER_LINK: 7,
//   JUDGER_LINK: 8,
//   CREATED_AT: 9,
//   UPDATED_AT: 10
// };
// const GROUP_HEADER_ROW = 1;
// const GROUP_TOTAL_COLUMNS = 10;
// === SYNC LOGIC ===
function syncGroupsFromPostgrest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GROUP_SHEET_NAME);
  
  if (!sheet) {
    throw new Error(`Sheet named "${GROUP_SHEET_NAME}" not found!`);
  }
  // 1. Fetch data from PostgREST
  const url = POSTGREST_BASE_URL + POSTGREST_GROUP_TABLE;
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
    throw new Error("Failed to fetch data from PostgREST: " + response.getContentText());
  }
  
  const groups = JSON.parse(response.getContentText());
  if (!groups || groups.length === 0) {
    Logger.log("No groups found to sync.");
    return;
  }
  // 2. Map PostgREST DB keys to your specific 1-indexed GROUP_COL positions
  // Array index is GROUP_COL value - 1 (because JS arrays are 0-indexed)
  const mapDbToRow = (group) => {
    const row = new Array(GROUP_TOTAL_COLUMNS).fill("");
    
    row[GROUP_COL.ID - 1] = group.id ?? "";
    row[GROUP_COL.GROUP_NAME - 1] = group.groupName ?? "";
    row[GROUP_COL.GROUP_ID - 1] = group.groupId ?? "";
    row[GROUP_COL.GROUP_TYPE - 1] = group.groupType ?? "";
    row[GROUP_COL.MANAGER_EMAIL - 1] = group.managerEmail ?? "";
    row[GROUP_COL.OWNER_EMAIL - 1] = group.ownerEmail ?? "";
    row[GROUP_COL.CHECKER_LINK - 1] = group.checkerLink ?? "";
    row[GROUP_COL.JUDGER_LINK - 1] = group.judgerLink ?? "";
    row[GROUP_COL.CREATED_AT - 1] = group.createdAt ?? "";
    row[GROUP_COL.UPDATED_AT - 1] = group.updatedAt ?? "";
    
    return row;
  };
  // 3. Read current sheet values into memory
  const lastRow = sheet.getLastRow();
  let sheetValues = [];
  if (lastRow > 0) {
    sheetValues = sheet.getRange(1, 1, lastRow, GROUP_TOTAL_COLUMNS).getValues();
  }

  while (sheetValues.length < GROUP_HEADER_ROW) {
    sheetValues.push(new Array(GROUP_TOTAL_COLUMNS).fill(""));
  }

  // 4. Map existing IDs to their 0-indexed row index in sheetValues
  const idToRowIndex = new Map();
  for (let i = GROUP_HEADER_ROW; i < sheetValues.length; i++) {
    const id = sheetValues[i][GROUP_COL.ID - 1];
    if (id !== undefined && id !== null && id !== "") {
      idToRowIndex.set(id.toString(), i);
    }
  }

  // 5. Update or append rows in memory
  let updatedCount = 0;
  let appendedCount = 0;
  
  // Optional: Set flag so onGroupEdit doesn't fire while we're writing bulk updates
  // groupScriptWritebackInProgress_(true); // If you are using the onGroupEdit script!
  
  groups.forEach(group => {
    const rowData = mapDbToRow(group);
    const groupIdStr = group.id ? group.id.toString() : null;
    
    if (groupIdStr && idToRowIndex.has(groupIdStr)) {
      const rowIndex = idToRowIndex.get(groupIdStr);
      sheetValues[rowIndex] = rowData;
      updatedCount++;
    } else {
      sheetValues.push(rowData);
      appendedCount++;
    }
  });

  // 6. Write back all at once
  if (sheetValues.length > 0) {
    sheet.getRange(1, 1, sheetValues.length, GROUP_TOTAL_COLUMNS).setValues(sheetValues);
  }
  
  // groupScriptWritebackInProgress_(false);
  Logger.log(`Sync complete! Updated ${updatedCount} existing rows and appended ${appendedCount} new rows.`);
}



// ======================================

function syncReferalsFromPostgrest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REFERAL_SHEET_NAME);
  
  if (!sheet) throw new Error(`Sheet named "${REFERAL_SHEET_NAME}" not found!`);

  // 1. Fetch data from PostgREST
  const url = POSTGREST_BASE_URL + POSTGREST_REFERAL_TABLE;
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
    throw new Error("Failed to fetch data from PostgREST: " + response.getContentText());
  }
  
  const referals = JSON.parse(response.getContentText());
  if (!referals || referals.length === 0) {
    Logger.log("No referals found to sync.");
    return;
  }

  // 2. Map PostgREST DB keys to your specific 1-indexed REFERAL_COL positions
  const mapDbToRow = (ref) => {
    const row = new Array(REFERAL_TOTAL_COLUMNS).fill("");
    
    row[REFERAL_COL.ID - 1] = ref.id ?? "";
    row[REFERAL_COL.EMAIL - 1] = ref.email ?? "";
    row[REFERAL_COL.CODE - 1] = ref.code ?? "";
    row[REFERAL_COL.NAME - 1] = ref.name ?? "";
    row[REFERAL_COL.SITENAME - 1] = ref.sitename ?? "";
    row[REFERAL_COL.STATUS - 1] = ref.status ?? "";
    row[REFERAL_COL.HOW_MANY_USE - 1] = ref.howManyUse ?? 0;
    row[REFERAL_COL.CREATED_AT - 1] = ref.createdAt ?? "";
    row[REFERAL_COL.UPDATED_AT - 1] = ref.updatedAt ?? "";
    
    return row;
  };

  // 3. Read current sheet values into memory
  const lastRow = sheet.getLastRow();
  let sheetValues = [];
  if (lastRow > 0) {
    sheetValues = sheet.getRange(1, 1, lastRow, REFERAL_TOTAL_COLUMNS).getValues();
  }

  while (sheetValues.length < REFERAL_HEADER_ROW) {
    sheetValues.push(new Array(REFERAL_TOTAL_COLUMNS).fill(""));
  }

  // 4. Map existing IDs to their 0-indexed row index in sheetValues
  const idToRowIndex = new Map();
  for (let i = REFERAL_HEADER_ROW; i < sheetValues.length; i++) {
    const id = sheetValues[i][REFERAL_COL.ID - 1];
    if (id !== undefined && id !== null && id !== "") {
      idToRowIndex.set(id.toString(), i);
    }
  }

  // 5. Update or append rows in memory
  let updatedCount = 0;
  let appendedCount = 0;
  
  referals.forEach(ref => {
    const rowData = mapDbToRow(ref);
    const refIdStr = ref.id ? ref.id.toString() : null;
    
    if (refIdStr && idToRowIndex.has(refIdStr)) {
      const rowIndex = idToRowIndex.get(refIdStr);
      sheetValues[rowIndex] = rowData;
      updatedCount++;
    } else {
      sheetValues.push(rowData);
      appendedCount++;
    }
  });

  // 6. Write back all at once
  if (sheetValues.length > 0) {
    sheet.getRange(1, 1, sheetValues.length, REFERAL_TOTAL_COLUMNS).setValues(sheetValues);
  }

  Logger.log(`Sync complete! Updated ${updatedCount} existing rows and appended ${appendedCount} new rows.`);
}

// ======================================

function syncAutomatedChatFromPostgrest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Fetch data from PostgREST
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
    throw new Error("Failed to fetch AutomatedChatMessage data from PostgREST: " + response.getContentText());
  }

  const allRecords = JSON.parse(response.getContentText());
  if (!allRecords) {
    Logger.log("No automated chat records returned.");
    return;
  }

  // Iterate over each tab (Novice, Challengers, OG, Checker, Judger, IC)
  Object.keys(AUTOMATED_CHAT_TAB_MAP).forEach(tabName => {
    const targetChatType = AUTOMATED_CHAT_TAB_MAP[tabName];
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return; // Skip if tab doesn't exist in spreadsheet

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
      setVal('message', rec.message ?? "");
      setVal('Message', rec.message ?? "");
      setVal('senderName', rec.senderName ?? "");
      setVal('SenderName', rec.senderName ?? "");
      setVal('senderRole', rec.senderRole ?? "");
      setVal('SenderRole', rec.senderRole ?? "");
      setVal('frequency', rec.frequency ?? "");
      setVal('Frequency', rec.frequency ?? "");
      setVal('isScheduled', rec.isScheduled !== undefined ? (rec.isScheduled ? "TRUE" : "FALSE") : "");
      setVal('IsScheduled', rec.isScheduled !== undefined ? (rec.isScheduled ? "TRUE" : "FALSE") : "");
      setVal('specificTime', rec.specificTime ?? "");
      setVal('SpecificTime', rec.specificTime ?? "");
      setVal('startHour', rec.startHour ?? "");
      setVal('StartHour', rec.startHour ?? "");
      setVal('endHour', rec.endHour ?? "");
      setVal('EndHour', rec.endHour ?? "");
      setVal('runsPerDay', rec.runsPerDay ?? "");
      setVal('RunsPerDay', rec.runsPerDay ?? "");
      setVal('lastRunDate', rec.lastRunDate ?? rec.lastSentAt ?? "");
      setVal('LastRunDate', rec.lastRunDate ?? rec.lastSentAt ?? "");
      setVal('isActive', rec.isActive !== undefined ? (rec.isActive ? "TRUE" : "FALSE") : "TRUE");
      setVal('IsActive', rec.isActive !== undefined ? (rec.isActive ? "TRUE" : "FALSE") : "TRUE");
      setVal('createdAt', rec.createdAt ?? "");
      setVal('CreatedAt', rec.createdAt ?? "");
      setVal('updatedAt', rec.updatedAt ?? "");
      setVal('UpdatedAt', rec.updatedAt ?? "");

      return row;
    };

    // 3. Read current sheet values into memory
    const lastRow = sheet.getLastRow();
    let sheetValues = [];
    if (lastRow > 0) {
      sheetValues = sheet.getRange(1, 1, lastRow, totalCols).getValues();
    }

    while (sheetValues.length < AUTOMATED_CHAT_HEADER_ROW) {
      sheetValues.push(new Array(totalCols).fill(""));
    }

    // 4. Map existing IDs to their 0-indexed row index in sheetValues
    const idToRowIndex = new Map();
    const idColIdx = colMap['ID'] || colMap['id'] || 1;
    for (let i = AUTOMATED_CHAT_HEADER_ROW; i < sheetValues.length; i++) {
      const id = sheetValues[i][idColIdx - 1];
      if (id !== undefined && id !== null && id !== "") {
        idToRowIndex.set(id.toString(), i);
      }
    }

    // 5. Update or append rows in memory
    let updatedCount = 0;
    let appendedCount = 0;

    tabRecords.forEach(rec => {
      const rowData = mapDbToRow(rec);
      const recIdStr = rec.id ? rec.id.toString() : null;

      if (recIdStr && idToRowIndex.has(recIdStr)) {
        const rowIndex = idToRowIndex.get(recIdStr);
        sheetValues[rowIndex] = rowData;
        updatedCount++;
      } else {
        sheetValues.push(rowData);
        appendedCount++;
      }
    });

    // 6. Write back all at once
    if (sheetValues.length > 0) {
      sheet.getRange(1, 1, sheetValues.length, totalCols).setValues(sheetValues);
    }

    Logger.log(`Synced ${tabName} tab: updated ${updatedCount} rows, appended ${appendedCount} rows.`);
  });
}

// ======================================

// Column/sheet constants live in profileChangeRequest.gs
function syncProfileChangeRequestsFromPostgrest() {
  const sheet = ensureProfileChangeSheet_();

  // 1. Fetch data from PostgREST (newest requests first)
  const url = POSTGREST_BASE_URL + POSTGREST_PROFILE_CHANGE_TABLE + '?order=createdAt.desc';
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
    throw new Error("Failed to fetch ProfileChangeRequest data from PostgREST: " + response.getContentText());
  }

  const requests = JSON.parse(response.getContentText());
  if (!requests || requests.length === 0) {
    Logger.log("No profile change requests found to sync.");
    return;
  }

  // Fetch users to map userEmail -> User details (name, phone, refererEmail)
  const userUrl = POSTGREST_BASE_URL + 'User';
  const userResponse = UrlFetchApp.fetch(userUrl, options);
  const userMap = new Map();
  if (userResponse.getResponseCode() === 200) {
    const users = JSON.parse(userResponse.getContentText());
    users.forEach(u => {
      if (u.email) {
        userMap.set(u.email.trim().toLowerCase(), u);
      }
    });
  } else {
    throw new Error("Failed to fetch User table: " + userResponse.getContentText());
  }

  // 2. Map PostgREST DB keys to the 1-indexed PROFILE_CHANGE_COL positions
  const mapDbToRow = (req) => {
    const row = new Array(PROFILE_CHANGE_TOTAL_COLUMNS).fill("");

    row[PROFILE_CHANGE_COL.ID - 1]                   = req.id ?? "";
    row[PROFILE_CHANGE_COL.USER_EMAIL - 1]           = req.userEmail ?? "";

    const userEmailKey = req.userEmail ? req.userEmail.trim().toLowerCase() : "";
    const usr = userMap.get(userEmailKey) || {};

    row[PROFILE_CHANGE_COL.NAME - 1]                 = usr.name ?? "";
    row[PROFILE_CHANGE_COL.NUMBER - 1]               = usr.phone ?? "";

    let refererText = "";
    if (usr.refererEmail) {
      const refEmail = usr.refererEmail.trim().toLowerCase();
      const refUser = userMap.get(refEmail);
      if (refUser) {
        const refName = refUser.name || "";
        const refFb = refUser.facebook || "";
        refererText = `${refName}\n${refEmail}\n${refFb}`;
      } else {
        refererText = `\n${refEmail}\n`;
      }
    }
    row[PROFILE_CHANGE_COL.REFERER - 1]              = refererText;

    row[PROFILE_CHANGE_COL.REQUESTED_FIRST_NAME - 1] = req.requestedFirstName ?? "";
    row[PROFILE_CHANGE_COL.REQUESTED_LAST_NAME - 1]  = req.requestedLastName ?? "";
    row[PROFILE_CHANGE_COL.REQUESTED_FACEBOOK - 1]   = req.requestedFacebook ?? "";
    row[PROFILE_CHANGE_COL.STATUS - 1]               = req.status ?? "";
    row[PROFILE_CHANGE_COL.REJECTION_REASON - 1]     = req.rejectionReason ?? "";
    row[PROFILE_CHANGE_COL.REVIEWED_BY - 1]          = req.reviewedBy ?? "";
    row[PROFILE_CHANGE_COL.REVIEWED_AT - 1]          = req.reviewedAt ?? "";
    row[PROFILE_CHANGE_COL.CREATED_AT - 1]           = req.createdAt ?? "";
    row[PROFILE_CHANGE_COL.UPDATED_AT - 1]           = req.updatedAt ?? "";

    return row;
  };

  // 3. Read current sheet values into memory
  const lastRow = sheet.getLastRow();
  let sheetValues = [];
  if (lastRow > 0) {
    sheetValues = sheet.getRange(1, 1, lastRow, PROFILE_CHANGE_TOTAL_COLUMNS).getValues();
  }

  while (sheetValues.length < PROFILE_CHANGE_HEADER_ROW) {
    sheetValues.push(new Array(PROFILE_CHANGE_TOTAL_COLUMNS).fill(""));
  }

  // 4. Map existing IDs to their 0-indexed row index in sheetValues
  const idToRowIndex = new Map();
  for (let i = PROFILE_CHANGE_HEADER_ROW; i < sheetValues.length; i++) {
    const id = sheetValues[i][PROFILE_CHANGE_COL.ID - 1];
    if (id !== undefined && id !== null && id !== "") {
      idToRowIndex.set(id.toString(), i);
    }
  }

  // 5. Update or append rows in memory
  let updatedCount = 0;
  let appendedCount = 0;

  // Suppress onProfileChangeRequestEdit while we write bulk updates
  profileChangeScriptWritebackInProgress_(true);
  try {
    requests.forEach(req => {
      const rowData = mapDbToRow(req);
      const reqIdStr = req.id ? req.id.toString() : null;

      if (reqIdStr && idToRowIndex.has(reqIdStr)) {
        const rowIndex = idToRowIndex.get(reqIdStr);
        sheetValues[rowIndex] = rowData;
        updatedCount++;
      } else {
        sheetValues.push(rowData);
        appendedCount++;
      }
    });

    // 6. Write back all at once
    if (sheetValues.length > 0) {
      sheet.getRange(1, 1, sheetValues.length, PROFILE_CHANGE_TOTAL_COLUMNS).setValues(sheetValues);
    }
  } finally {
    profileChangeScriptWritebackInProgress_(false);
  }

  Logger.log(`Sync complete! Updated ${updatedCount} existing rows and appended ${appendedCount} new rows.`);
}

// ======================================

// Column/sheet constants live in paymentMethodHistory.gs
// Read-only: this is an append-only payout audit trail, so there is no
// matching onEdit writeback and nothing here ever pushes back to the DB.
function syncPaymentMethodHistoryFromPostgrest() {
  const sheet = ensurePaymentHistorySheet_();

  // 1. Fetch data from PostgREST (most recent change first)
  const url = POSTGREST_BASE_URL + POSTGREST_PAYMENT_HISTORY_TABLE + '?order=changedAt.desc';
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
    throw new Error("Failed to fetch PaymentMethodHistory data from PostgREST: " + response.getContentText());
  }

  const records = JSON.parse(response.getContentText());
  if (!records || records.length === 0) {
    Logger.log("No payment method history found to sync.");
    return;
  }

  // 2. Map PostgREST DB keys to the 1-indexed PAYMENT_HISTORY_COL positions
  const mapDbToRow = (rec) => {
    const row = new Array(PAYMENT_HISTORY_TOTAL_COLUMNS).fill("");

    row[PAYMENT_HISTORY_COL.ID - 1]                 = rec.id ?? "";
    row[PAYMENT_HISTORY_COL.EMAIL - 1]              = rec.email ?? "";
    row[PAYMENT_HISTORY_COL.OLD_PAYEE_NAME - 1]     = rec.oldPayeeName ?? "";
    row[PAYMENT_HISTORY_COL.OLD_LAST_NAME - 1]      = rec.oldLastName ?? "";
    row[PAYMENT_HISTORY_COL.OLD_PAYEE_UID - 1]      = rec.oldPayeeUid ?? "";
    row[PAYMENT_HISTORY_COL.OLD_PAYMENT_METHOD - 1] = rec.oldPaymentMethod ?? "";
    row[PAYMENT_HISTORY_COL.OLD_QR_IMAGE_URL - 1]   = rec.oldQrImageUrl ?? "";
    row[PAYMENT_HISTORY_COL.NEW_PAYEE_NAME - 1]     = rec.newPayeeName ?? "";
    row[PAYMENT_HISTORY_COL.NEW_LAST_NAME - 1]      = rec.newLastName ?? "";
    row[PAYMENT_HISTORY_COL.NEW_PAYEE_UID - 1]      = rec.newPayeeUid ?? "";
    row[PAYMENT_HISTORY_COL.NEW_PAYMENT_METHOD - 1] = rec.newPaymentMethod ?? "";
    row[PAYMENT_HISTORY_COL.NEW_QR_IMAGE_URL - 1]   = rec.newQrImageUrl ?? "";
    row[PAYMENT_HISTORY_COL.CHANGED_AT - 1]         = rec.changedAt ?? "";

    return row;
  };

  // 3. Read current sheet values into memory
  const lastRow = sheet.getLastRow();
  let sheetValues = [];
  if (lastRow > 0) {
    sheetValues = sheet.getRange(1, 1, lastRow, PAYMENT_HISTORY_TOTAL_COLUMNS).getValues();
  }

  while (sheetValues.length < PAYMENT_HISTORY_HEADER_ROW) {
    sheetValues.push(new Array(PAYMENT_HISTORY_TOTAL_COLUMNS).fill(""));
  }

  // 4. Map existing IDs to their 0-indexed row index in sheetValues
  const idToRowIndex = new Map();
  for (let i = PAYMENT_HISTORY_HEADER_ROW; i < sheetValues.length; i++) {
    const id = sheetValues[i][PAYMENT_HISTORY_COL.ID - 1];
    if (id !== undefined && id !== null && id !== "") {
      idToRowIndex.set(id.toString(), i);
    }
  }

  // 5. Update or append rows in memory
  let updatedCount = 0;
  let appendedCount = 0;

  records.forEach(rec => {
    const rowData = mapDbToRow(rec);
    const recIdStr = rec.id ? rec.id.toString() : null;

    if (recIdStr && idToRowIndex.has(recIdStr)) {
      const rowIndex = idToRowIndex.get(recIdStr);
      sheetValues[rowIndex] = rowData;
      updatedCount++;
    } else {
      sheetValues.push(rowData);
      appendedCount++;
    }
  });

  // 6. Write back all at once
  if (sheetValues.length > 0) {
    sheet.getRange(1, 1, sheetValues.length, PAYMENT_HISTORY_TOTAL_COLUMNS).setValues(sheetValues);
  }

  Logger.log(`Sync complete! Updated ${updatedCount} existing rows and appended ${appendedCount} new rows.`);
}


/**
 * Prompts the admin for a user email and sends a deactivation/blacklist request to the server.
 */
function blacklistUserAction() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Blacklist & Zero User Wallet',
    'Enter the email of the user you want to blacklist and zero out their wallet:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const email = response.getResponseText().trim();
    if (!email) {
      ui.alert('Error', 'Email address cannot be empty.', ui.ButtonSet.OK);
      return;
    }
    
    // Call the server API
    const success = sendBlacklistRequestToServer_(email);
    if (success) {
      ui.alert('Success', 'User ' + email + ' has been blacklisted and their wallet has been zeroed.', ui.ButtonSet.OK);
      
      // Auto-trigger a sync for the User tab so the sheet reflects the deactivated status
      try {
        syncUsersFromPostgrest();
      } catch (e) {
        Logger.log('Sync failed after blacklist: ' + e.toString());
      }
    }
  }
}

/**
 * Sends a POST request to the server blacklist endpoint.
 * Secures the request using the POSTGREST_TOKEN Script Property.
 */
function sendBlacklistRequestToServer_(email) {
  const ui = SpreadsheetApp.getUi();
  try {
    const url = 'https://server.xfnite.cloud/api/admin/blacklist';
    const token = getPostgrestToken_();
    
    if (!token) {
      ui.alert('Error', 'POSTGREST_TOKEN script property is missing or empty. Please set it in Script Properties.', ui.ButtonSet.OK);
      return false;
    }
    
    const payload = JSON.stringify({ email: email });
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      payload: payload,
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      return true;
    } else {
      let errMsg = 'Failed to blacklist user. Server returned status ' + responseCode;
      try {
        const parsed = JSON.parse(responseText);
        if (parsed.error) {
          errMsg += '\nError: ' + parsed.error;
        }
      } catch (e) {
        errMsg += '\nResponse: ' + responseText;
      }
      ui.alert('Error', errMsg, ui.ButtonSet.OK);
      return false;
    }
  } catch (err) {
    ui.alert('Error', 'An unexpected connection error occurred: ' + err.toString(), ui.ButtonSet.OK);
    return false;
  }
}