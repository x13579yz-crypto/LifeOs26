// ═══════════════════════════════════════════════════════════════
// js/system/interactionmonitor.js — LifeOS 26 v3.5.1
// Tracks app interaction patterns. Self-awareness module.
// Depends on: Logger, Store, EventBus
//
// MASTER SPEC RULES:
//   75: Tracks section switches, settings opens, nav time, study/workout time
//       Does NOT track individual taps
//   76: Focus Guard — if study timer active, confirm before navigate
//       (Focus Guard enforced at LifeOS.navigate() level — see app.js)
//   77: Awareness rule — warn if interaction > study, switches > 150/wk, settings > 20/wk
//   FIX 8 (v3.5.1): recordNavTime() guard — safe to call before Store.init()
//   FIX 2 (v3.5.1): navigate() auto-wires nav time — no manual wiring needed
// ═══════════════════════════════════════════════════════════════

const InteractionMonitor = (() => {
  let _isStudyActive = false;

  // ── Week Context ──────────────────────────────────────────────

  function _getCurrentWeekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday = start of week
    return d.toISOString().slice(0, 10);
  }

  function _getData() {
    // FIX 8: guard against call before Store.init() completes
    if (typeof Store === 'undefined' || typeof Store.get !== 'function') {
      return {
        section_switches: 0, settings_opens: 0, total_nav_time: 0,
        study_active_time: 0, workout_active_time: 0, week_start: '',
      };
    }

    const data      = Store.get('interaction_data');
    const weekStart = _getCurrentWeekStart();

    // Auto-reset on new week — prevents stale data accumulating
    if (!data.week_start || data.week_start !== weekStart) {
      return {
        section_switches: 0, settings_opens: 0, total_nav_time: 0,
        study_active_time: 0, workout_active_time: 0, week_start: weekStart,
      };
    }
    return data;
  }

  function _save(data) {
    if (typeof Store === 'undefined' || typeof Store.set !== 'function') return;
    Store.set('interaction_data', data);
  }

  // ── Recording API ─────────────────────────────────────────────

  function recordSectionSwitch() {
    const d = _getData();
    d.section_switches++;
    _save(d);
  }

  function recordSettingsOpen() {
    const d = _getData();
    d.settings_opens++;
    _save(d);
  }

  /** FIX 8: guard against invalid ms values */
  function recordNavTime(ms) {
    if (!ms || ms < 0 || typeof Store.get !== 'function') return;
    const d = _getData();
    d.total_nav_time += ms;
    _save(d);
  }

  function addStudyTime(ms) {
    if (!ms || ms < 0) return;
    const d = _getData();
    d.study_active_time += ms;
    _save(d);
  }

  function addWorkoutTime(ms) {
    if (!ms || ms < 0) return;
    const d = _getData();
    d.workout_active_time += ms;
    _save(d);
  }

  // ── Summary & Awareness ───────────────────────────────────────

  /**
   * Get weekly summary for Reports module.
   * All times converted to minutes for display.
   */
  function getWeeklySummary() {
    const d = _getData();
    return {
      studyTime:           Math.round(d.study_active_time   / 60000),
      workoutTime:         Math.round(d.workout_active_time / 60000),
      appInteractionTime:  Math.round(d.total_nav_time      / 60000),
      sectionSwitches:     d.section_switches,
      settingsOpened:      d.settings_opens,
    };
  }

  /**
   * RULE 77: Awareness rule check.
   * Returns warning string or null.
   * No badges, no gamification — awareness only.
   */
  function checkAwarenessRule() {
    const d = _getData();

    if (d.total_nav_time > d.study_active_time && d.study_active_time > 0) {
      return '⚠️ You are interacting with the system more than producing output.';
    }
    if (d.section_switches > 150) {
      return '⚠️ You are interacting with the system more than producing output.';
    }
    if (d.settings_opens > 20) {
      return '⚠️ You are interacting with the system more than producing output.';
    }
    return null;
  }

  /** Expose study active state — used by LifeOS.navigate() Focus Guard (FIX 6) */
  function isStudyActive() {
    return _isStudyActive;
  }

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    // Section switch tracking
    EventBus.on('app:navigate', ({ from, to }) => {
      recordSectionSwitch();
      // RULE 76: Focus Guard — check handled at LifeOS.navigate() level
      // InteractionMonitor just emits the trigger event; app.js handles the confirm modal
      if (_isStudyActive && from !== to) {
        EventBus.emit('interaction:focus-guard-triggered', { from, to });
      }
    });

    // Study active time tracking via session events
    EventBus.on('study:session-started',   ()       => { _isStudyActive = true;  });
    EventBus.on('study:session-complete',  ({ durationMins }) => {
      _isStudyActive = false;
      addStudyTime(Math.round((durationMins || 0) * 60000));
    });
    EventBus.on('study:session-abandoned', ()       => { _isStudyActive = false; });

    // Workout time tracking
    EventBus.on('workout:session-complete', ({ durationMins }) => {
      addWorkoutTime(Math.round((durationMins || 0) * 60000));
    });

    Logger.info('InteractionMonitor ready');
  }

  return {
    init,
    recordSectionSwitch, recordSettingsOpen, recordNavTime,
    addStudyTime, addWorkoutTime,
    getWeeklySummary, checkAwarenessRule, isStudyActive,
  };
})();
