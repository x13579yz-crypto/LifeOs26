// ═══════════════════════════════════════════════════════════════
// js/foundation/eventbus.js — LifeOS 26 v3.5.1
// Pub/sub. on() returns unsubscribe fn. Depends on: Logger.
// RULE: EventBus.on() inside singleton IIFEs only.
//       Section modules: inside mount(onCleanup) + onCleanup(unsub).
//
// ALL EVENTS CATALOGUE:
// ─────────────────────────────────────────────
// LIFECYCLE:
//   app:ready                 {version}
//   app:navigate              {from, to}
//   app:onboarding-complete
//
// HABITS:
//   habit:completed           {habitId, name, streak}
//   habit:created             {habit}
//   habit:deleted             {habitId}
//   habit:undo-delete         {habit}
//   habit:reset-daily         {date, daysMissed}
//
// STUDY:
//   study:session-started     {subject, mode, durationMins}
//   study:session-complete    {subject, durationMins, mode}
//   study:session-abandoned   {subject, progress}
//   study:timer-tick          {secondsLeft, progress}
//   study:tree-grown          {subject, date}
//   study:tree-withered       {subject, progress}
//
// WORKOUT:
//   workout:session-started   {planName, type}
//   workout:session-complete  {planName, durationMins}
//   workout:rest-start        {seconds}
//   workout:rest-end
//   workout:pr-achieved
//
// HEALTH:
//   health:mood-logged        {mood, energy, timestamp}
//   health:sleep-logged       {duration, quality, date}
//   health:checkin-saved      {date, answers}
//   health:weight-logged      {weight, date}
//
// DATA:
//   data:backup-complete      {keys}
//   data:restored             {source, keys}
//   data:exported             {filename}
//   data:imported             {keys}
//
// AUDIO:
//   audio:play                {type}
//
// UI:
//   theme:changed             {theme}
//   profile:updated           {field, value}
//   ui:modal-close
//   ui:undo-available         {item, undoFn}
//
// NOTIFICATIONS:
//   notification:permission-granted
//   notification:reminder-triggered
//
// BACKUP:
//   backup:status-changed     {status, days}
//
// INTERACTION:
//   interaction:study-active
//   interaction:study-ended
//   interaction:focus-guard-triggered {from, to}
//
// BADGE:
//   badge:earned              {id, label}
// ═══════════════════════════════════════════════════════════════

const EventBus = (() => {
  const _listeners = new Map();

  /**
   * Subscribe to an event.
   * @param {string}   event    - event name
   * @param {Function} callback - handler fn
   * @returns {Function} unsubscribe fn — call in onCleanup()
   */
  function on(event, callback) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(callback);
    return () => {
      const set = _listeners.get(event);
      if (!set) return;
      set.delete(callback);
      // Auto-clean empty Sets — prevents Map growing unbounded on subscribe/unsubscribe cycles
      if (set.size === 0) _listeners.delete(event);
    };
  }

  /**
   * Emit event to all subscribers.
   * Each handler is individually try/caught — one bad handler
   * cannot break the rest. (RULE 12)
   */
  function emit(event, data) {
    if (!_listeners.has(event)) return;
    _listeners.get(event).forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        Logger.error(`EventBus handler error [${event}]`, e);
      }
    });
  }

  return { on, emit };
})();
