// ═══════════════════════════════════════════════════════════════
// js/foundation/schema.js — LifeOS 26 v3.5.1
// Schema validation + defaults for every Store key.
// Depends on: Logger.
// RULE 5: validate() called on every Store._readStorage()
// RULE 57: habit history items always {date:string, completed:boolean}
// ═══════════════════════════════════════════════════════════════

const SchemaValidator = (() => {

  // ── UID HELPER ───────────────────────────────────────────────
  // Guarantees unique fallback IDs even if multiple items are
  // invalid simultaneously. Date.now() alone would collide.
  let _uidCounter = 0;
  function _uid() {
    return `${Date.now()}_${++_uidCounter}`;
  }

  // ── DEFAULTS ────────────────────────────────────────────────
  const DEFAULTS = {
    profile: {
      name: '', avatar: '🌟', age: null, height: null, weight: null,
      goal: 'maintain', level: 'semester1', tagline: '',
      onboarded: false, fontScale: 1.0,
    },
    habits:          [],
    study_sessions:  [],
    workout_plans:   [],
    workout_logs:    [],
    schedule:        { 0:'rest', 1:'rest', 2:'rest', 3:'rest', 4:'rest', 5:'rest', 6:'rest' },
    sleep:           [],
    mood:            [],
    checkins:        [],
    forest:          [],
    body_weight:     [],
    notes:           [],
    diet_compliance: [],
    interaction_data: {
      section_switches: 0, settings_opens: 0, total_nav_time: 0,
      study_active_time: 0, workout_active_time: 0, week_start: '',
    },
    daily_reset_last:    '',
    settings: {
      theme: 'dark', pomodoroWork: 25, pomodoroBreak: 5,
      hydrationGoal: 8, studyGoalHours: 4, notifications: false,
      lastExportDate: null, highContrast: false, fontSize: 'medium',
    },
    notification_prefs: {
      habitReminders: {}, studyReminder: null,
      sleepReminder: true, streakAlert: true,
    },
    achievements:        [],
    last_open_date:      '',
    weekly_summary_last: '',
  };

  // ── PUBLIC API ───────────────────────────────────────────────

  function defaultFor(key) {
    const d = DEFAULTS[key];
    return d !== undefined ? JSON.parse(JSON.stringify(d)) : null;
  }

  function validate(key, data) {
    try {
      switch (key) {

        // ── habits ──────────────────────────────────────────
        case 'habits':
          if (!Array.isArray(data)) return [];
          return data
            .filter(h => h && typeof h.id === 'string' && typeof h.name === 'string')
            .map(h => ({
              id:             String(h.id),
              name:           String(h.name || '').trim(),
              emoji:          typeof h.emoji === 'string' ? h.emoji : '✅',
              category:       ['morning','evening','health','focus','social'].includes(h.category)
                                ? h.category : 'health',
              frequency:      h.frequency === 'weekdays' ? 'weekdays' : 'daily',
              streak:         Math.max(0, parseInt(h.streak)        || 0),
              longestStreak:  Math.max(0, parseInt(h.longestStreak) || 0),
              completedToday: Boolean(h.completedToday),
              // RULE 57: history items always {date:string, completed:boolean}
              history: Array.isArray(h.history)
                ? h.history.slice(-365).map(entry => ({
                    date:      typeof entry.date === 'string' ? entry.date : '',
                    completed: Boolean(entry.completed),
                  }))
                : [],
              createdAt:    typeof h.createdAt    === 'string' ? h.createdAt    : new Date().toISOString(),
              reminderTime: typeof h.reminderTime === 'string' ? h.reminderTime : null,
            }));

        // ── notes ───────────────────────────────────────────
        case 'notes':
          if (!Array.isArray(data)) return [];
          return data
            .filter(n => n && typeof n.id === 'string')
            .map(n => ({
              id:        String(n.id),
              type:      n.type === 'list' ? 'list' : 'text',
              title:     typeof n.title   === 'string' ? n.title   : '',
              content:   typeof n.content === 'string' ? n.content : '',
              items: Array.isArray(n.items)
                ? n.items.map(i => ({
                    id:      typeof i.id   === 'string'  ? i.id   : _uid(),
                    text:    typeof i.text === 'string'  ? i.text : '',
                    checked: Boolean(i.checked),
                  }))
                : [],
              createdAt: typeof n.createdAt === 'string' ? n.createdAt : new Date().toISOString(),
              updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : new Date().toISOString(),
            }));

        // ── diet_compliance ─────────────────────────────────
        case 'diet_compliance':
          if (!Array.isArray(data)) return [];
          return data
            .filter(d => d && typeof d.date === 'string')
            .map(d => ({
              date:        String(d.date),
              protein:     Boolean(d.protein),
              meals:       Boolean(d.meals),
              water:       Boolean(d.water),
              postWorkout: Boolean(d.postWorkout),
              percentage:  Math.min(100, Math.max(0, Number(d.percentage) || 0)),
            }));

        // ── body_weight ─────────────────────────────────────
        case 'body_weight':
          if (!Array.isArray(data)) return [];
          return data
            .filter(e => e && typeof e.date === 'string' && !isNaN(e.weight))
            .map(e => ({
              date:   String(e.date),
              weight: Number(e.weight),
              unit:   e.unit === 'lbs' ? 'lbs' : 'kg',
            }));

        // ── profile ─────────────────────────────────────────
        case 'profile':
          if (typeof data !== 'object' || Array.isArray(data)) return defaultFor('profile');
          return {
            ...defaultFor('profile'),
            ...Object.fromEntries(
              Object.entries(data).filter(([k]) => k in DEFAULTS.profile)
            ),
            age:       (data.age    != null && !isNaN(data.age))
                         ? Math.min(120, Math.max(1,   Number(data.age)))    : null,
            height:    (data.height != null && !isNaN(data.height))
                         ? Math.min(300, Math.max(50,  Number(data.height))) : null,
            weight:    (data.weight != null && !isNaN(data.weight))
                         ? Math.min(500, Math.max(20,  Number(data.weight))) : null,
            fontScale: Math.min(2, Math.max(0.5, Number(data.fontScale) || 1.0)),
          };

        // ── settings ────────────────────────────────────────
        case 'settings':
          if (typeof data !== 'object' || Array.isArray(data)) return defaultFor('settings');
          return {
            ...defaultFor('settings'),
            ...data,
            pomodoroWork:   Math.min(120, Math.max(1,   parseInt(data.pomodoroWork)    || 25)),
            pomodoroBreak:  Math.min(60,  Math.max(1,   parseInt(data.pomodoroBreak)   || 5)),
            hydrationGoal:  Math.min(20,  Math.max(1,   parseInt(data.hydrationGoal)   || 8)),
            studyGoalHours: Math.min(24,  Math.max(0.5, parseFloat(data.studyGoalHours)|| 4)),
            theme:    data.theme    === 'light' ? 'light' : 'dark',
            fontSize: ['small','medium','large','xlarge'].includes(data.fontSize)
                        ? data.fontSize : 'medium',
          };

        // ── schedule ────────────────────────────────────────
        case 'schedule': {
          if (typeof data !== 'object' || Array.isArray(data)) return defaultFor('schedule');
          const VALID_TYPES = [
            'rest','calisthenics','yoga','meditation','combined',
            'push','pull','legs','cardio','custom',
          ];
          const result = { ...defaultFor('schedule') };
          for (let d = 0; d <= 6; d++) {
            if (data[d] !== undefined) {
              result[d] = VALID_TYPES.includes(data[d]) ? data[d] : 'rest';
            }
          }
          return result;
        }

        // ── study_sessions ──────────────────────────────────
        case 'study_sessions':
          if (!Array.isArray(data)) return [];
          return data
            .filter(s => s && typeof s.subject === 'string' && typeof s.durationMins === 'number')
            .map(s => ({
              id:           typeof s.id   === 'string' ? s.id   : _uid(),
              subject:      String(s.subject).trim(),
              durationMins: Math.max(0, Number(s.durationMins) || 0),
              plannedMins:  Math.max(0, Number(s.plannedMins)  || 0),
              mode:         ['pomodoro','stopwatch','countdown'].includes(s.mode) ? s.mode : 'pomodoro',
              date:         typeof s.date  === 'string' ? s.date  : '',
              treeGrown:    Boolean(s.treeGrown),
              notes:        typeof s.notes === 'string' ? s.notes : '',
              subjectColor: typeof s.subjectColor === 'string' ? s.subjectColor : '',
            }));

        // ── workout_logs ────────────────────────────────────
        case 'workout_logs':
          if (!Array.isArray(data)) return [];
          return data
            .filter(l => l && typeof l.date === 'string')
            .map(l => ({
              id:           typeof l.id       === 'string' ? l.id       : _uid(),
              planName:     typeof l.planName === 'string' ? l.planName : '',
              date:         String(l.date),
              durationMins: Math.max(0, Number(l.durationMins) || 0),
              notes:        typeof l.notes    === 'string' ? l.notes    : '',
              exercises:    Array.isArray(l.exercises) ? l.exercises : [],
              totalVolume:  Math.max(0, Number(l.totalVolume)  || 0),
            }));

        // ── workout_plans ───────────────────────────────────
        case 'workout_plans':
          if (!Array.isArray(data)) return [];
          return data
            .filter(p => p && typeof p.name === 'string')
            .map(p => ({
              id:        typeof p.id   === 'string' ? p.id   : _uid(),
              name:      String(p.name).trim(),
              type:      typeof p.type === 'string' ? p.type : 'custom',
              exercises: Array.isArray(p.exercises) ? p.exercises : [],
            }));

        // ── sleep ───────────────────────────────────────────
        case 'sleep':
          if (!Array.isArray(data)) return [];
          return data
            .filter(s => s && typeof s.date === 'string')
            .map(s => ({
              date:     String(s.date),
              bedtime:  typeof s.bedtime  === 'string' ? s.bedtime  : '',
              wakeTime: typeof s.wakeTime === 'string' ? s.wakeTime : '',
              duration: Math.max(0, Number(s.duration) || 0),
              quality:  Math.min(5, Math.max(1, parseInt(s.quality) || 3)),
            }));

        // ── mood ────────────────────────────────────────────
        case 'mood':
          if (!Array.isArray(data)) return [];
          return data
            .filter(m => m && typeof m.timestamp === 'string')
            .map(m => ({
              timestamp: String(m.timestamp),
              mood:      Math.min(5, Math.max(1, parseInt(m.mood)   || 3)),
              energy:    Math.min(5, Math.max(1, parseInt(m.energy) || 3)),
              note:      typeof m.note === 'string' ? m.note : '',
            }));

        // ── forest ──────────────────────────────────────────
        case 'forest':
          if (!Array.isArray(data)) return [];
          return data
            .filter(t => t && typeof t.date === 'string')
            .map(t => ({
              date:    String(t.date),
              subject: typeof t.subject === 'string' ? t.subject : '',
              grown:   Boolean(t.grown),
            }));

        // ── achievements ────────────────────────────────────
        case 'achievements':
          return Array.isArray(data) ? data.filter(a => typeof a === 'string') : [];

        // ── checkins ────────────────────────────────────────
        case 'checkins':
          return Array.isArray(data) ? data : [];

        // ── interaction_data ────────────────────────────────
        case 'interaction_data':
          if (typeof data !== 'object' || Array.isArray(data)) return defaultFor('interaction_data');
          return {
            section_switches:   Math.max(0, Number(data.section_switches)   || 0),
            settings_opens:     Math.max(0, Number(data.settings_opens)     || 0),
            total_nav_time:     Math.max(0, Number(data.total_nav_time)      || 0),
            study_active_time:  Math.max(0, Number(data.study_active_time)  || 0),
            workout_active_time:Math.max(0, Number(data.workout_active_time)|| 0),
            week_start:         typeof data.week_start === 'string' ? data.week_start : '',
          };

        // ── pass-through primitives ─────────────────────────
        default:
          return data;
      }
    } catch (e) {
      Logger.warn(`Schema validation failed for key: ${key}`, e.message);
      return defaultFor(key);
    }
  }

  return { validate, defaultFor };
})();
