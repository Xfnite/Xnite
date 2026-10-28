function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('🆕 Install')
    .addItem('Install Triggers', 'installTriggers')
    .addItem('Remove Triggers', 'removeTriggers')
    .addItem('Guide', 'showGuide')
    .addToUi();

  ui.createMenu('⚡ Actions')
    .addItem('Run User Sync', 'syncUsersFromPostgrest')
    .addItem('Run Group Sync', 'syncGroupsFromPostgrest')
    .addItem('Run Referal Sync', 'syncReferalsFromPostgrest')
    .addItem('Run Profile Change Request Sync', 'syncProfileChangeRequestsFromPostgrest')
    .addItem('Run Payment Method History Sync', 'syncPaymentMethodHistoryFromPostgrest')
    .addSeparator() // Adds a line break in the menu
    .addItem('Sync All Tables', 'autoSyncOnOpen') // Allows manual trigger of all
    .addSeparator()
    .addItem('Blacklist User (Zero Wallet)', 'blacklistUserAction')
    .addSeparator()
    .addItem('Batch Activate', 'runBatchActivate')
    .addItem('Batch Deactivate', 'runBatchDeactivate')
    .addToUi();
}

// 1. Create a function that runs every sync
function autoSyncOnOpen() {
  try {
    syncUsersFromPostgrest();
    syncGroupsFromPostgrest();
    syncReferalsFromPostgrest();
    syncProfileChangeRequestsFromPostgrest();
    syncPaymentMethodHistoryFromPostgrest();
    // Optional: Log success or notify user
    // SpreadsheetApp.getActiveSpreadsheet().toast('All data synced successfully from database!');
  } catch(e) {
    console.error("Sync failed on open:", e);
  }
}

// 2. Update your installTriggers to also install the "On Open" event
function installTriggers() {
  removeTriggers();

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Trigger for the User tab edits
  ScriptApp.newTrigger('onUserEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger for the Group tab edits
  ScriptApp.newTrigger('onGroupEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger for the Referal tab edits
  ScriptApp.newTrigger('onReferalEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger for the ProfileChangeRequest tab edits (approve / reject)
  ScriptApp.newTrigger('onProfileChangeRequestEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // NOTE: PaymentMethodHistory has no edit trigger on purpose — it is an
  // append-only audit trail and is synced one-way from the database.

  // IMPORTANT: Trigger for Auto-Sync on Document Open
  ScriptApp.newTrigger('autoSyncOnOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  SpreadsheetApp.getUi().alert('Triggers (including Auto-Sync on open) installed successfully.');
}

function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    const fn = trigger.getHandlerFunction();
    if (
      fn === 'onUserEdit' || 
      fn === 'onGroupEdit' || 
      fn === 'onReferalEdit' ||
      fn === 'onProfileChangeRequestEdit' ||
      fn === 'autoSyncOnOpen' || // Make sure we delete the onOpen trigger too
      fn === 'onEditInstallable' ||
      fn === 'onEditGroupInstallable' 
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  SpreadsheetApp.getUi().alert('Triggers removed.');
}
