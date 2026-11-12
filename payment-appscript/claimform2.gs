/**
 * XFNITE CLAIMFORM 2 - REFERRAL BONUS WITHDRAWALS SYNC
 * 
 * Handles pulling and syncing referral bonus withdrawal requests from
 * the Xfnite database ("ReferralWithdrawal" table, separate from IncomeHistory)
 * into the 'Claimform2' sheet.
 * 
 * Supports both:
 *   1. Custom Claimform2 layout (Col A: gingeremail, Col B: Salary, Col C: MOP, Col D: Status, etc.)
 *   2. Standard ClaimForm1 layout (Col A: Name, Col B: gingeremail, Col C: Salary, etc.)
 */

const CF2_BASE_URL = "https://api.xfnite.cloud";

/**
 * Normalizes cutoff strings for comparison (e.g. "October 15, 2026 Cutoff" -> "october152026")
 */
function normalizeCutoffString_(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/cutoff/gi, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

/**
 * Resolves the active Cutoff Name
 * Priority:
 *   1. Spreadsheet Title (e.g. "October 15, 2026" or "Recr Bonus - October 15, 2026")
 *   2. Fallback: FINAL!T3 if spreadsheet title has no date/month
 */
function getActiveCutoffName_(ss) {
    // 1. Prioritize Spreadsheet Title
    const title = ss.getName().trim();
    const cleanTitle = title.replace(/^recr\s*bonus\s*[-–—:]\s*/i, "").trim();

    const monthsRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
    if (monthsRegex.test(cleanTitle)) {
        return cleanTitle.toLowerCase().includes("cutoff") ? cleanTitle : cleanTitle + " Cutoff";
    }

    // 2. Fallback: FINAL!T3
    const finalSheet = ss.getSheetByName("FINAL");
    if (finalSheet) {
        const t3Val = String(finalSheet.getRange("T3").getValue() || "").trim();
        if (t3Val) return t3Val;
    }

    return cleanTitle || "Current Cutoff";
}

/**
 * Main Pull Function for Claimform2
 */
function pullDataToClaimForm2(isAuto = false) {
    const ui = SpreadsheetApp.getUi();
    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');

    if (!token) {
        return ui.alert("Setup Error: Please add your POSTGREST_TOKEN in Apps Script Project Settings > Script Properties.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Claimform2") || ss.getSheetByName("ClaimForm2");
    if (!sheet) {
        return ui.alert("Error: 'Claimform2' sheet not found. Please ensure the tab is named 'Claimform2'.");
    }

    const targetCutoff = getActiveCutoffName_(ss);
    const targetNorm = normalizeCutoffString_(targetCutoff);

    const headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/json"
    };
    const options = {
        "method": "GET",
        "headers": headers,
        "muteHttpExceptions": true
    };

    try {
        sheet.getParent().toast(`Fetching referral bonus claims for "${targetCutoff}"...`, "Claimform2 Sync", -1);

        const paymentRes = UrlFetchApp.fetch(CF2_BASE_URL + "/PaymentDetails?select=email,payeeName,lastName,payeeUid,paymentMethod,qrImageUrl", options);
        const userRes = UrlFetchApp.fetch(CF2_BASE_URL + "/User?select=email,gingerEmail,role,name,firstName,lastName,gingerUsername", options);
        const historyRes = UrlFetchApp.fetch(CF2_BASE_URL + "/ReferralWithdrawal?select=id,email,amount,status,createdAt,sentAt,cutoffLabel,cutoffs,paymentMethod,payeeUid,payeeName&order=createdAt.asc", options);

        if (paymentRes.getResponseCode() !== 200) return ui.alert(`Payment API Error: ${paymentRes.getContentText()}`);
        if (userRes.getResponseCode() !== 200) return ui.alert(`User API Error: ${userRes.getContentText()}`);
        if (historyRes.getResponseCode() !== 200) return ui.alert(`History API Error: ${historyRes.getContentText()}`);

        const dbPayments = JSON.parse(paymentRes.getContentText()) || [];
        const dbUsers = JSON.parse(userRes.getContentText()) || [];
        const dbHistoryAll = JSON.parse(historyRes.getContentText()) || [];

        // Referral withdrawals covering this cutoff (a withdrawal can span several cutoffs).
        // Normalized to the field names used below (amountPaid / payoutDate).
        const referralClaims = dbHistoryAll.filter(h => {
            const cutoffVals = [].concat(h.cutoffs || [], h.cutoffLabel || [])
                .map(c => String(c || "").trim())
                .filter(Boolean);
            if (cutoffVals.length === 0) return true; // If no cutoff tagged, include as active

            return cutoffVals.some(c => {
                const cutoffNorm = normalizeCutoffString_(c);
                return cutoffNorm === targetNorm || cutoffNorm.includes(targetNorm) || targetNorm.includes(cutoffNorm);
            });
        }).map(h => Object.assign({}, h, { amountPaid: h.amount, payoutDate: h.sentAt }));

        // Detect sheet layout by looking at Column A header (Row 1)
        const colAHeader = String(sheet.getRange(1, 1).getValue() || "").trim().toLowerCase();
        const isStandardClaimForm1Layout = colAHeader.includes("name");

        // Ensure Column T has the "ID" header so ID tracking and status syncing work automatically
        if (sheet.getRange(1, 20).getValue() === "") {
            sheet.getRange(1, 20).setValue("ID").setFontWeight("bold");
        }

        // Initialize rows 2-11 control block if empty (matching ClaimForm1 structure)
        const a2Val = String(sheet.getRange("A2").getValue() || "").trim();
        if (!a2Val) {
            sheet.getRange("A2").setValue("Balance:").setFontWeight("bold");
            sheet.getRange("A3").setValue("Whose Bank?:").setFontWeight("bold");
            sheet.getRange("A4").setValue("Who Sent?:").setFontWeight("bold");

            // Common MOP presets in Column C (matching ClaimForm1)
            const defaultPresets = [
                ["999999 GCASH"],
                ["999999 Palawan Pera Padala"],
                ["999999 bank_bpi"],
                ["999999 Cebuana"],
                ["999999 bank_bdo"],
                ["999999 M Lhuillier"],
                ["999999 bank_other"],
                ["999999 Metrobank"],
                ["999999 bank_landbank"],
                ["999999 Binance TRC20"]
            ];
            sheet.getRange(2, 3, defaultPresets.length, 1).setValues(defaultPresets);
        }

        const maxRow = sheet.getLastRow();

        // Calculate true last row based on Column A or D (starting only from Row 12!)
        let trueLastRow = 11; // Data rows start at Row 12
        if (maxRow >= 12) {
            const checkCol = isStandardClaimForm1Layout ? 4 : 1; // Col D for standard, Col A for custom
            const colVals = sheet.getRange(12, checkCol, maxRow - 11, 1).getValues();
            for (let i = colVals.length - 1; i >= 0; i--) {
                if (String(colVals[i][0]).trim() !== "") {
                    trueLastRow = 12 + i;
                    break;
                }
            }
        }

        // Map existing IDs in Column T (20) to their row indices for in-place updates (only from row 12!)
        const idRowMap = new Map();
        if (maxRow >= 12) {
            const idValuesT = sheet.getRange(12, 20, maxRow - 11, 1).getValues();
            for (let i = 0; i < idValuesT.length; i++) {
                const val = String(idValuesT[i][0]).trim();
                if (val && val !== "#N/A") {
                    idRowMap.set(val, 12 + i); // row index
                }
            }
        }

        let updatedCount = 0;
        const newRecords = [];

        referralClaims.forEach(h => {
            const livePay = dbPayments.find(p => p.email && p.email.toLowerCase() === (h.email || "").toLowerCase()) || {};
            // Prefer the payment details captured when the withdrawal was requested.
            const pay = Object.assign({}, livePay, {
                paymentMethod: h.paymentMethod || livePay.paymentMethod,
                payeeUid: h.payeeUid || livePay.payeeUid,
                payeeName: h.payeeName || livePay.payeeName,
                lastName: h.payeeName ? "" : livePay.lastName,
            });
            const usr = dbUsers.find(u => u.email && u.email.toLowerCase() === (h.email || "").toLowerCase()) || {};

            const gingerEmail = usr.gingerEmail || h.gingerUsername || usr.email || "";
            const salary = Math.round(Number(h.amountPaid || 0) * 100) / 100;
            const method = pay.paymentMethod || "";
            const status = h.status || "Pending";

            let ts = h.createdAt || "";
            if (ts) {
                const d = new Date(ts);
                if (!isNaN(d.getTime())) ts = d.toLocaleString();
            }

            let sentWhen = h.payoutDate || "";
            if (sentWhen) {
                const d = new Date(sentWhen);
                if (!isNaN(d.getTime())) sentWhen = d.toLocaleString();
            }

            const qrCode = pay.qrImageUrl || "";
            const role = usr.role || "";

            let fullName = pay.payeeName || "";
            if (pay.lastName) {
                fullName = fullName ? (fullName + " " + pay.lastName) : pay.lastName;
            }
            if (!fullName && usr.name) {
                fullName = usr.name;
            }

            let finalUserName = usr.name || "";
            if (usr.firstName || usr.lastName) {
                finalUserName = [usr.firstName, usr.lastName].filter(Boolean).join(" ");
            }
            if (!finalUserName) finalUserName = fullName;

            const mopAccountNum = pay.payeeUid || "";
            const claimId = String(h.id || "").trim();

            if (idRowMap.has(claimId)) {
                // Update existing row
                const rowToUpdate = idRowMap.get(claimId);

                if (isStandardClaimForm1Layout) {
                    // Standard ClaimForm1 Layout
                    sheet.getRange(rowToUpdate, 1, 1, 4).setValues([[finalUserName, gingerEmail, salary, method]]);
                    sheet.getRange(rowToUpdate, 8).setValue(status); // Col H (Status)
                    sheet.getRange(rowToUpdate, 31).setValue(role);   // Col AE (31)
                    sheet.getRange(rowToUpdate, 32).setValue(fullName); // Col AF (32)
                    sheet.getRange(rowToUpdate, 33).setValue(status); // Col AG (33)
                } else {
                    // Custom Claimform2 Layout (from screenshot)
                    sheet.getRange(rowToUpdate, 1, 1, 3).setValues([[gingerEmail, salary, method]]);
                    sheet.getRange(rowToUpdate, 8).setValue(status); // Col H (Status from Database)

                    const currentStatusColD = String(sheet.getRange(rowToUpdate, 4).getValue() || "").trim();
                    if (!currentStatusColD) {
                        sheet.getRange(rowToUpdate, 4).setValue(status);
                    }

                    if (qrCode) sheet.getRange(rowToUpdate, 6).setValue(qrCode);
                    sheet.getRange(rowToUpdate, 7).setValue(role);
                    if (sentWhen) sheet.getRange(rowToUpdate, 10).setValue(sentWhen);
                    sheet.getRange(rowToUpdate, 14, 1, 3).setValues([[method, fullName, mopAccountNum]]);
                }

                updatedCount++;
            } else {
                newRecords.push({
                    id: claimId,
                    finalUserName: finalUserName,
                    gingeremail: gingerEmail,
                    salary: salary,
                    method: method,
                    status: status,
                    timestamp: ts,
                    qrCode: qrCode,
                    role: role,
                    statusFromDb: status,
                    sentWhen: sentWhen,
                    mopName: fullName,
                    mopAccountNumber: mopAccountNum,
                });
            }
        });

        // Insert new records starting at trueLastRow + 1
        if (newRecords.length > 0) {
            let startRow = trueLastRow + 1;

            if (isStandardClaimForm1Layout) {
                // Standard ClaimForm1 Format
                const colAToD = [], statuses = [], timestamps = [], ids = [], roles = [], mopNames = [];
                newRecords.forEach(rec => {
                    colAToD.push([rec.finalUserName, rec.gingeremail, rec.salary, rec.method]);
                    statuses.push([rec.status]);
                    timestamps.push([rec.timestamp]);
                    ids.push([rec.id]);
                    roles.push([rec.role]);
                    mopNames.push([rec.mopName]);
                });

                sheet.getRange(startRow, 1, colAToD.length, 4).setValues(colAToD);
                sheet.getRange(startRow, 8, statuses.length, 1).setValues(statuses);  // Col H: Status
                sheet.getRange(startRow, 10, timestamps.length, 1).setValues(timestamps); // Col J: Timestamp
                sheet.getRange(startRow, 20, ids.length, 1).setValues(ids);         // Col T: ID
                sheet.getRange(startRow, 31, roles.length, 1).setValues(roles);     // Col AE: Role
                sheet.getRange(startRow, 32, mopNames.length, 1).setValues(mopNames); // Col AF: MOP Name
                sheet.getRange(startRow, 33, statuses.length, 1).setValues(statuses); // Col AG: Status
            } else {
                // Custom Claimform2 Format (from screenshot)
                const rowsData = [];
                const idsData = [];

                newRecords.forEach((rec, idx) => {
                    const currentRow = startRow + idx;
                    rowsData.push([
                        rec.gingeremail,                                // Col A (1)
                        rec.salary,                                     // Col B (2)
                        rec.method,                                     // Col C (3)
                        rec.status,                                     // Col D (4)
                        rec.timestamp,                                  // Col E (5)
                        rec.qrCode,                                     // Col F (6)
                        rec.role,                                       // Col G (7)
                        rec.statusFromDb,                               // Col H (8)
                        `=IF(D${currentRow}=H${currentRow},"MATCH","DISCREPANCY")`, // Col I (9)
                        rec.sentWhen,                                   // Col J (10)
                        "",                                             // Col K (11): Remaining Balance
                        "",                                             // Col L (12): Whose Bank?:
                        "",                                             // Col M (13): Who Sent?
                        rec.method,                                     // Col N (14): MOP
                        rec.mopName,                                    // Col O (15): MOP Name
                        rec.mopAccountNumber                            // Col P (16): MOP Account Number
                    ]);
                    idsData.push([rec.id]);                             // Col T (20): ID
                });

                sheet.getRange(startRow, 1, rowsData.length, 16).setValues(rowsData);
                sheet.getRange(startRow, 20, idsData.length, 1).setValues(idsData);
            }
        }

        const msg = `✅ Updated: ${updatedCount} | 📥 Inserted: ${newRecords.length} (Cutoff: ${targetCutoff})`;
        if (isAuto) {
            sheet.getParent().toast(msg, "Claimform2 Pull Complete", 6);
        } else {
            ui.alert("Claimform2 Pull Complete", `Target Cutoff: ${targetCutoff}\n\n${msg}`, ui.ButtonSet.OK);
        }

    } catch (err) {
        Logger.log("pullDataToClaimForm2 error: " + err);
        if (!isAuto) {
            ui.alert("Claimform2 Pull Failed", "Error: " + err.message, ui.ButtonSet.OK);
        }
    }
}

/**
 * Bulk Update Statuses from Claimform2 to Database
 * Scans visible rows in Claimform2, reads Column D or H (Status) and Column T (ID),
 * and updates ReferralWithdrawal via PostgREST (a DB trigger syncs the ReferralBonus rows).
 */
function bulkUpdateClaimForm2Statuses() {
    const ui = SpreadsheetApp.getUi();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Claimform2") || ss.getSheetByName("ClaimForm2");

    if (!sheet) {
        return ui.alert("Error: 'Claimform2' sheet not found.");
    }

    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');
    if (!token) return ui.alert("Setup Error: Missing POSTGREST_TOKEN in Script Properties.");

    const maxRow = sheet.getLastRow();
    if (maxRow < 12) return ui.alert("No claim data found in Claimform2 (claims start on row 12).");

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    const startPrompt = ui.prompt(
        'Bulk Status Update for Claimform2 (Step 1 of 2)',
        `Enter START row to update (e.g. 12):\nLeave blank to start from row 12.`,
        ui.ButtonSet.OK_CANCEL
    );
    if (startPrompt.getSelectedButton() !== ui.Button.OK) return;
    const startInput = startPrompt.getResponseText().trim();

    const endPrompt = ui.prompt(
        'Bulk Status Update for Claimform2 (Step 2 of 2)',
        `Enter END row to update (e.g. ${maxRow}):\nLeave blank to update through row ${maxRow}.`,
        ui.ButtonSet.OK_CANCEL
    );
    if (endPrompt.getSelectedButton() !== ui.Button.OK) return;
    const endInput = endPrompt.getResponseText().trim();

    let startRow = startInput ? parseInt(startInput, 10) : 12;
    let endRow = endInput ? parseInt(endInput, 10) : maxRow;

    if (isNaN(startRow) || isNaN(endRow) || startRow < 12 || startRow > endRow) {
        return ui.alert("Invalid row range entered. Data rows start at row 12.");
    }

    sheet.getParent().toast(`Syncing statuses for rows ${startRow} to ${endRow}...`, "Claimform2 Update", -1);

    const headersObj = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json"
    };

    let updatedCount = 0;
    let skippedCount = 0;
    const now = new Date().toISOString();

    const colAHeader = String(values[0][0] || "").toLowerCase();
    const isStandard = colAHeader.includes("name");
    const statusColIdx = isStandard ? 7 : 3; // Col H (index 7) or Col D (index 3)

    // Remaining Balance Tracking from B2
    const b2Cell = sheet.getRange("B2");
    let currentBal = (parseCurrencyValue(b2Cell.getValue()).value) || 0;
    const bankInfo = typeof getWhoseBankAndWhoSent_ === "function" ? getWhoseBankAndWhoSent_(sheet) : {
        whoseBank: String(sheet.getRange("B3").getValue() || "").trim(),
        whoSent: String(sheet.getRange("B4").getValue() || "").trim()
    };

    for (let r = startRow; r <= endRow && r <= values.length; r++) {
        if (sheet.isRowHiddenByFilter(r)) {
            skippedCount++;
            continue;
        }

        const rowIdx = r - 1;
        const row = values[rowIdx];

        const newStatus = String(row[statusColIdx] || "").trim();
        // ID is in Column T (index 19)
        const rowId = String(row[19] || "").trim();

        if (!newStatus || !rowId || rowId.length !== 36 || rowId.split("-").length !== 5) {
            skippedCount++;
            continue;
        }

        try {
            const patchUrl = `${CF2_BASE_URL}/ReferralWithdrawal?id=eq.${encodeURIComponent(rowId)}`;
            const payload = {
                status: newStatus,
                updatedAt: now
            };
            const isSent = newStatus.toLowerCase() === "sent" || newStatus.toLowerCase() === "paid";
            if (isSent) {
                payload.sentAt = now;
            }

            const response = UrlFetchApp.fetch(patchUrl, {
                method: "PATCH",
                headers: headersObj,
                payload: JSON.stringify(payload),
                muteHttpExceptions: true
            });

            if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
                if (isStandard) {
                    // Standard ClaimForm1 Layout
                    sheet.getRange(r, 8).setValue(newStatus); // Col H (Status)
                    sheet.getRange(r, 33).setValue(newStatus); // Col AG (33: Status from DB)

                    if (isSent) {
                        const sal = (parseCurrencyValue(sheet.getRange(r, 3).getValue()).value) || 0;
                        currentBal -= sal;

                        // Col AI (35): Sent When?
                        sheet.getRange(r, 35).setValue(new Date(now).toLocaleString());
                        // Col AJ (36): Remaining Balance
                        sheet.getRange(r, 36).setValue(currentBal);
                        // Col AK (37): Whose Bank?, Col AL (38): Who Sent?, Col AM (39): MOP
                        if (bankInfo.whoseBank) sheet.getRange(r, 37).setValue(bankInfo.whoseBank);
                        if (bankInfo.whoSent) sheet.getRange(r, 38).setValue(bankInfo.whoSent);
                        if (bankInfo.mop) sheet.getRange(r, 39).setValue(bankInfo.mop || sheet.getRange(r, 4).getValue());
                    }
                } else {
                    // Custom Claimform2 Layout (from screenshot)
                    sheet.getRange(r, 8).setValue(newStatus); // Col H (Status from Database)

                    if (isSent) {
                        const sal = (parseCurrencyValue(sheet.getRange(r, 2).getValue()).value) || 0;
                        currentBal -= sal;

                        // Col K (11): Remaining Balance
                        sheet.getRange(r, 11).setValue(currentBal);
                        // Col J (10): Sent When?
                        sheet.getRange(r, 10).setValue(new Date(now).toLocaleString());
                        // Col L (12): Whose Bank?, Col M (13): Who Sent?, Col N (14): MOP
                        if (bankInfo.whoseBank) sheet.getRange(r, 12).setValue(bankInfo.whoseBank);
                        if (bankInfo.whoSent) sheet.getRange(r, 13).setValue(bankInfo.whoSent);
                        if (bankInfo.mop) sheet.getRange(r, 14).setValue(bankInfo.mop || sheet.getRange(r, 3).getValue());
                    }
                }
                updatedCount++;
            } else {
                Logger.log(`Failed to update row ${r} (ID: ${rowId}): ${response.getContentText()}`);
            }
        } catch (e) {
            Logger.log(`Error updating row ${r}: ${e.message}`);
        }
    }

    b2Cell.setValue(currentBal);

    ui.alert(
        "Bulk Status Update Complete",
        `✅ Updated ${updatedCount} claims in Database.\n⏭️ Skipped ${skippedCount} rows.\n\n💰 Bank Balance in B2 is now: ${currentBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ui.ButtonSet.OK
    );
}

/**
 * Live edit listener specifically for Claimform2
 * Triggered from onStatusEdit whenever a user changes a status in Claimform2
 */
function onClaimForm2StatusEdit(e) {
    if (!e) return;

    const sheet = e.source.getActiveSheet();
    const range = e.range;
    const col = range.getColumn();
    const row = range.getRow();

    // Data rows start at Row 12
    if (row < 12) return;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colAHeader = String(headers[0] || "").trim().toLowerCase();
    const isStandardLayout = colAHeader.includes("name");

    let statusColIdx = -1;
    if (!isStandardLayout) {
        statusColIdx = 4; // Col D in custom layout
    } else {
        for (let i = 0; i < headers.length; i++) {
            if (String(headers[i]).toLowerCase().includes("status") && !String(headers[i]).toLowerCase().includes("push")) {
                statusColIdx = i + 1;
                break;
            }
        }
        if (statusColIdx === -1 && (col === 8 || col === 9)) {
            statusColIdx = col;
        }
    }

    if (statusColIdx === -1 || col !== statusColIdx) return;

    const newStatus = e.value || String(range.getValue() || "").trim();
    if (!newStatus) return;
    const oldStatus = String(e.oldValue || "").trim().toLowerCase();
    const wasAlreadySent = oldStatus === "sent";

    let rowId = null;
    if (!isStandardLayout) {
        rowId = String(sheet.getRange(row, 20).getValue() || "").trim();
    } else {
        const valT = String(sheet.getRange(row, 20).getValue() || "").trim();
        if (valT.length === 36 && valT.split("-").length === 5) {
            rowId = valT;
        } else {
            for (let c = 9; c <= 20; c++) {
                const val = String(sheet.getRange(row, c).getValue() || "").trim();
                if (val.length === 36 && val.split("-").length === 5) {
                    rowId = val;
                    break;
                }
            }
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
    const patchUrl = CF2_BASE_URL + `/ReferralWithdrawal?id=eq.${encodeURIComponent(rowId)}`;
    const now = new Date().toISOString();
    const payloadObj = { status: newStatus, updatedAt: now };

    const isSent = newStatus.toLowerCase() === "sent" || newStatus.toLowerCase() === "paid";
    if (isSent) {
        payloadObj.sentAt = now;
    }

    try {
        const patchRes = UrlFetchApp.fetch(patchUrl, {
            method: "PATCH",
            headers: headersObj,
            payload: JSON.stringify(payloadObj),
            muteHttpExceptions: true
        });

        if (patchRes.getResponseCode() >= 200 && patchRes.getResponseCode() < 300) {
            if (typeof logSyncActivity === "function") {
                logSyncActivity("STATUS_CHANGE_CF2", `Updated ID ${rowId} status to '${newStatus}' in ReferralWithdrawal`);
            }

            sheet.getRange(row, 8).setValue(newStatus);
            if (isStandardLayout) {
                sheet.getRange(row, 33).setValue(newStatus);
            }

            if (isSent) {
                const sentWhenCol = isStandardLayout ? 35 : 10;
                const remBalCol = isStandardLayout ? 36 : 11;
                const salaryCol = isStandardLayout ? 3 : 2;

                sheet.getRange(row, sentWhenCol).setValue(new Date().toLocaleString());

                if (!wasAlreadySent) {
                    const salary = (parseCurrencyValue(sheet.getRange(row, salaryCol).getValue()).value) || 0;
                    const b2Cell = sheet.getRange("B2");
                    const currentBal = (parseCurrencyValue(b2Cell.getValue()).value) || 0;
                    const newBal = currentBal - salary;
                    b2Cell.setValue(newBal);
                    sheet.getRange(row, remBalCol).setValue(newBal);
                }

                const bankInfo = typeof getWhoseBankAndWhoSent_ === "function" ? getWhoseBankAndWhoSent_(sheet, row) : {
                    whoseBank: String(sheet.getRange("B3").getValue() || "").trim(),
                    whoSent: String(sheet.getRange("B4").getValue() || "").trim(),
                    mop: String(sheet.getRange(row, isStandardLayout ? 4 : 3).getValue() || "").trim()
                };

                if (isStandardLayout) {
                    sheet.getRange(row, 37).setValue(bankInfo.whoseBank);
                    sheet.getRange(row, 38).setValue(bankInfo.whoSent);
                    sheet.getRange(row, 39).setValue(bankInfo.mop || sheet.getRange(row, 4).getValue());
                } else {
                    if (bankInfo.whoseBank) sheet.getRange(row, 12).setValue(bankInfo.whoseBank);
                    if (bankInfo.whoSent) sheet.getRange(row, 13).setValue(bankInfo.whoSent);
                    if (bankInfo.mop) sheet.getRange(row, 14).setValue(bankInfo.mop || sheet.getRange(row, 3).getValue());
                }

                try {
                    const memberEmail = String(sheet.getRange(row, isStandardLayout ? 2 : 1).getValue() || "").trim();
                    if (memberEmail && typeof getMopSnapshots_ === "function") {
                        const snaps = getMopSnapshots_(CF2_BASE_URL, headersObj, [memberEmail]);
                        const snap = snaps[memberEmail.toLowerCase()];
                        if (snap) {
                            if (isStandardLayout) {
                                if (typeof writeMopSnapshot_ === "function" && typeof getBankAndSenderColIndices_ === "function") {
                                    const cols = getBankAndSenderColIndices_(sheet, headers);
                                    writeMopSnapshot_(sheet, row, cols, snap);
                                }
                            } else {
                                sheet.getRange(row, 15).setValue(snap.mopName);
                                sheet.getRange(row, 16).setNumberFormat("@").setValue(snap.mopAccount);
                            }
                        }
                    }
                } catch (eSnap) { }
            }

            e.source.toast(`Successfully updated DB to ${newStatus}`, "Success");
        } else {
            e.source.toast(`Failed to update DB: ${patchRes.getContentText()}`, "Error");
        }
    } catch (err) {
        e.source.toast("Error syncing to DB: " + err.toString(), "Error");
    }
}
