// === Batch Activate tab ===
// Paste user emails into column A or B, then run "⚡ Actions > Batch Activate"
// or "⚡ Actions > Batch Deactivate". Column C gets the result for each row.
//   Activate   -> status = Active, lastLogin/updatedAt = now (so the daily
//                 deactivation job in server/app.js doesn't re-deactivate them)
//   Deactivate -> status = Deactivated, updatedAt = now (wallet is untouched)
// Numbered lines like "1. example@dk.com" (or the number in A and the email
// in B) are fine - the email is extracted. Rows without an email (e.g. the
// header row) are skipped.

const BATCH_ACTIVATE_SHEET_NAME = 'Batch Activate';

const BATCH_ACTIVATE_COL = {
  INPUT_COUNT: 1, // emails are looked for in column A
  RESULT: 2       // results are written to column B
};

function runBatchActivate() {
  runBatchStatus_('activate');
}

function runBatchDeactivate() {
  runBatchStatus_('deactivate');
}

function runBatchStatus_(action) {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BATCH_ACTIVATE_SHEET_NAME);
  if (!sheet) {
    ui.alert('Error', `Sheet "${BATCH_ACTIVATE_SHEET_NAME}" not found.`, ui.ButtonSet.OK);
    return;
  }

  const lastRow = sheet.getLastRow();
  const values = lastRow > 0 ? sheet.getRange(1, 1, lastRow, BATCH_ACTIVATE_COL.RESULT).getValues() : [];
  const emailCount = values.filter(r => extractRowEmail_(r)).length;
  if (emailCount === 0) {
    ui.alert('Nothing to do', 'No emails found in columns A or B.', ui.ButtonSet.OK);
    return;
  }

  const label = action === 'activate' ? 'Activate' : 'Deactivate';
  const confirm = ui.alert(
    `Batch ${label}`,
    `${label} ${emailCount} user(s)?`,
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  const results = values.map(r => [r[BATCH_ACTIVATE_COL.RESULT - 1]]);
  let succeeded = 0, failed = 0;

  values.forEach((r, i) => {
    const email = extractRowEmail_(r);
    if (!email) return;

    // Skip if column B contains "activated"
    if (String(r[1] || '').toLowerCase().includes('activated')) {
      return;
    }

    const res = action === 'activate'
      ? activateUserByEmail_(email)
      : deactivateUserByEmail_(email);

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    if (res.success) {
      results[i] = [`✅ ${label}d (${stamp})`];
      succeeded++;
    } else {
      results[i] = [`❌ ${res.error}`];
      failed++;
    }
  });

  sheet.getRange(1, BATCH_ACTIVATE_COL.RESULT, results.length, 1).setValues(results);

  // Refresh the User tab so it reflects the new statuses
  try {
    syncUsersFromPostgrest();
  } catch (e) {
    Logger.log('User sync failed after batch ' + action + ': ' + e.toString());
  }

  ui.alert(
    `Batch ${label} complete`,
    `${label}d: ${succeeded}\nFailed: ${failed}`,
    ui.ButtonSet.OK
  );
}

// Pulls the email out of a pasted cell, e.g. "1. example@dk.com" -> "example@dk.com".
// Returns '' when the cell has no email (e.g. the header row).
function extractEmail_(value) {
  const text = String(value || '').replace(/^\s*\d+\s*[.)\-:]\s*/, ''); // strip "1." / "1)" / "1 -"
  const match = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return match ? match[0].toLowerCase() : '';
}

function extractRowEmail_(row) {
  for (let c = 0; c < BATCH_ACTIVATE_COL.INPUT_COUNT; c++) {
    const email = extractEmail_(row[c]);
    if (email) return email;
  }
  return '';
}

function activateUserByEmail_(email) {
  // Same rule as the website's Activate Users page (needsNewGingerAccount): those
  // users get a new Ginger account there instead of a plain reactivation.
  const check = needsNewGingerAccount_(email);
  if (!check.success) return check;
  if (check.needsReset) {
    return { success: false, error: 'Needs new Ginger account. Use Activate Users page' };
  }

  const nowIso = new Date().toISOString();
  return patchUserByEmail_(email, { status: 'Active', lastLogin: nowIso, updatedAt: nowIso });
}

const GINGER_RESET_MIN_CUMULATIVE_SALARY = 50000;

// A deactivated labeler / old labeler paid more than GINGER_RESET_MIN_CUMULATIVE_SALARY
// in total (IncomeHistory) who passed none of Landcover, 3D Roof and 3D Matching.
// Returns { success, needsReset }; a failed lookup fails the row so it is never
// activated without the check.
function needsNewGingerAccount_(email) {
  const quoted = '"' + email.replace(/"/g, '') + '"'; // emails contain dots, so quote them
  const users = getRows_('User', 'or=' + encodeURIComponent('(email.eq.' + quoted + ',gingerEmail.eq.' + quoted + ')') + '&select=id,email,role,status');
  if (!users.success) return users;
  // Primary email wins over Ginger email, same as patchUserByEmail_.
  const user = users.rows.find(u => String(u.email).toLowerCase() === email) || users.rows[0];
  if (!user) return { success: true, needsReset: false }; // patch reports "User not found"

  const role = String(user.role || '').trim().toLowerCase();
  const isLabeler = role === 'labeler' || role === 'old-labeler' || role === 'old-laber' || role === 'old labeler';
  const status = String(user.status || '').trim().toLowerCase();
  const isDeactivated = status === 'deactivated' || status === 'inactive'; // not e.g. "Activated"
  if (!isLabeler || !isDeactivated) return { success: true, needsReset: false };

  const income = getRows_('IncomeHistory', 'email=eq.' + encodeURIComponent(user.email) + '&select=amountPaid');
  if (!income.success) return income;
  const total = income.rows.reduce((sum, r) => sum + (Number(r.amountPaid) || 0), 0);
  if (total <= GINGER_RESET_MIN_CUMULATIVE_SALARY) return { success: true, needsReset: false };

  const training = getRows_('Training', 'userId=eq.' + encodeURIComponent(user.id) + '&select=trainings');
  if (!training.success) return training;
  const list = (training.rows[0] && training.rows[0].trainings) || [];
  // No synced training list means we can't tell what they passed — activate normally.
  if (list.length === 0) return { success: true, needsReset: false };

  const passedAny = ['landcover', 'roof', '3d'].some(type => trainingPassed_(list, type));
  return { success: true, needsReset: !passedAny };
}

// Same as checkTrainingPassedFromList in frontend/src/lib/trainingStatus.ts.
function trainingPassed_(trainings, type) {
  const nameOf = t => String((t && (t.annotate_sub_project_name || t.name)) || '').toLowerCase();
  const target = trainings.find(t => {
    const n = nameOf(t);
    if (type === 'landcover') return n.includes('landcover') || n.includes('land cover');
    if (type === 'roof') return n.includes('roof');
    return n.includes('3d_match') || n.includes('3d match');
  });
  if (!target) return false;

  const rawStatus = String(target.training_status_desc || target.trainingStatus || '').toLowerCase();
  const isPassed = rawStatus === 'status_passed' || rawStatus === 'passed';
  if (type === 'roof') return isPassed;

  const passed = Number(target.passed_task_num != null ? target.passed_task_num : (target.passedTask || 0));
  let total = Number(target.total_task != null ? target.total_task : (target.totalTask || 0));
  if (type === 'landcover' && total === 0) total = 18;
  if (type === '3d' && total === 0) total = 7;
  const pct = total > 0 ? Math.round((passed / total) * 100) : (isPassed ? 100 : 0);
  return isPassed || pct === 100;
}

function getRows_(table, query) {
  const headers = {};
  const token = getPostgrestToken_();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const resp = UrlFetchApp.fetch(POSTGREST_BASE_URL + table + '?' + query, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      return { success: true, rows: JSON.parse(resp.getContentText() || '[]') };
    }
    return { success: false, error: `Could not check ${table} (HTTP ${code})` };
  } catch (err) {
    return { success: false, error: `Could not check ${table}: ${err.toString()}` };
  }
}

// Judgers and admins must never be deactivated (same rule as server/app.js).
const NEVER_DEACTIVATED_ROLES = ['judger', 'admin'];

function deactivateUserByEmail_(email) {
  const quoted = '"' + email.replace(/"/g, '') + '"'; // emails contain dots, so quote them
  const users = getRows_('User', 'or=' + encodeURIComponent('(email.eq.' + quoted + ',gingerEmail.eq.' + quoted + ')') + '&select=email,role');
  if (!users.success) return users; // a failed lookup fails the row so it is never deactivated without the check
  // Primary email wins over Ginger email, same as patchUserByEmail_.
  const user = users.rows.find(u => String(u.email).toLowerCase() === email) || users.rows[0];
  const role = user ? String(user.role || '').trim().toLowerCase() : '';
  if (NEVER_DEACTIVATED_ROLES.includes(role)) {
    return { success: false, error: `Cannot deactivate ${role} accounts` };
  }

  return patchUserByEmail_(email, { status: 'Deactivated', updatedAt: new Date().toISOString() });
}

// Looks up by primary email first, then gingerEmail (same as the server blacklist).
function patchUserByEmail_(email, payload) {
  const res = patchUserWhere_('email', email, payload);
  if (!res.success || res.updated > 0) return res;

  const fallback = patchUserWhere_('gingerEmail', email, payload);
  if (!fallback.success || fallback.updated > 0) return fallback;

  return { success: false, error: 'User not found' };
}

function patchUserWhere_(column, email, payload) {
  const headers = {
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const token = getPostgrestToken_();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const url = POSTGREST_BASE_URL + POSTGREST_TABLE + '?' + column + '=eq.' + encodeURIComponent(email);

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const text = resp.getContentText();

    if (code >= 200 && code < 300) {
      const parsed = text ? JSON.parse(text) : [];
      return { success: true, updated: Array.isArray(parsed) ? parsed.length : 1 };
    }

    let errMsg = text;
    try {
      errMsg = JSON.parse(text).message || text;
    } catch (parseErr) {
      // leave errMsg as raw text
    }
    return { success: false, error: `HTTP ${code}: ${errMsg}` };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}
