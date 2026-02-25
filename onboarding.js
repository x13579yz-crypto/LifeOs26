// js/features/onboarding.js
// OnboardingModule — LifeOS 26 v3.5.1
// Part 5 — Features Layer
// ZERO inline CSS — all styling via components.css classes
// NO STUBS — every function fully implemented

const OnboardingModule = (() => {

  const STEPS = {
    1: { title:"What's your name? 👋",      field:'name',           type:'text',   placeholder:'Your name…',               next:2 },
    2: { title:"What's your main goal? 🎯", field:'goal',           type:'select', options:['maintain','lose weight','gain muscle','study more','stay healthy'], next:3 },
    3: { title:'Add your first habit ✅',                           type:'habit',                                          next:4 },
    4: { title:'Set study goal 📚',         field:'studyGoalHours', type:'number', placeholder:'Hours per day (e.g. 4)',    next:5 },
    5: { title:'Your wake time ⏰',          field:'wakeTime',       type:'time',                                           next:6 },
    6: { title:'Data Safety Notice 🔒',                             type:'notice',                                         next:null },
  };

  // Step 6 (notice) excluded from progress bar — it's a confirmation screen, not a data step
  const TOTAL_STEPS = Object.keys(STEPS).length - 1; // = 5

  // ── Public ──────────────────────────────────────────────────────────────────

  function isFirstLaunch() {
    const profile = Store.get('profile');
    return !profile || !profile.onboarded;
  }

  function start() {
    const screen = document.getElementById('onboarding-screen');
    if (!screen) { Logger.warn('Onboarding screen element not found'); return; }
    screen.hidden = false;
    _renderStep(1);
    Logger.info('Onboarding started');
  }

  // ── Render Step ──────────────────────────────────────────────────────────────

  function _renderStep(stepNum) {
    const screen = document.getElementById('onboarding-screen');
    if (!screen) return;
    const s = STEPS[stepNum];
    if (!s) { Logger.warn('Unknown step', { stepNum }); return; }

    const isNotice = s.type === 'notice';

    const progressHTML = !isNotice ? `
      <div class="onb-progress-track">
        <div class="onb-progress-fill" id="onb-progress-fill"></div>
      </div>
      <div class="onb-step-counter">${stepNum} / ${TOTAL_STEPS}</div>
    ` : '';

    const actionsHTML = !isNotice ? `
      <div class="onb-actions">
        <button id="onboard-skip" class="onb-btn-skip">Skip</button>
        <button id="onboard-next" class="onb-btn-next">${s.next ? 'Next →' : 'Get Started! 🚀'}</button>
      </div>
    ` : '';

    screen.innerHTML = `
      <div class="onb-wrap">
        ${progressHTML}
        <h2 class="onb-title">${s.title}</h2>
        <div class="onb-field" id="onboard-field"></div>
        ${actionsHTML}
      </div>
    `;

    // Set progress fill width — this is data (a percentage), not a design decision
    if (!isNotice) {
      const fill = document.getElementById('onb-progress-fill');
      if (fill) fill.style.width = Math.round((stepNum / TOTAL_STEPS) * 100) + '%';
    }

    _renderOnboardField(s);

    if (!isNotice) {
      document.getElementById('onboard-skip').addEventListener('click', () => _advance(stepNum, s, true));
      document.getElementById('onboard-next').addEventListener('click', () => _advance(stepNum, s, false));
      setTimeout(() => {
        const input = document.getElementById('onboard-input') || document.getElementById('onboard-habit-name');
        if (input) {
          input.focus();
          input.addEventListener('keydown', e => { if (e.key === 'Enter') _advance(stepNum, s, false); });
        }
      }, 50);
    }
  }

  // ── Render Field ─────────────────────────────────────────────────────────────

  function _renderOnboardField(s) {
    const container = document.getElementById('onboard-field');
    if (!container) return;

    if (s.type === 'text') {
      container.innerHTML = `
        <input id="onboard-input" type="text"
          placeholder="${s.placeholder || ''}"
          autocomplete="off" autocorrect="off" spellcheck="false">`;

    } else if (s.type === 'number') {
      container.innerHTML = `
        <input id="onboard-input" type="number"
          min="0.5" max="24" step="0.5"
          placeholder="${s.placeholder || ''}">`;

    } else if (s.type === 'time') {
      container.innerHTML = `
        <input id="onboard-input" type="time">
        <p class="onb-hint">Used for daily reminders and habit scheduling.</p>`;

    } else if (s.type === 'select') {
      const opts = (s.options || [])
        .map(o => `<option value="${o}">${o.charAt(0).toUpperCase() + o.slice(1)}</option>`)
        .join('');
      container.innerHTML = `<select id="onboard-input">${opts}</select>`;

    } else if (s.type === 'habit') {
      container.innerHTML = `
        <input id="onboard-habit-name" type="text"
          placeholder="e.g. Morning Run 🏃" autocomplete="off">
        <p class="onb-habit-hint">You can add more habits later from the Habits section.</p>`;
      setTimeout(() => {
        const input = document.getElementById('onboard-habit-name');
        if (input) {
          input.focus();
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter') _advance(3, STEPS[3], false);
          });
        }
      }, 50);

    } else if (s.type === 'notice') {
      container.innerHTML = `
        <div class="onb-notice-card">
          <div class="onb-notice-icon">🔒</div>
          <p class="onb-notice-text">
            Data is stored <strong>locally on this device</strong>.<br>
            Clearing browser storage <strong>erases all your progress</strong>.<br>
            We recommend exporting a backup <strong>monthly</strong>.
          </p>
          <div class="onb-notice-divider"></div>
          <p class="onb-notice-sub">
            LifeOS has no cloud sync. Your data lives only here.<br>
            Use the export feature in Profile to keep it safe.
          </p>
          <button id="onboard-acknowledge" class="onb-btn-acknowledge">
            ✅ I Understand — Let's Go!
          </button>
        </div>`;
      document.getElementById('onboard-acknowledge').addEventListener('click', () => _complete());
    }
  }

  // ── Save Step ────────────────────────────────────────────────────────────────

  function _saveStep(stepNum) {
    const s = STEPS[stepNum];
    if (!s) return;

    if (s.type === 'text' || s.type === 'number' || s.type === 'select' || s.type === 'time') {
      const input = document.getElementById('onboard-input');
      const val   = input ? input.value.trim() : '';
      if (!val) return;

      const profile  = Store.get('profile');
      const settings = Store.get('settings');

      if      (s.field === 'name')           Store.set('profile',  { ...profile, name: val });
      else if (s.field === 'goal')           Store.set('profile',  { ...profile, goal: val });
      else if (s.field === 'studyGoalHours') Store.set('settings', { ...settings, studyGoalHours: parseFloat(val) || 4 });
      else if (s.field === 'wakeTime')       Store.set('profile',  { ...profile, wakeTime: val });

      Logger.info('Onboarding step saved', { field: s.field });

    } else if (s.type === 'habit') {
      const nameInput = document.getElementById('onboard-habit-name');
      const name      = nameInput ? nameInput.value.trim() : '';
      if (!name) return;

      const habits = Store.get('habits') || [];
      habits.push({
        id: String(Date.now()), name, emoji: '✅', category: 'health',
        frequency: 'daily', streak: 0, longestStreak: 0,
        completedToday: false, history: [],
        createdAt: new Date().toISOString(), reminderTime: null, notes: [],
      });
      Store.set('habits', habits);
      Logger.info('First habit created during onboarding', { name });
    }
  }

  // ── Advance ──────────────────────────────────────────────────────────────────

  function _advance(stepNum, s, skipped) {
    if (!skipped) _saveStep(stepNum);
    else Logger.info('Step skipped', { stepNum });
    if (!s.next) { _complete(); return; }
    _renderStep(s.next);
  }

  // ── Complete ─────────────────────────────────────────────────────────────────

  function _complete() {
    const profile = Store.get('profile');
    Store.set('profile', { ...profile, onboarded: true });
    const screen = document.getElementById('onboarding-screen');
    if (screen) screen.hidden = true;
    Logger.info('Onboarding complete');
    EventBus.emit('app:onboarding-complete');
    if (typeof LifeOS !== 'undefined' && typeof LifeOS.navigate === 'function') {
      LifeOS.navigate('dashboard');
    }
    UI.showToast("🎉 Welcome to LifeOS 26! You're all set.", 'success', 4000);
  }

  return { isFirstLaunch, start };

})();
