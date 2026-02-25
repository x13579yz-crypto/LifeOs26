// js/features/badges.js
// BadgeSystem — LifeOS 26 v3.5.1
// Part 5 — Features Layer
// EventBus listeners registered inside init() — no IIFE-level side effects

const BadgeSystem = (() => {

  const BADGES = [
    { id:'first_habit',   label:'🌱 First Habit',    check: s => (s.habits||[]).length >= 1 },
    { id:'streak_7',      label:'🔥 Week Streak',    check: s => (s.habits||[]).some(h => (h.streak||0) >= 7) },
    { id:'streak_30',     label:'⚡ Month Warrior',  check: s => (s.habits||[]).some(h => (h.streak||0) >= 30) },
    { id:'streak_100',    label:'💎 Century Legend', check: s => (s.habits||[]).some(h => (h.streak||0) >= 100) },
    { id:'study_1h',      label:'📖 First Hour',     check: s => _totalStudyH(s) >= 1 },
    { id:'study_10h',     label:'📚 10h Scholar',    check: s => _totalStudyH(s) >= 10 },
    { id:'study_100h',    label:'🎓 100h Master',    check: s => _totalStudyH(s) >= 100 },
    { id:'workout_first', label:'🏋️ First Session',  check: s => (s.workout_logs||[]).length >= 1 },
    { id:'workout_10',    label:'💪 Iron Will',      check: s => (s.workout_logs||[]).length >= 10 },
    { id:'forest_10',     label:'🌳 Forest Keeper',  check: s => (s.forest||[]).filter(t=>t.grown).length >= 10 },
    { id:'hydration_7',   label:'💧 Hydration Hero', check: s => _hydrationStreak(s) >= 7 },
    { id:'early_bird',    label:'🌅 Early Bird',     check: s => (s.sleep||[]).some(e => { const [h]=(e.wakeTime||'').split(':').map(Number); return h<=6; }) },
    { id:'night_owl',     label:'🦉 Night Owl',      check: s => (s.sleep||[]).some(e => { const [h]=(e.bedtime||'').split(':').map(Number); return h>=0&&h<=2; }) },
  ];

  let _initialized = false;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _totalStudyH(s) {
    return (s.study_sessions||[]).reduce((sum,sess) => sum + (sess.durationMins||0), 0) / 60;
  }

  function _hydrationStreak(s) {
    const wh = (s.habits||[]).find(h => /water|hydrat|drink/i.test(h.name) && h.category==='health');
    return wh ? (wh.streak||0) : 0;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * init() — registers EventBus listeners.
   * Called once by LifeOS init sequence.
   * Safe to call multiple times (guard prevents duplicate listeners).
   */
  function init() {
    if (_initialized) return;
    _initialized = true;

    EventBus.on('habit:completed',          () => check());
    EventBus.on('study:session-complete',   () => check());
    EventBus.on('workout:session-complete', () => check());
    EventBus.on('health:sleep-logged',      () => check());

    Logger.info('BadgeSystem initialized');
  }

  function check() {
    const state = {
      habits:         Store.get('habits'),
      study_sessions: Store.get('study_sessions'),
      forest:         Store.get('forest'),
      sleep:          Store.get('sleep'),
      workout_logs:   Store.get('workout_logs'),
    };

    const unlocked = [...(Store.get('achievements')||[])];
    let changed = false;

    BADGES.forEach(badge => {
      if (!unlocked.includes(badge.id) && badge.check(state)) {
        unlocked.push(badge.id);
        changed = true;
        // Delayed toast — UI safety
        setTimeout(() => {
          UI.showToast(`🏆 Achievement Unlocked: ${badge.label}`, 'success', 5000);
          AudioModule.play('complete');
        }, 500);
        EventBus.emit('badge:earned', { id: badge.id, label: badge.label });
        Logger.info('Badge earned', { id: badge.id });
      }
    });

    if (changed) Store.set('achievements', unlocked);
  }

  function hydrate() {
    const earned   = Store.get('achievements') || [];
    const badgeRow = document.getElementById('dashboard-badge-row');
    if (!badgeRow) return;

    if (earned.length === 0) {
      badgeRow.innerHTML = '<span class="badge-pill">No badges yet — complete activities to earn them!</span>';
      return;
    }

    const earnedBadges = BADGES.filter(b => earned.includes(b.id));
    badgeRow.innerHTML = earnedBadges
      .map(b => `<span class="badge-pill" title="${b.label}" aria-label="${b.label}">${b.label}</span>`)
      .join('');
  }

  function getEarned() {
    return [...(Store.get('achievements')||[])];
  }

  return { init, check, hydrate, getEarned, BADGES };

})();
