// ═══════════════════════════════════════════════════════════════
// js/system/dailyreset.js — LifeOS 26 v3.5.1
// Delta-based daily reset. Handles multi-day gaps correctly.
// Depends on: Logger, Store, EventBus, Perf
//
// FIX 4 (v3.5.1): Wrapped in Perf.measure('daily-reset') — 50ms budget
// FIX 4 (v3.5.1): todayObj cached — no repeated new Date() in loop
// RULE 57: habit history items always {date:string, completed:boolean}
// ═══════════════════════════════════════════════════════════════

const DailyReset = (() => {

  function run() {
    // FIX 4: enforce 50ms performance budget on reset
    return Perf.measure('daily-reset', () => _runInternal());
  }

  function _runInternal() {
    const todayObj = new Date(); // FIX 4: cache — reuse in loop, no repeated allocation
    const today    = todayObj.toISOString().slice(0, 10);
    const lastOpen = Store.get('last_open_date');

    if (lastOpen === today) {
      return Logger.info('DailyReset: already ran today');
    }

    const daysMissed        = lastOpen ? _daysBetween(lastOpen, today) : 0;
    const missedMultipleDays = daysMissed >= 2;
    const isWeekend          = !_isWeekday(todayObj); // cache once — same for all habits

    // Precompute gap dates ONCE outside map — avoids O(habits × daysMissed) work.
    // e.g. 1000 habits × 30 missed days saves ~30,000 redundant _addDays() calls.
    // RULE 57: every entry must be {date:string, completed:boolean}
    const _gapDates = [];
    if (lastOpen && daysMissed > 1) {
      for (let i = 1; i < daysMissed; i++) {
        _gapDates.push({ date: _addDays(lastOpen, i), completed: false });
      }
    }

    const habits = Store.get('habits').map(h => {
      const wasCompleted = Boolean(h.completedToday);

      // ── Streak calculation ──────────────────────────────
      let finalStreak;
      if (missedMultipleDays) {
        // User missed 2+ days → streak always breaks regardless of completion
        finalStreak = 0;
      } else {
        const newStreak = wasCompleted ? (h.streak || 0) + 1 : 0;
        // Weekday-only habits: don't break streak on weekend
        finalStreak = (!wasCompleted && h.frequency === 'weekdays' && isWeekend)
          ? h.streak
          : newStreak;
      }

      // ── History backfill ────────────────────────────────
      // Reuse precomputed gap dates + append this habit's lastOpen entry
      const tailEntries = [
        ..._gapDates,
        { date: lastOpen || today, completed: wasCompleted },
      ];

      return {
        ...h,
        completedToday: false,
        streak:         finalStreak,
        longestStreak:  Math.max(h.longestStreak || 0, finalStreak),
        history:        [...(h.history || []), ...tailEntries].slice(-365),
      };
    });

    Store.set('habits', habits);
    Store.set('last_open_date', today);
    EventBus.emit('habit:reset-daily', { date: today, daysMissed });
    Logger.info('DailyReset complete', { date: today, daysMissed });
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _isWeekday(date) {
    const d = date.getDay(); // 0=Sun, 6=Sat
    return d >= 1 && d <= 5;
  }

  function _daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function _addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  return { run };
})();
