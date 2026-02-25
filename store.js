// ═══════════════════════════════════════════════════════════════
// js/data/store.js — LifeOS 26 v3.5.1
// Single source of truth. All reads via Store.get().
// Depends on: Logger, EventBus, SchemaValidator, DataProtection
//
// RULES:
//   RULE 4:  Store = single source of truth — UI reads Store.get(), never localStorage directly
//   RULE 5:  SchemaValidator.validate() called on every _readStorage()
//   RULE 13: Store subscribers individually try/caught
//   RULE 47: ALL storage reads via Store.get()
//   RULE 51: Text inputs: Store.setDebounced() — toggles: Store.set()
//   RULE 62: body_weight, notification_prefs, weekly_summary_last in KEYS
// ═══════════════════════════════════════════════════════════════

const Store = (() => {
  let _state = {};
  const _subs           = new Map();
  const _debounceTimers = {};

  // RULE 62: all keys enumerated — nothing reads localStorage directly
  const KEYS = [
    'profile', 'habits', 'study_sessions', 'workout_plans', 'workout_logs',
    'schedule', 'sleep', 'mood', 'checkins', 'forest', 'settings',
    'achievements', 'last_open_date', 'body_weight', 'notification_prefs',
    'weekly_summary_last', 'notes', 'diet_compliance', 'interaction_data',
    'daily_reset_last',
  ];

  // ── Init ─────────────────────────────────────────────────────

  function init() {
    KEYS.forEach(k => { _state[k] = _readStorage(k); });
    Logger.info('Store ready', { keys: KEYS.length });
  }

  // ── Read ─────────────────────────────────────────────────────

  /** RULE 47: use this — never localStorage.getItem() directly */
  function get(key) {
    return _state[key] ?? SchemaValidator.defaultFor(key);
  }

  // ── Write ────────────────────────────────────────────────────

  function set(key, value) {
    const validated = SchemaValidator.validate(key, value);
    _state[key]     = validated;
    _writeStorage(key, validated);
    DataProtection.scheduleBackup();
    _notify(key, validated);
  }

  /** RULE 51: use for text inputs — debounced to avoid per-keystroke writes */
  function setDebounced(key, value, delay = 250) {
    clearTimeout(_debounceTimers[key]); // RULE 46: clear before set
    _debounceTimers[key] = setTimeout(() => set(key, value), delay);
  }

  /** Partial mutation — updates one item in an array by id. Avoids full rewrite. */
  function update(key, id, partial) {
    const arr = get(key);
    if (!Array.isArray(arr)) return;
    const idx = arr.findIndex(item => item.id === id);
    if (idx === -1) return;
    // Shallow copy — break reference before mutation so external
    // callers holding old array reference are never silently affected.
    const copy = [...arr];
    copy[idx] = { ...copy[idx], ...partial };
    set(key, copy);
  }

  // ── Subscribe ────────────────────────────────────────────────

  /**
   * Subscribe to key changes.
   * @returns unsubscribe fn — use in onCleanup()
   */
  function subscribe(key, cb) {
    if (!_subs.has(key)) _subs.set(key, new Set());
    _subs.get(key).add(cb);
    return () => {
      const set = _subs.get(key);
      if (set) set.delete(cb);
    };
  }

  function _notify(key, value) {
    const set = _subs.get(key);
    if (!set) return;
    // RULE 13: each subscriber individually try/caught
    set.forEach(cb => {
      try { cb(value); }
      catch (e) { Logger.error(`Store subscriber error [${key}]`, e); }
    });
  }

  // ── Storage I/O ──────────────────────────────────────────────

  function _readStorage(key) {
    try {
      const raw = localStorage.getItem('lifeos_' + key);
      if (raw === null) return SchemaValidator.defaultFor(key);
      // RULE 5: validate on every read
      return SchemaValidator.validate(key, JSON.parse(raw));
    } catch {
      return SchemaValidator.defaultFor(key);
    }
  }

  function _writeStorage(key, value) {
    try {
      let v = value;

      // ── Hard caps — log warning, do NOT crash ──────────────
      if (key === 'habits' && Array.isArray(v)) {
        v = v.map(h => ({
          ...h,
          history: Array.isArray(h.history) && h.history.length > 365
            ? h.history.slice(-365)
            : (h.history || []),
        }));
      }

      if (key === 'study_sessions' && Array.isArray(v) && v.length > 10000) {
        Logger.warn('study_sessions cap: 10000 entries');
        v = v.slice(-10000);
      }

      if (key === 'workout_logs' && Array.isArray(v) && v.length > 5000) {
        Logger.warn('workout_logs cap: 5000 entries');
        v = v.slice(-5000);
      }

      // FIX 3 (v3.5.1): Notes hard cap — prevents export bloat and mount freeze
      if (key === 'notes' && Array.isArray(v) && v.length > 2000) {
        Logger.warn('notes cap: 2000 entries');
        v = v.slice(-2000);
      }

      // Rolling 3-year window for time-series data
      if ((key === 'sleep' || key === 'mood') && Array.isArray(v)) {
        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
        const cutoff = cutoffDate.toISOString().slice(0, 10);
        const before = v.length;
        v = v.filter(e => (e.date || e.timestamp || '') >= cutoff);
        if (v.length < before) {
          Logger.warn(`${key} 3-year cap applied`, { removed: before - v.length });
        }
      }

      localStorage.setItem('lifeos_' + key, JSON.stringify(v));
    } catch (e) {
      Logger.error('Store: write failed', { key, error: e.message });
    }
  }

  return { init, get, set, setDebounced, update, subscribe };
})();
