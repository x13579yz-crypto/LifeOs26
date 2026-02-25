// js/sections/health.js
// HealthModule — LifeOS 26 v3.5.3
// Part 8 — Sections Layer
// Exports: mount(onCleanup)
// Guardrails: G1 G2 G3 G6 G8 enforced
// CRITICAL: calcSleepDuration() MIDNIGHT-SAFE — if wakeTime < bedtime → add 24h
// CRITICAL: No new Date(undefined) — all date inputs validated before parse
// CRITICAL: No division by zero on averages

const HealthModule = (() => {

  // ─── Date/time helpers ────────────────────────────────────────────────────────
  function _todayStr() { return new Date().toISOString().slice(0, 10); }

  // MIDNIGHT-SAFE sleep duration (Spec Rule 49)
  // Input: "HH:MM" strings from time inputs
  // Returns: hours as decimal (e.g. 7.5)
  function calcSleepDuration(bedtime, wakeTime) {
    if (!bedtime || !wakeTime) return 0;
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wakeTime.split(':').map(Number);
    if (isNaN(bh) || isNaN(bm) || isNaN(wh) || isNaN(wm)) return 0;
    let bedMins  = bh * 60 + bm;
    let wakeMins = wh * 60 + wm;
    if (wakeMins <= bedMins) wakeMins += 24 * 60; // crossed midnight — add full day
    return Math.round((wakeMins - bedMins) / 6) / 10; // decimal hours, 1dp
  }

  // ─── Mood data helpers ────────────────────────────────────────────────────────
  function _moodEntryFor(moodLog, dateStr) {
    return moodLog.find(m => {
      // mood entries keyed by timestamp ISO string
      if (!m.timestamp) return false;
      return m.timestamp.slice(0, 10) === dateStr;
    });
  }

  // ─── Hydration helpers ────────────────────────────────────────────────────────
  function _checkinFor(checkins, dateStr) {
    return checkins.find(c => c.date === dateStr) || {
      date: dateStr, hydration: 0, supplements: false, medication: false,
    };
  }

  // ─── HTML builders ────────────────────────────────────────────────────────────

  function _moodRowHTML(todayMood) {
    const MOODS = [
      { val: 1, emoji: '😴', label: 'Exhausted' },
      { val: 2, emoji: '😐', label: 'Meh'       },
      { val: 3, emoji: '🙂', label: 'Okay'      },
      { val: 4, emoji: '😊', label: 'Good'      },
      { val: 5, emoji: '🔥', label: 'Amazing'   },
    ];
    return `
      <div class="health-mood-btns" id="health-mood-btns" role="group" aria-label="Log mood">
        ${MOODS.map(m => `
          <button class="health-mood-btn spring-tap${todayMood && todayMood.mood === m.val ? ' health-mood-btn--active' : ''}"
            data-mood="${m.val}" aria-label="${m.label}" aria-pressed="${Boolean(todayMood && todayMood.mood === m.val)}">
            ${m.emoji}
            <span class="health-mood-label">${m.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function _sleepQualityHTML(quality) {
    return `
      <div class="health-sleep-quality-row">
        <span class="health-input-label">Sleep quality</span>
        <input id="health-sleep-quality" type="range" class="profile-range" min="1" max="5" step="1"
          value="${quality || 3}" aria-label="Sleep quality 1 to 5">
        <span id="health-sleep-quality-val" class="health-range-val">${quality || 3}/5</span>
      </div>
    `;
  }

  function _recentSleepHTML(sleepLog) {
    if (!sleepLog.length) return '';
    const recent = [...sleepLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    return `
      <div class="health-sleep-recent">
        <div class="health-subsection-title">Recent Sleep</div>
        ${recent.map(s => `
          <div class="health-sleep-item">
            <span class="health-sleep-item-date">${s.date}</span>
            <span class="health-sleep-item-dur">${s.duration}h</span>
            <span class="health-sleep-item-quality">${'⭐'.repeat(s.quality || 1)}</span>
            <span class="health-sleep-item-times">${s.bedtime || '—'} → ${s.wakeTime || '—'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function _weightRecentHTML(weights) {
    if (!weights.length) return '';
    const recent = [...weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const latest = recent[0];
    return `
      <div class="health-weight-latest">
        <span class="health-weight-latest-val">${latest.weight}${latest.unit}</span>
        <span class="health-weight-latest-date">${latest.date}</span>
      </div>
      <div class="health-weight-recent">
        ${recent.map(w => `
          <div class="health-weight-item">
            <span>${w.date}</span>
            <span>${w.weight}${w.unit}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-health');
    if (!section) return;

    let activeTab = 'mood'; // 'mood' | 'sleep' | 'checkin' | 'weight'
    let weightUnit = 'kg';

    function _render() {
      // G3: Read — never mutate Store.get() result
      const moodLog  = Store.get('mood')      || [];
      const sleepLog = Store.get('sleep')     || [];
      const checkins = Store.get('checkins')  || [];
      const weights  = Store.get('body_weight')|| [];
      const settings = Store.get('settings') || {};
      const todayStr = _todayStr();

      const todayMood   = _moodEntryFor(moodLog, todayStr);
      const todaySleep  = sleepLog.find(s => s.date === todayStr);
      const todayCheckin = _checkinFor(checkins, todayStr);

      // Sleep stats: last 7 entries
      const last7Sleep  = [...sleepLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
      const avgSleep    = last7Sleep.length
        ? (last7Sleep.reduce((s, e) => s + (e.duration || 0), 0) / last7Sleep.length).toFixed(1)
        : null;

      // Mood stats
      const last7Mood   = [...moodLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 7);
      const avgMood     = last7Mood.length
        ? (last7Mood.reduce((s, m) => s + (m.mood || 0), 0) / last7Mood.length).toFixed(1)
        : null;
      const avgEnergy   = last7Mood.length
        ? (last7Mood.reduce((s, m) => s + (m.energy || 0), 0) / last7Mood.length).toFixed(1)
        : null;

      const hydGoal = settings.hydrationGoal || 8;

      section.innerHTML = `<div class="section-content">

        <!-- Tab switcher -->
        <div class="tab-switcher">
          <button class="tab-switcher-btn${activeTab === 'mood'    ? ' active' : ''}" data-tab="mood">😊 Mood</button>
          <button class="tab-switcher-btn${activeTab === 'sleep'   ? ' active' : ''}" data-tab="sleep">😴 Sleep</button>
          <button class="tab-switcher-btn${activeTab === 'checkin' ? ' active' : ''}" data-tab="checkin">✅ Checkin</button>
          <button class="tab-switcher-btn${activeTab === 'weight'  ? ' active' : ''}" data-tab="weight">⚖️ Weight</button>
        </div>

        <!-- ─── MOOD TAB ─────────────────────────────────────────────── -->
        <div id="tab-mood" ${activeTab !== 'mood' ? 'hidden' : ''}>
          <div class="glass-card health-mood-card">
            <div class="health-card-title">How are you feeling today? 😊</div>
            ${_moodRowHTML(todayMood)}

            <!-- Energy slider -->
            <div class="health-mood-energy-row">
              <span class="health-input-label">Energy level</span>
              <input id="health-energy-slider" type="range" class="profile-range" min="1" max="5" step="1"
                value="${todayMood ? todayMood.energy || 3 : 3}" aria-label="Energy 1 to 5">
              <span id="health-energy-val" class="health-range-val">${todayMood ? todayMood.energy || 3 : 3}/5</span>
            </div>

            <!-- Note -->
            <textarea id="health-mood-note" class="health-mood-textarea" rows="2"
              placeholder="Optional note…" aria-label="Mood note">${todayMood ? todayMood.note || '' : ''}</textarea>

            <button class="btn-primary spring-tap" id="health-mood-save">Log Mood</button>

            ${todayMood ? `<div class="health-mood-logged">✓ Logged today: ${todayMood.mood}/5 mood · ${todayMood.energy || '—'}/5 energy</div>` : ''}
          </div>

          ${avgMood ? `
            <div class="glass-card health-mood-stats-card">
              <div class="health-card-title">7-Day Average</div>
              <div class="health-stats-row">
                <div class="health-stat">
                  <div class="health-stat-val">${avgMood}/5</div>
                  <div class="health-stat-label">Mood</div>
                </div>
                <div class="health-stat">
                  <div class="health-stat-val">${avgEnergy}/5</div>
                  <div class="health-stat-label">Energy</div>
                </div>
                <div class="health-stat">
                  <div class="health-stat-val">${last7Mood.length}</div>
                  <div class="health-stat-label">Entries</div>
                </div>
              </div>
            </div>
          ` : `<div class="health-empty-hint">Log mood daily to see trends 📊</div>`}
        </div>

        <!-- ─── SLEEP TAB ─────────────────────────────────────────────── -->
        <div id="tab-sleep" ${activeTab !== 'sleep' ? 'hidden' : ''}>
          <div class="glass-card health-sleep-card">
            <div class="health-card-title">😴 Sleep Log — ${todayStr}</div>

            <div class="health-sleep-inputs">
              <div class="health-sleep-field">
                <label class="health-input-label" for="health-bedtime">Bedtime</label>
                <input id="health-bedtime" type="time" class="health-time-input"
                  value="${todaySleep ? todaySleep.bedtime || '' : ''}" aria-label="Bedtime">
              </div>
              <div class="health-sleep-field">
                <label class="health-input-label" for="health-waketime">Wake time</label>
                <input id="health-waketime" type="time" class="health-time-input"
                  value="${todaySleep ? todaySleep.wakeTime || '' : ''}" aria-label="Wake time">
              </div>
            </div>

            <div class="health-sleep-preview" id="sleep-duration-preview">
              ${todaySleep && todaySleep.duration ? `Duration: <strong>${todaySleep.duration}h</strong>` : 'Enter times to see duration'}
            </div>

            ${_sleepQualityHTML(todaySleep ? todaySleep.quality : 3)}

            <button class="btn-primary spring-tap" id="health-sleep-save">Log Sleep</button>
          </div>

          ${avgSleep ? `
            <div class="glass-card health-sleep-stats-card">
              <div class="health-card-title">7-Day Average Sleep</div>
              <div class="health-sleep-avg-val">${avgSleep}h</div>
              <div class="health-sleep-avg-label">${
                parseFloat(avgSleep) >= 7.5 ? '😊 Well rested' :
                parseFloat(avgSleep) >= 6   ? '😐 Could be better' : '😴 Sleep more!'
              }</div>
            </div>
          ` : ''}

          ${_recentSleepHTML(sleepLog)}
        </div>

        <!-- ─── DAILY CHECKIN TAB ─────────────────────────────────────── -->
        <div id="tab-checkin" ${activeTab !== 'checkin' ? 'hidden' : ''}>
          <div class="glass-card health-checkin-card">
            <div class="health-card-title">✅ Daily Check-in — ${todayStr}</div>

            <!-- Hydration counter -->
            <div class="health-hydration-section">
              <div class="health-hydration-title">💧 Hydration</div>
              <div class="health-hydration-counter">
                <button class="health-hydration-btn spring-tap" id="hydration-minus" aria-label="Remove glass">−</button>
                <div class="health-hydration-count" id="hydration-count">
                  <span class="health-hydration-num">${todayCheckin.hydration || 0}</span>
                  <span class="health-hydration-unit">/${hydGoal} glasses</span>
                </div>
                <button class="health-hydration-btn spring-tap" id="hydration-plus" aria-label="Add glass">+</button>
              </div>
              <div class="health-hydration-bar-wrap">
                <div class="health-hydration-bar" id="hydration-bar"
                  data-pct="${Math.min(100, Math.round((todayCheckin.hydration || 0) / hydGoal * 100))}"></div>
              </div>
              <div class="health-hydration-pct" id="hydration-pct">${Math.min(100, Math.round((todayCheckin.hydration || 0) / hydGoal * 100))}%</div>
            </div>

            <!-- Supplement & medication checkboxes -->
            <div class="health-checkin-items">
              <div class="health-checkin-item">
                <button class="health-check-btn spring-tap${todayCheckin.supplements ? ' health-check-btn--done' : ''}"
                  id="checkin-supplements" role="switch" aria-checked="${Boolean(todayCheckin.supplements)}">
                  ${todayCheckin.supplements ? '☑️' : '☐'}
                </button>
                <span class="health-checkin-label">💊 Supplements taken</span>
              </div>
              <div class="health-checkin-item">
                <button class="health-check-btn spring-tap${todayCheckin.medication ? ' health-check-btn--done' : ''}"
                  id="checkin-medication" role="switch" aria-checked="${Boolean(todayCheckin.medication)}">
                  ${todayCheckin.medication ? '☑️' : '☐'}
                </button>
                <span class="health-checkin-label">💉 Medication taken</span>
              </div>
            </div>

            <button class="btn-primary spring-tap" id="health-checkin-save">Save Check-in</button>
          </div>
        </div>

        <!-- ─── WEIGHT TAB ─────────────────────────────────────────────── -->
        <div id="tab-weight" ${activeTab !== 'weight' ? 'hidden' : ''}>
          <div class="glass-card health-weight-card">
            <div class="health-card-title">⚖️ Weight Log</div>

            <div class="health-weight-input-row">
              <input id="health-weight-input" type="number" class="health-weight-input"
                placeholder="0.0" min="20" max="500" step="0.1" aria-label="Current weight">
              <div class="health-unit-toggle" role="group" aria-label="Weight unit">
                <button class="health-unit-btn spring-tap${weightUnit === 'kg'  ? ' active' : ''}" data-unit="kg"  aria-pressed="${weightUnit === 'kg'}">kg</button>
                <button class="health-unit-btn spring-tap${weightUnit === 'lbs' ? ' active' : ''}" data-unit="lbs" aria-pressed="${weightUnit === 'lbs'}">lbs</button>
              </div>
              <button class="btn-primary spring-tap" id="health-weight-save">Log</button>
            </div>

            ${weights.length > 0 ? _weightRecentHTML(weights) : `
              <div class="health-weight-empty">
                <div class="health-empty-icon">⚖️</div>
                <div class="health-empty-title">No weight entries yet</div>
                <div class="health-empty-sub">Log your first weight to start tracking.</div>
              </div>
            `}
          </div>
        </div>

      </div>`;

      _wireEvents();
    }

    // ─── Wire all events after render ─────────────────────────────────────────
    function _wireEvents() {

      // Set CSS custom properties post-render (no inline styles — spec compliant)
      const hydBarEl = document.getElementById('hydration-bar');
      if (hydBarEl && hydBarEl.dataset.pct !== undefined) {
        hydBarEl.style.setProperty('--hyd-pct', `${hydBarEl.dataset.pct}%`);
      }

      // Tab switcher
      const tabRow = section.querySelector('.tab-switcher');
      if (tabRow) {
        tabRow.addEventListener('click', e => {
          const btn = e.target.closest('[data-tab]');
          if (!btn) return;
          activeTab = btn.dataset.tab;
          _render();
        });
      }

      // ── MOOD tab ───────────────────────────────────────────────────────────
      const moodBtns = document.getElementById('health-mood-btns');
      const energySlider = document.getElementById('health-energy-slider');
      const energyVal    = document.getElementById('health-energy-val');

      if (energySlider && energyVal) {
        energySlider.addEventListener('input', () => {
          energyVal.textContent = `${energySlider.value}/5`;
        });
      }

      const moodSaveBtn = document.getElementById('health-mood-save');
      if (moodSaveBtn) {
        const h = () => {
          const moodBtnsEl = document.getElementById('health-mood-btns');
          const activeBtn  = moodBtnsEl?.querySelector('.health-mood-btn--active');
          const moodVal    = activeBtn ? parseInt(activeBtn.dataset.mood) : null;
          if (!moodVal) { UI.showToast('Select a mood first.', 'error'); return; }

          const energy  = parseInt(document.getElementById('health-energy-slider')?.value || '3');
          const note    = (document.getElementById('health-mood-note')?.value || '').trim();
          const todayStr = _todayStr();
          const ts       = new Date().toISOString();

          // G3: immutable — filter today's existing entry, push new
          const moodLog = Store.get('mood') || [];
          const updated = [
            ...moodLog.filter(m => !m.timestamp || m.timestamp.slice(0, 10) !== todayStr),
            { timestamp: ts, mood: moodVal, energy, note }
          ];
          Store.set('mood', updated);
          EventBus.emit('health:mood-logged', { mood: moodVal, energy, timestamp: ts });
          UI.showToast(`Mood logged: ${moodVal}/5 ✅`, 'success', 2000);
          _render();
        };
        moodSaveBtn.addEventListener('click', h);
        onCleanup(() => moodSaveBtn.removeEventListener('click', h));
      }

      // Mood selection (visual toggle)
      if (moodBtns) {
        const h = e => {
          const btn = e.target.closest('[data-mood]');
          if (!btn) return;
          moodBtns.querySelectorAll('[data-mood]').forEach(b => {
            const active = b === btn;
            b.classList.toggle('health-mood-btn--active', active);
            b.setAttribute('aria-pressed', active);
          });
        };
        moodBtns.addEventListener('click', h);
        onCleanup(() => moodBtns.removeEventListener('click', h));
      }

      // ── SLEEP tab ──────────────────────────────────────────────────────────
      // Live duration preview as user types times
      const bedtimeInput  = document.getElementById('health-bedtime');
      const waketimeInput = document.getElementById('health-waketime');
      const durationEl    = document.getElementById('sleep-duration-preview');

      const _updateDurationPreview = () => {
        if (!bedtimeInput || !waketimeInput || !durationEl) return;
        const bed  = bedtimeInput.value;
        const wake = waketimeInput.value;
        if (bed && wake) {
          const dur = calcSleepDuration(bed, wake);
          durationEl.innerHTML = `Duration: <strong>${dur}h</strong>${dur < 6 ? ' ⚠️ Low' : dur >= 8 ? ' ✅ Great' : ''}`;
        }
      };

      if (bedtimeInput)  { bedtimeInput.addEventListener('input', _updateDurationPreview); onCleanup(() => bedtimeInput.removeEventListener('input', _updateDurationPreview)); }
      if (waketimeInput) { waketimeInput.addEventListener('input', _updateDurationPreview); onCleanup(() => waketimeInput.removeEventListener('input', _updateDurationPreview)); }

      const sleepQualSlider = document.getElementById('health-sleep-quality');
      const sleepQualVal    = document.getElementById('health-sleep-quality-val');
      if (sleepQualSlider && sleepQualVal) {
        const h = () => { sleepQualVal.textContent = `${sleepQualSlider.value}/5`; };
        sleepQualSlider.addEventListener('input', h);
        onCleanup(() => sleepQualSlider.removeEventListener('input', h));
      }

      const sleepSaveBtn = document.getElementById('health-sleep-save');
      if (sleepSaveBtn) {
        const h = () => {
          const bed  = document.getElementById('health-bedtime')?.value;
          const wake = document.getElementById('health-waketime')?.value;
          if (!bed || !wake) { UI.showToast('Enter both bedtime and wake time.', 'error'); return; }

          const dur     = calcSleepDuration(bed, wake);
          const quality = parseInt(document.getElementById('health-sleep-quality')?.value || '3');
          const today   = _todayStr();

          // G3: immutable — filter today, push new
          const sleepLog = Store.get('sleep') || [];
          const updated  = [
            ...sleepLog.filter(s => s.date !== today),
            { date: today, bedtime: bed, wakeTime: wake, duration: dur, quality }
          ];
          Store.set('sleep', updated);
          EventBus.emit('health:sleep-logged', { duration: dur, quality, date: today });
          UI.showToast(`Sleep logged: ${dur}h ✅`, 'success', 2000);
          _render();
        };
        sleepSaveBtn.addEventListener('click', h);
        onCleanup(() => sleepSaveBtn.removeEventListener('click', h));
      }

      // ── CHECKIN tab ────────────────────────────────────────────────────────
      const hydPlusBtn  = document.getElementById('hydration-plus');
      const hydMinusBtn = document.getElementById('hydration-minus');

      function _updateHydrationUI(count) {
        const settings = Store.get('settings') || {};
        const goal     = settings.hydrationGoal || 8;
        const countEl  = document.querySelector('.health-hydration-num');
        const barEl    = document.getElementById('hydration-bar');
        const pctEl    = document.getElementById('hydration-pct');
        const pct      = Math.min(100, Math.round(count / goal * 100));
        if (countEl) countEl.textContent = count;
        if (barEl)   barEl.style.setProperty('--hyd-pct', `${pct}%`);
        if (pctEl)   pctEl.textContent = `${pct}%`;      }

      if (hydPlusBtn) {
        const h = () => {
          const today    = _todayStr();
          const checkins = Store.get('checkins') || [];
          const cur      = checkins.find(c => c.date === today) || { date: today, hydration: 0 };
          const newCount = (cur.hydration || 0) + 1;
          const updated  = [...checkins.filter(c => c.date !== today), { ...cur, hydration: newCount }];
          Store.set('checkins', updated);
          EventBus.emit('health:checkin-saved', { date: today, answers: { hydration: newCount } });
          _updateHydrationUI(newCount);
        };
        hydPlusBtn.addEventListener('click', h);
        onCleanup(() => hydPlusBtn.removeEventListener('click', h));
      }

      if (hydMinusBtn) {
        const h = () => {
          const today    = _todayStr();
          const checkins = Store.get('checkins') || [];
          const cur      = checkins.find(c => c.date === today) || { date: today, hydration: 0 };
          const newCount = Math.max(0, (cur.hydration || 0) - 1);
          const updated  = [...checkins.filter(c => c.date !== today), { ...cur, hydration: newCount }];
          Store.set('checkins', updated);
          _updateHydrationUI(newCount);
        };
        hydMinusBtn.addEventListener('click', h);
        onCleanup(() => hydMinusBtn.removeEventListener('click', h));
      }

      // Supplement / Medication toggles
      const supplementBtn  = document.getElementById('checkin-supplements');
      const medicationBtn  = document.getElementById('checkin-medication');

      function _toggleCheckinField(field, btn) {
        if (!btn) return;
        const h = () => {
          const today    = _todayStr();
          const checkins = Store.get('checkins') || [];
          const cur      = checkins.find(c => c.date === today) || { date: today, hydration: 0, supplements: false, medication: false };
          const enabled  = !cur[field];
          const updated  = [...checkins.filter(c => c.date !== today), { ...cur, [field]: enabled }];
          Store.set('checkins', updated);
          btn.textContent = enabled ? '☑️' : '☐';
          btn.classList.toggle('health-check-btn--done', enabled);
          btn.setAttribute('aria-checked', enabled);
          EventBus.emit('health:checkin-saved', { date: today, answers: { [field]: enabled } });
        };
        btn.addEventListener('click', h);
        onCleanup(() => btn.removeEventListener('click', h));
      }

      _toggleCheckinField('supplements', supplementBtn);
      _toggleCheckinField('medication',  medicationBtn);

      const checkinSaveBtn = document.getElementById('health-checkin-save');
      if (checkinSaveBtn) {
        const h = () => {
          UI.showToast('Check-in saved ✅', 'success', 1500);
        };
        checkinSaveBtn.addEventListener('click', h);
        onCleanup(() => checkinSaveBtn.removeEventListener('click', h));
      }

      // ── WEIGHT tab ─────────────────────────────────────────────────────────
      const unitToggle = section.querySelector('.health-unit-toggle');
      if (unitToggle) {
        const h = e => {
          const btn = e.target.closest('[data-unit]');
          if (!btn) return;
          weightUnit = btn.dataset.unit;
          unitToggle.querySelectorAll('[data-unit]').forEach(b => {
            const active = b.dataset.unit === weightUnit;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', active);
          });
        };
        unitToggle.addEventListener('click', h);
        onCleanup(() => unitToggle.removeEventListener('click', h));
      }

      const weightSaveBtn = document.getElementById('health-weight-save');
      if (weightSaveBtn) {
        const h = () => {
          const input = document.getElementById('health-weight-input');
          const val   = parseFloat(input?.value || '0');
          if (!val || val < 20 || val > 500) { UI.showToast('Enter a valid weight.', 'error'); return; }
          const today   = _todayStr();
          // G3: immutable — filter today's entry, add new
          const weights = Store.get('body_weight') || [];
          const updated = [...weights.filter(w => w.date !== today), { date: today, weight: val, unit: weightUnit }];
          Store.set('body_weight', updated);
          EventBus.emit('health:weight-logged', { weight: val, date: today });
          UI.showToast(`Weight logged: ${val}${weightUnit} ✅`, 'success', 2000);
          if (input) input.value = '';
          _render();
        };
        weightSaveBtn.addEventListener('click', h);
        onCleanup(() => weightSaveBtn.removeEventListener('click', h));
      }
    }

    // ── Initial render ─────────────────────────────────────────────────────────
    _render();
  }

  // Export calcSleepDuration for possible use in Reports
  return { mount, calcSleepDuration };

})();
