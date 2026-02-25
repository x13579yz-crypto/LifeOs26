// js/features/notifications.js
// NotificationModule — LifeOS 26 v3.5.1
// Part 5 — Features Layer

const NotificationModule = (() => {

  let _intervalId = null;
  const _sentToday = {};
  const MAX_PER_DAY = 3;

  // ── Public API ────────────────────────────────────────────────────────────────

  function init() {
    if (!('Notification' in window)) {
      Logger.info('Notifications not supported in this browser');
      return;
    }
    // Clear existing interval before setting new (lifecycle safety)
    if (_intervalId !== null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    _intervalId = setInterval(_checkAndTrigger, 60000);
    Logger.info('NotificationModule initialized');
  }

  /**
   * destroy() — clears interval on module teardown.
   * Call if app ever re-inits or hot-reloads.
   */
  function destroy() {
    if (_intervalId !== null) {
      clearInterval(_intervalId);
      _intervalId = null;
      Logger.info('NotificationModule destroyed');
    }
  }

  function requestPermission() {
    if (!('Notification' in window)) return Promise.resolve(false);
    return Notification.requestPermission()
      .then(result => {
        const granted = result === 'granted';
        if (granted) EventBus.emit('notification:permission-granted');
        Logger.info('Notification permission result', { result });
        return granted;
      })
      .catch(err => {
        Logger.warn('Notification permission request failed', err.message);
        return false;
      });
  }

  function scheduleHabitReminder(habit) {
    if (!habit || !habit.id || !habit.reminderTime) return;
    const prefs = Store.get('notification_prefs');
    const habitReminders = { ...(prefs.habitReminders||{}) };
    habitReminders[habit.id] = habit.reminderTime;
    Store.set('notification_prefs', { ...prefs, habitReminders });
    Logger.info('Habit reminder scheduled', { habitId: habit.id, time: habit.reminderTime });
  }

  function cancelReminder(habitId) {
    if (!habitId) return;
    const prefs = Store.get('notification_prefs');
    const habitReminders = { ...(prefs.habitReminders||{}) };
    delete habitReminders[habitId];
    Store.set('notification_prefs', { ...prefs, habitReminders });
    Logger.info('Habit reminder cancelled', { habitId });
  }

  function scheduleStreakAlert() {
    // Handled automatically in _checkAndTrigger at 9 PM
    Logger.info('Streak alert — managed by interval check');
  }

  function scheduleSleepReminder() {
    // Handled automatically in _checkAndTrigger at 10 PM
    Logger.info('Sleep reminder — managed by interval check');
  }

  // ── Private: Main Check Loop ──────────────────────────────────────────────────

  function _checkAndTrigger() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const prefs = Store.get('notification_prefs');
    if (!prefs || !prefs.enabled) return;

    const now   = new Date();
    const hhmm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const today = now.toISOString().slice(0,10);

    // Reset daily counters at midnight
    if (_sentToday._date !== today) {
      Object.keys(_sentToday).forEach(k => { delete _sentToday[k]; });
      _sentToday._date = today;
    }

    // Per-habit reminders
    Object.entries(prefs.habitReminders||{}).forEach(([habitId, time]) => {
      if (time !== hhmm) return;
      const key      = `habit_${habitId}`;
      const sentCount = _sentToday[key] || 0;
      if (sentCount >= MAX_PER_DAY) {
        UI.showToast('💡 Reminders ignored often. Adjust times in Settings?', 'info');
        return;
      }
      const habit = (Store.get('habits')||[]).find(h => h.id === habitId);
      if (!habit || habit.completedToday) return;
      _send('LifeOS — Habit Reminder', `Don't forget: ${habit.name} 🌟`);
      _sentToday[key] = sentCount + 1;
      EventBus.emit('notification:reminder-triggered', { habitId });
    });

    // Streak alert at 9 PM
    if (prefs.streakAlert && now.getHours() === 21 && now.getMinutes() === 0) {
      const atRisk = (Store.get('habits')||[]).filter(h => !h.completedToday && (h.streak||0) >= 3);
      if (atRisk.length > 0 && !_sentToday['streak_alert']) {
        _send('LifeOS — Streak Alert', `${atRisk.length} habit(s) at risk tonight! 🔥`);
        _sentToday['streak_alert'] = 1;
      }
    }

    // Sleep reminder at 10 PM if variance high
    if (prefs.sleepReminder && now.getHours() === 22 && now.getMinutes() === 0) {
      const variance = _getSleepVariance();
      if (variance !== null && variance > 45 && !_sentToday['sleep_reminder']) {
        _send('LifeOS — Sleep Reminder', 'Inconsistent sleep detected. Time to rest! 😴');
        _sentToday['sleep_reminder'] = 1;
      }
    }
  }

  function _getSleepVariance() {
    const sleepArr = (Store.get('sleep')||[]).slice(-7);
    if (sleepArr.length < 3) return null;
    const mins = sleepArr.map(s => {
      const [h,m] = (s.bedtime||'0:0').split(':').map(Number);
      // Normalize post-midnight hours (0–3) to 24–27 for correct variance
      return ((h < 4 ? h + 24 : h) * 60) + (m || 0);
    });
    const avg = mins.reduce((a,b) => a+b, 0) / mins.length;
    return Math.sqrt(mins.reduce((s,t) => s + Math.pow(t-avg,2), 0) / mins.length);
  }

  function _send(title, body) {
    try {
      new Notification(title, { body, icon: './icon-192.png' });
      Logger.info('Notification sent', { title });
    } catch(e) {
      Logger.warn('Notification send failed', e.message);
    }
  }

  return { init, destroy, requestPermission, scheduleHabitReminder, cancelReminder, scheduleStreakAlert, scheduleSleepReminder };

})();
