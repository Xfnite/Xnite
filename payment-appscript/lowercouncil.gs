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
 * Strips URLs (like Google Drive links) and trailing separators from a cutoff string.
 */
function cleanCutoffNote_(val) {
    if (!val) return "";
    let str = String(val).trim();
    str = str.split('- Projects')[0].trim();
    str = str.replace(/\s*[-–—:]*\s*https?:\/\/[^\s]+/gi, "").trim();
    str = str.replace(/https?:\/\/[^\s]+/gi, "").trim();
    str = str.replace(/[\s\-–—:]+$/, "").trim();
    return str;
}

/**
 * Normalizes cutoff strings for comparison (e.g. "October 15, 2026 Cutoff" -> "october152026")
 */
function normalizeCutoffForLC_(str) {
    return cleanCutoffNote_(str)
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
        const t3Val = cleanCutoffNote_(finalSheet.getRange("T3").getValue());
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
        const numRecruiters = recruitersList.length;

        // 1. Capture sample formulas from Row 2 (or Row 3 as fallback) BEFORE modifying the sheet
        const row2Formulas = maxRow >= 2 ? (sheet.getRange(2, 1, 1, lastCol).getFormulas()[0] || []) : [];
        const row3Formulas = maxRow >= 3 ? (sheet.getRange(3, 1, 1, lastCol).getFormulas()[0] || []) : [];
        const sampleFormulas = [];
        for (let c = 0; c < lastCol; c++) {
            sampleFormulas[c] = row2Formulas[c] || row3Formulas[c] || "";
        }

        let grandTotal = 0;
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
        });

        // 2. Clear template dummy data and old static values in non-formula columns
        // This ensures dummy values in Row 2 (e.g. 591, 9995, Sent, Abigail Ibabao, YES, 73, etc.) are completely cleared!
        const totalRowsToClean = Math.max(maxRow >= 2 ? maxRow - 1 : 1, numRecruiters);
        for (let c = 1; c <= lastCol; c++) {
            const formula = sampleFormulas[c - 1];
            // If it's NOT a formula column and NOT Name/Email/Bonus, clear all rows so template/dummy data is removed
            if (!formula && c !== nameCol && c !== emailCol && c !== bonusCol) {
                try {
                    sheet.getRange(2, c, totalRowsToClean, 1).clearContent();
                } catch (e) { }
            }
        }

        // 3. Write Name, gingeremail, and Recruiter Bonus starting at Row 2 (replaces template data in row 2)
        sheet.getRange(2, nameCol, names.length, 1).setValues(names);
        sheet.getRange(2, emailCol, emails.length, 1).setValues(emails);
        sheet.getRange(2, bonusCol, bonuses.length, 1).setValues(bonuses);

        // Format Recruiter Bonus as currency
        sheet.getRange(2, bonusCol, bonuses.length, 1)
            .setNumberFormat("₱#,##0.00")
            .setFontWeight("bold");

        // 4. Auto-fill or clear formula columns
        for (let c = 1; c <= lastCol; c++) {
            const formula = sampleFormulas[c - 1];
            if (!formula) continue;

            const fUpper = formula.toUpperCase();
            const isArrayFormula = fUpper.includes("ARRAYFORMULA") ||
                fUpper.includes("FILTER(") ||
                fUpper.includes("QUERY(") ||
                fUpper.includes("BYROW(") ||
                fUpper.includes("MAP(") ||
                fUpper.includes("IMPORTRANGE");

            if (isArrayFormula) {
                // Ensure ARRAYFORMULA is in Row 2
                if (!row2Formulas[c - 1]) sheet.getRange(2, c).setFormula(formula);
                // Clear rows 3+ so array formula can expand freely without #REF! errors
                if (totalRowsToClean > 1) {
                    try {
                        sheet.getRange(3, c, totalRowsToClean - 1, 1).clearContent();
                    } catch (e) { }
                }
            } else {
                // Single-cell formula:
                if (!row2Formulas[c - 1]) {
                    try {
                        sheet.getRange(3, c).copyTo(sheet.getRange(2, c), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
                    } catch (e) { }
                }
                // Copy from Row 2 down to all recruiter rows
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

        // 5. If the old sheet had extra rows beyond the current recruiters, clear them completely
        if (maxRow > numRecruiters + 1) {
            const extraRows = maxRow - (numRecruiters + 1);
            sheet.getRange(numRecruiters + 2, 1, extraRows, sheet.getMaxColumns()).clearContent();
        }

        // Freeze header row
        sheet.setFrozenRows(1);

        const summaryMsg = `✅ Lower Council Referral Bonus Pull Complete!\n\n`
            + `Cutoff: ${targetCutoff}\n`
            + `👥 Members Loaded: ${numRecruiters}\n`
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

