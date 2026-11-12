/**
 * XFNITE LOWER COUNCIL - REFERRAL BONUS PULL SCRIPT
 * 
 * Pulls all Lower Council recruiters (labelers and old-labelers) whose recruits
 * have referral earnings for the active cutoff, aggregating their total bonuses,
 * active recruit counts, payment details, and recruit breakdown.
 * 
 * Target Sheet: 'LOWERCOUNCIL'
 * 
 * Column Structure:
 *   Col A  (1):  Full Name
 *   Col B  (2):  gingeremail (Bitmappro / Ginger Email)
 *   Col C  (3):  Main Email (Login / Main Email)
 *   Col D  (4):  Ginger Username
 *   Col E  (5):  Role (labeler / old-labeler)
 *   Col F  (6):  Active Recruits (Count of recruits with earnings)
 *   Col G  (7):  Total Referral Bonus (Sum of recruiter share for cutoff)
 *   Col H  (8):  Mode of Payment (GCash, Maya, Bank)
 *   Col I  (9):  Payee Name (Registered MOP payee name)
 *   Col J  (10): Account Number (MOP account / phone number)
 *   Col K  (11): Recruits Breakdown (Recruit ginger usernames & amounts)
 */

const LC_BASE_URL = "https://api.xfnite.cloud";

/**
 * Normalizes cutoff strings for comparison (e.g. "October 15, 2026 Cutoff" -> "october152026")
 */
function normalizeCutoffForLC_(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/cutoff/gi, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

/**
 * Checks if a user role is a Lower Council member (labeler or old-labeler)
 */
function isLowerCouncilRole_(role) {
    const clean = String(role || "").trim().toLowerCase();
    return clean === "labeler" || clean === "old-labeler" || clean === "old labeler" || clean === "old-laber";
}

/**
 * Resolves the active Cutoff Name
 * Priority:
 *   1. Spreadsheet Title (e.g. "October 15, 2026" or "Recr Bonus - October 15, 2026")
 *   2. Fallback: FINAL!T3 if spreadsheet title has no date/month
 */
function getActiveCutoffForLC_(ss) {
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
 * Main Pull Function for LOWERCOUNCIL Sheet
 */
function pullDataToLowerCouncil(isAuto = false) {
    const ui = SpreadsheetApp.getUi();
    const token = PropertiesService.getScriptProperties().getProperty('POSTGREST_TOKEN');

    if (!token) {
        return ui.alert("Setup Error: Please add your POSTGREST_TOKEN in Apps Script Project Settings > Script Properties.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("X1.LOWERCOUNCIL") || ss.getSheetByName("LOWERCOUNCIL") || ss.getSheetByName("LowerCouncil");
    if (!sheet) {
        const allSheets = ss.getSheets();
        sheet = allSheets.find(s => s.getName().toLowerCase().replace(/[^a-z0-9]/g, "").includes("lowercouncil"));
    }
    if (!sheet) {
        return ui.alert("Error: Lower Council sheet not found. Please ensure your tab has 'LOWERCOUNCIL' or 'X1.LOWERCOUNCIL' in its name.");
    }

    const targetCutoff = getActiveCutoffForLC_(ss);
    const targetNorm = normalizeCutoffForLC_(targetCutoff);

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
        sheet.getParent().toast(`Fetching Lower Council recruiter earnings for "${targetCutoff}"...`, "Lower Council Sync", -1);

        // 1. Fetch ReferralBonuses, Users, and PaymentDetails from Database
        const bonusRes = UrlFetchApp.fetch(LC_BASE_URL + "/ReferralBonus?select=gingerUsername,amount,cutoff,recruiterEmail,recruitEmail,user_name", options);
        const userRes = UrlFetchApp.fetch(LC_BASE_URL + "/User?select=email,name,firstName,lastName,role,gingerEmail,gingerUsername,linkedRecruiterEmail,labelerRefererEmail,refererEmail", options);
        const paymentRes = UrlFetchApp.fetch(LC_BASE_URL + "/PaymentDetails?select=email,payeeName,lastName,payeeUid,paymentMethod", options);

        if (bonusRes.getResponseCode() !== 200) return ui.alert(`ReferralBonus API Error: ${bonusRes.getContentText()}`);
        if (userRes.getResponseCode() !== 200) return ui.alert(`User API Error: ${userRes.getContentText()}`);
        if (paymentRes.getResponseCode() !== 200) return ui.alert(`Payment API Error: ${paymentRes.getContentText()}`);

        const allBonuses = JSON.parse(bonusRes.getContentText()) || [];
        const allUsers = JSON.parse(userRes.getContentText()) || [];
        const allPayments = JSON.parse(paymentRes.getContentText()) || [];

        // 2. Build User and Payment lookup maps
        const userByEmail = new Map();
        const userByGingerUsername = new Map();

        allUsers.forEach(u => {
            if (u.email) userByEmail.set(u.email.toLowerCase().trim(), u);
            if (u.linkedRecruiterEmail) userByEmail.set(u.linkedRecruiterEmail.toLowerCase().trim(), u);
            if (u.gingerEmail) userByEmail.set(u.gingerEmail.toLowerCase().trim(), u);
            if (u.gingerUsername) userByGingerUsername.set(u.gingerUsername.toLowerCase().trim(), u);
        });

        const paymentByEmail = new Map();
        allPayments.forEach(p => {
            if (p.email) paymentByEmail.set(p.email.toLowerCase().trim(), p);
        });

        // 3. Filter bonuses matching target cutoff
        const filteredBonuses = allBonuses.filter(b => {
            const cutoffVal = String(b.cutoff || "").trim();
            if (!cutoffVal) return true;
            const cNorm = normalizeCutoffForLC_(cutoffVal);
            return cNorm === targetNorm || cNorm.includes(targetNorm) || targetNorm.includes(cNorm);
        });

        // 4. Group by Lower Council recruiter
        const recruiterGroups = new Map();

        filteredBonuses.forEach(b => {
            let recEmail = String(b.recruiterEmail || "").toLowerCase().trim();

            // Fallback: If recruiterEmail is missing, lookup recruit by gingerUsername
            if (!recEmail && b.gingerUsername) {
                const recruitUser = userByGingerUsername.get(String(b.gingerUsername).toLowerCase().trim());
                if (recruitUser) {
                    recEmail = String(recruitUser.labelerRefererEmail || recruitUser.refererEmail || "").toLowerCase().trim();
                }
            }

            if (!recEmail) return;

            const recruiterUser = userByEmail.get(recEmail);
            const role = recruiterUser?.role || "";

            // ONLY LOWER COUNCIL (labeler or old-labeler)
            if (!isLowerCouncilRole_(role)) return;

            const primaryEmail = recruiterUser?.email ? recruiterUser.email.toLowerCase().trim() : recEmail;

            if (!recruiterGroups.has(primaryEmail)) {
                recruiterGroups.set(primaryEmail, {
                    recruiterUser,
                    email: primaryEmail,
                    totalBonus: 0,
                    recruits: []
                });
            }

            const group = recruiterGroups.get(primaryEmail);
            const amt = Number(b.amount || 0);
            group.totalBonus += amt;
            group.recruits.push({
                ginger: b.gingerUsername || b.user_name || b.recruitEmail || "Unknown",
                name: (userByGingerUsername.get(String(b.gingerUsername || "").toLowerCase().trim()) || {}).name || "",
                amount: amt
            });
        });

        const recruitersList = Array.from(recruiterGroups.values());
        if (recruitersList.length === 0) {
            return ui.alert("No Data", `No Lower Council recruiters found with recruit earnings for cutoff: "${targetCutoff}".`, ui.ButtonSet.OK);
        }

        // 5. Sort from highest bonus to lowest
        recruitersList.sort((a, b) => b.totalBonus - a.totalBonus);

        // 6. Detect Columns in X1.LOWERCOUNCIL sheet
        const lastCol = Math.max(sheet.getLastColumn(), 10);
        const headerRowValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        let nameCol = -1;
        let emailCol = -1;
        let bonusCol = -1;

        for (let i = 0; i < headerRowValues.length; i++) {
            const h = String(headerRowValues[i] || "").toLowerCase().trim();
            if (nameCol === -1 && h.includes("name")) {
                nameCol = i + 1;
            }
            if (emailCol === -1 && (h.includes("gingeremail") || h.includes("bitmappro email") || h === "email")) {
                emailCol = i + 1;
            }
            if (bonusCol === -1 && (h.includes("recruiter bonus") || h.includes("referral bonus") || h.includes("recruiter share") || h.includes("referral"))) {
                bonusCol = i + 1;
            }
        }

        // Safe fallbacks matching the X1.LOWERCOUNCIL layout (Col A, Col B, Col G)
        if (nameCol === -1) nameCol = 1;   // Col A: Name:
        if (emailCol === -1) emailCol = 2;  // Col B: gingeremail
        if (bonusCol === -1) bonusCol = 7;  // Col G: Recruiter Bonus:

        const maxRow = sheet.getLastRow();
        const existingRowMap = new Map();
        const existingNameMap = new Map();

        // Scan existing rows (from Row 2 to maxRow) to match members
        if (maxRow >= 2) {
            const emailValues = sheet.getRange(2, emailCol, maxRow - 1, 1).getValues();
            const nameValues = sheet.getRange(2, nameCol, maxRow - 1, 1).getValues();

            for (let i = 0; i < emailValues.length; i++) {
                const em = String(emailValues[i][0] || "").trim().toLowerCase();
                const nm = String(nameValues[i][0] || "").trim().toLowerCase();
                const sheetRowNum = i + 2;

                if (em) existingRowMap.set(em, sheetRowNum);
                if (nm) existingNameMap.set(nm, sheetRowNum);
            }
        }

        function findExistingRow(item) {
            const ge = String(item.recruiterUser?.gingerEmail || "").trim().toLowerCase();
            const pe = String(item.email || "").trim().toLowerCase();
            if (ge && existingRowMap.has(ge)) return existingRowMap.get(ge);
            if (pe && existingRowMap.has(pe)) return existingRowMap.get(pe);
            return null;
        }

        let matchCount = 0;
        recruitersList.forEach(item => {
            if (findExistingRow(item)) matchCount++;
        });

        // If no Lower Council recruiters match existing rows, it's a fresh duplicate (e.g. from X1.INNERCOUNCIL)
        const isFreshSheet = (matchCount === 0);

        let updatedCount = 0;
        let insertedCount = 0;
        let grandTotal = 0;

        // 7. Write to X1.LOWERCOUNCIL sheet
        if (isFreshSheet) {
            // =========================================================================
            // FRESH SHEET / DUPLICATED FROM X1.INNERCOUNCIL
            // =========================================================================
            const numRecruiters = recruitersList.length;

            // Capture row 2 formulas (e.g. Total Payment with Salary, Status, etc.)
            let row2Formulas = [];
            if (maxRow >= 2) {
                row2Formulas = sheet.getRange(2, 1, 1, lastCol).getFormulas()[0] || [];
            }

            // Detect marker columns to clear (Push Status, ID, Push Date, Error)
            const markerCols = [];
            for (let i = 0; i < headerRowValues.length; i++) {
                const h = String(headerRowValues[i] || "").toLowerCase().trim();
                if (h.includes("push status") || h === "id" || h.includes("push date") || h === "error") {
                    markerCols.push(i + 1);
                }
            }

            const names = [];
            const emails = [];
            const bonuses = [];

            recruitersList.forEach(item => {
                const totalRounded = Math.round(item.totalBonus * 100) / 100;
                grandTotal += totalRounded;

                const u = item.recruiterUser;
                let fullName = u?.name || "";
                if (u?.firstName || u?.lastName) {
                    fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
                }

                names.push([fullName || "N/A"]);
                emails.push([u?.gingerEmail || item.email]);
                bonuses.push([totalRounded]);
                insertedCount++;
            });

            // Write Name, gingeremail, and Recruiter Bonus starting at Row 2
            sheet.getRange(2, nameCol, names.length, 1).setValues(names);
            sheet.getRange(2, emailCol, emails.length, 1).setValues(emails);
            sheet.getRange(2, bonusCol, bonuses.length, 1).setValues(bonuses);

            // Format Recruiter Bonus as currency
            sheet.getRange(2, bonusCol, bonuses.length, 1)
                .setNumberFormat("₱#,##0.00")
                .setFontWeight("bold");

            // Auto-fill or clear formula columns
            // Only regular (single-cell) formulas are copied down.
            // ARRAYFORMULAs must stay ONLY in Row 2 and rows 3+ must be cleared so they can expand freely!
            for (let c = 1; c <= lastCol; c++) {
                const formula = row2Formulas[c - 1] || "";
                if (!formula) continue;

                const fUpper = formula.toUpperCase();
                const isArrayFormula = fUpper.includes("ARRAYFORMULA") ||
                    fUpper.includes("FILTER(") ||
                    fUpper.includes("QUERY(") ||
                    fUpper.includes("BYROW(") ||
                    fUpper.includes("MAP(") ||
                    fUpper.includes("IMPORTRANGE");

                if (isArrayFormula) {
                    // ARRAY FORMULA: Keep ONLY in Row 2!
                    // Clear rows 3+ in this column so the array formula has room to expand downward without #REF! errors
                    if (numRecruiters > 1) {
                        try {
                            sheet.getRange(3, c, numRecruiters - 1, 1).clearContent();
                        } catch (e) { }
                    }
                } else {
                    // REGULAR SINGLE-CELL FORMULA: copy down from Row 2 to rows 3..numRecruiters+1
                    if (numRecruiters > 1) {
                        try {
                            sheet.getRange(2, c).copyTo(
                                sheet.getRange(3, c, numRecruiters - 1, 1),
                                SpreadsheetApp.CopyPasteType.PASTE_FORMULA,
                                false
                            );
                        } catch (e) {
                            Logger.log(`Formula copy error on col ${c}: ${e}`);
                        }
                    }
                }
            }

            // Clear old push markers (Pushed, ID, Push Date) from row 2 down
            markerCols.forEach(colIdx => {
                try {
                    sheet.getRange(2, colIdx, numRecruiters, 1).clearContent();
                } catch (e) { }
            });

            // If the old sheet had extra rows beyond the new recruiters, clear them
            if (maxRow > numRecruiters + 1) {
                const extraRows = maxRow - (numRecruiters + 1);
                sheet.getRange(numRecruiters + 2, 1, extraRows, sheet.getMaxColumns()).clearContent();
            }

        } else {
            // =========================================================================
            // EXISTING LOWER COUNCIL SHEET: Update in-place, preserve all manual team data
            // =========================================================================
            // Clean up rows 3+ for any ARRAYFORMULA columns to resolve #REF! collisions
            const row2Formulas = sheet.getRange(2, 1, 1, lastCol).getFormulas()[0] || [];
            for (let c = 1; c <= lastCol; c++) {
                const formula = row2Formulas[c - 1] || "";
                if (!formula) continue;

                const fUpper = formula.toUpperCase();
                const isArrayFormula = fUpper.includes("ARRAYFORMULA") ||
                    fUpper.includes("FILTER(") ||
                    fUpper.includes("QUERY(") ||
                    fUpper.includes("BYROW(") ||
                    fUpper.includes("MAP(") ||
                    fUpper.includes("IMPORTRANGE");

                if (isArrayFormula && maxRow > 2) {
                    try {
                        sheet.getRange(3, c, maxRow - 2, 1).clearContent();
                    } catch (e) { }
                }
            }

            const numRows = maxRow - 1;
            const bonusValues = [];
            for (let r = 0; r < numRows; r++) {
                bonusValues.push([0]);
            }

            const newRecruiters = [];

            recruitersList.forEach(item => {
                const totalRounded = Math.round(item.totalBonus * 100) / 100;
                grandTotal += totalRounded;

                const u = item.recruiterUser;
                let fullName = u?.name || "";
                if (u?.firstName || u?.lastName) {
                    fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
                }
                const primaryEmail = item.email;
                const gingerEmail = u?.gingerEmail || primaryEmail;

                let rowNum = findExistingRow(item);
                if (!rowNum && fullName) {
                    const fnLower = fullName.toLowerCase().trim();
                    if (existingNameMap.has(fnLower)) {
                        rowNum = existingNameMap.get(fnLower);
                    }
                }

                if (rowNum && rowNum <= maxRow) {
                    bonusValues[rowNum - 2] = [totalRounded];
                    updatedCount++;
                } else {
                    newRecruiters.push({
                        name: fullName || "N/A",
                        email: gingerEmail,
                        bonus: totalRounded
                    });
                }
            });

            // Write all bonus values to bonusCol in ONE batch call
            sheet.getRange(2, bonusCol, bonusValues.length, 1).setValues(bonusValues);

            // Append any new recruiters not currently in the sheet
            if (newRecruiters.length > 0) {
                let nextRow = maxRow + 1;
                newRecruiters.forEach(rec => {
                    sheet.getRange(nextRow, nameCol).setValue(rec.name);
                    sheet.getRange(nextRow, emailCol).setValue(rec.email);
                    sheet.getRange(nextRow, bonusCol).setValue(rec.bonus);
                    nextRow++;
                    insertedCount++;
                });
            }

            // Format Recruiter Bonus as currency
            const finalLastRow = sheet.getLastRow();
            if (finalLastRow >= 2) {
                sheet.getRange(2, bonusCol, finalLastRow - 1, 1)
                    .setNumberFormat("₱#,##0.00")
                    .setFontWeight("bold");
            }
        }

        // Freeze header row
        sheet.setFrozenRows(1);

        const summaryMsg = `✅ Lower Council Referral Bonus Pull Complete!\n\n`
            + `Cutoff: ${targetCutoff}\n`
            + `👥 Members Updated: ${updatedCount}\n`
            + `➕ New Members Added: ${insertedCount}\n`
            + `💰 Total Referral Bonus: ₱${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (isAuto) {
            sheet.getParent().toast(`✅ Pulled ${recruitersList.length} Lower Council recruiters (₱${grandTotal.toFixed(2)})`, "Sync Complete", 6);
        } else {
            ui.alert("Lower Council Pull Complete", summaryMsg, ui.ButtonSet.OK);
        }

    } catch (err) {
        Logger.log("pullDataToLowerCouncil error: " + err);
        if (!isAuto) {
            ui.alert("Lower Council Pull Failed", "Error: " + err.message, ui.ButtonSet.OK);
        }
    }
}

