// ═══════════════════════════════════════════════════════════════
// js/data/dataprotection.js — LifeOS 26 v3.5.1
// Dual storage: localStorage primary + IndexedDB rolling snapshots.
// Export: JSON (MASTER format) + CSV.
// Import: accepts flat (v3.4) AND wrapped (MASTER) — backward compat.
// Depends on: Logger, EventBus, SchemaValidator, UI (for modals/toasts)
//
// RULES:
//   RULE 42: NEVER localStorage.clear() — only clearAll()
//   RULE 52: Import fully validated
//   RULE 58: Dual storage (localStorage + IDB)
//   RULE 59: Init order: IDB restore → migration → Store.init()
//   RULE 60: Export updates lastExportDate; reminder after 30 days
//   RULE 63: Export format: {lifeos_version:"MASTER", exported_at:"ISO", data:{...}}
//   RULE 64: Rolling snapshots: 3 max, key format snap_<timestamp>
//   FIX 7:   Removed duplicate backup() call from exportJSON() — single IDB write
//   FIX 10:  Export size guard — warns if backup > 5MB
// ═══════════════════════════════════════════════════════════════

const DataProtection = (() => {
  const IDB_NAME  = 'LifeOS_Backup';
  const IDB_VER   = 1;
  const IDB_STORE = 'snapshots';
  const MAX_SNAPSHOTS = 3;

  let _db          = null;
  let _backupTimer = null;

  // ── IndexedDB ────────────────────────────────────────────────

  function _openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      if (!window.indexedDB) return reject(new Error('IDB not supported'));

      const req = indexedDB.open(IDB_NAME, IDB_VER);

      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = e => {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = e => reject(e.target.error); // RULE 14
    });
  }

  /**
   * restoreIfNeeded — called FIRST in LifeOS.init() before Store.init().
   * If localStorage is empty but IDB has a snapshot → restore from IDB.
   * RULE 59: IDB restore → migration → Store.init()
   */
  async function restoreIfNeeded() {
    const hasData = Object.keys(localStorage).some(k => k.startsWith('lifeos_'));
    if (hasData) return; // localStorage intact — nothing to restore

    try {
      const db      = await _openDB();
      const tx      = db.transaction(IDB_STORE, 'readonly');
      const store   = tx.objectStore(IDB_STORE);
      const keys    = await _idbGetAll(store, 'getAllKeys');

      if (!keys.length) return; // no IDB backup either

      // Sort descending — newest first (snap_<timestamp>)
      keys.sort((a, b) => b.localeCompare(a));
      const latestKey = keys[0];
      const snapshot  = await _idbGet(store, latestKey);

      if (!snapshot) return;

      Object.entries(snapshot).forEach(([k, v]) => {
        if (k.startsWith('lifeos_')) {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
      });

      Logger.info('DataProtection: restored from IDB', { key: latestKey });
      EventBus.emit('data:restored', { source: 'idb', keys: Object.keys(snapshot).length });
    } catch (e) {
      Logger.warn('DataProtection: IDB restore failed', e.message);
    }
  }

  // ── Backup ───────────────────────────────────────────────────

  /** Debounced — called from Store.set() on every write */
  function scheduleBackup() {
    clearTimeout(_backupTimer);
    _backupTimer = setTimeout(() => backup(), 2000);
  }

  /** Write rolling snapshot to IDB. Max 3 snapshots. */
  async function backup() {
    try {
      const db   = await _openDB();
      const data = {};
      Object.keys(localStorage)
        .filter(k => k.startsWith('lifeos_'))
        .forEach(k => { data[k] = localStorage.getItem(k); });

      const key = `snap_${Date.now()}`;

      // Write snapshot — wait for oncomplete before pruning (prevents race condition)
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror    = e  => reject(e.target.error); // RULE 14
      });

      // Prune old snapshots AFTER write is confirmed committed
      const allKeys = await _idbGetAllKeys();
      if (allKeys.length > MAX_SNAPSHOTS) {
        allKeys.sort(); // ascending — oldest first
        const toDelete = allKeys.slice(0, allKeys.length - MAX_SNAPSHOTS);
        await new Promise((resolve, reject) => {
          const delTx    = db.transaction(IDB_STORE, 'readwrite');
          const delStore = delTx.objectStore(IDB_STORE);
          toDelete.forEach(k => delStore.delete(k));
          delTx.oncomplete = () => resolve();
          delTx.onerror    = e  => { Logger.error('IDB prune error', e.target.error); resolve(); };
        });
      }

      Logger.info('DataProtection: IDB backup saved', { key });
      EventBus.emit('data:backup-complete', { keys: Object.keys(data).length });
    } catch (e) {
      Logger.error('DataProtection: backup failed', e.message);
    }
  }

  // ── Export ───────────────────────────────────────────────────

  /**
   * Export all LifeOS data as JSON.
   * RULE 63: wrapped format {lifeos_version:"MASTER", exported_at, data:{...}}
   * FIX 7: NO duplicate backup() call here — backup runs via scheduleBackup()
   * FIX 10: Warn if > 5MB
   */
  function exportJSON() {
    try {
      const data = {};
      Object.keys(localStorage)
        .filter(k => k.startsWith('lifeos_'))
        .forEach(k => {
          try { data[k] = JSON.parse(localStorage.getItem(k)); }
          catch { data[k] = localStorage.getItem(k); }
        });

      const payload = {
        lifeos_version: 'MASTER',
        exported_at:    new Date().toISOString(),
        data,
      };

      const json = JSON.stringify(payload, null, 2);

      // FIX 10: size guard
      const sizeBytes = new Blob([json]).size;
      if (sizeBytes > 5 * 1024 * 1024) {
        Logger.warn('Export size > 5MB', { bytes: sizeBytes });
        UI.showToast('⚠️ Backup file is large (>5MB). Consider clearing old data.', 'warning');
      }

      const filename = `lifeos-backup-${new Date().toISOString().slice(0,10)}.json`;
      _downloadBlob(new Blob([json], { type: 'application/json' }), filename);

      // Update lastExportDate
      _updateLastExportDate();

      UI.showToast('✅ Backup downloaded!', 'success');
      EventBus.emit('data:exported', { filename });
      Logger.info('DataProtection: JSON exported', { filename, bytes: sizeBytes });
    } catch (e) {
      UI.showToast('❌ Export failed: ' + e.message, 'error');
      Logger.error('DataProtection: exportJSON failed', e.message);
    }
  }

  /** Export as CSV — study sessions, habits summary */
  function exportCSV() {
    try {
      // RULE 47: ALL reads via Store.get() — never localStorage directly
      const sessions = Store.get('study_sessions');
      const habits   = Store.get('habits');

      let csv = 'Type,Date,Name/Subject,Duration(mins),Notes\n';

      sessions.forEach(s => {
        const row = [
          'study',
          s.date || '',
          `"${(s.subject || '').replace(/"/g, '""')}"`,
          s.durationMins || 0,
          `"${(s.notes   || '').replace(/"/g, '""')}"`,
        ];
        csv += row.join(',') + '\n';
      });

      habits.forEach(h => {
        const row = [
          'habit',
          h.createdAt ? h.createdAt.slice(0, 10) : '',
          `"${(h.name || '').replace(/"/g, '""')}"`,
          h.streak || 0,
          `streak:${h.streak || 0}`,
        ];
        csv += row.join(',') + '\n';
      });

      const filename = `lifeos-export-${new Date().toISOString().slice(0,10)}.csv`;
      _downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);

      _updateLastExportDate();
      UI.showToast('✅ CSV exported!', 'success');
      EventBus.emit('data:exported', { filename });
      Logger.info('DataProtection: CSV exported', { filename });
    } catch (e) {
      UI.showToast('❌ CSV export failed: ' + e.message, 'error');
      Logger.error('DataProtection: exportCSV failed', e.message);
    }
  }

  function _updateLastExportDate() {
    // RULE 47: Always route through Store.set() — schema validation + reactive subscribers
    try {
      const settings = Store.get('settings');
      Store.set('settings', { ...settings, lastExportDate: new Date().toISOString() });
    } catch (e) {
      Logger.warn('Could not update lastExportDate', e.message);
    }
  }

  // ── Import ───────────────────────────────────────────────────

  /**
   * Import from file picker.
   * RULE 52: full validation. Accepts flat (v3.4) AND MASTER wrapped format.
   * FIX 2 (v3.5): backward compatible with both formats.
   */
  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        let dataObj;

        // Detect format
        if (parsed.lifeos_version === 'MASTER' && parsed.data) {
          // MASTER wrapped format (v3.5+)
          dataObj = parsed.data;
        } else if (typeof parsed === 'object' && !parsed.lifeos_version) {
          // Flat format (v3.4 legacy)
          dataObj = parsed;
        } else {
          throw new Error('Invalid version: ' + parsed.lifeos_version);
        }

        const keys = Object.keys(dataObj).filter(k => k.startsWith('lifeos_'));
        if (keys.length === 0) throw new Error('No LifeOS data found in file');

        // RULE 52: Full validation — all array keys must actually be arrays
        const ARRAY_KEYS = [
          'lifeos_habits', 'lifeos_study_sessions', 'lifeos_forest',
          'lifeos_notes', 'lifeos_body_weight', 'lifeos_diet_compliance',
          'lifeos_sleep', 'lifeos_mood', 'lifeos_workout_logs',
          'lifeos_workout_plans', 'lifeos_achievements', 'lifeos_checkins',
        ];
        ARRAY_KEYS.forEach(k => {
          if (dataObj[k] !== undefined && !Array.isArray(dataObj[k])) {
            throw new Error(`${k} must be an array`);
          }
        });

        // Validate object keys
        const OBJ_KEYS = ['lifeos_settings', 'lifeos_profile', 'lifeos_schedule', 'lifeos_interaction_data'];
        OBJ_KEYS.forEach(k => {
          if (dataObj[k] !== undefined && (typeof dataObj[k] !== 'object' || Array.isArray(dataObj[k]))) {
            throw new Error(`${k} must be an object`);
          }
        });

        keys.forEach(k => localStorage.setItem(k, JSON.stringify(dataObj[k])));

        UI.showToast('✅ Data imported! Reloading…', 'success');
        EventBus.emit('data:imported', { keys: keys.length });
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        UI.showToast('❌ Import failed: ' + err.message, 'error');
        Logger.error('DataProtection: import failed', err.message);
      }
    };
    reader.readAsText(file);
  }

  // ── Clear ────────────────────────────────────────────────────

  /**
   * RULE 42: NEVER localStorage.clear() — only this method.
   * Removes ONLY lifeos_ prefixed keys.
   */
  function clearAll() {
    UI.showConfirmModal(
      '⚠️ Delete ALL LifeOS data permanently? This cannot be undone.',
      () => {
        // Only remove lifeos_ prefixed keys — never clear entire localStorage
        Object.keys(localStorage)
          .filter(k => k.startsWith('lifeos_'))
          .forEach(k => localStorage.removeItem(k));

        // Also clear IDB
        _openDB().then(db => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).clear();
          tx.onerror = e => Logger.error('IDB clearAll failed', e.target.error);
        }).catch(() => {});

        UI.showToast('🗑️ All data cleared', 'info');
        setTimeout(() => location.reload(), 1000);
      }
    );
  }

  // ── IDB Helpers ──────────────────────────────────────────────

  function _idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = e  => reject(e.target.error);
    });
  }

  // Separate helper for getAllKeys — opens fresh readonly tx to avoid stale tx issues
  async function _idbGetAllKeys() {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = e  => reject(e.target.error);
    });
  }

  function _idbGetAll(store, method = 'getAllKeys') {
    return new Promise((resolve, reject) => {
      const req = store[method]();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = e  => reject(e.target.error);
    });
  }

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { restoreIfNeeded, scheduleBackup, backup, exportJSON, exportCSV, importData, clearAll };
})();
