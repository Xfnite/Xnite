/**
 * XFNITE REFERRAL BONUS SYNC
 * 
 * Pushes recruit ginger usernames and recruiter share amounts from Google Sheets
 * to the Xfnite database via PostgREST.
 * 
 * Sheet format:
 *   Column A: Recruits Ginger Username (e.g. user_name / XFd_chrbann23)
 *   Column B: Recruiter Share / Bonus (e.g. Recruiter Pin - 56.37)
 *   Column C: Push Status (Written automatically by script)
 */

const BASE_URL = "https://api.xfnite.cloud";
const TABLE_NAME = "ReferralBonus";
const BATCH_SIZE = 50;

/**
 * Custom Menu for Referral Bonus Sync (called from main onOpen in code.gs)
 */
function createReferralBonusMenu(ui) {
    if (!ui) ui = SpreadsheetApp.getUi();
    ui.createMenu('Referral Bonus Sync')
        .addItem('🚀 PUSH ALL: Recruiter Share to DB', 'pushAllReferralBonuses')
        .addItem('💸 PUSH SINGLE: Selected Row to DB', 'pushSingleReferralBonus')
        .addSeparator()
        .addItem('⚡ FORCE PUSH ALL: Overwrite Already Pushed', 'forcePushAllReferralBonuses')
        .addToUi();
}

/**
 * Helper to get PostgREST authorization headers
 */
function getAuthHeaders_() {
    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) {
        SpreadsheetApp.getUi().alert("Setup Error: Missing POSTGREST_TOKEN in Script Properties.\n\nGo to Project Settings > Script Properties and add POSTGREST_TOKEN.");
        return null;
    }
    return {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    };
}

/**
 * Extracts default cutoff name from Spreadsheet Title (e.g. "Recr Bonus - October 15, 2026")
 */
function getDefaultCutoffName_(ss) {
    const title = ss.getName().trim();
    const cleaned = title.replace(/^recr\s*bonus\s*[-–—:]\s*/i, "").trim();
    if (cleaned) {
        return cleaned.toLowerCase().includes("cutoff") ? cleaned : cleaned + " Cutoff";
    }
    return "Current Cutoff";
}

/**
 * Prompts user to confirm or customize the Cutoff Name
 */
function promptCutoff_(ss) {
    const defaultCutoff = getDefaultCutoffName_(ss);
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt(
        'Push Referral Bonuses',
        'Confirm or enter Cutoff Name:\n(Default extracted from sheet title)',
        ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() !== ui.Button.OK) {
        return null;
    }

    const input = response.getResponseText().trim();
    return input || defaultCutoff;
}

/**
 * Safely parses currency / numeric values from sheet cells
 */
function parseCurrencyValue(rawValue) {
    if (typeof rawValue === 'number') {
        return { value: rawValue, raw: rawValue };
    }
    const str = String(rawValue == null ? "" : rawValue).trim();
    if (str === "") {
        return { value: null, raw: str };
    }
    const cleaned = str.replace(/[^0-9.\-]/g, '');
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) {
        return { value: null, raw: str };
    }
    return { value: parsed, raw: str };
}

/**
 * Identifies column indices for user_name, recruiter share, and push status
 */
function getColumnIndices_(sheet, headersRow) {
    const headers = headersRow.map(h => String(h || "").trim().toLowerCase());

    // 1. Column A (user_name / ginger username)
    let userColIdx = headers.findIndex(h => h.includes("user_name") || h.includes("username") || h.includes("ginger"));
    if (userColIdx === -1) userColIdx = 0; // Default Column A

    // 2. Column B (recruiter share / pin / bonus)
    let shareColIdx = headers.findIndex(h => h.includes("recruiter") || h.includes("share") || h.includes("bonus") || h.includes("pin"));
    if (shareColIdx === -1) shareColIdx = 1; // Default Column B

    // 3. Status Column (find existing or create at Column C)
    let statusColIdx = headers.findIndex(h => h.includes("push status") || h === "status");
    if (statusColIdx === -1) {
        statusColIdx = Math.max(headersRow.length, 2);
        sheet.getRange(1, statusColIdx + 1).setValue("Push Status").setFontWeight("bold");
    }

    return { userColIdx, shareColIdx, statusColIdx };
}

/**
 * 1. PUSH ALL REFERRAL BONUSES TO DATABASE
 * Skips rows already marked as "Pushed"
 */
function pushAllReferralBonuses() {
    executeReferralBonusPush_(false);
}

/**
 * 2. FORCE PUSH ALL REFERRAL BONUSES TO DATABASE
 * Overwrites / re-pushes all rows even if marked "Pushed"
 */
function forcePushAllReferralBonuses() {
    executeReferralBonusPush_(true);
}

/**
 * Core push execution function
 */
function executeReferralBonusPush_(forcePush) {
    const ui = SpreadsheetApp.getUi();
    const headers = getAuthHeaders_();
    if (!headers) return;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length < 2) {
        return ui.alert("No recruit bonus data found in this sheet.");
    }

    // Prompt for cutoff
    const cutoff = promptCutoff_(ss);
    if (!cutoff) return;

    const { userColIdx, shareColIdx, statusColIdx } = getColumnIndices_(sheet, values[0]);

    sheet.getParent().toast("Fetching existing records from DB...", "Referral Bonus Sync", -1);

    // Fetch existing records for this cutoff from PostgREST to perform PATCH vs POST
    let existingMap = new Map();
    try {
        const fetchUrl = BASE_URL + `/${TABLE_NAME}?cutoff=eq.${encodeURIComponent(cutoff)}&select=id,gingerUsername,user_name`;
        const fetchRes = UrlFetchApp.fetch(fetchUrl, { method: "GET", headers: headers, muteHttpExceptions: true });

        if (fetchRes.getResponseCode() === 200) {
            const existingRows = JSON.parse(fetchRes.getContentText());
            existingRows.forEach(r => {
                const u1 = (r.gingerUsername || "").trim().toLowerCase();
                const u2 = (r.user_name || "").trim().toLowerCase();
                if (u1) existingMap.set(u1, r.id);
                if (u2) existingMap.set(u2, r.id);
            });
        }
    } catch (err) {
        Logger.log("Notice: Could not fetch existing records, proceeding with POST: " + err);
    }

    const now = new Date().toISOString();
    const patches = [];
    const posts = [];
    const errorRows = [];
    let skippedPushed = 0;

    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const sheetRowNum = i + 1;
        const rawUsername = String(row[userColIdx] || "").trim();
        const rawShare = row[shareColIdx];
        const currentStatus = String(row[statusColIdx] || "").trim().toLowerCase();

        // Skip blank rows
        if (!rawUsername && (rawShare === "" || rawShare === null || rawShare === undefined)) {
            continue;
        }

        if (!rawUsername) {
            errorRows.push({ row: sheetRowNum, reason: "Missing username" });
            continue;
        }

        // Skip already pushed unless forcePush
        if (!forcePush && currentStatus === "pushed") {
            skippedPushed++;
            continue;
        }

        const parsed = parseCurrencyValue(rawShare);
        if (parsed.value === null) {
            errorRows.push({ row: sheetRowNum, reason: "Invalid amount" });
            continue;
        }

        const usernameKey = rawUsername.toLowerCase();
        const payload = {
            gingerUsername: rawUsername,
            amount: parsed.value,
            cutoff: cutoff,
            status: "Active",
            updatedAt: now
        };

        if (existingMap.has(usernameKey)) {
            patches.push({
                sheetRow: sheetRowNum,
                id: existingMap.get(usernameKey),
                payload: payload
            });
        } else {
            posts.push({
                sheetRow: sheetRowNum,
                payload: Object.assign({ createdAt: now }, payload)
            });
        }
    }

    if (patches.length === 0 && posts.length === 0) {
        let msg = "No rows to push.";
        if (skippedPushed > 0) msg += `\n(${skippedPushed} rows already marked as 'Pushed')`;
        return ui.alert(msg);
    }

    sheet.getParent().toast(`Syncing ${patches.length + posts.length} rows to DB...`, "Referral Bonus Sync", -1);

    let successCount = 0;
    let failCount = 0;
    const successRows = [];

    // 1. Batch execute PATCH requests
    for (let i = 0; i < patches.length; i += BATCH_SIZE) {
        const batch = patches.slice(i, i + BATCH_SIZE);
        const requests = batch.map(item => ({
            url: BASE_URL + `/${TABLE_NAME}?id=eq.${encodeURIComponent(item.id)}`,
            method: "PATCH",
            headers: headers,
            payload: JSON.stringify(item.payload),
            muteHttpExceptions: true
        }));

        try {
            const responses = UrlFetchApp.fetchAll(requests);
            responses.forEach((res, idx) => {
                const item = batch[idx];
                if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
                    successCount++;
                    successRows.push(item.sheetRow);
                } else {
                    failCount++;
                    errorRows.push({ row: item.sheetRow, reason: "API Error " + res.getResponseCode() });
                }
            });
        } catch (err) {
            failCount += batch.length;
            batch.forEach(item => errorRows.push({ row: item.sheetRow, reason: "Batch failed: " + err.message }));
        }
    }

    // 2. Batch execute POST requests
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        const requests = batch.map(item => ({
            url: BASE_URL + `/${TABLE_NAME}?on_conflict=gingerUsername,cutoff`,
            method: "POST",
            headers: headers,
            payload: JSON.stringify(item.payload),
            muteHttpExceptions: true
        }));

        try {
            const responses = UrlFetchApp.fetchAll(requests);
            responses.forEach((res, idx) => {
                const item = batch[idx];
                if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
                    successCount++;
                    successRows.push(item.sheetRow);
                } else {
                    failCount++;
                    errorRows.push({ row: item.sheetRow, reason: "API Error " + res.getResponseCode() });
                }
            });
        } catch (err) {
            failCount += batch.length;
            batch.forEach(item => errorRows.push({ row: item.sheetRow, reason: "Batch failed: " + err.message }));
        }
    }

    // 3. Update sheet status column
    if (successRows.length > 0) {
        sheet.getParent().toast("Writing 'Pushed' markers...", "Referral Bonus Sync", -1);
        successRows.forEach(rowNum => {
            sheet.getRange(rowNum, statusColIdx + 1).setValue("Pushed");
        });
    }

    if (errorRows.length > 0) {
        errorRows.forEach(item => {
            sheet.getRange(item.row, statusColIdx + 1).setValue("Error: " + item.reason);
        });
    }

    let summaryMsg = `Push Complete!\n\n`
        + `Cutoff: ${cutoff}\n`
        + `✅ Successfully pushed: ${successCount}\n`
        + `❌ Errors / Failed: ${failCount}`;

    if (skippedPushed > 0 && !forcePush) {
        summaryMsg += `\n⏩ Skipped (already pushed): ${skippedPushed}`;
    }

    ui.alert(summaryMsg);
}

/**
 * 3. PUSH SINGLE ROW TO DATABASE
 * Pushes the currently selected row in the spreadsheet
 */
function pushSingleReferralBonus() {
    const ui = SpreadsheetApp.getUi();
    const headers = getAuthHeaders_();
    if (!headers) return;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    const activeRow = sheet.getActiveCell().getRow();

    if (activeRow < 2) {
        return ui.alert("Please select a data row (Row 2 or below).");
    }

    const headersRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 3)).getValues()[0];
    const { userColIdx, shareColIdx, statusColIdx } = getColumnIndices_(sheet, headersRow);

    const rowValues = sheet.getRange(activeRow, 1, 1, Math.max(sheet.getLastColumn(), statusColIdx + 1)).getValues()[0];
    const rawUsername = String(rowValues[userColIdx] || "").trim();
    const rawShare = rowValues[shareColIdx];

    if (!rawUsername) {
        return ui.alert(`Row ${activeRow}: Username is empty.`);
    }

    const parsed = parseCurrencyValue(rawShare);
    if (parsed.value === null) {
        return ui.alert(`Row ${activeRow}: Invalid recruiter share amount.`);
    }

    const cutoff = getDefaultCutoffName_(ss);
    const now = new Date().toISOString();

    sheet.getParent().toast(`Pushing Row ${activeRow} (${rawUsername})...`, "Referral Bonus Sync", -1);

    // Check if record exists for this cutoff
    let existingId = null;
    try {
        const checkUrl = BASE_URL + `/${TABLE_NAME}?cutoff=eq.${encodeURIComponent(cutoff)}&user_name=eq.${encodeURIComponent(rawUsername)}&select=id`;
        const checkRes = UrlFetchApp.fetch(checkUrl, { method: "GET", headers: headers, muteHttpExceptions: true });
        if (checkRes.getResponseCode() === 200) {
            const items = JSON.parse(checkRes.getContentText());
            if (items.length > 0) existingId = items[0].id;
        }
    } catch (e) {
        Logger.log("Check error: " + e);
    }

    const payload = {
        gingerUsername: rawUsername,
        user_name: rawUsername,
        amount: parsed.value,
        share: parsed.value,
        cutoff: cutoff,
        status: "Active",
        updatedAt: now
    };

    let pushSuccess = false;
    try {
        if (existingId) {
            const patchRes = UrlFetchApp.fetch(BASE_URL + `/${TABLE_NAME}?id=eq.${encodeURIComponent(existingId)}`, {
                method: "PATCH",
                headers: headers,
                payload: JSON.stringify(payload),
                muteHttpExceptions: true
            });
            pushSuccess = (patchRes.getResponseCode() >= 200 && patchRes.getResponseCode() < 300);
        } else {
            const postRes = UrlFetchApp.fetch(BASE_URL + `/${TABLE_NAME}?on_conflict=gingerUsername,cutoff`, {
                method: "POST",
                headers: headers,
                payload: JSON.stringify(Object.assign({ createdAt: now }, payload)),
                muteHttpExceptions: true
            });
            pushSuccess = (postRes.getResponseCode() >= 200 && postRes.getResponseCode() < 300);
        }
    } catch (err) {
        return ui.alert("Network/API Error: " + err.message);
    }

    if (pushSuccess) {
        sheet.getRange(activeRow, statusColIdx + 1).setValue("Pushed");
        sheet.getParent().toast(`Row ${activeRow} pushed successfully!`, "Success", 3);
    } else {
        sheet.getRange(activeRow, statusColIdx + 1).setValue("Error");
        ui.alert(`Failed to push Row ${activeRow}. Please check your POSTGREST_TOKEN.`);
    }
}

