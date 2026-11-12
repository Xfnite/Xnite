const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';
const UPDATE_START_ROW = 4434; // Rows above this are already verified and left untouched
const INACTIVE_SHEET_NAME = 'Inactive Labelers October 2026'; // Emails here will not be pulled or populated

function getPostgrestToken_() {
  return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
}

// =========================================================================
// OPTIMIZED: FETCH & POPULATE WITH DUPLICATE CHECK (USING POSTGRES)
// =========================================================================
function getPassersAndPopulate() {
  // 1. Fetch only needed columns
  // 2. Filter: role != 'applicant'
  const selectQuery = "?select=createdAt,name,email,gingerEmail,gingerPassword,gingerUsername,labelerId,labelerPassword,labelerRefererEmail,refererEmail,facebook&role=neq.applicant";
  const apiUrl = POSTGREST_BASE_URL + "User" + selectQuery;
  const referalApiUrl = POSTGREST_BASE_URL + "Referal?select=email,name";
  const token = getPostgrestToken_();

  if (!token) {
    SpreadsheetApp.getUi().alert("❌ Error: POSTGREST_TOKEN is missing in Script Properties.");
    return;
  }
  
  try {
    const headers = {
      "Authorization": "Bearer " + token,
      "Accept": "application/json"
    };

    // Paginate so PostgREST's max-rows cap can't silently drop users
    console.log("Fetching User data (paginated)...");
    const userResult = fetchAllPages_(apiUrl + "&order=id", headers);

    if (userResult.error) {
      console.log("Error: " + userResult.error);
      SpreadsheetApp.getUi().alert("❌ Error: Postgres User API failed: " + userResult.error);
      return;
    }

    const data = userResult.rows;
    console.log("Fetched " + data.length + " active passers from Postgres");

    // Process Referal Response
    let referalData = [];
    const referalResult = fetchAllPages_(referalApiUrl + "&order=email", headers);
    if (referalResult.error) {
      console.log("Referal Fetch Error: " + referalResult.error);
    } else {
      referalData = referalResult.rows;
    }
    
    // Collect all unique labelerRefererEmail values to query dynamically
    const refererEmails = new Set();
    for (let i = 0; i < data.length; i++) {
      if (data[i].labelerRefererEmail) {
        refererEmails.add(data[i].labelerRefererEmail.trim().toLowerCase());
      }
    }
    
    // Fetch User name mappings ONLY for the recruiters that are actually referenced
    // This allows us to query ALL roles without pagination limits (since we only fetch a few rows)
    let userMapData = [];
    if (refererEmails.size > 0) {
      // Split into chunks so each URL stays under Apps Script's ~2KB URL limit
      const userMapUrls = buildRefererLookupUrls_(Array.from(refererEmails));
      try {
        console.log("Fetching User mappings for referer emails in " + userMapUrls.length + " request(s)...");
        const userMapRequests = userMapUrls.map(function(url) {
          return { url: url, method: "get", headers: headers, muteHttpExceptions: true };
        });
        const userMapResponses = UrlFetchApp.fetchAll(userMapRequests);
        for (let i = 0; i < userMapResponses.length; i++) {
          const userMapResponse = userMapResponses[i];
          if (userMapResponse.getResponseCode() === 200) {
            const chunk = JSON.parse(userMapResponse.getContentText());
            if (Array.isArray(chunk)) {
              for (let j = 0; j < chunk.length; j++) userMapData.push(chunk[j]);
            }
          } else {
            console.log("User Map Fetch Error (chunk " + (i + 1) + "): " + userMapResponse.getContentText());
          }
        }
        console.log("Fetched " + userMapData.length + " matching user mappings.");
      } catch (userMapErr) {
        console.log("Failed to fetch User map: " + userMapErr);
      }
    }
    
    // Build userEmailToNameMap (User table: email/gingerEmail -> Name)
    const userEmailToNameMap = new Map();
    
    // First, populate from dynamic user mappings (any role)
    if (Array.isArray(userMapData)) {
      for (let i = 0; i < userMapData.length; i++) {
        const u = userMapData[i];
        const userName = u.name ? u.name.toString().trim() : "";
        if (userName) {
          if (u.email) {
            userEmailToNameMap.set(u.email.toString().trim().toLowerCase(), userName);
          }
          if (u.gingerEmail) {
            userEmailToNameMap.set(u.gingerEmail.toString().trim().toLowerCase(), userName);
          }
        }
      }
    }

    // Next, populate from main synced passers list (just in case there are missing overlaps)
    for (let i = 0; i < data.length; i++) {
      const u = data[i];
      const userName = u.name ? u.name.toString().trim() : "";
      if (userName) {
        if (u.email) {
          userEmailToNameMap.set(u.email.toString().trim().toLowerCase(), userName);
        }
        if (u.gingerEmail) {
          userEmailToNameMap.set(u.gingerEmail.toString().trim().toLowerCase(), userName);
        }
      }
    }

    // Build referalEmailToNameMap (Referal table: email -> Name)
    const referalEmailToNameMap = new Map();
    if (Array.isArray(referalData)) {
      for (let i = 0; i < referalData.length; i++) {
        const ref = referalData[i];
        if (ref.email && ref.name) {
          referalEmailToNameMap.set(ref.email.toString().trim().toLowerCase(), ref.name.toString().trim());
        }
      }
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Xfnite_Account");
    
    if (!sheet) {
      console.log("Error: Sheet not found");
      SpreadsheetApp.getUi().alert("❌ Error: Sheet not found");
      return;
    }
    
    // ⚡ Read sheet ONCE and build Map for fast lookups with row numbers
    const existingEmailsMap = getExistingEmailsAsMap(sheet);
    
    // ⚡ Read inactive emails from Inactive Labelers sheet
    const inactiveEmailsSet = getInactiveEmailsAsSet_(ss, INACTIVE_SHEET_NAME);

    // ⚡ Load original joined dates from backup spreadsheet (to preserve 2022/older dates for new rows)
    const backupDates = loadBackupDatesMaps_();
    
    // ⚡ Build array of rows to add (batch insert)
    const rowsToAdd = [];
    // rowNumber -> { createdAt, name, refName }; written in one batch after the loop
    const pendingUpdates = new Map();
    let skippedCount = 0;
    let updatedCount = 0;
    let inactiveSkippedCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      
      // Skip records without a gingerEmail to prevent blank errors
      if (!record.gingerEmail) continue;
      
      const gingerEmailLower = record.gingerEmail.toString().trim().toLowerCase();
      const userEmailLower = record.email ? record.email.toString().trim().toLowerCase() : "";

      // 🚫 Skip if email exists in Inactive Labelers sheet
      if (inactiveEmailsSet.has(gingerEmailLower) || (userEmailLower && inactiveEmailsSet.has(userEmailLower))) {
        console.log("SKIPPED Inactive Labeler: " + (record.name || "") + " (" + record.gingerEmail + ")");
        inactiveSkippedCount++;
        continue;
      }
      
      // Resolve Recruiter/Referer Name
      let refName = "";
      if (record.labelerRefererEmail) {
        const emailLower = record.labelerRefererEmail.toString().trim().toLowerCase();
        refName = userEmailToNameMap.get(emailLower) || "";
      }
      
      if (!refName && record.refererEmail) {
        const emailLower = record.refererEmail.toString().trim().toLowerCase();
        refName = referalEmailToNameMap.get(emailLower) || "";
      }
      
      if (!refName) {
        const fallbackEmail = record.labelerRefererEmail || record.refererEmail || "";
        if (fallbackEmail) {
          refName = fallbackEmail.toString().trim().split("@")[0];
        }
      }

      // Resolve joined date (prefer original backup date over 2026 database date)
      let resolvedJoinedDate = record.createdAt || "";
      if (backupDates) {
        const gingerIdStr = record.labelerId ? record.labelerId.toString().trim() : "";
        const backupDate = backupDates.emailMap.get(gingerEmailLower) ||
                           (userEmailLower ? backupDates.emailMap.get(userEmailLower) : null) ||
                           (gingerIdStr ? backupDates.idMap.get(gingerIdStr) : null);
        if (backupDate) {
          resolvedJoinedDate = backupDate;
        }
      }

      // O(1) lookup - check if gingerEmail already exists
      if (existingEmailsMap.has(gingerEmailLower)) {
        const rowNumber = existingEmailsMap.get(gingerEmailLower);
        
        // 🔹 FIX: Only update if the row is 4434 or further down
        if (rowNumber >= UPDATE_START_ROW) {
          // Queue update of CreatedAt (Col A), Name (Col B) and Recruiter (Col K)
          pendingUpdates.set(rowNumber, {
            createdAt: resolvedJoinedDate,
            name: record.name || "",
            refName: refName
          });

          console.log("UPDATED Row " + rowNumber + ": " + record.name + " (" + record.gingerEmail + ") | Recruiter: " + refName);
          updatedCount++;
        } else if (rowNumber === -1) {
          console.log("SKIPPED DB duplicate: " + record.name + " (" + record.gingerEmail + ") already queued in this run.");
        } else {
          // Ignore it entirely to leave rows 1-4433 untouched
          console.log("PROTECTED Row " + rowNumber + ": left untouched.");
        }
        
        skippedCount++;
      } else {

        // NEW EMAIL - ADD ROW (uses original backup joined date if available, else DB date)
        rowsToAdd.push([
          resolvedJoinedDate,                      // A: Created At (Original Backup Date or DB fallback)
          record.name || "",                       // B: Full Name
          record.gingerEmail || "",                // C: bitmappro Email login
          record.gingerPassword || "",             // D: bitmappro Password
          record.gingerUsername || "",             // E: Site Username
          "",                                      // F: Status (leave blank for manual review)
          record.labelerId || "",                  // G: Ginger ID
          record.labelerPassword || "",            // H: Ginger Software Pass
          "",                                      // I: Labeler ID #2
          "",                                      // J: LabelerPass #2
          refName,                                 // K: Recruiter (Resolved Name)
          record.facebook || "",                   // L: Facebook Timeline Link
        ]);

        // Mark as seen so a duplicate gingerEmail in the DB isn't appended twice
        existingEmailsMap.set(gingerEmailLower, -1);
      }
    }
    
    // ⚡ Write all updates to existing rows in ONE batch (before appending, so row numbers stay valid)
    if (pendingUpdates.size > 0) {
      applyRowUpdatesBatch(sheet, pendingUpdates);
    }

    // ⚡ Add all new rows in ONE batch operation
    if (rowsToAdd.length > 0) {
      addRowsToSheetBatch(sheet, rowsToAdd);
      console.log("ADDED: " + rowsToAdd.length + " new rows in batch");
    } else {
      console.log("No new rows to add");
    }
    
    console.log("=== POPULATE COMPLETE ===");
    console.log("Total Processed: " + data.length + " | Added: " + rowsToAdd.length + " | Updated: " + updatedCount + " | Skipped (Inactive): " + inactiveSkippedCount);
    
    // Show success alert
    SpreadsheetApp.getUi().alert(
      "✅ Complete!\n\n" +
      "Added: " + rowsToAdd.length + "\n" +
      "Updated: " + updatedCount + "\n" +
      "Skipped (Inactive): " + inactiveSkippedCount
    );
    
  } catch (error) {
    console.log("Error: " + error);
    SpreadsheetApp.getUi().alert("❌ Error: " + error.toString());
  }
}

// =========================================================================
// FETCH ALL PAGES FROM POSTGREST (stops on an empty page, so it works
// regardless of the server's max-rows setting)
// =========================================================================
function fetchAllPages_(baseUrl, headers) {
  const pageSize = 1000;
  const rows = [];
  let offset = 0;

  while (true) {
    const url = baseUrl + "&limit=" + pageSize + "&offset=" + offset;
    const response = UrlFetchApp.fetch(url, { method: "get", headers: headers, muteHttpExceptions: true });
    const code = response.getResponseCode();

    if (code !== 200) {
      return { rows: rows, error: "HTTP " + code + ": " + response.getContentText() };
    }

    const page = JSON.parse(response.getContentText());
    if (!Array.isArray(page)) {
      return { rows: rows, error: "Expected array from PostgREST" };
    }
    if (page.length === 0) break;

    for (let i = 0; i < page.length; i++) rows.push(page[i]);
    offset += page.length;
  }

  return { rows: rows, error: null };
}

// =========================================================================
// BUILD REFERER LOOKUP URLS (chunked to stay under the ~2KB URL limit)
// =========================================================================
function buildRefererLookupUrls_(emails) {
  const maxUrlLength = 1800; // headroom below Apps Script's 2KB limit
  const base = POSTGREST_BASE_URL + "User?select=email,gingerEmail,name&or=";

  // Quote each email so commas/parentheses can't break PostgREST's in.(...) list
  const buildUrl = function(chunk) {
    const list = chunk.map(function(e) { return '"' + e.replace(/"/g, '') + '"'; }).join(",");
    return base + encodeURIComponent("(email.in.(" + list + "),gingerEmail.in.(" + list + "))");
  };

  const urls = [];
  let chunk = [];
  for (let i = 0; i < emails.length; i++) {
    const candidate = chunk.concat([emails[i]]);
    if (chunk.length > 0 && buildUrl(candidate).length > maxUrlLength) {
      urls.push(buildUrl(chunk));
      chunk = [emails[i]];
    } else {
      chunk = candidate;
    }
  }
  if (chunk.length > 0) urls.push(buildUrl(chunk));

  return urls;
}

// =========================================================================
// APPLY UPDATES TO EXISTING ROWS IN ONE BATCH (cols A, B and K)
// =========================================================================
function applyRowUpdatesBatch(sheet, pendingUpdates) {
  let maxRow = UPDATE_START_ROW;
  pendingUpdates.forEach(function(_, rowNumber) {
    if (rowNumber > maxRow) maxRow = rowNumber;
  });
  const numRows = maxRow - UPDATE_START_ROW + 1;

  const abRange = sheet.getRange(UPDATE_START_ROW, 1, numRows, 2);  // A:B
  const kRange = sheet.getRange(UPDATE_START_ROW, 11, numRows, 1);  // K

  // Start from current contents, keeping any formulas so untouched cells don't change
  const abValues = mergeFormulas_(abRange.getValues(), abRange.getFormulas());
  const kValues = mergeFormulas_(kRange.getValues(), kRange.getFormulas());

  pendingUpdates.forEach(function(update, rowNumber) {
    const i = rowNumber - UPDATE_START_ROW;
    // Only update CreatedAt if Column A is currently empty, to protect original joined dates
    if (!abValues[i][0]) {
      abValues[i][0] = update.createdAt;
    }
    abValues[i][1] = update.name;
    kValues[i][0] = update.refName;
  });

  abRange.setValues(abValues);
  kRange.setValues(kValues);
  console.log("Successfully updated " + pendingUpdates.size + " existing rows in batch");
}

function mergeFormulas_(values, formulas) {
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values[i].length; j++) {
      if (formulas[i][j]) values[i][j] = formulas[i][j];
    }
  }
  return values;
}

// =========================================================================
// GET ALL EXISTING EMAILS WITH ROW NUMBERS (Fast O(1) lookup + update)
// =========================================================================
function getExistingEmailsAsMap(sheet) {
  const emailColumnLetter = "C"; // bitmappro Email login (gingerEmail)
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Map();
  
  // Read all emails at once
  const emailRange = sheet.getRange(emailColumnLetter + 2 + ":" + emailColumnLetter + lastRow);
  const emailValues = emailRange.getValues();
  
  // Build Map for O(1) lookups + row numbers for updates
  const emailMap = new Map();
  for (let i = 0; i < emailValues.length; i++) {
    const email = emailValues[i][0].toString().trim().toLowerCase();
    if (email !== "") {
      const actualRowNumber = i + 2; // Row 2 is index 0, Row 3 is index 1, etc.
      emailMap.set(email, actualRowNumber);
    }
  }
  
  console.log("Loaded " + emailMap.size + " existing emails from sheet");
  return emailMap;
}

// =========================================================================
// GET INACTIVE EMAILS SET FROM INACTIVE LABELERS SHEET
// =========================================================================
function getInactiveEmailsAsSet_(ss, sheetName) {
  let inactiveSheet = ss.getSheetByName(sheetName);

  // Fallback: search for any sheet with "Inactive Labelers" in its title
  if (!inactiveSheet) {
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().toLowerCase().indexOf("inactive labelers") !== -1) {
        inactiveSheet = sheets[i];
        break;
      }
    }
  }

  const inactiveEmails = new Set();
  if (!inactiveSheet) {
    console.log("Notice: Inactive sheet '" + sheetName + "' not found.");
    return inactiveEmails;
  }

  const lastRow = inactiveSheet.getLastRow();
  if (lastRow < 2) return inactiveEmails;

  // Col C (Column index 3): bitmappro Email login
  const emailValues = inactiveSheet.getRange(2, 3, lastRow - 1, 1).getValues();
  for (let i = 0; i < emailValues.length; i++) {
    const val = emailValues[i][0];
    if (val) {
      inactiveEmails.add(val.toString().trim().toLowerCase());
    }
  }

  console.log("Loaded " + inactiveEmails.size + " inactive emails from '" + inactiveSheet.getName() + "'");
  return inactiveEmails;
}

// =========================================================================
// ADD MULTIPLE ROWS IN ONE BATCH (Much faster!)
// =========================================================================
function addRowsToSheetBatch(sheet, rows) {
  if (rows.length === 0) return;
  
  try {
    // Single API call to append all rows at once
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    console.log("Successfully added " + rows.length + " rows to sheet");
  } catch (error) {
    console.log("Error adding rows: " + error);
  }
}

// =========================================================================
// 1. MASTER AUTOMATION FUNCTION (Set your Trigger to run this one!)
// =========================================================================
function runAutomatedTasks() {
  console.log("=== STARTING DAILY AUTOMATION ===");
  
  // Step 1: Run the highlighter (passing 'true' tells it to run quietly without UI pop-ups)
  console.log("Executing Phase 1: Highlighting Duplicates...");
  highlightDuplicateEmails(true); 
  
  // Step 2: Run the cleanup script strictly after Step 1 finishes
  console.log("Executing Phase 2: Cleaning up old DUP rows...");
  cleanUpSheet();
  
  console.log("=== DAILY AUTOMATION COMPLETE ===");
}


// =========================================================================
// 2. HIGHLIGHT DUPLICATES
// =========================================================================
function highlightDuplicateEmails(isAutomated) {
  // --- CONFIGURATION ---
  var sheetName = "Xfnite_Account"; 
  var emailColumnLetter = "C";   // Column C for Emails
  var statusColumnLetter = "F";  // Column F for Status
  var startRow = 2;              // Data starts at row 2
  // ---------------------

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    if (!isAutomated) SpreadsheetApp.getUi().alert('Sheet "' + sheetName + '" not found.');
    console.log('Error: Sheet "' + sheetName + '" not found.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) {
    if (!isAutomated) SpreadsheetApp.getUi().alert("No data found to check.");
    console.log("No data found to check.");
    return;
  }

  var emailRange = sheet.getRange(emailColumnLetter + startRow + ":" + emailColumnLetter + lastRow);
  var statusRange = sheet.getRange(statusColumnLetter + startRow + ":" + statusColumnLetter + lastRow);

  var emailValues = emailRange.getValues();
  var statusValues = statusRange.getValues();
  var emailBackgrounds = emailRange.getBackgrounds();
  var statusBackgrounds = statusRange.getBackgrounds();

  var emailGroups = {};

  for (var i = 0; i < emailValues.length; i++) {
    var email = emailValues[i][0].toString().trim().toLowerCase();
    var status = statusValues[i][0].toString().toUpperCase().trim();

    if (email === "") continue; 

    if (!emailGroups[email]) {
      emailGroups[email] = [];
    }
    emailGroups[email].push({ index: i, status: status });
  }

  var duplicateCount = 0;

  for (var email in emailGroups) {
    var rows = emailGroups[email];
    
    if (rows.length < 2) {
      var idx = rows[0].index;
      emailBackgrounds[idx][0] = null;
      statusBackgrounds[idx][0] = null;
      // Clear a stale DUP so cleanUpSheet doesn't delete the only remaining row
      if (rows[0].status === "DUP") statusValues[idx][0] = "";
      continue;
    }

    var winnerIndex = -1;
    var okRow = rows.find(function(r) { return r.status === "OK" });

    if (okRow) {
      winnerIndex = okRow.index;
    } else {
      winnerIndex = rows[rows.length - 1].index;
    }

    for (var k = 0; k < rows.length; k++) {
      var currentIndex = rows[k].index;

      if (currentIndex !== winnerIndex) {
        emailBackgrounds[currentIndex][0] = "#FF0000"; 
        statusValues[currentIndex][0] = "DUP";         
        statusBackgrounds[currentIndex][0] = "#FF0000";
        duplicateCount++;
      } else {
        emailBackgrounds[currentIndex][0] = null;
        statusBackgrounds[currentIndex][0] = null;
        // Clear a stale DUP so cleanUpSheet doesn't delete the kept row
        if (rows[k].status === "DUP") statusValues[currentIndex][0] = "";
      }
    }
  }

  emailRange.setBackgrounds(emailBackgrounds);
  statusRange.setValues(statusValues);
  statusRange.setBackgrounds(statusBackgrounds);

  // Handle alerts based on how the script was run
  if (!isAutomated) {
    if (duplicateCount > 0) {
      SpreadsheetApp.getUi().alert('Done! Processed latest logic. Marked ' + duplicateCount + ' rows as DUP.');
    } else {
      SpreadsheetApp.getUi().alert('No duplicates found.');
    }
  } else {
    console.log("Highlighter finished. Marked " + duplicateCount + " rows as DUP.");
  }
}


// =========================================================================
// 3. CLEAN UP SHEET (Only deletes DUP > 24 hours)
// =========================================================================
function cleanUpSheet() {
  // --- CONFIGURATION ---
  var sheetName = "Xfnite_Account"; 
  var timestampCol = 0; // Column A
  var nameCol = 1;      // Column B 
  var emailCol = 2;     // Column C 
  var statusCol = 5;    // Column F 
  var startRow = 2;     
  // ---------------------

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    console.log('Error: Sheet "' + sheetName + '" not found.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) {
    console.log("No data found to process.");
    return;
  }

  var range = sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn());
  var values = range.getValues();

  var now = new Date();
  var oneDayAgo = now.getTime() - (1 * 24 * 60 * 60 * 1000);

  var deletedCount = 0;

  for (var i = values.length - 1; i >= 0; i--) {
    var rowDate = new Date(values[i][timestampCol]);
    var status = values[i][statusCol].toString().toUpperCase().trim();
    var email = values[i][emailCol];
    var name = values[i][nameCol];
    
    if (isNaN(rowDate.getTime())) continue;

    var shouldDelete = false;
    var deleteReason = "";

    // RULE: Delete ONLY if older than 1 day AND Status IS "DUP"
    if (rowDate.getTime() < oneDayAgo && status === "DUP") {
      shouldDelete = true;
      deleteReason = "Old Duplicate (> 24hrs)";
    }

    if (shouldDelete) {
      var actualRow = startRow + i;
      console.log("DELETING Row " + actualRow + " | Name: " + name + " | Email: " + email + " | Reason: " + deleteReason);
      sheet.deleteRow(actualRow);
      deletedCount++;
    }
  }

  console.log("Cleanup finished: Deleted " + deletedCount + " DUP rows.");
}

// =========================================================================
// 4. AUTOMATIC TRIGGER SETUP (Run this manually ONE TIME)
// =========================================================================
function setupDailyTrigger() {
  var functionName = "runAutomatedTasks";
  
  // Step 1: Delete any existing triggers for this function to prevent duplicates
  var existingTriggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existingTriggers.length; i++) {
    if (existingTriggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(existingTriggers[i]);
      console.log("Deleted old trigger for " + functionName);
    }
  }

  // Step 2: Create the new daily trigger
  // This sets it to run every day between Midnight and 1:00 AM.
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(0) // 0 = Midnight. Change to 1 for 1 AM, 14 for 2 PM, etc.
    .create();

  console.log("Success! A new daily trigger has been created for " + functionName);
  SpreadsheetApp.getUi().alert("Trigger setup complete! 'runAutomatedTasks' will now run automatically every day around midnight.");
}

// =========================================================================
// LOAD ORIGINAL JOINED DATES FROM BACKUP SPREADSHEET
// =========================================================================
const BACKUP_SPREADSHEET_URL_OR_ID = "";

function loadBackupDatesMaps_(sourceOptional) {
  let targetSource = (sourceOptional || BACKUP_SPREADSHEET_URL_OR_ID || "").trim();
  if (!targetSource) {
    targetSource = PropertiesService.getScriptProperties().getProperty("BACKUP_SPREADSHEET_SOURCE") || "";
  }

  if (!targetSource) {
    console.log("Notice: No backup spreadsheet source configured. Using database createdAt.");
    return null;
  }

  try {
    const backupSs = openSpreadsheetSafe_(targetSource);
    const backupSheet = backupSs.getSheetByName("Xfnite_Account");
    if (!backupSheet) {
      console.log("Notice: Sheet 'Xfnite_Account' not found in backup spreadsheet ('" + backupSs.getName() + "').");
      return null;
    }

    const backupLastRow = backupSheet.getLastRow();
    if (backupLastRow < 2) return null;

    console.log("Loading original joined dates from backup (" + (backupLastRow - 1) + " rows)...");
    const backupValues = backupSheet.getRange(2, 1, backupLastRow - 1, 7).getValues();

    const emailToTimestampMap = new Map();
    const idToTimestampMap = new Map();

    for (let i = 0; i < backupValues.length; i++) {
      const ts = backupValues[i][0];
      const email = backupValues[i][2] ? backupValues[i][2].toString().trim().toLowerCase() : "";
      const gingerId = backupValues[i][6] ? backupValues[i][6].toString().trim() : "";

      if (!ts) continue;

      const tsMs = getTimestampMs_(ts);
      if (tsMs === 0) continue;

      // Keep the earliest date for each email/ID in case of multiple duplicate entries
      if (email) {
        const existing = emailToTimestampMap.get(email);
        if (!existing || tsMs < getTimestampMs_(existing)) {
          emailToTimestampMap.set(email, ts);
        }
      }

      if (gingerId) {
        const existingId = idToTimestampMap.get(gingerId);
        if (!existingId || tsMs < getTimestampMs_(existingId)) {
          idToTimestampMap.set(gingerId, ts);
        }
      }
    }

    console.log("Loaded " + emailToTimestampMap.size + " unique emails and " + idToTimestampMap.size + " Ginger IDs from backup.");
    return {
      emailMap: emailToTimestampMap,
      idMap: idToTimestampMap,
      sheetName: backupSheet.getName(),
      ssName: backupSs.getName(),
      source: targetSource
    };
  } catch (err) {
    console.log("Failed to load backup dates: " + err);
    return null;
  }
}

function restoreJoinedDatesFromBackup() {
  const ui = SpreadsheetApp.getUi();

  let targetSource = (BACKUP_SPREADSHEET_URL_OR_ID || "").trim();
  if (!targetSource) {
    targetSource = PropertiesService.getScriptProperties().getProperty("BACKUP_SPREADSHEET_SOURCE") || "";
  }

  const promptText = targetSource
    ? "Current saved backup source is available.\n\nTo use a new one, paste the full URL below, or leave blank and click OK to use the saved one:"
    : "Please paste the full URL of your backup spreadsheet ('Copy of Xfnite Accounts v2') directly from your browser's address bar:";

  const promptResponse = ui.prompt(
    "Restore Joined Dates from Backup",
    promptText,
    ui.ButtonSet.OK_CANCEL
  );

  if (promptResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const userInput = promptResponse.getResponseText().trim();
  if (userInput) {
    targetSource = userInput;
  }

  if (!targetSource) {
    ui.alert("❌ Error: No backup spreadsheet URL or ID provided.");
    return;
  }

  try {
    const backupDates = loadBackupDatesMaps_(targetSource);
    if (!backupDates) {
      ui.alert("❌ Error: Could not load data from backup spreadsheet.");
      return;
    }
    PropertiesService.getScriptProperties().setProperty("BACKUP_SPREADSHEET_SOURCE", targetSource);

    const emailToTimestampMap = backupDates.emailMap;
    const idToTimestampMap = backupDates.idMap;

    // Current active sheet
    const currentSs = SpreadsheetApp.getActiveSpreadsheet();
    const currentSheet = currentSs.getSheetByName("Xfnite_Account");
    if (!currentSheet) {
      ui.alert("❌ Error: Sheet 'Xfnite_Account' not found in current active spreadsheet.");
      return;
    }

    const currentLastRow = currentSheet.getLastRow();
    if (currentLastRow < 2) {
      ui.alert("No data found in current sheet.");
      return;
    }

    // Read Col A:G from current sheet in ONE batch call
    console.log("Reading current sheet (" + (currentLastRow - 1) + " rows)...");
    const currentData = currentSheet.getRange(2, 1, currentLastRow - 1, 7).getValues();
    const colARange = currentSheet.getRange(2, 1, currentLastRow - 1, 1);
    const colAValues = colARange.getValues();

    let restoredCount = 0;
    let alreadyCorrectCount = 0;
    let notFoundCount = 0;

    for (let i = 0; i < currentData.length; i++) {
      const currentTs = colAValues[i][0];
      const email = currentData[i][2] ? currentData[i][2].toString().trim().toLowerCase() : "";
      const gingerId = currentData[i][6] ? currentData[i][6].toString().trim() : "";

      // Match by email first, fallback to Ginger ID
      let backupTs = null;
      if (email && emailToTimestampMap.has(email)) {
        backupTs = emailToTimestampMap.get(email);
      } else if (gingerId && idToTimestampMap.has(gingerId)) {
        backupTs = idToTimestampMap.get(gingerId);
      }

      if (backupTs) {
        const currentMs = getTimestampMs_(currentTs);
        const backupMs = getTimestampMs_(backupTs);

        const currentYear = currentMs > 0 ? new Date(currentMs).getFullYear() : 0;
        // Restore if current is empty, or current is 2026/future, or backup is older
        const shouldRestore = (currentMs === 0) || (backupMs !== currentMs && (currentYear >= 2026 || backupMs < currentMs));

        if (shouldRestore) {
          colAValues[i][0] = backupTs;
          restoredCount++;
        } else {
          alreadyCorrectCount++;
        }
      } else {
        notFoundCount++;
      }
    }

    // Write all updated timestamps back to Column A in ONE batch operation
    if (restoredCount > 0) {
      colARange.setValues(colAValues);
      console.log("Successfully restored " + restoredCount + " timestamps in Column A.");
    }

    ui.alert(
      "✅ Restore Complete!",
      "Summary:\n\n" +
      "• Restored with backup date: " + restoredCount + " rows\n" +
      "• Already older / correct: " + alreadyCorrectCount + " rows\n" +
      "• Not found in backup (left untouched): " + notFoundCount + " rows",
      ui.ButtonSet.OK
    );

  } catch (err) {
    console.log("Restore error: " + err);
    ui.alert("❌ Error restoring timestamps: " + err.toString());
  }
}

function getTimestampMs_(val) {
  if (!val) return 0;
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();

  var str = val.toString().trim();
  if (!str) return 0;

  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.getTime();

  var m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10) - 1;
    var year = parseInt(m[3], 10);
    var hour = m[4] ? parseInt(m[4], 10) : 0;
    var min = m[5] ? parseInt(m[5], 10) : 0;
    var sec = m[6] ? parseInt(m[6], 10) : 0;
    var d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  return 0;
}

function openSpreadsheetSafe_(source) {
  source = (source || "").trim();
  // Extract spreadsheet ID if a full URL was provided
  const match = source.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = match ? match[1] : source;

  try {
    return SpreadsheetApp.openById(sheetId);
  } catch (idErr) {
    if (source.indexOf("http") === 0) {
      return SpreadsheetApp.openByUrl(source);
    }
    throw idErr;
  }
}


// =========================================================================
// UPDATED: MENU WITH NEW FUNCTIONS
// =========================================================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('⚡  Actions')
    .addItem('📥 Fetch & Populate (Check Duplicates)', 'getPassersAndPopulate')
    .addItem('🔴 Highlight Duplicates', 'highlightDuplicateEmails')
    .addItem('🧹 Cleanup Old DUPs', 'cleanUpSheet')
    .addItem('▶️  Run Full Automation', 'runAutomatedTasks')
    .addSeparator()
    .addItem('⏪ Restore Joined Dates from Backup', 'restoreJoinedDatesFromBackup')
    .addSeparator()
    .addItem('⚙️  Setup Daily Trigger', 'setupDailyTrigger')
    .addToUi();
  
  ui.alert(
    'Status Guide',
    'Green > need send verification done script\n' +
    'Orange > cannot add gc and cant send verification done script\n' +
    'Purple > cannot add gc but sent verification done script\n' +
    'Yellow > all complete\n' +
    'Red > dummy/poser/dump (do not verify if did not use real fb)',
    ui.ButtonSet.OK
  );
}

// const POSTGREST_BASE_URL = 'https://api.xfnite.cloud/';

// function getPostgrestToken_() {
//   return PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN') || '';
// }

// function getPassers() {
//   const webhookUrl = "https://n8n.heysnaply.com/webhook/fc9b1edd-0687-48db-b14b-eba73b323410";
  
//   try {
//     const response = UrlFetchApp.fetch(webhookUrl, {
//       method: "get",
//       muteHttpExceptions: true
//     });
    
//     const responseCode = response.getResponseCode();
//     const responseText = response.getContentText();
    
//     Logger.log("Response Code: " + responseCode);
//     Logger.log("Response: " + responseText);
    
//     return responseText;
    
//   } catch (error) {
//     Logger.log("Error calling webhook: " + error);
//     return null;
//   }
// }

// // =========================================================================
// // 1. MASTER AUTOMATION FUNCTION (Set your Trigger to run this one!)
// // =========================================================================
// function runAutomatedTasks() {
//   console.log("=== STARTING DAILY AUTOMATION ===");
  
//   // Step 1: Run the highlighter (passing 'true' tells it to run quietly without UI pop-ups)
//   console.log("Executing Phase 1: Highlighting Duplicates...");
//   highlightDuplicateEmails(true); 
  
//   // Step 2: Run the cleanup script strictly after Step 1 finishes
//   console.log("Executing Phase 2: Cleaning up old DUP rows...");
//   cleanUpSheet();
  
//   console.log("=== DAILY AUTOMATION COMPLETE ===");
// }


// // =========================================================================
// // 2. HIGHLIGHT DUPLICATES
// // =========================================================================
// function highlightDuplicateEmails(isAutomated) {
//   // --- CONFIGURATION ---
//   var sheetName = "Xfnite_Account"; 
//   var emailColumnLetter = "C";   // Column C for Emails
//   var statusColumnLetter = "F";  // Column F for Status
//   var startRow = 2;              // Data starts at row 2
//   // ---------------------

//   var ss = SpreadsheetApp.getActiveSpreadsheet();
//   var sheet = ss.getSheetByName(sheetName);

//   if (!sheet) {
//     if (!isAutomated) SpreadsheetApp.getUi().alert('Sheet "' + sheetName + '" not found.');
//     console.log('Error: Sheet "' + sheetName + '" not found.');
//     return;
//   }

//   var lastRow = sheet.getLastRow();
//   if (lastRow < startRow) {
//     if (!isAutomated) SpreadsheetApp.getUi().alert("No data found to check.");
//     console.log("No data found to check.");
//     return;
//   }

//   var emailRange = sheet.getRange(emailColumnLetter + startRow + ":" + emailColumnLetter + lastRow);
//   var statusRange = sheet.getRange(statusColumnLetter + startRow + ":" + statusColumnLetter + lastRow);

//   var emailValues = emailRange.getValues();
//   var statusValues = statusRange.getValues();
//   var emailBackgrounds = emailRange.getBackgrounds();
//   var statusBackgrounds = statusRange.getBackgrounds();

//   var emailGroups = {};

//   for (var i = 0; i < emailValues.length; i++) {
//     var email = emailValues[i][0].toString().trim().toLowerCase();
//     var status = statusValues[i][0].toString().toUpperCase().trim();

//     if (email === "") continue; 

//     if (!emailGroups[email]) {
//       emailGroups[email] = [];
//     }
//     emailGroups[email].push({ index: i, status: status });
//   }

//   var duplicateCount = 0;

//   for (var email in emailGroups) {
//     var rows = emailGroups[email];
    
//     if (rows.length < 2) {
//       var idx = rows[0].index;
//       emailBackgrounds[idx][0] = null;  
//       statusBackgrounds[idx][0] = null; 
//       continue;
//     }

//     var winnerIndex = -1;
//     var okRow = rows.find(function(r) { return r.status === "OK" });

//     if (okRow) {
//       winnerIndex = okRow.index;
//     } else {
//       winnerIndex = rows[rows.length - 1].index;
//     }

//     for (var k = 0; k < rows.length; k++) {
//       var currentIndex = rows[k].index;

//       if (currentIndex !== winnerIndex) {
//         emailBackgrounds[currentIndex][0] = "#FF0000"; 
//         statusValues[currentIndex][0] = "DUP";         
//         statusBackgrounds[currentIndex][0] = "#FF0000";
//         duplicateCount++;
//       } else {
//         emailBackgrounds[currentIndex][0] = null;
//         statusBackgrounds[currentIndex][0] = null;
//       }
//     }
//   }

//   emailRange.setBackgrounds(emailBackgrounds);
//   statusRange.setValues(statusValues);
//   statusRange.setBackgrounds(statusBackgrounds);

//   // Handle alerts based on how the script was run
//   if (!isAutomated) {
//     if (duplicateCount > 0) {
//       SpreadsheetApp.getUi().alert('Done! Processed latest logic. Marked ' + duplicateCount + ' rows as DUP.');
//     } else {
//       SpreadsheetApp.getUi().alert('No duplicates found.');
//     }
//   } else {
//     console.log("Highlighter finished. Marked " + duplicateCount + " rows as DUP.");
//   }
// }


// // =========================================================================
// // 3. CLEAN UP SHEET (Only deletes DUP > 24 hours)
// // =========================================================================
// function cleanUpSheet() {
//   // --- CONFIGURATION ---
//   var sheetName = "Xfnite_Account"; 
//   var timestampCol = 0; // Column A
//   var nameCol = 1;      // Column B 
//   var emailCol = 2;     // Column C 
//   var statusCol = 5;    // Column F 
//   var startRow = 2;     
//   // ---------------------

//   var ss = SpreadsheetApp.getActiveSpreadsheet();
//   var sheet = ss.getSheetByName(sheetName);

//   if (!sheet) {
//     console.log('Error: Sheet "' + sheetName + '" not found.');
//     return;
//   }

//   var lastRow = sheet.getLastRow();
//   if (lastRow < startRow) {
//     console.log("No data found to process.");
//     return;
//   }

//   var range = sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn());
//   var values = range.getValues();

//   var now = new Date();
//   var oneDayAgo = now.getTime() - (1 * 24 * 60 * 60 * 1000);

//   var deletedCount = 0;

//   for (var i = values.length - 1; i >= 0; i--) {
//     var rowDate = new Date(values[i][timestampCol]);
//     var status = values[i][statusCol].toString().toUpperCase().trim();
//     var email = values[i][emailCol];
//     var name = values[i][nameCol];
    
//     if (isNaN(rowDate.getTime())) continue;

//     var shouldDelete = false;
//     var deleteReason = "";

//     // RULE: Delete ONLY if older than 1 day AND Status IS "DUP"
//     if (rowDate.getTime() < oneDayAgo && status === "DUP") {
//       shouldDelete = true;
//       deleteReason = "Old Duplicate (> 24hrs)";
//     }

//     if (shouldDelete) {
//       var actualRow = startRow + i;
//       console.log("DELETING Row " + actualRow + " | Name: " + name + " | Email: " + email + " | Reason: " + deleteReason);
//       sheet.deleteRow(actualRow);
//       deletedCount++;
//     }
//   }

//   console.log("Cleanup finished: Deleted " + deletedCount + " DUP rows.");
// }
// // =========================================================================
// // 4. AUTOMATIC TRIGGER SETUP (Run this manually ONE TIME)
// // =========================================================================
// function setupDailyTrigger() {
//   var functionName = "runAutomatedTasks";
  
//   // Step 1: Delete any existing triggers for this function to prevent duplicates
//   var existingTriggers = ScriptApp.getProjectTriggers();
//   for (var i = 0; i < existingTriggers.length; i++) {
//     if (existingTriggers[i].getHandlerFunction() === functionName) {
//       ScriptApp.deleteTrigger(existingTriggers[i]);
//       console.log("Deleted old trigger for " + functionName);
//     }
//   }

//   // Step 2: Create the new daily trigger
//   // This sets it to run every day between Midnight and 1:00 AM.
//   ScriptApp.newTrigger(functionName)
//     .timeBased()
//     .everyDays(1)
//     .atHour(0) // 0 = Midnight. Change to 1 for 1 AM, 14 for 2 PM, etc.
//     .create();

//   console.log("Success! A new daily trigger has been created for " + functionName);
//   SpreadsheetApp.getUi().alert("Trigger setup complete! 'runAutomatedTasks' will now run automatically every day around midnight.");
// }


// function onOpen() {
//   var ui = SpreadsheetApp.getUi();

//   ui.createMenu('⚡  Actions')
//     .addItem('Run GetPassers', 'getPassers')
//     .addToUi();
  
//   ui.alert(
//     'Status Guide',
//     'Green > need send verification done script\n' +
//     'Orange > cannot add gc and cant send verification done script\n' +
//     'Purple > cannot add gc but sent verification done script\n' +
//     'Yellow > all complete\n' +
//     'Red > dummy/poser/dump (do not verify if did not use real fb)',
//     ui.ButtonSet.OK
//   );
// }