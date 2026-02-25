// js/sections/profile.js
// ProfileModule — LifeOS 26 v3.5.4
// Part 8 — Sections Layer
// Exports: mount(onCleanup)
// Guardrails: G1 G2 G3 G6 G8 enforced
// Risk: Destructive actions — ALL via UI.showConfirmModal(), NEVER window.confirm()
// Risk: BackupStatus card — pulse stop on mount, updateShield() called immediately

const ProfileModule = (() => {

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function _todayStr() { return new Date().toISOString().slice(0, 10); }

  function _daysSince(isoDate) {
    if (!isoDate) return null;
    const diff = Date.now() - new Date(isoDate).getTime();
    return Math.floor(diff / 86400000);
  }

  function _calcBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm || heightCm <= 0) return null;
    const hm = heightCm / 100;
    return (weightKg / (hm * hm)).toFixed(1);
  }

  function _daysUsingApp() {
    const profile   = Store.get('profile') || {};
    const createdAt = profile.createdAt;
    if (!createdAt || typeof createdAt !== 'string') return 1;
    const t = new Date(createdAt).getTime();
    if (isNaN(t)) return 1; // guard: corrupted ISO string → safe fallback
    return Math.max(1, Math.floor((Date.now() - t) / 86400000));
  }

  function _levelLabel(level) {
    const map = {
      semester1: '📚 Semester 1', semester2: '📗 Semester 2',
      semester3: '📘 Semester 3', semester4: '📙 Semester 4',
      advanced:  '🎓 Advanced',   graduate:  '🏅 Graduate',
    };
    return map[level] || level || '📚 Student';
  }

  function _goalLabel(goal) {
    const map = { lose: '🔥 Lose Weight', gain: '💪 Gain Muscle', maintain: '⚖️ Maintain', endurance: '🏃 Endurance' };
    return map[goal] || goal || '⚖️ Maintain';
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-profile');
    if (!section) return;

    // Master Spec Rule 72: updateShield on profile open — stops CRITICAL pulse
    if (typeof BackupStatus !== 'undefined' && BackupStatus.updateShield) {
      BackupStatus.updateShield();
    }
    // InteractionMonitor: record settings open
    if (typeof InteractionMonitor !== 'undefined' && InteractionMonitor.recordSettingsOpen) {
      InteractionMonitor.recordSettingsOpen();
    }

    // G3: Read from Store — never mutate directly
    const profile  = Store.get('profile')  || {};
    const settings = Store.get('settings') || {};
    const notifPrefs = Store.get('notification_prefs') || {};
    const achievements = Store.get('achievements') || [];

    const bmi     = _calcBMI(profile.weight, profile.height);
    const days    = _daysUsingApp();
    const daysSinceBackup = (typeof BackupStatus !== 'undefined' && BackupStatus.getDaysSinceBackup)
      ? BackupStatus.getDaysSinceBackup()
      : null;

    // Backup status card content
    function _backupCardHTML() {
      if (typeof BackupStatus === 'undefined') return '';
      const d   = BackupStatus.getDaysSinceBackup ? BackupStatus.getDaysSinceBackup() : null;
      const status = d === null ? 'critical' : d <= 30 ? 'safe' : d <= 60 ? 'warning' : 'critical';
      const statusMap = {
        safe:     { icon: '🛡️', label: 'Backup Safe',        cls: 'backup-safe',     msg: `Last backup: ${d} day(s) ago` },
        warning:  { icon: '⚠️', label: 'Backup Recommended', cls: 'backup-warning',  msg: `${d} days since last backup` },
        critical: { icon: '🔴', label: 'Backup Required',    cls: 'backup-critical', msg: d !== null ? `${d} days since last backup — backup now!` : 'No backup found — export immediately!' },
      };
      const s = statusMap[status];
      return `
        <div class="backup-status-card ${s.cls}" id="backup-status-card">
          <div class="backup-status-icon">${s.icon}</div>
          <div class="backup-status-info">
            <div class="backup-status-label">${s.label}</div>
            <div class="backup-status-msg">${s.msg}</div>
          </div>
          <button class="btn-primary spring-tap" id="profile-download-backup">⬇️ Download Backup</button>
        </div>
      `;
    }

    // ── Render ────────────────────────────────────────────────────────────────
    section.innerHTML = `<div class="section-content profile-content">

      <!-- 1. Avatar + Identity -->
      <div class="glass-card profile-identity-card">
        <div class="profile-avatar-row">
          <div class="profile-avatar-wrap">
            <button class="profile-avatar spring-tap" id="profile-avatar-btn" aria-label="Change avatar">
              ${profile.avatar || '🌟'}
            </button>
          </div>
          <div class="profile-identity-info">
            <div class="profile-name" id="profile-name-display">${profile.name || 'Your Name'}</div>
            <div class="profile-level-badge">${_levelLabel(profile.level)}</div>
            <div class="profile-tagline">${profile.tagline || 'Add a tagline…'}</div>
            <div class="profile-days-badge">📅 ${days} day${days !== 1 ? 's' : ''} using LifeOS</div>
          </div>
        </div>
        ${achievements.length > 0 ? `
          <div class="profile-badges-row" aria-label="Earned badges">
            ${achievements.slice(0, 8).map(a => `<span class="profile-badge-chip">${a}</span>`).join('')}
          </div>
        ` : `<div class="profile-badges-empty">Complete habits to earn badges 🏅</div>`}
      </div>

      <!-- 2. Personal Info -->
      <div class="glass-card profile-info-card">
        <div class="profile-section-title">👤 Personal Info</div>
        <div class="profile-fields-grid">
          <div class="profile-field">
            <label class="profile-field-label" for="profile-name-input">Name</label>
            <input id="profile-name-input" type="text" class="profile-input" value="${profile.name || ''}" placeholder="Your name" autocomplete="name" aria-label="Your name">
          </div>
          <div class="profile-field">
            <label class="profile-field-label" for="profile-tagline-input">Tagline</label>
            <input id="profile-tagline-input" type="text" class="profile-input" value="${profile.tagline || ''}" placeholder="A short tagline…" aria-label="Your tagline">
          </div>
          <div class="profile-field">
            <label class="profile-field-label" for="profile-age-input">Age</label>
            <input id="profile-age-input" type="number" class="profile-input profile-input--sm" value="${profile.age || ''}" placeholder="Age" min="1" max="120" aria-label="Your age">
          </div>
          <div class="profile-field">
            <label class="profile-field-label" for="profile-height-input">Height (cm)</label>
            <input id="profile-height-input" type="number" class="profile-input profile-input--sm" value="${profile.height || ''}" placeholder="cm" min="50" max="300" aria-label="Height in centimeters">
          </div>
          <div class="profile-field">
            <label class="profile-field-label" for="profile-weight-input">Weight (kg)</label>
            <input id="profile-weight-input" type="number" class="profile-input profile-input--sm" value="${profile.weight || ''}" placeholder="kg" min="20" max="500" step="0.1" aria-label="Weight in kilograms">
          </div>
          <div class="profile-field">
            <div class="profile-field-label">BMI</div>
            <div class="profile-bmi-display" id="profile-bmi-display">${bmi ? bmi : '—'}</div>
          </div>
          <div class="profile-field">
            <label class="profile-field-label" for="profile-goal-select">Goal</label>
            <select id="profile-goal-select" class="profile-select" aria-label="Your fitness goal">
              ${['lose','gain','maintain','endurance'].map(g =>
                `<option value="${g}"${profile.goal === g ? ' selected' : ''}>${_goalLabel(g)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="profile-field">
            <label class="profile-field-label" for="profile-level-select">Level</label>
            <select id="profile-level-select" class="profile-select" aria-label="Your academic level">
              ${['semester1','semester2','semester3','semester4','advanced','graduate'].map(l =>
                `<option value="${l}"${profile.level === l ? ' selected' : ''}>${_levelLabel(l)}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <button class="btn-primary spring-tap" id="profile-save-info">Save Info</button>
      </div>

      <!-- 3. App Settings -->
      <div class="glass-card profile-settings-card">
        <div class="profile-section-title">⚙️ App Settings</div>

        <div class="profile-setting-row">
          <span class="profile-setting-label">Theme</span>
          <div class="profile-theme-toggle" role="group" aria-label="Theme selection">
            <button class="profile-theme-btn spring-tap${settings.theme !== 'light' ? ' active' : ''}" data-theme="dark" aria-pressed="${settings.theme !== 'light'}">🌙 Dark</button>
            <button class="profile-theme-btn spring-tap${settings.theme === 'light' ? ' active' : ''}" data-theme="light" aria-pressed="${settings.theme === 'light'}">☀️ Light</button>
          </div>
        </div>

        <div class="profile-setting-row">
          <span class="profile-setting-label">Font Size</span>
          <div class="profile-font-row" role="group" aria-label="Font size">
            ${[['small','S',0.85],['medium','M',1.0],['large','L',1.15],['xlarge','XL',1.3]].map(([key,label]) =>
              `<button class="profile-font-btn spring-tap${settings.fontSize === key ? ' active' : ''}" data-font="${key}" aria-pressed="${settings.fontSize === key}">${label}</button>`
            ).join('')}
          </div>
        </div>

        <div class="profile-setting-row">
          <span class="profile-setting-label">High Contrast</span>
          <button class="profile-toggle spring-tap${settings.highContrast ? ' active' : ''}" id="profile-contrast-toggle"
            role="switch" aria-checked="${Boolean(settings.highContrast)}">
            ${settings.highContrast ? 'On' : 'Off'}
          </button>
        </div>

        <div class="profile-setting-row profile-setting-row--col">
          <div class="profile-setting-label">🍅 Pomodoro Work: <span id="pomo-work-val">${settings.pomodoroWork || 25}</span>min</div>
          <input id="profile-pomo-work" type="range" class="profile-range" min="10" max="60" step="5"
            value="${settings.pomodoroWork || 25}" aria-label="Pomodoro work duration in minutes">
        </div>
        <div class="profile-setting-row profile-setting-row--col">
          <div class="profile-setting-label">☕ Break Duration: <span id="pomo-break-val">${settings.pomodoroBreak || 5}</span>min</div>
          <input id="profile-pomo-break" type="range" class="profile-range" min="1" max="30" step="1"
            value="${settings.pomodoroBreak || 5}" aria-label="Pomodoro break duration in minutes">
        </div>
        <div class="profile-setting-row profile-setting-row--col">
          <div class="profile-setting-label">📚 Study Goal: <span id="study-goal-val">${settings.studyGoalHours || 4}</span>h/day</div>
          <input id="profile-study-goal" type="range" class="profile-range" min="1" max="16" step="0.5"
            value="${settings.studyGoalHours || 4}" aria-label="Daily study goal in hours">
        </div>
        <div class="profile-setting-row profile-setting-row--col">
          <div class="profile-setting-label">💧 Hydration Goal: <span id="hydration-goal-val">${settings.hydrationGoal || 8}</span> glasses/day</div>
          <input id="profile-hydration-goal" type="range" class="profile-range" min="4" max="20" step="1"
            value="${settings.hydrationGoal || 8}" aria-label="Daily hydration goal in glasses">
        </div>
      </div>

      <!-- 4. Notification Settings -->
      <div class="glass-card profile-notif-card">
        <div class="profile-section-title">🔔 Notifications</div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Enable Notifications</span>
          <button class="profile-toggle spring-tap${notifPrefs.enabled ? ' active' : ''}" id="profile-notif-toggle"
            role="switch" aria-checked="${Boolean(notifPrefs.enabled)}">
            ${notifPrefs.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Study Reminder</span>
          <button class="profile-toggle spring-tap${notifPrefs.studyReminder ? ' active' : ''}" id="profile-study-notif"
            role="switch" aria-checked="${Boolean(notifPrefs.studyReminder)}">
            ${notifPrefs.studyReminder ? 'On' : 'Off'}
          </button>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Sleep Reminder</span>
          <button class="profile-toggle spring-tap${notifPrefs.sleepReminder !== false ? ' active' : ''}" id="profile-sleep-notif"
            role="switch" aria-checked="${notifPrefs.sleepReminder !== false}">
            ${notifPrefs.sleepReminder !== false ? 'On' : 'Off'}
          </button>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Streak Alerts</span>
          <button class="profile-toggle spring-tap${notifPrefs.streakAlert !== false ? ' active' : ''}" id="profile-streak-notif"
            role="switch" aria-checked="${notifPrefs.streakAlert !== false}">
            ${notifPrefs.streakAlert !== false ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <!-- 5. Backup Status Card -->
      ${_backupCardHTML()}

      <!-- 6. Data Management -->
      <div class="glass-card profile-data-card">
        <div class="profile-section-title">💾 Data Management</div>
        <div class="profile-data-row">
          <span class="profile-data-label">Last backup: ${daysSinceBackup !== null ? daysSinceBackup + ' day(s) ago' : 'Never'}</span>
        </div>
        <div class="profile-data-btns">
          <button class="btn-secondary spring-tap" id="profile-export-json">📤 Export JSON</button>
          <button class="btn-secondary spring-tap" id="profile-export-csv">📊 Export CSV</button>
          <button class="btn-secondary spring-tap" id="profile-import-btn">📥 Import</button>
          <button class="btn-secondary spring-tap" id="profile-install-btn" hidden>📲 Install App</button>
        </div>
        <input type="file" id="profile-import-file" accept=".json" class="sr-only" aria-label="Import data file">
        <button class="btn-danger spring-tap" id="profile-clear-btn">🗑️ Clear All Data</button>
      </div>

      <!-- Avatar picker modal anchor -->
      <div id="profile-avatar-picker-anchor"></div>

    </div>`;

    // ── Install button: show only if PWA install available ────────────────────
    const installBtn = document.getElementById('profile-install-btn');
    const onBeforeInstall = () => { if (installBtn) installBtn.hidden = false; };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    onCleanup(() => window.removeEventListener('beforeinstallprompt', onBeforeInstall));

    // ── Personal Info Save ─────────────────────────────────────────────────────
    const saveInfoBtn = document.getElementById('profile-save-info');
    if (saveInfoBtn) {
      const h = () => {
        const name     = (document.getElementById('profile-name-input')?.value || '').trim();
        const tagline  = (document.getElementById('profile-tagline-input')?.value || '').trim();
        const age      = parseFloat(document.getElementById('profile-age-input')?.value || '0') || null;
        const heightV  = parseFloat(document.getElementById('profile-height-input')?.value || '0') || null;
        const weightV  = parseFloat(document.getElementById('profile-weight-input')?.value || '0') || null;
        const goal     = document.getElementById('profile-goal-select')?.value || 'maintain';
        const level    = document.getElementById('profile-level-select')?.value || 'semester1';

        if (!name) { UI.showToast('Name cannot be empty.', 'error'); return; }

        const current = Store.get('profile') || {};
        Store.set('profile', { ...current, name, tagline, age, height: heightV, weight: weightV, goal, level });

        // Update BMI display
        const bmiEl = document.getElementById('profile-bmi-display');
        if (bmiEl) bmiEl.textContent = _calcBMI(weightV, heightV) || '—';
        // Update name display
        const nameEl = document.getElementById('profile-name-display');
        if (nameEl) nameEl.textContent = name || 'Your Name';

        EventBus.emit('profile:updated', { field: 'info', value: { name, tagline, age, height: heightV, weight: weightV, goal, level } });
        UI.showToast('Profile saved ✅', 'success', 2000);
      };
      saveInfoBtn.addEventListener('click', h);
      onCleanup(() => saveInfoBtn.removeEventListener('click', h));
    }

    // ── Avatar picker ──────────────────────────────────────────────────────────
    const avatarBtn = document.getElementById('profile-avatar-btn');
    if (avatarBtn) {
      const AVATARS = ['🌟','🦁','🐯','🦊','🐺','🦋','🐉','🌙','☀️','🌊','🔥','⚡','🎯','🧠','💎','🚀'];
      const h = () => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal-box">
            <div class="modal-title">Choose Avatar</div>
            <div class="avatar-picker-grid">
              ${AVATARS.map(a => `<button class="avatar-option spring-tap" data-avatar="${a}" aria-label="Avatar ${a}">${a}</button>`).join('')}
            </div>
            <div class="modal-actions">
              <button class="btn-secondary spring-tap" id="avatar-cancel">Cancel</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        if (typeof Accessibility !== 'undefined') Accessibility.trapFocus(modal.querySelector('.modal-box'));

        modal.addEventListener('click', e => {
          const opt = e.target.closest('[data-avatar]');
          if (opt) {
            const av = opt.dataset.avatar;
            const cur = Store.get('profile') || {};
            Store.set('profile', { ...cur, avatar: av });
            if (avatarBtn) avatarBtn.textContent = av;
            modal.remove();
            if (typeof Accessibility !== 'undefined') Accessibility.releaseFocus();
            UI.showToast(`Avatar updated ${av}`, 'success', 1500);
          }
          if (e.target.id === 'avatar-cancel') {
            modal.remove();
            if (typeof Accessibility !== 'undefined') Accessibility.releaseFocus();
          }
        });
      };
      avatarBtn.addEventListener('click', h);
      onCleanup(() => avatarBtn.removeEventListener('click', h));
    }

    // ── Theme toggle ───────────────────────────────────────────────────────────
    const themeRow = section.querySelector('.profile-theme-toggle');
    if (themeRow) {
      const h = e => {
        const btn = e.target.closest('[data-theme]');
        if (!btn) return;
        const theme = btn.dataset.theme;
        document.body.classList.toggle('light-theme', theme === 'light');
        // Update button states
        themeRow.querySelectorAll('[data-theme]').forEach(b => {
          const active = b.dataset.theme === theme;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', active);
        });
        const s = Store.get('settings') || {};
        Store.set('settings', { ...s, theme });
        EventBus.emit('theme:changed', { theme });
      };
      themeRow.addEventListener('click', h);
      onCleanup(() => themeRow.removeEventListener('click', h));
    }

    // ── Font size ──────────────────────────────────────────────────────────────
    const fontRow = section.querySelector('.profile-font-row');
    const FONT_SCALES = { small: 0.85, medium: 1.0, large: 1.15, xlarge: 1.3 };
    if (fontRow) {
      const h = e => {
        const btn = e.target.closest('[data-font]');
        if (!btn) return;
        const key = btn.dataset.font;
        fontRow.querySelectorAll('[data-font]').forEach(b => {
          const active = b.dataset.font === key;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', active);
        });
        if (typeof Accessibility !== 'undefined' && Accessibility.applyFontScale) {
          Accessibility.applyFontScale(FONT_SCALES[key] || 1.0);
        }
        const s = Store.get('settings') || {};
        Store.set('settings', { ...s, fontSize: key });
      };
      fontRow.addEventListener('click', h);
      onCleanup(() => fontRow.removeEventListener('click', h));
    }

    // ── High contrast ──────────────────────────────────────────────────────────
    const contrastBtn = document.getElementById('profile-contrast-toggle');
    if (contrastBtn) {
      const h = () => {
        const s       = Store.get('settings') || {};
        const enabled = !s.highContrast;
        if (typeof Accessibility !== 'undefined') {
          enabled ? Accessibility.enableHighContrast?.() : Accessibility.disableHighContrast?.();
        } else {
          document.documentElement.setAttribute('data-contrast', enabled ? 'high' : '');
        }
        Store.set('settings', { ...s, highContrast: enabled });
        contrastBtn.textContent = enabled ? 'On' : 'Off';
        contrastBtn.classList.toggle('active', enabled);
        contrastBtn.setAttribute('aria-checked', enabled);
      };
      contrastBtn.addEventListener('click', h);
      onCleanup(() => contrastBtn.removeEventListener('click', h));
    }

    // ── Pomodoro / Study / Hydration sliders ──────────────────────────────────
    const sliderMap = [
      { id: 'profile-pomo-work',     valId: 'pomo-work-val',    storeKey: 'pomodoroWork',   parse: parseInt  },
      { id: 'profile-pomo-break',    valId: 'pomo-break-val',   storeKey: 'pomodoroBreak',  parse: parseInt  },
      { id: 'profile-study-goal',    valId: 'study-goal-val',   storeKey: 'studyGoalHours', parse: parseFloat },
      { id: 'profile-hydration-goal',valId: 'hydration-goal-val', storeKey: 'hydrationGoal', parse: parseInt },
    ];
    sliderMap.forEach(({ id, valId, storeKey, parse }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const h = () => {
        const val = parse(el.value);
        const lbl = document.getElementById(valId);
        if (lbl) lbl.textContent = val;
        const s = Store.get('settings') || {};
        Store.set('settings', { ...s, [storeKey]: val });
      };
      el.addEventListener('input', h);
      onCleanup(() => el.removeEventListener('input', h));
    });

    // ── Notification toggles ──────────────────────────────────────────────────
    const notifToggleMap = [
      { id: 'profile-notif-toggle',  key: 'enabled',       special: 'request' },
      { id: 'profile-study-notif',   key: 'studyReminder'  },
      { id: 'profile-sleep-notif',   key: 'sleepReminder'  },
      { id: 'profile-streak-notif',  key: 'streakAlert'    },
    ];
    notifToggleMap.forEach(({ id, key, special }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const h = () => {
        const prefs   = Store.get('notification_prefs') || {};
        const enabled = !prefs[key];
        if (special === 'request' && enabled && typeof NotificationModule !== 'undefined') {
          NotificationModule.requestPermission?.();
        }
        Store.set('notification_prefs', { ...prefs, [key]: enabled });
        el.textContent = enabled ? 'On' : 'Off';
        el.classList.toggle('active', enabled);
        el.setAttribute('aria-checked', enabled);
      };
      el.addEventListener('click', h);
      onCleanup(() => el.removeEventListener('click', h));
    });

    // ── Backup Download (in status card) ──────────────────────────────────────
    const dlBackupBtn = document.getElementById('profile-download-backup');
    if (dlBackupBtn) {
      const h = () => {
        DataProtection.exportJSON();
        if (typeof BackupStatus !== 'undefined' && BackupStatus.updateShield) BackupStatus.updateShield();
        UI.showToast('Backup downloaded ✅', 'success', 2000);
      };
      dlBackupBtn.addEventListener('click', h);
      onCleanup(() => dlBackupBtn.removeEventListener('click', h));
    }

    // ── Export JSON ───────────────────────────────────────────────────────────
    const exportJsonBtn = document.getElementById('profile-export-json');
    if (exportJsonBtn) {
      const h = () => {
        DataProtection.exportJSON();
        if (typeof BackupStatus !== 'undefined' && BackupStatus.updateShield) BackupStatus.updateShield();
      };
      exportJsonBtn.addEventListener('click', h);
      onCleanup(() => exportJsonBtn.removeEventListener('click', h));
    }

    // ── Export CSV ────────────────────────────────────────────────────────────
    const exportCsvBtn = document.getElementById('profile-export-csv');
    if (exportCsvBtn) {
      const h = () => DataProtection.exportCSV?.();
      exportCsvBtn.addEventListener('click', h);
      onCleanup(() => exportCsvBtn.removeEventListener('click', h));
    }

    // ── Import ────────────────────────────────────────────────────────────────
    const importBtn  = document.getElementById('profile-import-btn');
    const importFile = document.getElementById('profile-import-file');
    if (importBtn && importFile) {
      const hBtn = () => importFile.click();
      const hFile = e => {
        const file = e.target.files?.[0];
        if (!file) return;
        UI.showConfirmModal(
          `Import data from "${file.name}"? This will overwrite current data.`,
          () => {
            DataProtection.importData(file).then(() => {
              UI.showToast('Import successful ✅', 'success', 3000);
            }).catch(err => {
              UI.showToast(`Import failed: ${err.message}`, 'error', 4000);
            });
          },
          () => {}
        );
        // Reset so same file can be re-selected
        importFile.value = '';
      };
      importBtn.addEventListener('click', hBtn);
      importFile.addEventListener('change', hFile);
      onCleanup(() => {
        importBtn.removeEventListener('click', hBtn);
        importFile.removeEventListener('change', hFile);
      });
    }

    // ── Install App ───────────────────────────────────────────────────────────
    if (installBtn) {
      const h = () => {
        if (typeof LifeOS !== 'undefined' && LifeOS.triggerInstall) LifeOS.triggerInstall();
      };
      installBtn.addEventListener('click', h);
      onCleanup(() => installBtn.removeEventListener('click', h));
    }

    // ── Clear All Data (DANGER — must use UI.showConfirmModal, never window.confirm) ──
    const clearBtn = document.getElementById('profile-clear-btn');
    if (clearBtn) {
      const h = () => {
        UI.showConfirmModal(
          '⚠️ Clear ALL data? This cannot be undone. Export a backup first.',
          () => {
            DataProtection.clearAll?.();
            if (typeof LifeOS !== 'undefined' && LifeOS.navigate) LifeOS.navigate('dashboard');
            UI.showToast('All data cleared.', 'warning', 3000);
          },
          () => {}
        );
      };
      clearBtn.addEventListener('click', h);
      onCleanup(() => clearBtn.removeEventListener('click', h));
    }
  }

  return { mount };

})();
