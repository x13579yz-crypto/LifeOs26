// js/features/exportreminder.js
// ExportReminder — LifeOS 26 v3.5.1
// Part 5 — Features Layer
// Delegates to BackupStatus — no duplicate logic

const ExportReminder = (() => {

  function check() {
    // Single source of truth: delegate entirely to BackupStatus
    // ExportReminder is a lightweight trigger — no duplicate status/days logic
    const days   = BackupStatus.getDaysSinceBackup();
    const status = BackupStatus.getStatus();

    Logger.info('ExportReminder checked', { days, status });

    if (days >= 30 && status !== 'SAFE') {
      BackupStatus.showBackupModal(status);
    }
  }

  return { check };

})();
