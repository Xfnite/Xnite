// This creates a custom menu at the very top of your Google Sheet
function previewSelectedImage() {
    var sheet = SpreadsheetApp.getActiveSheet();
    var range = sheet.getActiveCell();

    // Checks if you are currently highlighting a cell in Column Y (25)
    if (range.getColumn() === 25) {
        var row = range.getRow();

        // Grabs the text link from Column P (16) on that same row
        var urlValue = sheet.getRange(row, 16).getValue().toString().trim();

        if (!urlValue) {
            SpreadsheetApp.getUi().alert('Error: Column P is empty on this row!');
            return;
        }

        // Opens the preview window
        var htmlOutput = HtmlService
            .createHtmlOutput('<div style="display:flex; justify-content:center; align-items:center; height:100%; margin:0; padding:0; background:#f5f5f5;"><img src="' + urlValue + '" style="max-width:100%; max-height:100%; object-fit:contain;"></div>')
            .setWidth(700)
            .setHeight(700);
        SpreadsheetApp.getUi().showModelessDialog(htmlOutput, 'Large Image Preview');
    } else {
        SpreadsheetApp.getUi().alert('Please click on a cell in Column Y first!');
    }
}

/**
 * 1. CUSTOM MENU
 */
function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('Database Sync')
        .addItem('⬇️ PULL: Database to Claim Form', 'pullDataToClaimForm')
        .addSeparator()
        .addItem('💸 PUSH: Salary to Database (SINGLE ROW)', 'pushSalaryToDatabase')
        .addItem('🚀 PUSH ALL: All Salaries to Database', 'pushAllSalariesToDatabase')
        .addItem('⚠️ PUSH ALL (Below 1250): Ignore 1250 Limit', 'pushAllSalariesIgnoreMinimum')
        .addItem('⚡ FORCE PUSH ALL: Ignore Pushed/Sent', 'forcePushAllSalariesToDatabase')
        .addSeparator()
        .addItem('🔄 UPDATE: Final Sheet from Raw', 'updateCopyOfFinalColumnD')
        .addItem('📊 BULK UPDATE: All Statuses to DB', 'bulkUpdateAllStatuses')
        .addItem('💰 BACKFILL: Fill Logs for Already Sent Rows', 'backfillSentLogs')
        .addItem('🔧 AUTO-FIX: Wrong Emails', 'fixIncorrectEmails')
        .addItem('Preview Selected Image', 'previewSelectedImage')
        .addToUi();
}

/**
 * Helper to log actions to the "Sync Logs" tab
 */
function logSyncActivity(type, details) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName("Sync Logs");

    if (!logSheet) {
        logSheet = ss.insertSheet("Sync Logs");
        logSheet.appendRow(["Timestamp", "Type", "Details"]);
        logSheet.getRange("A1:C1").setFontWeight("bold");
    }

    const timestampStr = new Date().toLocaleString();
    logSheet.appendRow([timestampStr, type, details]);
}

/**
 * Helper to get Push Marker Column Index
 */
function getPushMarkerColIdx(headers) {
    for (let i = 0; i < headers.length; i++) {
        if (String(headers[i]).toLowerCase().includes("push status")) {
            return i; // 0-indexed for array lookups
        }
    }
    return -1;
}

/**
 * Helper to get Raw Computation map from the RAWCOMPUTATION sheet
 */
function getRawComputationDataMap() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawSheet = ss.getSheetByName("RAWCOMPUTATION");
    if (!rawSheet) return {};

    const values = rawSheet.getDataRange().getValues();
    if (values.length < 1) return {};

    const headersRow = values[0];
    const emailIdx = headersRow.indexOf("bitmappro Email login:");

    if (emailIdx === -1) return {};

    const rawCols = [
        "Hours:", "Benchmark:", "Raw", "Filter", "referral fee",
        "Platform Fee:", "Processing Fee:", "Worktime QUOTA:",
        "TLcalc:", "True Value:", "Unclaimed:", "Final Payment:"
    ];

    const colIndices = {};
    rawCols.forEach(col => {
        colIndices[col] = headersRow.indexOf(col);
    });

    const dataMap = {};
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const email = String(row[emailIdx]).trim().toLowerCase();
        if (!email) continue;

        let rawComputation = {};
        rawCols.forEach(col => {
            if (colIndices[col] !== -1) {
                rawComputation[col] = row[colIndices[col]];
            }
        });

        dataMap[email] = rawComputation;
    }

    return dataMap;
}

/**
 * Safely turns a sheet cell into a number.
 */
function parseCurrencyValue(rawValue) {
    if (typeof rawValue === 'number') {
        return { value: rawValue, raw: rawValue };
    }
    const str = String(rawValue == null ? "" : rawValue).trim();
    if (str === "") {
        return { value: 0, raw: str };
    }
    const cleaned = str.replace(/[^0-9.\-]/g, '');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) {
        return { value: null, raw: str };
    }
    return { value: parsed, raw: str };
}

/**
 * Helper to get all emails from the X1.INNERCOUNCIL sheet.
 */
function getInnerCouncilEmails(ss) {
    const icSheet = ss.getSheetByName("X1.INNERCOUNCIL");
    if (!icSheet) return new Set();

    const icValues = icSheet.getDataRange().getValues();
    const icHeaders = icValues.length > 0 ? icValues[0] : [];
    const icEmailIdx = icHeaders.indexOf("gingeremail");

    if (icEmailIdx === -1) return new Set();

    const emails = new Set();
    for (let i = 1; i < icValues.length; i++) {
        const email = String(icValues[i][icEmailIdx]).trim().toLowerCase();
        if (email) emails.add(email);
    }

    return emails;
}

/**
 * HELPER: Build a map of gingerEmail -> Name by scanning the other tabs
 */
function buildEmailToNameMap(ss) {
    const sheetNames = ["FINAL", "X1.INNERCOUNCIL", "RAWCOMPUTATION"];
    const nameMap = {};

    sheetNames.forEach(sheetName => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;

        const values = sheet.getDataRange().getValues();
        if (values.length < 2) return;

        const headerRow = values[0].map(h => String(h).trim().toLowerCase());

        let nameIdx = -1;
        let emailIdx = -1;

        if (sheetName === "FINAL") {
            nameIdx = headerRow.findIndex(h => h.includes("full name"));
            emailIdx = headerRow.findIndex(h => h.includes("bitmappro email"));
        } else if (sheetName === "X1.INNERCOUNCIL") {
            nameIdx = headerRow.indexOf("name:");
            emailIdx = headerRow.indexOf("gingeremail");
        } else if (sheetName === "RAWCOMPUTATION") {
            nameIdx = headerRow.indexOf("name:");
            emailIdx = headerRow.indexOf("bitmappro email login:");
        }

        if (nameIdx !== -1 && emailIdx !== -1) {
            for (let i = 1; i < values.length; i++) {
                const name = String(values[i][nameIdx]).trim();
                const email = String(values[i][emailIdx]).trim().toLowerCase();

                if (email && name && name !== "#N/A" && !nameMap[email]) {
                    nameMap[email] = name;
                }
            }
        }
    });

    return nameMap;
}

/**
 * 2. PULL FUNCTION (Maps true name to Col A, and Payee Name to Col AF)
 */
function autoPullOnOpen() {
    pullDataToClaimForm(true);
}

function pullDataToClaimForm(isAuto = false) {
    const ui = SpreadsheetApp.getUi();
    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');

    if (!token) return ui.alert("Setup Error: Please add your POSTGREST_TOKEN in the Apps Script Project Settings.");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const finalSheet = ss.getSheetByName("FINAL");
    if (!finalSheet) return ui.alert("Error: 'FINAL' sheet not found.");

    const t3Value = String(finalSheet.getRange("T3").getValue()).trim();
    if (!t3Value) return ui.alert("Cutoff Error: T3 in the 'FINAL' sheet is empty.");

    const t3Encoded = encodeURIComponent(t3Value);
    const headers = { "Authorization": "Bearer " + token, "Accept": "application/json" };
    const options = { "method": "GET", "headers": headers, "muteHttpExceptions": true };

    try {
        const BASE_URL = "https://api.xfnite.cloud";

        const paymentRes = UrlFetchApp.fetch(BASE_URL + "/PaymentDetails?select=email,payeeName,lastName,paymentMethod", options);
        const userRes = UrlFetchApp.fetch(BASE_URL + "/User?select=email,gingerEmail,role,name,firstName,lastName", options);
        // Fetch all IncomeHistory (no t3Value in URL to avoid URLFetch URL length limit),
        // then filter by _note1 in-memory.
        const historyUrl = BASE_URL + `/IncomeHistory?select=id,email,amountPaid,createdAt,status,rawComputation`;
        const historyRes = UrlFetchApp.fetch(historyUrl, options);

        if (paymentRes.getResponseCode() !== 200) return ui.alert(`Payment API Error: ${paymentRes.getContentText()}`);
        if (historyRes.getResponseCode() !== 200) return ui.alert(`History API Error: ${historyRes.getContentText()}`);

        const dbPayments = JSON.parse(paymentRes.getContentText());
        const dbUsers = JSON.parse(userRes.getContentText());
        let dbHistoryAll = JSON.parse(historyRes.getContentText());
        if (!Array.isArray(dbHistoryAll)) dbHistoryAll = [];
        // Filter in-memory by _note1 === t3Value
        let dbHistory = dbHistoryAll.filter(r => String((r.rawComputation || {})._note1 || "").trim() === t3Value.trim());

        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ClaimForm1");
        if (!sheet) return ui.alert("Error: 'ClaimForm1' sheet not found.");
        const maxRow = sheet.getLastRow();

        // Safely calculate the true last row based on Column D (4)
        let trueLastRow = 1;
        if (maxRow > 0) {
            const dValues = sheet.getRange(1, 4, maxRow, 1).getValues();
            for (let i = dValues.length - 1; i >= 0; i--) {
                if (String(dValues[i][0]).trim() !== "") {
                    trueLastRow = i + 1;
                    break;
                }
            }
        }
        const startRow = trueLastRow + 1;

        // Map existing IDs to their row indices so we can UPDATE them instead of skipping them
        const idRowMap = new Map();
        if (maxRow > 1) {
            const idValuesT = sheet.getRange(2, 20, maxRow - 1, 1).getValues();
            for (let i = 0; i < idValuesT.length; i++) {
                const val = String(idValuesT[i][0]).trim();
                if (val && val !== "#N/A") {
                    idRowMap.set(val, i + 2); // +2 because range starts at row 2
                }
            }
        }

        const pulledRecords = [];
        let updatedCount = 0;

        dbHistory.forEach(h => {
            const pay = dbPayments.find(p => p.email === h.email) || {};
            const usr = dbUsers.find(u => u.email === h.email) || {};
            const salary = Math.round(h.amountPaid || 0);

            const userGingerEmail = String(usr.gingerEmail || "").trim().toLowerCase();

            let finalUserName = usr.name || "";
            if (usr.firstName || usr.lastName) {
                finalUserName = [usr.firstName, usr.lastName].filter(Boolean).join(" ");
            }

            let fullName = pay.payeeName || "";
            if (pay.lastName) {
                fullName = fullName ? (fullName + " " + pay.lastName) : pay.lastName;
            }

            if (idRowMap.has(String(h.id).trim())) {
                const rowToUpdate = idRowMap.get(String(h.id).trim());
                sheet.getRange(rowToUpdate, 1, 1, 4).setValues([[finalUserName, usr.gingerEmail || "", salary, pay.paymentMethod || ""]]);

                // 🔹 UPDATED: Write Status to Column AG (33)
                sheet.getRange(rowToUpdate, 33, 1, 1).setValue(h.status || "Pending");

                sheet.getRange(rowToUpdate, 31, 1, 1).setValue(usr.role || "");
                sheet.getRange(rowToUpdate, 32, 1, 1).setValue(fullName); // Write Payee Name to Column AF (32)
                updatedCount++;
            } else {
                pulledRecords.push({
                    id: h.id || "",
                    name: finalUserName,
                    gingeremail: usr.gingerEmail || "",
                    salary: salary,
                    method: pay.paymentMethod || "",
                    status: h.status || "Pending",
                    timestamp: h.createdAt || "",
                    role: usr.role || "",
                    mopName: fullName
                });
            }
        });

        if (pulledRecords.length > 0) {
            const colAToD = [], statuses = [], timestamps = [], ids = [], roles = [], mopNames = [];

            pulledRecords.forEach(rec => {
                colAToD.push([rec.name, rec.gingeremail, rec.salary, rec.method]);
                let ts = rec.timestamp;
                if (ts) {
                    const d = new Date(ts);
                    if (!isNaN(d.getTime())) ts = d.toLocaleString();
                }
                statuses.push([rec.status]);
                timestamps.push([ts]);
                ids.push([rec.id]);
                roles.push([rec.role]);
                mopNames.push([rec.mopName]);
            });

            sheet.getRange(startRow, 1, colAToD.length, 4).setValues(colAToD);

            // 🔹 UPDATED: Write Array to Column AG (33)
            sheet.getRange(startRow, 33, statuses.length, 1).setValues(statuses);

            sheet.getRange(startRow, 10, timestamps.length, 1).setValues(timestamps);
            sheet.getRange(startRow, 20, ids.length, 1).setValues(ids);
            sheet.getRange(startRow, 31, roles.length, 1).setValues(roles);
            sheet.getRange(startRow, 32, mopNames.length, 1).setValues(mopNames); // Write Array to Column AF
        }

        if (isAuto) {
            SpreadsheetApp.getActiveSpreadsheet().toast(`✅ Updated: ${updatedCount} | ✅ Inserted: ${pulledRecords.length}`, 'Pull Complete', 8);
        } else {
            ui.alert('Pull Complete', `✅ Updated existing claims: ${updatedCount}\n✅ Inserted new claims: ${pulledRecords.length}`, ui.ButtonSet.OK);
        }
    } catch (error) {
        if (isAuto) {
            SpreadsheetApp.getActiveSpreadsheet().toast(error.toString(), 'Execution Error', 10);
        } else {
            ui.alert("Execution Error: " + error.toString());
        }
    }
}


/**
 * 3. PUSH FUNCTION (SINGLE ROW) - ROBUST RE-PUSH SUPPORT
 */
function pushSalaryToDatabase() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const sheetName = sheet.getName();

    if (sheetName !== "FINAL" && sheetName !== "X1.INNERCOUNCIL") return ui.alert("Action Denied: Only for 'FINAL' or 'X1.INNERCOUNCIL' tabs.");

    const activeRow = sheet.getActiveCell().getRow();
    if (activeRow === 1) return ui.alert("Please select a user row.");

    const finalSheet = ss.getSheetByName("FINAL");
    const t3Value = finalSheet ? String(finalSheet.getRange("T3").getValue()).trim() : "";
    if (!t3Value) return ui.alert("Missing T3 Cutoff value in FINAL sheet.");

    const emailHeaderName = (sheetName === "FINAL") ? "bitmappro Email login:" : "gingeremail";
    const salaryHeaderName = (sheetName === "FINAL") ? "Final Payment:" : "Total Payment with Salary:";
    const bonusHeaderName = "Payment + Bonus:";

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headersRow = values[0];

    const gingerEmailIdx = headersRow.indexOf(emailHeaderName);
    const salaryIdx = headersRow.indexOf(salaryHeaderName);
    const bonusIdx = headersRow.indexOf(bonusHeaderName);
    const statusIdx = headersRow.findIndex(h => String(h).toUpperCase().includes("STATUS") && !String(h).toUpperCase().includes("PUSH"));
    const pushMarkerIdx = getPushMarkerColIdx(headersRow);
    const idColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "id");
    const pushDateColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "push date");
    const errorColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "error");

    if (gingerEmailIdx === -1 || salaryIdx === -1) return ui.alert(`Missing columns.`);

    const pushStatus = String(values[activeRow - 1][pushMarkerIdx]).trim();
    if (pushStatus.toLowerCase() === "pushed") {
        return ui.alert("Action Denied", "This row is marked as 'Pushed'. To re-push and update the database, simply clear the 'Pushed' cell and try again.", ui.ButtonSet.OK);
    }

    const rowGingerEmail = String(values[activeRow - 1][gingerEmailIdx]).trim();

    if (sheetName === "FINAL") {
        const innerCouncilEmails = getInnerCouncilEmails(ss);
        if (innerCouncilEmails.has(rowGingerEmail.toLowerCase())) {
            if (errorColIdx !== -1) sheet.getRange(activeRow, errorColIdx + 1).setValue("Inner Council");
            return ui.alert("Action Denied", `This user (${rowGingerEmail}) is an Inner Council member.\n\nTheir salary should only be pushed from the X1.INNERCOUNCIL tab!`, ui.ButtonSet.OK);
        }
    }

    const rowStatus = String(values[activeRow - 1][statusIdx]).trim();
    const rawBonusCell = (bonusIdx !== -1) ? values[activeRow - 1][bonusIdx] : "";
    const rawSalaryCell = values[activeRow - 1][salaryIdx];

    const salaryResult = (sheetName === "FINAL" && String(rawBonusCell).trim() !== "") ? parseCurrencyValue(rawBonusCell) : parseCurrencyValue(rawSalaryCell);
    if (salaryResult.value === null) {
        if (errorColIdx !== -1) sheet.getRange(activeRow, errorColIdx + 1).setValue("Invalid salary amount");
        return ui.alert(`Push Aborted: Could not read a valid number.`);
    }

    const calculatedSalary = salaryResult.value;
    const rawComputationMap = getRawComputationDataMap();

    const rawComputation = Object.assign({}, rawComputationMap[rowGingerEmail.toLowerCase()] || {});

    const tmBonusIdx = headersRow.indexOf("TM Bonus Payment:");
    if (tmBonusIdx !== -1) {
        const tmBonusValue = values[activeRow - 1][tmBonusIdx];
        if (String(tmBonusValue).trim() !== "") {
            const parsedBonus = parseCurrencyValue(tmBonusValue);
            if (parsedBonus.value !== null) {
                rawComputation["TM Bonus Payment:"] = parsedBonus.value;
            }
        }
    }

    // Inner Council only: show their Previous Unclaimed in the computation details
    const prevUnclaimedIdx = (sheetName === "X1.INNERCOUNCIL") ? headersRow.indexOf("Previous Unclaimed:") : -1;
    if (prevUnclaimedIdx !== -1) {
        const prevUnclaimedValue = values[activeRow - 1][prevUnclaimedIdx];
        if (String(prevUnclaimedValue).trim() !== "") {
            const parsedPrevUnclaimed = parseCurrencyValue(prevUnclaimedValue);
            if (parsedPrevUnclaimed.value !== null) {
                rawComputation["Previous Unclaimed:"] = parsedPrevUnclaimed.value;
            }
        }
    }

    let n1 = t3Value;
    let n2 = finalSheet ? String(finalSheet.getRange("T7").getValue()).trim() : "";
    let n3 = finalSheet ? String(finalSheet.getRange("T9").getValue()).trim() : "";
    if (n1) rawComputation["_note1"] = n1;
    if (n2) rawComputation["_note2"] = n2;
    if (n3) rawComputation["_note3"] = n3;

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" };
    const BASE_URL = "https://api.xfnite.cloud";

    try {
        const userRes = UrlFetchApp.fetch(BASE_URL + `/User?gingerEmail=eq.${encodeURIComponent(rowGingerEmail)}&select=email,status`, { "method": "GET", "headers": headers });
        const userData = JSON.parse(userRes.getContentText());
        if (userData.length === 0) {
            if (errorColIdx !== -1) sheet.getRange(activeRow, errorColIdx + 1).setValue("No database user found");
            return ui.alert("Database Error: No user found for this email identifier.");
        }

        if (userData[0].status && userData[0].status.toLowerCase() === "deactivated") {
            if (errorColIdx !== -1) sheet.getRange(activeRow, errorColIdx + 1).setValue("Deactivated");
            return ui.alert("Action Denied: This user is deactivated in the database.");
        }

        const primaryEmail = userData[0].email;

        // Fetch IncomeHistory by email only (avoids URL length limit from encoding t3Value in the query string),
        // then filter by _note1 in-memory.
        const ihUrl = BASE_URL + `/IncomeHistory?select=id,rawComputation&email=eq.${encodeURIComponent(primaryEmail)}`;
        const ihRes = UrlFetchApp.fetch(ihUrl, { method: "GET", headers: headers });
        const ihAll = JSON.parse(ihRes.getContentText());
        const ihData = ihAll.filter(r => {
            const rc = r.rawComputation || {};
            return String(rc._note1 || "").trim() === t3Value.trim();
        });

        let dbRecordId = null;
        let targetTable = "";

        if (ihData.length > 0) {
            dbRecordId = ihData[0].id;
            targetTable = "IncomeHistory";
            const patchPayload = { amountPaid: calculatedSalary, rawComputation: rawComputation, updatedAt: new Date().toISOString() };
            UrlFetchApp.fetch(BASE_URL + `/IncomeHistory?id=eq.${dbRecordId}`, { method: "PATCH", headers: headers, payload: JSON.stringify(patchPayload) });
        } else {
            targetTable = "CurrentIncome";
            const payload = { "email": primaryEmail, "estimatedAmount": calculatedSalary, "status": rowStatus, "rawComputation": rawComputation, "updatedAt": new Date().toISOString() };

            let incomeRes = UrlFetchApp.fetch(BASE_URL + `/CurrentIncome?email=eq.${encodeURIComponent(primaryEmail)}`, {
                method: "PATCH", headers: { ...headers, "Prefer": "return=representation" }, payload: JSON.stringify(payload), muteHttpExceptions: true
            });

            if (incomeRes.getResponseCode() === 200) {
                const updatedRows = JSON.parse(incomeRes.getContentText());
                if (updatedRows.length === 0) {
                    const newId = Utilities.getUuid();
                    const postPayload = { ...payload, id: newId, createdAt: new Date().toISOString() };
                    UrlFetchApp.fetch(BASE_URL + "/CurrentIncome", { method: "POST", headers: { ...headers, "Prefer": "return=minimal" }, payload: JSON.stringify(postPayload), muteHttpExceptions: true });
                    dbRecordId = newId;
                } else {
                    dbRecordId = updatedRows[0].id;
                }
            }
        }

        sheet.getRange(activeRow, pushMarkerIdx + 1).setValue("Pushed");
        if (idColIdx !== -1) sheet.getRange(activeRow, idColIdx + 1).setValue(dbRecordId);
        if (pushDateColIdx !== -1) sheet.getRange(activeRow, pushDateColIdx + 1).setValue(new Date());
        if (errorColIdx !== -1) sheet.getRange(activeRow, errorColIdx + 1).setValue("");

        ui.alert(`Success! Updated ₱${calculatedSalary} for ${rowGingerEmail} in ${targetTable}.`);
    } catch (error) {
        const errMsg = error.toString();
        const errStack = error.stack ? String(error.stack).substring(0, 500) : "(no stack)";
        const logDetail = `Function: pushSalaryToDatabase | Email: ${rowGingerEmail || "(unknown)"} | Row: ${activeRow || "(unknown)"}\nError: ${errMsg}\nStack: ${errStack}`;
        logSyncActivity("PUSH ERROR", logDetail);
        if (typeof errorColIdx !== "undefined" && errorColIdx !== -1) {
            try { sheet.getRange(activeRow, errorColIdx + 1).setValue(errMsg.substring(0, 200)); } catch (e2) { }
        }
        ui.alert("Execution Error", `${errMsg}\n\nFull details logged to 'Sync Logs' tab.`, ui.ButtonSet.OK);
    }
}

/**
 * 3.5 PUSH ALL FUNCTION - ROBUST RE-PUSH SUPPORT
 */
function pushAllSalariesToDatabase() {
    executePushAll(true);
}

function pushAllSalariesIgnoreMinimum() {
    executePushAll(false);
}

function executePushAll(enforceMinimum) {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const sheetName = sheet.getName();

    if (sheetName !== "FINAL" && sheetName !== "X1.INNERCOUNCIL") return ui.alert("Action Denied: Only for 'FINAL' or 'X1.INNERCOUNCIL' tabs.");

    const finalSheet = ss.getSheetByName("FINAL");
    const t3Value = finalSheet ? String(finalSheet.getRange("T3").getValue()).trim() : "";
    if (!t3Value) return ui.alert("Missing T3 Cutoff value in FINAL sheet.");

    const response = ui.alert(
        enforceMinimum ? 'Confirm Push All' : 'Confirm Push All (Ignore 1250 Limit)',
        enforceMinimum
            ? "Are you sure you want to push all salaries?\n\nNOTE: Rows marked as 'Pushed' will be SKIPPED. To re-push a row and fix a calculation, simply clear the 'Pushed' cell manually first."
            : "Are you sure you want to push all salaries?\n\nNOTE: This WILL PUSH salaries below ₱1,250.\n\nRows marked as 'Pushed' will still be SKIPPED.",
        ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;

    const emailHeaderName = (sheetName === "FINAL") ? "bitmappro Email login:" : "gingeremail";
    const salaryHeaderName = (sheetName === "FINAL") ? "Final Payment:" : "Total Payment with Salary:";
    const bonusHeaderName = "Payment + Bonus:";

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headersRow = values[0];

    const gingerEmailIdx = headersRow.indexOf(emailHeaderName);
    const salaryIdx = headersRow.indexOf(salaryHeaderName);
    const bonusIdx = headersRow.indexOf(bonusHeaderName);
    const statusIdx = headersRow.findIndex(h => String(h).toUpperCase().includes("STATUS") && !String(h).toUpperCase().includes("PUSH"));
    const pushMarkerIdx = getPushMarkerColIdx(headersRow);
    const idColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "id");
    const pushDateColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "push date");
    const errorColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "error");

    if (gingerEmailIdx === -1 || salaryIdx === -1) return ui.alert("Missing columns.");
    if (pushMarkerIdx === -1) return ui.alert("Missing 'Push Status' column.");

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) return ui.alert("Setup Error: Missing POSTGREST_TOKEN.");

    const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" };
    const BASE_URL = "https://api.xfnite.cloud";

    sheet.getParent().toast("Fetching database records... Please wait.", "Push All", -1);

    try {
        const userRes = UrlFetchApp.fetch(BASE_URL + "/User?select=email,gingerEmail,status", { "method": "GET", "headers": headers });
        const userData = JSON.parse(userRes.getContentText());

        const byGingerEmail = {};
        const byEmail = {};
        userData.forEach(u => {
            if (u.gingerEmail) byGingerEmail[String(u.gingerEmail).trim().toLowerCase()] = u;
            if (u.email) byEmail[String(u.email).trim().toLowerCase()] = u;
        });

        function resolvePrimaryUser(rawGingerEmail) {
            const key = String(rawGingerEmail).trim().toLowerCase();
            return byGingerEmail[key] || byEmail[key] || null;
        }

        const incomeRes = UrlFetchApp.fetch(BASE_URL + "/CurrentIncome?select=id,email", { "method": "GET", "headers": headers });
        const existingIncomes = new Map(JSON.parse(incomeRes.getContentText()).map(i => [i.email.toLowerCase(), i]));

        // Fetch all IncomeHistory (no t3Value in URL to avoid URLFetch URL length limit),
        // then filter by _note1 in-memory.
        const historyUrl = BASE_URL + `/IncomeHistory?select=id,email,rawComputation`;
        const historyRes = UrlFetchApp.fetch(historyUrl, { "method": "GET", "headers": headers });
        const existingHistories = new Map(
            JSON.parse(historyRes.getContentText())
                .filter(r => String((r.rawComputation || {})._note1 || "").trim() === t3Value.trim())
                .map(i => [i.email.toLowerCase(), i])
        );

        const rawComputationMap = getRawComputationDataMap();
        let n1 = t3Value;
        let n2 = finalSheet ? String(finalSheet.getRange("T7").getValue()).trim() : "";
        let n3 = finalSheet ? String(finalSheet.getRange("T9").getValue()).trim() : "";

        const patchesIH = [];
        const patchesCI = [];
        const postsCI = [];
        const now = new Date().toISOString();
        const errorRows = [];

        const innerCouncilEmails = sheetName === "FINAL" ? getInnerCouncilEmails(ss) : new Set();
        let skippedInnerCouncil = 0;
        let skippedPushed = 0;
        let skippedBelowMinimum = 0; // Track how many were skipped for being < 1250
        let skippedDeactivated = 0;

        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            const sheetRow = i + 1;
            const rawGingerEmail = String(row[gingerEmailIdx]).trim();

            if (!rawGingerEmail) continue;

            if (String(row[pushMarkerIdx]).trim().toLowerCase() === "pushed") {
                skippedPushed++;
                continue;
            }

            if (sheetName === "FINAL" && innerCouncilEmails.has(rawGingerEmail.toLowerCase())) {
                skippedInnerCouncil++;
                errorRows.push({ row: sheetRow, reason: "Inner Council" });
                continue;
            }

            if (String(row[statusIdx]).trim().toLowerCase() === "sent") continue;

            const user = resolvePrimaryUser(rawGingerEmail);
            if (!user) {
                errorRows.push({ row: sheetRow, reason: "No database user found" });
                continue;
            }

            if (user.status && user.status.toLowerCase() === "deactivated") {
                skippedDeactivated++;
                errorRows.push({ row: sheetRow, reason: "Deactivated" });
                continue;
            }

            const primaryEmail = user.email;

            const cellSalary = row[salaryIdx];
            const cellBonus = (bonusIdx !== -1) ? row[bonusIdx] : "";
            const useBonus = (sheetName === "FINAL" && String(cellBonus).trim() !== "");
            const salaryResult = useBonus ? parseCurrencyValue(cellBonus) : parseCurrencyValue(cellSalary);

            if (salaryResult.value === null) {
                errorRows.push({ row: sheetRow, reason: "Invalid salary amount" });
                continue;
            }
            const calculatedSalary = salaryResult.value;

            // Check if salary is below 1250 and skip it if it is
            if (enforceMinimum && calculatedSalary < 1250) {
                skippedBelowMinimum++;
                errorRows.push({ row: sheetRow, reason: "Below 1250 minimum" });
                continue;
            }

            const rawComputation = Object.assign({}, rawComputationMap[rawGingerEmail.toLowerCase()] || {});

            const tmBonusIdx = headersRow.indexOf("TM Bonus Payment:");
            if (tmBonusIdx !== -1) {
                const tmBonusValue = row[tmBonusIdx];
                if (String(tmBonusValue).trim() !== "") {
                    const parsedBonus = parseCurrencyValue(tmBonusValue);
                    if (parsedBonus.value !== null) {
                        rawComputation["TM Bonus Payment:"] = parsedBonus.value;
                    }
                }
            }

            // Inner Council only: show their Previous Unclaimed in the computation details
            const prevUnclaimedIdx = (sheetName === "X1.INNERCOUNCIL") ? headersRow.indexOf("Previous Unclaimed:") : -1;
            if (prevUnclaimedIdx !== -1) {
                const prevUnclaimedValue = row[prevUnclaimedIdx];
                if (String(prevUnclaimedValue).trim() !== "") {
                    const parsedPrevUnclaimed = parseCurrencyValue(prevUnclaimedValue);
                    if (parsedPrevUnclaimed.value !== null) {
                        rawComputation["Previous Unclaimed:"] = parsedPrevUnclaimed.value;
                    }
                }
            }

            if (n1) rawComputation["_note1"] = n1;
            if (n2) rawComputation["_note2"] = n2;
            if (n3) rawComputation["_note3"] = n3;

            const primaryEmailLower = primaryEmail.toLowerCase();

            if (existingHistories.has(primaryEmailLower)) {
                patchesIH.push({ id: existingHistories.get(primaryEmailLower).id, sheetRow: sheetRow, payload: { amountPaid: calculatedSalary, rawComputation: rawComputation, updatedAt: now } });
            } else if (existingIncomes.has(primaryEmailLower)) {
                patchesCI.push({ id: existingIncomes.get(primaryEmailLower).id, sheetRow: sheetRow, payload: { email: primaryEmail, estimatedAmount: calculatedSalary, status: String(row[statusIdx]).trim(), rawComputation: rawComputation, updatedAt: now } });
            } else {
                const newId = Utilities.getUuid();
                postsCI.push({ id: newId, sheetRow: sheetRow, payload: { id: newId, email: primaryEmail, estimatedAmount: calculatedSalary, status: String(row[statusIdx]).trim(), rawComputation: rawComputation, createdAt: now, updatedAt: now } });
            }
        }

        if (patchesIH.length === 0 && patchesCI.length === 0 && postsCI.length === 0) {
            if (errorColIdx !== -1 && errorRows.length > 0) {
                errorRows.forEach(item => sheet.getRange(item.row, errorColIdx + 1).setValue(item.reason));
            }
            let skipMsg = "No valid records pushed.";
            if (skippedInnerCouncil > 0) skipMsg += `\nNote: ${skippedInnerCouncil} users were skipped because they are Inner Council members.`;
            if (skippedDeactivated > 0) skipMsg += `\nNote: ${skippedDeactivated} users were skipped because they are Deactivated.`;
            if (enforceMinimum && skippedBelowMinimum > 0) skipMsg += `\nNote: ${skippedBelowMinimum} users were skipped because their salary is below ₱1,250.`;
            return ui.alert((enforceMinimum ? "Push All Complete!\n\n" : "Push All (Ignore 1250 Limit) Complete!\n\n") + skipMsg);
        }

        sheet.getParent().toast("Syncing updates...", "Push All", -1);

        let successCount = 0; let failCount = 0; const successRows = [];

        const BATCH_SIZE = 50;

        // Batch process patchesIH
        for (let i = 0; i < patchesIH.length; i += BATCH_SIZE) {
            const batch = patchesIH.slice(i, i + BATCH_SIZE);
            const requests = batch.map(item => ({
                url: BASE_URL + `/IncomeHistory?id=eq.${item.id}`,
                method: "PATCH",
                headers: headers,
                payload: JSON.stringify(item.payload),
                muteHttpExceptions: true
            }));
            try {
                const responses = UrlFetchApp.fetchAll(requests);
                responses.forEach((res, index) => {
                    const item = batch[index];
                    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
                        successCount++; successRows.push({ row: item.sheetRow, id: item.id });
                    } else {
                        failCount++; errorRows.push({ row: item.sheetRow, reason: "API Error" });
                    }
                });
            } catch (e) {
                failCount += batch.length;
                batch.forEach(item => errorRows.push({ row: item.sheetRow, reason: "Failed: " + String(e.message).substring(0, 50) }));
            }
        }

        // Batch process patchesCI
        for (let i = 0; i < patchesCI.length; i += BATCH_SIZE) {
            const batch = patchesCI.slice(i, i + BATCH_SIZE);
            const requests = batch.map(item => ({
                url: BASE_URL + `/CurrentIncome?id=eq.${item.id}`,
                method: "PATCH",
                headers: headers,
                payload: JSON.stringify(item.payload),
                muteHttpExceptions: true
            }));
            try {
                const responses = UrlFetchApp.fetchAll(requests);
                responses.forEach((res, index) => {
                    const item = batch[index];
                    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
                        successCount++; successRows.push({ row: item.sheetRow, id: item.id });
                    } else {
                        failCount++; errorRows.push({ row: item.sheetRow, reason: "API Error" });
                    }
                });
            } catch (e) {
                failCount += batch.length;
                batch.forEach(item => errorRows.push({ row: item.sheetRow, reason: "Failed: " + String(e.message).substring(0, 50) }));
            }
        }

        // Batch process postsCI
        for (let i = 0; i < postsCI.length; i += BATCH_SIZE) {
            const batch = postsCI.slice(i, i + BATCH_SIZE);
            const requests = batch.map(item => ({
                url: BASE_URL + "/CurrentIncome",
                method: "POST",
                headers: headers,
                payload: JSON.stringify(item.payload),
                muteHttpExceptions: true
            }));
            try {
                const responses = UrlFetchApp.fetchAll(requests);
                responses.forEach((res, index) => {
                    const item = batch[index];
                    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
                        successCount++; successRows.push({ row: item.sheetRow, id: item.id });
                    } else {
                        failCount++; errorRows.push({ row: item.sheetRow, reason: "API Error" });
                    }
                });
            } catch (e) {
                failCount += batch.length;
                batch.forEach(item => errorRows.push({ row: item.sheetRow, reason: "Failed: " + String(e.message).substring(0, 50) }));
            }
        }

        if (successRows.length > 0) {
            sheet.getParent().toast("Writing 'Pushed' markers and IDs...", "Finalizing", -1);
            const pushDateStamp = new Date();
            successRows.forEach(item => {
                sheet.getRange(item.row, pushMarkerIdx + 1).setValue("Pushed");
                if (idColIdx !== -1) sheet.getRange(item.row, idColIdx + 1).setValue(item.id);
                if (pushDateColIdx !== -1) sheet.getRange(item.row, pushDateColIdx + 1).setValue(pushDateStamp);
                if (errorColIdx !== -1) sheet.getRange(item.row, errorColIdx + 1).setValue("");
            });
        }

        if (errorColIdx !== -1 && errorRows.length > 0) {
            errorRows.forEach(item => {
                sheet.getRange(item.row, errorColIdx + 1).setValue(item.reason);
            });
        }

        let alertMsg = `✅ Updated/Inserted records: ${successCount}\n🔴 Failed: ${failCount}\n⏭️ Skipped (Already Pushed): ${skippedPushed}`;

        // Add the skipped due to minimum amount logic to the final alert
        if (enforceMinimum && skippedBelowMinimum > 0) {
            alertMsg += `\n⏭️ Skipped (Below ₱1,250): ${skippedBelowMinimum}`;
        }

        if (skippedDeactivated > 0) {
            alertMsg += `\n⚠️ Skipped (Deactivated): ${skippedDeactivated}`;
        }

        if (sheetName === "FINAL" && skippedInnerCouncil > 0) {
            alertMsg += `\n⚠️ Skipped (Inner Council Members): ${skippedInnerCouncil}`;
        }

        ui.alert(enforceMinimum ? 'Push All Complete' : 'Push All (Ignore 1250 Limit) Complete', alertMsg, ui.ButtonSet.OK);

    } catch (error) {
        const errMsg = error.toString();
        const errStack = error.stack ? String(error.stack).substring(0, 500) : "(no stack)";
        const logDetail = `Function: executePushAll (enforceMinimum=${enforceMinimum}) | Sheet: ${sheetName || "(unknown)"}\nError: ${errMsg}\nStack: ${errStack}`;
        logSyncActivity("PUSH ALL ERROR", logDetail);
        ui.alert("Execution Error", `${errMsg}\n\nFull details logged to 'Sync Logs' tab.`, ui.ButtonSet.OK);
    }
}

/**
 * 3.6 FORCE PUSH ALL - Ignores "Pushed" marker and "Sent" status
 * Use this when records need to be re-synced regardless of their current state.
 */
function forcePushAllSalariesToDatabase() {
    executeForcePush(true);
}

function executeForcePush(enforceMinimum) {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const sheetName = sheet.getName();

    if (sheetName !== "FINAL" && sheetName !== "X1.INNERCOUNCIL") return ui.alert("Action Denied: Only for 'FINAL' or 'X1.INNERCOUNCIL' tabs.");

    const finalSheet = ss.getSheetByName("FINAL");
    const t3Value = finalSheet ? String(finalSheet.getRange("T3").getValue()).trim() : "";
    if (!t3Value) return ui.alert("Missing T3 Cutoff value in FINAL sheet.");

    const response = ui.alert(
        enforceMinimum ? '⚡ Confirm Force Push All' : '⚠️ Confirm EXTREME Force Push All',
        enforceMinimum
            ? "This will push ALL rows — including those already marked 'Pushed' or with status 'Sent'.\n\n(Salaries below ₱1,250 will still be skipped).\n\nAre you sure?"
            : "This will push ALL rows — including those already marked 'Pushed' or with status 'Sent', AND it will IGNORE the ₱1,250 minimum limit.\n\nAre you absolutely sure?",
        ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;

    const emailHeaderName = (sheetName === "FINAL") ? "bitmappro Email login:" : "gingeremail";
    const salaryHeaderName = (sheetName === "FINAL") ? "Final Payment:" : "Total Payment with Salary:";
    const bonusHeaderName = "Payment + Bonus:";

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headersRow = values[0];

    const gingerEmailIdx = headersRow.indexOf(emailHeaderName);
    const salaryIdx = headersRow.indexOf(salaryHeaderName);
    const bonusIdx = headersRow.indexOf(bonusHeaderName);
    const statusIdx = headersRow.findIndex(h => String(h).toUpperCase().includes("STATUS") && !String(h).toUpperCase().includes("PUSH"));
    const pushMarkerIdx = getPushMarkerColIdx(headersRow);
    const idColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "id");
    const pushDateColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "push date");

    if (gingerEmailIdx === -1 || salaryIdx === -1) return ui.alert("Missing columns.");
    if (pushMarkerIdx === -1) return ui.alert("Missing 'Push Status' column.");

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) return ui.alert("Setup Error: Missing POSTGREST_TOKEN.");

    const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" };
    const BASE_URL = "https://api.xfnite.cloud";

    sheet.getParent().toast("Fetching database records... Please wait.", "Force Push All", -1);

    try {
        const userRes = UrlFetchApp.fetch(BASE_URL + "/User?select=email,gingerEmail,status", { "method": "GET", "headers": headers });
        const userData = JSON.parse(userRes.getContentText());

        const byGingerEmail = {};
        const byEmail = {};
        userData.forEach(u => {
            if (u.gingerEmail) byGingerEmail[String(u.gingerEmail).trim().toLowerCase()] = u;
            if (u.email) byEmail[String(u.email).trim().toLowerCase()] = u;
        });

        function resolvePrimaryUser(rawGingerEmail) {
            const key = String(rawGingerEmail).trim().toLowerCase();
            return byGingerEmail[key] || byEmail[key] || null;
        }

        const incomeRes = UrlFetchApp.fetch(BASE_URL + "/CurrentIncome?select=id,email", { "method": "GET", "headers": headers });
        const existingIncomes = new Map(JSON.parse(incomeRes.getContentText()).map(i => [i.email.toLowerCase(), i]));

        const historyUrl = BASE_URL + `/IncomeHistory?select=id,email&rawComputation-%3E%3E_note1=eq.${encodeURIComponent(t3Value)}`;
        const historyRes = UrlFetchApp.fetch(historyUrl, { "method": "GET", "headers": headers });
        const existingHistories = new Map(JSON.parse(historyRes.getContentText()).map(i => [i.email.toLowerCase(), i]));

        const rawComputationMap = getRawComputationDataMap();
        let n1 = t3Value;
        let n2 = finalSheet ? String(finalSheet.getRange("T7").getValue()).trim() : "";
        let n3 = finalSheet ? String(finalSheet.getRange("T9").getValue()).trim() : "";

        const patchesIH = [];
        const patchesCI = [];
        const postsCI = [];
        const now = new Date().toISOString();
        const errorRows = [];

        const innerCouncilEmails = sheetName === "FINAL" ? getInnerCouncilEmails(ss) : new Set();
        let skippedInnerCouncil = 0;
        let skippedBelowMinimum = 0;
        let skippedDeactivated = 0;

        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            const sheetRow = i + 1;
            const rawGingerEmail = String(row[gingerEmailIdx]).trim();

            if (!rawGingerEmail) continue;

            // ✅ NO "Pushed" check here — force push ignores it
            // ✅ NO "Sent" status check here — force push ignores it

            if (sheetName === "FINAL" && innerCouncilEmails.has(rawGingerEmail.toLowerCase())) {
                skippedInnerCouncil++;
                errorRows.push({ row: sheetRow, reason: "Inner Council" });
                continue;
            }

            const user = resolvePrimaryUser(rawGingerEmail);
            if (!user) {
                errorRows.push({ row: sheetRow, reason: "No database user found" });
                continue;
            }

            if (user.status && user.status.toLowerCase() === "deactivated") {
                skippedDeactivated++;
                errorRows.push({ row: sheetRow, reason: "Deactivated" });
                continue;
            }

            const primaryEmail = user.email;

            const cellSalary = row[salaryIdx];
            const cellBonus = (bonusIdx !== -1) ? row[bonusIdx] : "";
            const useBonus = (sheetName === "FINAL" && String(cellBonus).trim() !== "");
            const salaryResult = useBonus ? parseCurrencyValue(cellBonus) : parseCurrencyValue(cellSalary);

            if (salaryResult.value === null) {
                errorRows.push({ row: sheetRow, reason: "Invalid salary amount" });
                continue;
            }
            const calculatedSalary = salaryResult.value;

            if (enforceMinimum && calculatedSalary < 1250) {
                skippedBelowMinimum++;
                errorRows.push({ row: sheetRow, reason: "Below 1250 minimum" });
                continue;
            }

            // No minimum salary check for extreme force push

            const rawComputation = Object.assign({}, rawComputationMap[rawGingerEmail.toLowerCase()] || {});

            const tmBonusIdx = headersRow.indexOf("TM Bonus Payment:");
            if (tmBonusIdx !== -1) {
                const tmBonusValue = row[tmBonusIdx];
                if (String(tmBonusValue).trim() !== "") {
                    const parsedBonus = parseCurrencyValue(tmBonusValue);
                    if (parsedBonus.value !== null) {
                        rawComputation["TM Bonus Payment:"] = parsedBonus.value;
                    }
                }
            }

            // Inner Council only: show their Previous Unclaimed in the computation details
            const prevUnclaimedIdx = (sheetName === "X1.INNERCOUNCIL") ? headersRow.indexOf("Previous Unclaimed:") : -1;
            if (prevUnclaimedIdx !== -1) {
                const prevUnclaimedValue = row[prevUnclaimedIdx];
                if (String(prevUnclaimedValue).trim() !== "") {
                    const parsedPrevUnclaimed = parseCurrencyValue(prevUnclaimedValue);
                    if (parsedPrevUnclaimed.value !== null) {
                        rawComputation["Previous Unclaimed:"] = parsedPrevUnclaimed.value;
                    }
                }
            }

            if (n1) rawComputation["_note1"] = n1;
            if (n2) rawComputation["_note2"] = n2;
            if (n3) rawComputation["_note3"] = n3;

            const primaryEmailLower = primaryEmail.toLowerCase();

            if (existingHistories.has(primaryEmailLower)) {
                patchesIH.push({ id: existingHistories.get(primaryEmailLower).id, sheetRow: sheetRow, payload: { amountPaid: calculatedSalary, rawComputation: rawComputation, updatedAt: now } });
            } else if (existingIncomes.has(primaryEmailLower)) {
                patchesCI.push({ id: existingIncomes.get(primaryEmailLower).id, sheetRow: sheetRow, payload: { email: primaryEmail, estimatedAmount: calculatedSalary, status: String(row[statusIdx]).trim(), rawComputation: rawComputation, updatedAt: now } });
            } else {
                const newId = Utilities.getUuid();
                postsCI.push({ id: newId, sheetRow: sheetRow, payload: { id: newId, email: primaryEmail, estimatedAmount: calculatedSalary, status: String(row[statusIdx]).trim(), rawComputation: rawComputation, createdAt: now, updatedAt: now } });
            }
        }

        if (patchesIH.length === 0 && patchesCI.length === 0 && postsCI.length === 0) {
            if (errorColIdx !== -1 && errorRows.length > 0) {
                errorRows.forEach(item => sheet.getRange(item.row, errorColIdx + 1).setValue(item.reason));
            }
            return ui.alert("Force Push Complete!\n\nNo valid records found to push.");
        }

        sheet.getParent().toast("Syncing updates...", "Force Push All", -1);

        let successCount = 0; let failCount = 0; const successRows = [];

        for (const item of patchesIH) {
            try {
                const res = UrlFetchApp.fetch(BASE_URL + `/IncomeHistory?id=eq.${item.id}`, { "method": "PATCH", "headers": headers, "payload": JSON.stringify(item.payload), "muteHttpExceptions": true });
                if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) { successCount++; successRows.push({ row: item.sheetRow, id: item.id }); } else failCount++;
            } catch (e) { failCount++; }
        }

        for (const item of patchesCI) {
            try {
                const res = UrlFetchApp.fetch(BASE_URL + `/CurrentIncome?id=eq.${item.id}`, { "method": "PATCH", "headers": headers, "payload": JSON.stringify(item.payload), "muteHttpExceptions": true });
                if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) { successCount++; successRows.push({ row: item.sheetRow, id: item.id }); } else failCount++;
            } catch (e) { failCount++; }
        }

        for (const item of postsCI) {
            try {
                const res = UrlFetchApp.fetch(BASE_URL + "/CurrentIncome", { "method": "POST", "headers": headers, "payload": JSON.stringify(item.payload), "muteHttpExceptions": true });
                if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) { successCount++; successRows.push({ row: item.sheetRow, id: item.id }); } else failCount++;
            } catch (e) { failCount++; }
        }

        if (successRows.length > 0) {
            sheet.getParent().toast("Writing 'Pushed' markers and IDs...", "Finalizing", -1);
            const pushDateStamp = new Date();
            successRows.forEach(item => {
                sheet.getRange(item.row, pushMarkerIdx + 1).setValue("Pushed");
                if (idColIdx !== -1) sheet.getRange(item.row, idColIdx + 1).setValue(item.id);
                if (pushDateColIdx !== -1) sheet.getRange(item.row, pushDateColIdx + 1).setValue(pushDateStamp);
            });
        }

        let alertMsg = `✅ Updated/Inserted records: ${successCount}\n🔴 Failed: ${failCount}`;
        if (enforceMinimum && skippedBelowMinimum > 0) alertMsg += `\n⏭️ Skipped (Below ₱1,250): ${skippedBelowMinimum}`;
        if (skippedDeactivated > 0) alertMsg += `\n⚠️ Skipped (Deactivated): ${skippedDeactivated}`;
        if (sheetName === "FINAL" && skippedInnerCouncil > 0) alertMsg += `\n⚠️ Skipped (Inner Council Members): ${skippedInnerCouncil}`;

        ui.alert(enforceMinimum ? '⚡ Force Push All Complete' : '⚠️ Extreme Force Push All Complete', alertMsg, ui.ButtonSet.OK);

    } catch (error) {
        ui.alert("Execution Error: " + error.toString());
    }
}


/**
 * 4. INTERNAL SHEET SYNC
 */
function updateCopyOfFinalColumnD() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawSheet = ss.getSheetByName("RAWCOMPUTATION");
    const finalSheet = ss.getSheetByName("Final");
    const rawData = rawSheet.getDataRange().getValues();
    const finalData = finalSheet.getDataRange().getValues();

    const lookup = {};
    for (let i = 1; i < rawData.length; i++) {
        if (rawData[i][0] !== "") lookup[rawData[i][0]] = rawData[i][13];
    }

    const output = [];
    for (let i = 1; i < finalData.length; i++) {
        output.push([lookup.hasOwnProperty(finalData[i][0]) ? lookup[finalData[i][0]] : finalData[i][3]]);
    }

    if (output.length > 0) finalSheet.getRange(2, 4, output.length, 1).setValues(output);
    SpreadsheetApp.getActiveSpreadsheet().toast("Column D in 'Final' updated.", "Sync Complete", 3);
}

/**
 * 5. ON EDIT TRIGGER
 */
/**
 * PAYOUT "SENT" NOTICES
 * When a payout changes to "Sent", the member gets a message in their Xfnite inbox
 * (DirectMessage; the site shows unread ones as a pop-up when they open it).
 * Only rows that weren't already "Sent" get one, so re-running a bulk update
 * doesn't message people twice.
 */
// Of these IncomeHistory ids, the rows not yet "Sent" (check before patching).
function getRowsBecomingSent_(baseUrl, headers, ids) {
    const rowsById = {};
    const CHUNK = 20; // keeps each URL well under Apps Script's ~2KB limit
    for (let i = 0; i < ids.length; i += CHUNK) {
        const list = ids.slice(i, i + CHUNK).map(id => `"${id}"`).join(",");
        const url = baseUrl + `/IncomeHistory?id=in.(${encodeURIComponent(list)})&status=neq.Sent&select=id,email,amountPaid,periodStart,periodEnd,rawComputation`;
        const res = UrlFetchApp.fetch(url, { method: "GET", headers: headers, muteHttpExceptions: true });
        if (res.getResponseCode() !== 200) {
            logSyncActivity("SENT_NOTICE_LOOKUP_FAIL", res.getContentText());
            continue;
        }
        JSON.parse(res.getContentText()).forEach(r => { rowsById[r.id] = r; });
    }
    return rowsById;
}

// Inserts one inbox message per row. Returns how many were sent.
function sendPayoutSentNotices_(baseUrl, headers, rows) {
    if (rows.length === 0) return 0;
    const messages = rows.map(r => {
        const amount = Number(r.amountPaid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const note = r.rawComputation && r.rawComputation._note1 ? String(r.rawComputation._note1).split("- Projects")[0].trim() : "";
        // e.g. "the August 30 - September 15, 2026 Cutoff", else the period dates
        const period = note ? `the ${note}` : [r.periodStart, r.periodEnd].filter(Boolean).map(d => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })).join(" – ");
        return {
            toEmail: String(r.email).trim().toLowerCase(),
            fromName: "Xfnite Payroll",
            subject: "Your salary has been sent 💸",
            message: `Good news! Your salary of ₱${amount}${period ? ` for ${period}` : ""} has been sent. Please check your payout account. If you don't receive it within 24 hours, message your recruiter or checker.`,
        };
    });
    const res = UrlFetchApp.fetch(baseUrl + "/DirectMessage", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Prefer": "return=minimal" },
        payload: JSON.stringify(messages),
        muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) return messages.length;
    logSyncActivity("SENT_NOTICE_FAIL", `HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
    return 0;
}

/**
 * Helper to fetch "Whose Bank?", "Who Sent?", and "MOP" values from the active sheet.
 * Primarily checks cells A3:B3 (Whose Bank?), A4:B4 (Who Sent?), and A5:B5 (MOP).
 * Supports fallback scanning of top rows (A1:B11) if rows have moved.
 * If MOP is not defined at the top, falls back to the row's payment method from Column D (4).
 */
function getWhoseBankAndWhoSent_(sheet, row = null) {
    let whoseBank = "";
    let whoSent = "";
    let mop = "";

    const a3 = String(sheet.getRange("A3").getValue() || "").trim();
    const b3 = String(sheet.getRange("B3").getValue() || "").trim();
    const a4 = String(sheet.getRange("A4").getValue() || "").trim();
    const b4 = String(sheet.getRange("B4").getValue() || "").trim();

    // Extract Whose Bank?
    if (b3) {
        whoseBank = b3;
    } else if (a3) {
        if (a3.includes(":")) {
            whoseBank = a3.split(":").slice(1).join(":").trim();
        } else if (!a3.toLowerCase().includes("bank")) {
            whoseBank = a3;
        }
    }

    // Extract Who Sent?
    if (b4) {
        whoSent = b4;
    } else if (a4) {
        if (a4.includes(":")) {
            whoSent = a4.split(":").slice(1).join(":").trim();
        } else if (!a4.toLowerCase().includes("sent")) {
            whoSent = a4;
        }
    }

    // Fallback: scan top rows (up to row 11) in case positions differ
    if (!whoseBank || !whoSent) {
        const maxScan = Math.min(sheet.getLastRow(), 11);
        if (maxScan >= 1) {
            const topVals = sheet.getRange(1, 1, maxScan, 2).getValues();
            for (let i = 0; i < topVals.length; i++) {
                const label = String(topVals[i][0] || "").trim();
                const val = String(topVals[i][1] || "").trim();
                const labelLower = label.toLowerCase();

                if (!whoseBank && labelLower.includes("whose bank")) {
                    whoseBank = val || (label.includes(":") ? label.split(":").slice(1).join(":").trim() : "");
                }
                if (!whoSent && labelLower.includes("who sent")) {
                    whoSent = val || (label.includes(":") ? label.split(":").slice(1).join(":").trim() : "");
                }
            }
        }
    }

    // Worker's payment method directly from Column D (4)
    if (row) {
        const rawMop = String(sheet.getRange(row, 4).getValue() || "").trim();
        if (rawMop.toLowerCase().startsWith("bank_")) {
            mop = rawMop.substring(5).trim(); // e.g. "bank_bpi" -> "bpi"
        } else {
            mop = rawMop; // e.g. "gcash" -> "gcash"
        }
    }

    return { whoseBank, whoSent, mop };
}

/**
 * Helper to get 1-based column indices for "Whose Bank?" (Column AK / 37),
 * "Who Sent?" (Column AL / 38), and "MOP" (Column AM / 39).
 */
function getBankAndSenderColIndices_(sheet, headers) {
    let whoseBankCol = 37; // Default Column AK
    let whoSentCol = 38;   // Default Column AL
    let mopCol = 39;       // Default Column AM

    const lastCol = Math.max(sheet.getLastColumn(), 39);
    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    for (let i = 0; i < headerRow.length; i++) {
        const h = String(headerRow[i] || "").toLowerCase().trim();
        if (h.includes("whose bank")) {
            whoseBankCol = i + 1;
        } else if (h.includes("who sent") || h.includes("sent by")) {
            whoSentCol = i + 1;
        } else if (h === "mop" || (h.startsWith("mop") && !h.includes("name"))) {
            mopCol = i + 1;
        }
    }

    return { whoseBankCol, whoSentCol, mopCol };
}

function onStatusEdit(e) {
    if (!e) return;

    const sheet = e.source.getActiveSheet();
    const range = e.range;
    const col = range.getColumn();
    const row = range.getRow();

    if (row === 1) return;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let statusColIdx = -1;
    for (let i = 0; i < headers.length; i++) {
        if (String(headers[i]).toLowerCase().includes("status") && !String(headers[i]).toLowerCase().includes("push")) {
            statusColIdx = i + 1;
            break;
        }
    }

    // Fallback: If Status column wasn't detected by header text but user edited Column I (9)
    if (statusColIdx === -1 && col === 9) {
        statusColIdx = 9;
    }

    if (statusColIdx === -1 || col !== statusColIdx) return;

    const newStatus = e.value || String(range.getValue() || "").trim();
    if (!newStatus) return;
    const oldStatus = String(e.oldValue || "").trim().toLowerCase();
    const wasAlreadySent = oldStatus === "sent";

    let rowId = null;
    for (let c = 9; c <= 20; c++) {
        const val = String(sheet.getRange(row, c).getValue() || "").trim();
        if (val.length === 36 && val.split("-").length === 5) {
            rowId = val;
            break;
        }
    }

    if (!rowId) {
        e.source.toast("Could not find the Database ID for this row. Cannot sync.", "Sync Error");
        return;
    }

    e.source.toast("Syncing status to database...", "Syncing");

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) {
        e.source.toast("POSTGREST_TOKEN missing", "Error");
        return;
    }

    const headersObj = { "Authorization": "Bearer " + token, "Content-Type": "application/json" };
    const BASE_URL = "https://api.xfnite.cloud";

    try {
        const patchUrl = BASE_URL + `/IncomeHistory?id=eq.${encodeURIComponent(rowId)}`;
        const now = new Date().toISOString();
        const payloadObj = { status: newStatus, updatedAt: now };

        const isSent = newStatus.toLowerCase() === "sent";
        if (isSent) {
            payloadObj.payoutDate = now;
        }
        // Checked before the update: only a change to "Sent" gets an inbox message
        const becomingSent = isSent ? getRowsBecomingSent_(BASE_URL, headersObj, [rowId]) : {};

        const patchRes = UrlFetchApp.fetch(patchUrl, {
            method: "PATCH",
            headers: headersObj,
            payload: JSON.stringify(payloadObj),
            muteHttpExceptions: true
        });

        if (patchRes.getResponseCode() >= 200 && patchRes.getResponseCode() < 300) {
            logSyncActivity("STATUS_CHANGE", `Updated ID ${rowId} status to '${newStatus}'`);
            // Log "Sent When?" timestamp in Column AI (35) — only when status is "Sent"
            if (isSent) {
                sheet.getRange(row, 35).setValue(new Date().toLocaleString());

                // Deduct from B2 and log in Column AJ (36) only if not already sent before this edit
                if (!wasAlreadySent) {
                    const salary = (parseCurrencyValue(sheet.getRange(row, 3).getValue()).value) || 0;
                    const b2Cell = sheet.getRange("B2");
                    const currentBal = (parseCurrencyValue(b2Cell.getValue()).value) || 0;
                    const newBal = currentBal - salary;
                    b2Cell.setValue(newBal);
                    sheet.getRange(row, 36).setValue(newBal);
                }

                // Update Whose Bank? (Column AK / 37), Who Sent? (Column AL / 38), and MOP (Column AM / 39)
                const bankInfo = getWhoseBankAndWhoSent_(sheet, row);
                const cols = getBankAndSenderColIndices_(sheet, headers);
                if (bankInfo.whoseBank) {
                    sheet.getRange(row, cols.whoseBankCol).setValue(bankInfo.whoseBank);
                }
                if (bankInfo.whoSent) {
                    sheet.getRange(row, cols.whoSentCol).setValue(bankInfo.whoSent);
                }
                if (bankInfo.mop) {
                    sheet.getRange(row, cols.mopCol).setValue(bankInfo.mop);
                }
            }
            const notified = sendPayoutSentNotices_(BASE_URL, headersObj, Object.values(becomingSent));
            e.source.toast(`Successfully updated DB to ${newStatus}${notified ? " and notified the member" : ""}`, "Success");
        } else {
            logSyncActivity("STATUS_CHANGE_FAIL", `Failed ID ${rowId}: ${patchRes.getContentText()}`);
            e.source.toast(`Failed to update DB: ${patchRes.getContentText()}`, "Error");
        }
    } catch (err) {
        logSyncActivity("STATUS_CHANGE_ERROR", err.toString());
        e.source.toast("Error syncing to DB: " + err.toString(), "Error");
    }
}

/**
 * 6. ON SELECTION CHANGE TRIGGER
 * Auto-expands the image preview when clicking a specific column.
 */
function onImageCheckboxEdit(e) {
    var range = e.range;

    if (range.getNumRows() !== 1 || range.getNumColumns() !== 1 || range.getColumn() !== 25) return;

    var checked = range.getValue();
    if (checked !== true) return;

    var sheet = range.getSheet();
    var row = range.getRow();
    var url = sheet.getRange(row, 16).getValue();

    range.setValue(false);

    if (!url) {
        SpreadsheetApp.getUi().alert('No image found for this row.');
        return;
    }

    var html = HtmlService.createHtmlOutput(
        '<div style="text-align:center; background:#f8f8f8;">' +
        '<img src="' + url + '" style="max-width:100%; max-height:85vh;">' +
        '</div>'
    ).setWidth(500).setHeight(650);

    SpreadsheetApp.getUi().showModalDialog(html, 'Image Preview');
}

function setupImageCheckboxes() {
    var sheet = SpreadsheetApp.getActiveSheet();
    var lastRow = sheet.getLastRow();

    for (var row = 2; row <= lastRow; row++) {
        var url = sheet.getRange(row, 16).getValue();
        var cell = sheet.getRange(row, 25);

        cell.clearDataValidations();
        cell.clearContent();

        if (url) {
            cell.insertCheckboxes();
        }
    }
}

function authorizeScript() {
    SpreadsheetApp.getUi().alert("Authorization successful! You can now click the images.");
}

// /**
//  * 7. BULK UPDATE STATUSES
//  * Mimics onStatusEdit but runs across all rows with a valid ID.
//  */
// function bulkUpdateAllStatuses() {
//   const ui = SpreadsheetApp.getUi();
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = ss.getActiveSheet();

//   const response = ui.alert('Confirm Bulk Status Update', "Are you sure you want to push ALL current statuses from this sheet to the database?\n\nThis will update the database for every row that has a valid Database ID.", ui.ButtonSet.YES_NO);
//   if (response !== ui.Button.YES) return;

//   const dataRange = sheet.getDataRange();
//   const values = dataRange.getValues();
//   if (values.length < 2) return ui.alert("No data found.");
//   const headersRow = values[0];

//   // Find the 'Status' column automatically
//   const statusIdx = headersRow.findIndex(h => String(h).toUpperCase().includes("STATUS") && !String(h).toUpperCase().includes("PUSH"));
//   const idColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "id");

//   if (statusIdx === -1) return ui.alert("Error: Missing 'Status' column on this sheet.");

//   const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
//   if (!token) return ui.alert("Setup Error: Missing POSTGREST_TOKEN.");

//   const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" };
//   const BASE_URL = "https://api.xfnite.cloud";

//   sheet.getParent().toast("Preparing bulk status update...", "Bulk Update", -1);

//   const patches = [];
//   const now = new Date().toISOString();

//   for (let i = 1; i < values.length; i++) {
//     const row = values[i];
//     let rowId = null;

//     // First try the ID column if one was explicitly found
//     if (idColIdx !== -1) {
//       const val = String(row[idColIdx] || "").trim();
//       if (val.length === 36 && val.split("-").length === 5) {
//         rowId = val;
//       }
//     }

//     // Fallback: search columns 9 to 20 for a UUID (just like onStatusEdit logic)
//     if (!rowId) {
//       for (let c = 8; c <= 19; c++) { 
//         if (c >= row.length) break;
//         const val = String(row[c] || "").trim();
//         if (val.length === 36 && val.split("-").length === 5) {
//           rowId = val;
//           break;
//         }
//       }
//     }

//     if (!rowId) continue; 

//     const newStatus = String(row[statusIdx] || "").trim();
//     if (!newStatus) continue; 

//     const payloadObj = { status: newStatus, updatedAt: now };
//     if (newStatus.toLowerCase() === "sent") {
//       payloadObj.payoutDate = now;
//     }

//     patches.push({ id: rowId, payload: payloadObj });
//   }

//   if (patches.length === 0) {
//     return ui.alert("Bulk Update Complete!\n\nNo rows with valid IDs and statuses found to update.");
//   }

//   sheet.getParent().toast(`Syncing ${patches.length} status updates to the database...`, "Bulk Update", -1);

//   let successCount = 0; 
//   let failCount = 0; 

//   // Loop through all records and perform a PATCH request
//   for (const item of patches) {
//     try {
//       const patchUrl = BASE_URL + `/IncomeHistory?id=eq.${encodeURIComponent(item.id)}`;
//       const patchRes = UrlFetchApp.fetch(patchUrl, {
//         method: "PATCH", 
//         headers: headers, 
//         payload: JSON.stringify(item.payload), 
//         muteHttpExceptions: true
//       });

//       if (patchRes.getResponseCode() >= 200 && patchRes.getResponseCode() < 300) {
//         successCount++; 
//       } else {
//         failCount++; 
//       }
//     } catch(e) { 
//       failCount++; 
//     }
//   }

//   if (typeof logSyncActivity === "function") {
//     logSyncActivity("BULK_STATUS_UPDATE", `Bulk status update ran. Success: ${successCount}, Failed: ${failCount}`);
//   }

//   ui.alert('Bulk Status Update Complete', `✅ Successfully updated statuses: ${successCount}\n🔴 Failed: ${failCount}`, ui.ButtonSet.OK);
// }


/**
 * 8. AUTO-FIX INCORRECT EMAILS
 * Replaces main emails with their correct bitmappro/gingerEmail from the DB and logs the changes.
 */
function fixIncorrectEmails() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const sheetName = sheet.getName();

    // 🔹 UPDATED: Added "RAWCOMPUTATION" to the allowed tabs
    if (sheetName !== "FINAL" && sheetName !== "X1.INNERCOUNCIL" && sheetName !== "RAWCOMPUTATION") {
        return ui.alert("Please run this on the FINAL, RAWCOMPUTATION, or X1.INNERCOUNCIL tab.");
    }

    const response = ui.alert('Confirm Auto-Fix', `This will check all emails in the ${sheetName} tab.\n\nIf it finds a Main Email, it will automatically replace it with the correct bitmappro email and log the change in the 'Sync Logs' tab.\n\nContinue?`, ui.ButtonSet.YES_NO);
    if (response !== ui.Button.YES) return;

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) return ui.alert("Missing POSTGREST_TOKEN.");

    const headers = { "Authorization": "Bearer " + token, "Accept": "application/json" };
    const BASE_URL = "https://api.xfnite.cloud";

    sheet.getParent().toast("Fetching users from database...", "Auto-Fixing Emails", -1);

    try {
        const userRes = UrlFetchApp.fetch(BASE_URL + "/User?select=email,gingerEmail", { "method": "GET", "headers": headers });
        const userData = JSON.parse(userRes.getContentText());

        // Create maps for lookup
        const validGingerEmails = new Set();
        const emailToGingerEmailMap = new Map();

        userData.forEach(u => {
            if (u.gingerEmail) validGingerEmails.add(String(u.gingerEmail).trim().toLowerCase());
            if (u.email && u.gingerEmail) {
                emailToGingerEmailMap.set(String(u.email).trim().toLowerCase(), String(u.gingerEmail).trim());
            }
        });

        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        const headerRow = values[0];

        // 🔹 UPDATED: Smarter way to find the email column regardless of the tab
        let emailColIdx = -1;
        for (let j = 0; j < headerRow.length; j++) {
            const hStr = String(headerRow[j]).trim().toLowerCase();
            if (hStr === "bitmappro email login:" || hStr === "gingeremail") {
                emailColIdx = j;
                break;
            }
        }

        if (emailColIdx === -1) return ui.alert(`Could not find the email column on this tab.`);

        let fixCount = 0;
        let notFoundCount = 0;

        const backgrounds = [];
        const notes = [];
        const newValues = [];
        const logs = [];

        for (let i = 1; i < values.length; i++) {
            const cellValue = String(values[i][emailColIdx]).trim();
            if (!cellValue) {
                backgrounds.push([null]);
                notes.push([null]);
                newValues.push([cellValue]);
                continue;
            }

            const cellLower = cellValue.toLowerCase();

            if (!validGingerEmails.has(cellLower)) {
                if (emailToGingerEmailMap.has(cellLower)) {
                    // Found a main email, we can fix it!
                    const correctGingerEmail = emailToGingerEmailMap.get(cellLower);

                    backgrounds.push(["#D9EAD3"]); // Light Green to show it was fixed
                    notes.push([`Auto-Fixed: Replaced main email (${cellValue}) with correct bitmappro email (${correctGingerEmail})`]);
                    newValues.push([correctGingerEmail]);

                    logs.push([new Date().toLocaleString(), "EMAIL_AUTO_FIX", `${sheetName} Row ${i + 1}: Changed ${cellValue} to ${correctGingerEmail}`]);
                    fixCount++;
                } else {
                    backgrounds.push(["#FFCC99"]); // Orange
                    notes.push(["Not Found: This email does not exist in the database as a main or bitmappro email."]);
                    newValues.push([cellValue]);
                    notFoundCount++;
                }
            } else {
                backgrounds.push([null]);
                notes.push([null]);
                newValues.push([cellValue]);
            }
        }

        const targetRange = sheet.getRange(2, emailColIdx + 1, newValues.length, 1);
        targetRange.setValues(newValues);
        targetRange.setBackgrounds(backgrounds);
        targetRange.setNotes(notes);

        if (logs.length > 0) {
            let logSheet = ss.getSheetByName("Sync Logs");
            if (!logSheet) {
                logSheet = ss.insertSheet("Sync Logs");
                logSheet.appendRow(["Timestamp", "Type", "Details"]);
                logSheet.getRange("A1:C1").setFontWeight("bold");
            }
            logSheet.getRange(logSheet.getLastRow() + 1, 1, logs.length, 3).setValues(logs);
        }

        ui.alert('Auto-Fix Complete', `✅ Checked all emails on the ${sheetName} tab.\n\n🟢 Auto-Fixed ${fixCount} emails.\n🟠 Found ${notFoundCount} unknown emails.\n\nFixed emails are highlighted green. Check the 'Sync Logs' tab for full details!`, ui.ButtonSet.OK);

    } catch (err) {
        ui.alert("Error: " + err.toString());
    }
}


/**
 * 7. BULK UPDATE STATUSES
 * Mimics onStatusEdit but runs across filtered/visible rows with a valid ID.
 */
function bulkUpdateAllStatuses() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();

    const startResponse = ui.prompt(
        'Confirm Bulk Status Update (Step 1 of 2)',
        "Enter START row to update (e.g., '2').\nLeave blank to start from row 2.",
        ui.ButtonSet.OK_CANCEL
    );
    if (startResponse.getSelectedButton() !== ui.Button.OK) return;
    const startInput = startResponse.getResponseText().trim();

    const endResponse = ui.prompt(
        'Confirm Bulk Status Update (Step 2 of 2)',
        "Enter END row to update (e.g., '500').\nLeave blank to update all the way to the end.",
        ui.ButtonSet.OK_CANCEL
    );
    if (endResponse.getSelectedButton() !== ui.Button.OK) return;
    const endInput = endResponse.getResponseText().trim();

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    if (values.length < 2) return ui.alert("No data found.");

    let startRow = 2;
    let endRow = values.length;

    if (startInput) {
        startRow = parseInt(startInput, 10);
        if (isNaN(startRow)) return ui.alert("Invalid START row format. Must be a number.");
    }

    if (endInput) {
        endRow = parseInt(endInput, 10);
        if (isNaN(endRow)) return ui.alert("Invalid END row format. Must be a number.");
    }

    if (startRow > endRow) {
        return ui.alert("Error: START row cannot be greater than END row.");
    }

    const headersRow = values[0];

    // Find the 'Status' column automatically
    const statusIdx = headersRow.findIndex(h => String(h).toUpperCase().includes("STATUS") && !String(h).toUpperCase().includes("PUSH"));
    const idColIdx = headersRow.findIndex(h => String(h).trim().toLowerCase() === "id");

    if (statusIdx === -1) return ui.alert("Error: Missing 'Status' column on this sheet.");

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) return ui.alert("Setup Error: Missing POSTGREST_TOKEN.");

    const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" };
    const BASE_URL = "https://api.xfnite.cloud";

    sheet.getParent().toast(`Preparing bulk status update for rows ${startRow} to ${endRow}...`, "Bulk Update", -1);

    const patches = [];
    const now = new Date().toISOString();

    for (let i = 1; i < values.length; i++) {
        // 1-based index for sheet row (Row 1 is headers, so i=1 corresponds to Sheet Row 2)
        const rowNum = i + 1;

        // Check if row is outside the selected range
        if (rowNum < startRow || rowNum > endRow) {
            continue;
        }

        // Check if row is hidden by a filter
        if (sheet.isRowHiddenByFilter(rowNum)) {
            continue; // Skip hidden/filtered out rows
        }

        const row = values[i];
        let rowId = null;

        // First try the ID column if one was explicitly found
        if (idColIdx !== -1) {
            const val = String(row[idColIdx] || "").trim();
            if (val.length === 36 && val.split("-").length === 5) {
                rowId = val;
            }
        }

        // Fallback: search columns 9 to 20 for a UUID (just like onStatusEdit logic)
        if (!rowId) {
            for (let c = 8; c <= 19; c++) {
                if (c >= row.length) break;
                const val = String(row[c] || "").trim();
                if (val.length === 36 && val.split("-").length === 5) {
                    rowId = val;
                    break;
                }
            }
        }

        if (!rowId) continue;

        const newStatus = String(row[statusIdx] || "").trim();
        if (!newStatus) continue;

        const payloadObj = { status: newStatus, updatedAt: now };
        if (newStatus.toLowerCase() === "sent") {
            payloadObj.payoutDate = now;
        }

        patches.push({ id: rowId, rowNum: rowNum, payload: payloadObj });
    }

    if (patches.length === 0) {
        return ui.alert("Bulk Update Complete!\n\nNo visible rows with valid IDs and statuses found to update.");
    }

    sheet.getParent().toast(`Syncing ${patches.length} status updates to the database...`, "Bulk Update", -1);

    // Checked before the update: only rows changing to "Sent" get an inbox message
    const sentIds = patches.filter(p => p.payload.status.toLowerCase() === "sent").map(p => p.id);
    const becomingSent = sentIds.length > 0 ? getRowsBecomingSent_(BASE_URL, headers, sentIds) : {};
    const toNotify = [];

    let successCount = 0;
    let failCount = 0;
    const successRows = [];

    // Process requests in batches using UrlFetchApp.fetchAll to improve performance
    const BATCH_SIZE = 50;
    for (let i = 0; i < patches.length; i += BATCH_SIZE) {
        const batch = patches.slice(i, i + BATCH_SIZE);

        const requests = batch.map(item => ({
            url: BASE_URL + `/IncomeHistory?id=eq.${encodeURIComponent(item.id)}`,
            method: "PATCH",
            headers: headers,
            payload: JSON.stringify(item.payload),
            muteHttpExceptions: true
        }));

        try {
            const responses = UrlFetchApp.fetchAll(requests);
            responses.forEach((res, index) => {
                if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
                    successCount++;
                    successRows.push(batch[index].rowNum);
                    if (becomingSent[batch[index].id]) toNotify.push(becomingSent[batch[index].id]);
                } else {
                    failCount++;
                }
            });
        } catch (e) {
            failCount += batch.length;
        }
    }

    // Log status change date in Column AI (35) and update B2/AJ, AK, AL for all successfully updated rows
    if (successRows.length > 0) {
        const statusChangeDate = new Date();
        const b2Cell = sheet.getRange("B2");
        let currentBal = (parseCurrencyValue(b2Cell.getValue()).value) || 0;
        const bankInfo = getWhoseBankAndWhoSent_(sheet);
        const cols = getBankAndSenderColIndices_(sheet, headersRow);

        successRows.sort((a, b) => a - b);
        successRows.forEach(rowNum => {
            sheet.getRange(rowNum, 35).setValue(statusChangeDate);
            const rowPatch = patches.find(p => p.rowNum === rowNum);
            if (rowPatch && rowPatch.payload.status.toLowerCase() === "sent") {
                const sal = (parseCurrencyValue(sheet.getRange(rowNum, 3).getValue()).value) || 0;
                currentBal -= sal;
                sheet.getRange(rowNum, 36).setValue(currentBal);

                const bankInfo = getWhoseBankAndWhoSent_(sheet, rowNum);
                if (bankInfo.whoseBank) {
                    sheet.getRange(rowNum, cols.whoseBankCol).setValue(bankInfo.whoseBank);
                }
                if (bankInfo.whoSent) {
                    sheet.getRange(rowNum, cols.whoSentCol).setValue(bankInfo.whoSent);
                }
                if (bankInfo.mop) {
                    sheet.getRange(rowNum, cols.mopCol).setValue(bankInfo.mop);
                }
            }
        });
        b2Cell.setValue(currentBal);
    }

    // Inbox messages for payouts that just became "Sent", in batches of 100
    let notifiedCount = 0;
    for (let i = 0; i < toNotify.length; i += 100) {
        notifiedCount += sendPayoutSentNotices_(BASE_URL, headers, toNotify.slice(i, i + 100));
    }

    if (typeof logSyncActivity === "function") {
        logSyncActivity("BULK_STATUS_UPDATE", `Bulk status update ran on filtered rows. Success: ${successCount}, Failed: ${failCount}, Notified: ${notifiedCount}/${toNotify.length}`);
    }

    ui.alert('Bulk Status Update Complete', `✅ Successfully updated statuses: ${successCount}\n🔴 Failed: ${failCount}\n📩 Members notified (newly Sent): ${notifiedCount}${notifiedCount < toNotify.length ? ` of ${toNotify.length} — check the sync log` : ""}`, ui.ButtonSet.OK);
}

/**
 * 8. BACKFILL FUNCTION
 * Recalculates and fills Column AJ logs for visible rows already marked "Sent",
 * and sets B2 to the final remaining balance.
 */
function backfillSentLogs() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();

    const response = ui.prompt(
        "Backfill Sent Logs",
        "Enter your starting bank balance before any of these rows were sent (e.g. 736402.66):",
        ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== ui.Button.OK) return;

    const inputVal = response.getResponseText().trim();
    const startBalRes = parseCurrencyValue(inputVal);
    if (startBalRes.value === null) {
        return ui.alert("Invalid number entered.");
    }

    let currentBal = startBalRes.value;
    const lastRow = sheet.getLastRow();
    if (lastRow < 12) return ui.alert("No data rows found.");

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let statusColIdx = headers.findIndex(h => String(h).toUpperCase().includes("STATUS") && !String(h).toUpperCase().includes("PUSH"));
    if (statusColIdx === -1) return ui.alert("Missing 'Status' column.");

    const cols = getBankAndSenderColIndices_(sheet, headers);

    let count = 0;
    for (let r = 12; r <= lastRow; r++) {
        // Respect active filter so it only backfills visible rows!
        if (sheet.isRowHiddenByFilter(r)) continue;

        const status = String(sheet.getRange(r, statusColIdx + 1).getValue() || "").trim().toLowerCase();
        if (status === "sent") {
            const salary = (parseCurrencyValue(sheet.getRange(r, 3).getValue()).value) || 0;
            currentBal -= salary;
            sheet.getRange(r, 36).setValue(currentBal);

            const bankInfo = getWhoseBankAndWhoSent_(sheet, r);
            if (bankInfo.whoseBank) {
                sheet.getRange(r, cols.whoseBankCol).setValue(bankInfo.whoseBank);
            }
            if (bankInfo.whoSent) {
                sheet.getRange(r, cols.whoSentCol).setValue(bankInfo.whoSent);
            }
            if (bankInfo.mop) {
                sheet.getRange(r, cols.mopCol).setValue(bankInfo.mop);
            }
            count++;
        }
    }

    sheet.getRange("B2").setValue(currentBal);
    ui.alert("Backfill Complete", `✅ Updated ${count} sent rows in Column AJ.\n\n💰 Bank Balance in B2 is now: ${currentBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, ui.ButtonSet.OK);
}
