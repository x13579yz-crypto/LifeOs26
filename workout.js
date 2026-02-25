// js/sections/workout.js
// WorkoutModule — LifeOS 26 v3.5.4
// Part 8 — Sections Layer
// Exports: mount(onCleanup)
// Guardrails: G1 G2 G3 G5 G6 G8 enforced
// Risk areas: schedule day-of-week 0-6 correct, completion log immutable,
//             plan delete must NOT delete logs, no cross-module mutation

const WorkoutModule = (() => {

  // ─── UID helper ───────────────────────────────────────────────────────────────
  function _uid() { return String(Date.now()) + '_' + Math.random().toString(36).slice(2, 9); }

  // ─── Date helpers ─────────────────────────────────────────────────────────────
  function _todayStr() { return new Date().toISOString().slice(0, 10); }
  // dayOfWeek: 0=Sun, 1=Mon … 6=Sat — matches JS Date.getDay() exactly (no off-by-one)
  function _todayDOW() { return new Date().getDay(); }

  // ─── DAY NAMES ────────────────────────────────────────────────────────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ─── Workout type labels ──────────────────────────────────────────────────────
  const TYPE_LABELS = {
    push: '💪 Push', pull: '🏋️ Pull', legs: '🦵 Legs',
    cardio: '🏃 Cardio', yoga: '🧘 Yoga',
    calisthenics: '🤸 Calisthenics', full: '🔥 Full Body', custom: '⚡ Custom',
  };

  // ─── Rest Timer (timestamp-based — G5: no setInterval for countdown) ─────────
  // Defensive: _tick() always checks _endTime before firing — safe after stop()
  const RestTimer = {
    _endTime:  null,
    _tickTO:   null,
    _onDone:   null,

    start(secs, onDone) {
      this.stop();
      this._endTime = Date.now() + secs * 1000;
      this._onDone  = onDone;
      this._tick();
    },

    _tick() {
      // Guard: if stop() was called between schedule and fire, do nothing
      if (!this._endTime) return;
      const remaining = Math.max(0, this._endTime - Date.now());
      EventBus.emit('workout:rest-tick', { secondsLeft: Math.ceil(remaining / 1000) });
      if (remaining > 0) {
        this._tickTO = setTimeout(() => this._tick(), 500);
      } else {
        AudioModule.play('chime');
        EventBus.emit('workout:rest-end', {});
        if (typeof this._onDone === 'function') this._onDone();
        this.stop();
      }
    },

    stop() {
      clearTimeout(this._tickTO);
      this._tickTO  = null;
      this._endTime = null; // sentinel — _tick() checks this first
      this._onDone  = null;
    },

    isRunning() { return this._tickTO !== null; },
  };

  // ─── Formatters ───────────────────────────────────────────────────────────────
  function _fmtSecs(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  }

  // ─── HTML helpers ─────────────────────────────────────────────────────────────

  function _planCardHTML(plan, isToday) {
    return `
      <div class="glass-card workout-plan-card${isToday ? ' workout-plan-card--today' : ''}" data-id="${plan.id}">
        <div class="workout-plan-header">
          <div>
            <div class="workout-plan-name">${plan.name}</div>
            <div class="workout-plan-type">${TYPE_LABELS[plan.type] || plan.type}</div>
          </div>
          <div class="workout-plan-actions">
            ${isToday ? `<button class="btn-primary spring-tap workout-start-btn" data-id="${plan.id}" aria-label="Start ${plan.name}">▶ Start</button>` : ''}
            <button class="btn-ghost spring-tap workout-edit-plan" data-id="${plan.id}" aria-label="Edit ${plan.name}">✏️</button>
            <button class="btn-ghost spring-tap workout-del-plan" data-id="${plan.id}" aria-label="Delete ${plan.name}">🗑️</button>
          </div>
        </div>
        ${plan.exercises && plan.exercises.length > 0 ? `
          <div class="workout-exercises-preview">
            ${plan.exercises.slice(0, 3).map(ex =>
              `<span class="workout-ex-chip">${ex.name} ${ex.sets}×${ex.reps}</span>`
            ).join('')}
            ${plan.exercises.length > 3 ? `<span class="workout-ex-more">+${plan.exercises.length - 3} more</span>` : ''}
          </div>
        ` : `<div class="workout-no-exercises">No exercises added yet</div>`}
      </div>
    `;
  }

  function _dietHTML(today, dietLog) {
    const ITEMS = [
      { key: 'protein',     label: '🥩 Hit protein target' },
      { key: 'meals',       label: '🍱 Ate required meals'  },
      { key: 'water',       label: '💧 3L water'            },
      { key: 'postWorkout', label: '🥤 Post-workout nutrition' },
    ];
    const checked = ITEMS.filter(i => dietLog[i.key]).length;
    const pct     = Math.round((checked / ITEMS.length) * 100);
    return `
      <div class="diet-checklist">
        <div class="diet-progress-row">
          <div class="diet-progress-label">Today's Compliance</div>
          <div class="diet-progress-pct">${pct}%</div>
        </div>
        <div class="diet-progress-bar-wrap">
          <div class="diet-progress-bar" data-pct="${pct}"></div>
        </div>
        ${ITEMS.map(item => `
          <div class="diet-item">
            <button class="diet-check-btn spring-tap${dietLog[item.key] ? ' diet-check-btn--done' : ''}"
              data-key="${item.key}" aria-pressed="${Boolean(dietLog[item.key])}" aria-label="${item.label}">
              ${dietLog[item.key] ? '☑️' : '☐'}
            </button>
            <span class="diet-item-label${dietLog[item.key] ? ' diet-item-label--done' : ''}">${item.label}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-workout');
    if (!section) return;

    let activeTab     = 'plans';  // 'plans' | 'session' | 'progress' | 'diet'
    let activeSession = null;     // { planId, startTime, exercises: [] }
    let restSeconds   = 60;

    function _render() {
      // G3: Read — never mutate
      const plans     = Store.get('workout_plans')  || [];
      const logs      = Store.get('workout_logs')   || [];
      const weights   = Store.get('body_weight')    || [];
      const schedule  = Store.get('schedule')       || {};
      const dietAll   = Store.get('diet_compliance')|| [];
      const todayStr  = _todayStr();
      const todayDOW  = _todayDOW(); // 0-6, correct

      // Today's diet log entry (G3: find only)
      const dietToday = dietAll.find(d => d.date === todayStr) || {
        date: todayStr, protein: false, meals: false, water: false, postWorkout: false, percentage: 0,
      };

      // 7-day diet average
      const last7Diet = dietAll.slice(-7);
      const avgDiet   = last7Diet.length
        ? Math.round(last7Diet.reduce((s, d) => s + (d.percentage || 0), 0) / last7Diet.length)
        : 0;

      // Today's plan
      const todayType    = schedule[todayDOW] || 'rest';
      const isRestDay    = todayType === 'rest';
      const todayPlan    = !isRestDay ? plans.find(p => p.type === todayType || p.name.toLowerCase().includes(todayType)) : null;

      section.innerHTML = `<div class="section-content">

        <!-- Tab switcher -->
        <div class="tab-switcher">
          <button class="tab-switcher-btn${activeTab === 'plans'    ? ' active' : ''}" data-tab="plans">📋 Plans</button>
          <button class="tab-switcher-btn${activeTab === 'session'  ? ' active' : ''}" data-tab="session">▶ Session</button>
          <button class="tab-switcher-btn${activeTab === 'progress' ? ' active' : ''}" data-tab="progress">📈 Progress</button>
          <button class="tab-switcher-btn${activeTab === 'diet'     ? ' active' : ''}" data-tab="diet">🥗 Diet</button>
        </div>

        <!-- PLANS TAB -->
        <div id="tab-plans" ${activeTab !== 'plans' ? 'hidden' : ''}>
          <!-- Today's schedule banner -->
          <div class="glass-card workout-today-card">
            <div class="workout-today-label">Today — ${DAY_NAMES[todayDOW]}</div>
            <div class="workout-today-type${isRestDay ? ' workout-today-rest' : ''}">${
              isRestDay ? '😴 Rest Day — Recovery is training too.' : `${TYPE_LABELS[todayType] || todayType} Day`
            }</div>
          </div>

          ${plans.length === 0 ? `
            <div class="glass-card workout-empty-card">
              <div class="workout-empty-icon">🏋️</div>
              <div class="workout-empty-title">No plans yet</div>
              <div class="workout-empty-sub">Create your first workout plan.</div>
              <button class="btn-primary spring-tap" id="workout-create-first">+ Create Plan</button>
            </div>
          ` : `
            <div class="card-stack" id="plans-list">
              ${plans.map(p => _planCardHTML(p, todayPlan && todayPlan.id === p.id)).join('')}
            </div>
            <button class="btn-secondary spring-tap" id="workout-add-plan-btn">+ Add Plan</button>
          `}

          <!-- Weekly Schedule -->
          <div class="glass-card workout-schedule-card">
            <div class="workout-schedule-title">📅 Weekly Schedule</div>
            <div class="workout-schedule-row">
              ${[0,1,2,3,4,5,6].map(d => `
                <div class="workout-schedule-day${d === todayDOW ? ' workout-schedule-day--today' : ''}">
                  <div class="workout-schedule-day-name">${DAY_NAMES[d]}</div>
                  <select class="workout-schedule-select" data-dow="${d}" aria-label="${DAY_NAMES[d]} workout type">
                    ${['rest','push','pull','legs','cardio','yoga','calisthenics','full','custom'].map(t =>
                      `<option value="${t}"${(schedule[d] || 'rest') === t ? ' selected' : ''}>${t}</option>`
                    ).join('')}
                  </select>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- SESSION TAB -->
        <div id="tab-session" ${activeTab !== 'session' ? 'hidden' : ''}>
          ${!activeSession ? `
            <div class="glass-card workout-session-idle-card">
              <div class="workout-session-idle-icon">💪</div>
              <div class="workout-session-idle-title">Ready to Train?</div>
              <div class="workout-session-idle-sub">Select a plan from the Plans tab and tap Start.</div>
              ${plans.length > 0 ? `
                <select id="session-plan-select" class="workout-session-select" aria-label="Select plan to start">
                  ${plans.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <button class="btn-primary spring-tap" id="session-start-btn">▶ Start Session</button>
              ` : `<div class="workout-session-no-plans">Create a plan first →</div>`}
            </div>
          ` : `
            <div class="glass-card workout-session-active-card" id="session-active">
              <div class="workout-session-active-header">
                <div class="workout-session-name">${(plans.find(p => p.id === activeSession.planId) || {}).name || 'Session'}</div>
                <div class="workout-session-timer" id="session-elapsed">00:00</div>
              </div>

              <!-- Exercises -->
              <div class="workout-session-exercises" id="session-exercises">
                ${(plans.find(p => p.id === activeSession.planId)?.exercises || []).map((ex, idx) => `
                  <div class="workout-session-ex" data-idx="${idx}">
                    <div class="workout-session-ex-name">${ex.name}</div>
                    <div class="workout-session-ex-row">
                      <span>Target: ${ex.sets}×${ex.reps} @ ${ex.weight || 0}kg</span>
                    </div>
                    <div class="workout-session-sets">
                      ${Array.from({ length: parseInt(ex.sets) || 0 }, (_, s) => `
                        <div class="workout-set-row">
                          <span class="workout-set-label">Set ${s + 1}</span>
                          <input type="number" class="workout-set-weight" placeholder="${ex.weight || 0}" min="0" step="0.5"
                            data-ex="${idx}" data-set="${s}" data-field="weight" aria-label="Weight for set ${s+1}">
                          <input type="number" class="workout-set-reps" placeholder="${ex.reps}" min="0"
                            data-ex="${idx}" data-set="${s}" data-field="reps" aria-label="Reps for set ${s+1}">
                          <button class="workout-set-done spring-tap${
                            (activeSession.exerciseLogs?.[idx]?.sets?.[s]?.done) ? ' workout-set-done--ok' : ''
                          }" data-ex="${idx}" data-set="${s}" aria-label="Mark set done">✓</button>
                        </div>
                      `).join('')}
                    </div>
                    <button class="btn-ghost spring-tap workout-rest-btn" data-ex="${idx}" aria-label="Start rest timer">⏱ Rest</button>
                  </div>
                `).join('')}
              </div>

              <!-- Rest Timer -->
              <div class="workout-rest-timer" id="workout-rest-timer" hidden>
                <div class="workout-rest-countdown" id="rest-countdown">01:00</div>
                <div class="workout-rest-row">
                  <button class="btn-ghost spring-tap" id="rest-minus">−15s</button>
                  <button class="btn-ghost spring-tap" id="rest-plus">+15s</button>
                  <button class="btn-secondary spring-tap" id="rest-skip">Skip</button>
                </div>
              </div>

              <!-- Session actions -->
              <div class="workout-session-btns">
                <button class="btn-danger spring-tap" id="session-abandon-btn">✕ Abandon</button>
                <button class="btn-primary spring-tap" id="session-finish-btn">✅ Finish Session</button>
              </div>
            </div>
          `}
        </div>

        <!-- PROGRESS TAB -->
        <div id="tab-progress" ${activeTab !== 'progress' ? 'hidden' : ''}>
          <!-- Weight log -->
          <div class="glass-card workout-weight-card">
            <div class="workout-card-title">⚖️ Weight Progress</div>
            <div class="workout-weight-input-row">
              <input type="number" id="weight-input" class="workout-weight-input" placeholder="0.0" min="20" max="500" step="0.1" aria-label="Current weight">
              <div class="workout-weight-unit-toggle" role="group" aria-label="Weight unit">
                <button class="workout-unit-btn spring-tap active" data-unit="kg" aria-pressed="true">kg</button>
                <button class="workout-unit-btn spring-tap" data-unit="lbs" aria-pressed="false">lbs</button>
              </div>
              <button class="btn-primary spring-tap" id="weight-log-btn">Log</button>
            </div>
            ${weights.length >= 2 ? `
              <canvas id="weight-chart" height="120" aria-label="Weight progress chart"></canvas>
            ` : `
              <div class="workout-weight-empty">Log your weight to track progress 📊</div>
              ${weights.length === 1 ? `<div class="workout-weight-one">1 entry logged — log one more to see chart.</div>` : ''}
            `}
          </div>

          <!-- Recent logs -->
          <div class="glass-card workout-logs-card">
            <div class="workout-card-title">📋 Recent Sessions</div>
            ${logs.length === 0 ? `
              <div class="workout-logs-empty">No sessions logged yet.</div>
            ` : `
              <div class="workout-logs-list">
                ${[...logs].reverse().slice(0, 10).map(log => `
                  <div class="workout-log-item">
                    <div class="workout-log-info">
                      <div class="workout-log-name">${log.planName || 'Workout'}</div>
                      <div class="workout-log-meta">${log.date} · ${Math.round(log.durationMins || 0)}min · Vol: ${log.totalVolume || 0}kg</div>
                    </div>
                    <div class="workout-log-badge">💪</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- DIET TAB -->
        <div id="tab-diet" ${activeTab !== 'diet' ? 'hidden' : ''}>
          <div class="glass-card workout-diet-card">
            <div class="workout-card-title">🥗 Diet Compliance — ${todayStr}</div>
            ${_dietHTML(todayStr, dietToday)}
            <div class="diet-7day-avg">7-day average: <strong>${avgDiet}%</strong></div>
          </div>
        </div>

      </div>`;

      _wireEvents();

      // Weight chart (DataGuard: >= 2 entries)
      if (activeTab === 'progress' && weights.length >= 2) {
        _drawWeightChart(weights);
      }
    }

    // ─── Weight chart ─────────────────────────────────────────────────────────
    function _drawWeightChart(weights) {
      const id  = 'weight-chart';
      const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
      const vals   = sorted.map(w => w.weight);
      const labels = sorted.map(w => w.date.slice(5)); // MM-DD

      ChartModule.draw(id, (ctx, W, H, ease) => {
        if (vals.length < 2) return;
        const min    = Math.min(...vals) - 1;
        const max    = Math.max(...vals) + 1;
        const range  = max - min || 1;
        const stepX  = W / (vals.length - 1);

        ctx.strokeStyle = 'var(--accent-workout)';
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        vals.forEach((v, i) => {
          const x = i * stepX;
          const y = H - ((v - min) / range) * H * 0.8 * ease - H * 0.1;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Dots
        vals.forEach((v, i) => {
          const x = i * stepX;
          const y = H - ((v - min) / range) * H * 0.8 * ease - H * 0.1;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'var(--accent-workout)';
          ctx.fill();
        });

        // Label last value
        const last = vals[vals.length - 1];
        ctx.font      = '12px Inter, sans-serif';
        ctx.fillStyle = 'var(--text-secondary)';
        ctx.textAlign = 'right';
        ctx.fillText(`${last}`, W - 4, 14);
      });

      onCleanup(() => ChartModule.remove(id));
    }

    // ─── Session elapsed timer ─────────────────────────────────────────────────
    let _elapsedTO = null;
    function _startElapsedTimer() {
      _stopElapsedTimer();
      const tick = () => {
        if (!activeSession) return;
        const elapsed = Date.now() - activeSession.startTime;
        const el = document.getElementById('session-elapsed');
        if (el) el.textContent = _fmtSecs(Math.floor(elapsed / 1000));
        _elapsedTO = setTimeout(tick, 1000);
      };
      tick();
    }
    function _stopElapsedTimer() {
      clearTimeout(_elapsedTO);
      _elapsedTO = null;
    }
    onCleanup(() => _stopElapsedTimer());

    // ─── Wire all events ──────────────────────────────────────────────────────
    function _wireEvents() {

      // Set CSS custom properties for progress bars (no inline styles — done via JS post-render)
      section.querySelectorAll('.diet-progress-bar[data-pct]').forEach(el => {
        el.style.setProperty('--diet-pct', `${el.dataset.pct}%`);
      });

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

      // Add plan buttons
      const addPlanBtn  = document.getElementById('workout-add-plan-btn');
      const createFirst = document.getElementById('workout-create-first');
      [addPlanBtn, createFirst].forEach(btn => {
        if (btn) btn.addEventListener('click', () => _showAddPlanModal());
      });

      // Plans list delegation
      const plansList = document.getElementById('plans-list') || section.querySelector('#tab-plans');
      if (plansList) {
        plansList.addEventListener('click', e => {
          const startBtn = e.target.closest('.workout-start-btn');
          if (startBtn) { _beginSession(startBtn.dataset.id); return; }
          const editBtn = e.target.closest('.workout-edit-plan');
          if (editBtn) { _showEditPlanModal(editBtn.dataset.id); return; }
          const delBtn = e.target.closest('.workout-del-plan');
          if (delBtn) { _deletePlan(delBtn.dataset.id); return; }
        });

        // Schedule selects — debounce-save
        plansList.addEventListener('change', e => {
          const sel = e.target.closest('.workout-schedule-select');
          if (!sel) return;
          const dow = parseInt(sel.dataset.dow);
          const val = sel.value;
          const sched = Store.get('schedule') || {};
          Store.set('schedule', { ...sched, [dow]: val });
        });
      }

      // Session tab
      const sessionPlanSelect = document.getElementById('session-plan-select');
      const sessionStartBtn   = document.getElementById('session-start-btn');
      if (sessionStartBtn && sessionPlanSelect) {
        sessionStartBtn.addEventListener('click', () => {
          _beginSession(sessionPlanSelect.value);
        });
      }

      // Session active area
      const sessionActive = document.getElementById('session-active');
      if (sessionActive) {
        _startElapsedTimer();

        // Set done buttons + input changes
        sessionActive.addEventListener('click', e => {
          const doneBtn = e.target.closest('.workout-set-done');
          if (doneBtn) {
            const exIdx  = parseInt(doneBtn.dataset.ex);
            const setIdx = parseInt(doneBtn.dataset.set);
            if (!activeSession.exerciseLogs) activeSession.exerciseLogs = {};
            if (!activeSession.exerciseLogs[exIdx]) activeSession.exerciseLogs[exIdx] = { sets: {} };
            const cur = activeSession.exerciseLogs[exIdx].sets[setIdx] || {};
            activeSession.exerciseLogs[exIdx].sets[setIdx] = { ...cur, done: !cur.done };
            doneBtn.classList.toggle('workout-set-done--ok', activeSession.exerciseLogs[exIdx].sets[setIdx].done);
            doneBtn.setAttribute('aria-pressed', activeSession.exerciseLogs[exIdx].sets[setIdx].done);
          }

          // Rest timer button
          const restBtn = e.target.closest('.workout-rest-btn');
          if (restBtn) {
            const timerDiv = document.getElementById('workout-rest-timer');
            if (timerDiv) timerDiv.hidden = false;
            RestTimer.start(restSeconds, () => {
              if (timerDiv) timerDiv.hidden = true;
            });
          }

          // Rest controls
          if (e.target.id === 'rest-minus') { restSeconds = Math.max(15, restSeconds - 15); _updateRestDisplay(); }
          if (e.target.id === 'rest-plus')  { restSeconds = Math.min(300, restSeconds + 15); _updateRestDisplay(); }
          if (e.target.id === 'rest-skip')  {
            RestTimer.stop();
            const timerDiv = document.getElementById('workout-rest-timer');
            if (timerDiv) timerDiv.hidden = true;
          }

          // Abandon
          if (e.target.id === 'session-abandon-btn') {
            UI.showConfirmModal('Abandon this session? Progress will be lost.', () => {
              _stopElapsedTimer();
              RestTimer.stop();
              activeSession = null;
              _render();
            }, () => {});
          }

          // Finish
          if (e.target.id === 'session-finish-btn') { _finishSession(); }
        });

        // Input changes for weight/reps
        sessionActive.addEventListener('input', e => {
          const input  = e.target;
          const exIdx  = parseInt(input.dataset.ex);
          const setIdx = parseInt(input.dataset.set);
          const field  = input.dataset.field;
          if (isNaN(exIdx) || isNaN(setIdx) || !field) return;
          if (!activeSession.exerciseLogs) activeSession.exerciseLogs = {};
          if (!activeSession.exerciseLogs[exIdx]) activeSession.exerciseLogs[exIdx] = { sets: {} };
          if (!activeSession.exerciseLogs[exIdx].sets[setIdx]) activeSession.exerciseLogs[exIdx].sets[setIdx] = {};
          activeSession.exerciseLogs[exIdx].sets[setIdx][field] = parseFloat(input.value) || 0;
        });
      }

      // Rest timer tick display
      const onRestTick = ({ secondsLeft }) => {
        const el = document.getElementById('rest-countdown');
        if (el) el.textContent = _fmtSecs(secondsLeft);
      };
      EventBus.on('workout:rest-tick', onRestTick);
      onCleanup(() => EventBus.off('workout:rest-tick', onRestTick));

      // Weight log (progress tab)
      const weightLogBtn = document.getElementById('weight-log-btn');
      if (weightLogBtn) {
        let selectedUnit = 'kg';
        const unitRow = section.querySelector('.workout-weight-unit-toggle');
        if (unitRow) {
          unitRow.addEventListener('click', e => {
            const btn = e.target.closest('[data-unit]');
            if (!btn) return;
            selectedUnit = btn.dataset.unit;
            unitRow.querySelectorAll('[data-unit]').forEach(b => {
              const active = b.dataset.unit === selectedUnit;
              b.classList.toggle('active', active);
              b.setAttribute('aria-pressed', active);
            });
          });
        }
        weightLogBtn.addEventListener('click', () => {
          const input   = document.getElementById('weight-input');
          const val     = parseFloat(input?.value || '0');
          if (!val || val < 20 || val > 500) { UI.showToast('Enter a valid weight.', 'error'); return; }
          const today   = _todayStr();
          // G3: immutable — filter existing today entry then add new
          const weights = Store.get('body_weight') || [];
          const updated = [...weights.filter(w => w.date !== today), { date: today, weight: val, unit: selectedUnit }];
          Store.set('body_weight', updated);
          EventBus.emit('health:weight-logged', { weight: val, date: today });
          UI.showToast(`Weight logged: ${val}${selectedUnit} ✅`, 'success', 2000);
          if (input) input.value = '';
          _render();
        });
      }

      // Diet checklist (diet tab)
      const dietCard = section.querySelector('.workout-diet-card');
      if (dietCard) {
        dietCard.addEventListener('click', e => {
          const btn = e.target.closest('.diet-check-btn');
          if (!btn) return;
          const key     = btn.dataset.key;
          const today   = _todayStr();
          const dietAll = Store.get('diet_compliance') || [];
          const cur     = dietAll.find(d => d.date === today) || { date: today, protein:false, meals:false, water:false, postWorkout:false, percentage:0 };
          const updated = { ...cur, [key]: !cur[key] };
          const KEYS    = ['protein','meals','water','postWorkout'];
          updated.percentage = Math.round(KEYS.filter(k => updated[k]).length / KEYS.length * 100);
          // G3: immutable
          const newAll = [...dietAll.filter(d => d.date !== today), updated];
          Store.set('diet_compliance', newAll);
          _render();
        });
      }
    }

    // ─── Rest display helper ──────────────────────────────────────────────────
    function _updateRestDisplay() {
      const el = document.getElementById('rest-countdown');
      if (el && !RestTimer.isRunning()) el.textContent = _fmtSecs(restSeconds);
    }

    // ─── Session flow ─────────────────────────────────────────────────────────
    function _beginSession(planId) {
      const plans = Store.get('workout_plans') || [];
      const plan  = plans.find(p => p.id === planId);
      if (!plan) return;

      if (activeSession) {
        UI.showConfirmModal('Replace current session?', () => {
          _stopElapsedTimer();
          RestTimer.stop();
          activeSession = { planId, startTime: Date.now(), exerciseLogs: {} };
          activeTab = 'session';
          EventBus.emit('workout:session-started', { planName: plan.name, type: plan.type });
          _render();
        }, () => {});
        return;
      }

      activeSession = { planId, startTime: Date.now(), exerciseLogs: {} };
      activeTab = 'session';
      EventBus.emit('workout:session-started', { planName: plan.name, type: plan.type });
      _render();
    }

    function _finishSession() {
      if (!activeSession) return;
      const plans   = Store.get('workout_plans') || [];
      const plan    = plans.find(p => p.id === activeSession.planId);
      const elapsed = Date.now() - activeSession.startTime;
      const durMins = Math.round(elapsed / 60000);

      // Calc total volume from exercise logs
      let totalVolume = 0;
      if (plan && plan.exercises) {
        plan.exercises.forEach((ex, idx) => {
          const exLog = activeSession.exerciseLogs?.[idx];
          if (!exLog) return;
          Object.values(exLog.sets || {}).forEach(set => {
            if (set.done) totalVolume += (set.weight || ex.weight || 0) * (set.reps || ex.reps || 0);
          });
        });
      }

      // G3: Read → push new → set — NEVER overwrite logs accidentally
      const logs = Store.get('workout_logs') || [];
      const newLog = {
        id:          _uid(),
        planName:    plan?.name || 'Workout',
        date:        _todayStr(),
        durationMins: durMins,
        notes:       '',
        exercises:   plan?.exercises || [],
        totalVolume: Math.round(totalVolume),
      };
      Store.set('workout_logs', [...logs, newLog]);

      // EventBus — no direct badge/reports mutation (G8.4)
      EventBus.emit('workout:session-complete', { planName: plan?.name || '', durationMins: durMins });
      // InteractionMonitor
      if (typeof InteractionMonitor !== 'undefined' && InteractionMonitor.addWorkoutTime) {
        InteractionMonitor.addWorkoutTime(elapsed);
      }

      _stopElapsedTimer();
      RestTimer.stop();
      AudioModule.play('complete');
      UI.showToast(`✅ Session complete! ${durMins}min · ${Math.round(totalVolume)}kg volume`, 'success', 3000);

      activeSession = null;
      activeTab = 'progress';
      _render();
    }

    // ─── Plan CRUD ────────────────────────────────────────────────────────────

    function _showAddPlanModal() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">New Workout Plan</div>
          <input id="new-plan-name" type="text" placeholder="Plan name…" class="modal-input" aria-label="Plan name" autocomplete="off">
          <select id="new-plan-type" class="modal-select" aria-label="Workout type">
            ${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <div class="modal-section-label">Exercises (one per row)</div>
          <div id="new-plan-exercises">
            ${_exerciseRowHTML(0)}
          </div>
          <button class="btn-ghost spring-tap" id="new-plan-add-ex">+ Add Exercise</button>
          <div class="modal-actions">
            <button class="btn-secondary spring-tap" id="new-plan-cancel">Cancel</button>
            <button class="btn-primary spring-tap" id="new-plan-save">Create</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      if (typeof Accessibility !== 'undefined') Accessibility.trapFocus(modal.querySelector('.modal-box'));

      let exCount = 1;

      modal.addEventListener('click', e => {
        if (e.target.id === 'new-plan-cancel') {
          modal.remove();
          if (typeof Accessibility !== 'undefined') Accessibility.releaseFocus();
        }
        if (e.target.id === 'new-plan-add-ex') {
          const cont = document.getElementById('new-plan-exercises');
          if (cont) { cont.insertAdjacentHTML('beforeend', _exerciseRowHTML(exCount++)); }
        }
        if (e.target.classList.contains('plan-ex-del')) {
          e.target.closest('.plan-ex-row')?.remove();
        }
        if (e.target.id === 'new-plan-save') {
          const name = document.getElementById('new-plan-name')?.value.trim();
          const type = document.getElementById('new-plan-type')?.value || 'custom';
          if (!name) { UI.showToast('Plan name required.', 'error'); return; }
          const exercises = _collectExercises(modal);
          const plans = Store.get('workout_plans') || [];
          Store.set('workout_plans', [...plans, { id: _uid(), name, type, exercises }]);
          modal.remove();
          if (typeof Accessibility !== 'undefined') Accessibility.releaseFocus();
          UI.showToast(`Plan "${name}" created ✅`, 'success', 2000);
          _render();
        }
      });
    }

    function _showEditPlanModal(planId) {
      const plans = Store.get('workout_plans') || [];
      const plan  = plans.find(p => p.id === planId);
      if (!plan) return;

      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">Edit Plan</div>
          <input id="edit-plan-name" type="text" class="modal-input" value="${plan.name}" aria-label="Plan name">
          <select id="edit-plan-type" class="modal-select" aria-label="Workout type">
            ${Object.entries(TYPE_LABELS).map(([k,v]) => `<option value="${k}"${plan.type === k ? ' selected' : ''}>${v}</option>`).join('')}
          </select>
          <div class="modal-section-label">Exercises</div>
          <div id="edit-plan-exercises">
            ${(plan.exercises || []).map((ex, i) => _exerciseRowHTML(i, ex)).join('') || _exerciseRowHTML(0)}
          </div>
          <button class="btn-ghost spring-tap" id="edit-plan-add-ex">+ Add Exercise</button>
          <div class="modal-actions">
            <button class="btn-secondary spring-tap" id="edit-plan-cancel">Cancel</button>
            <button class="btn-primary spring-tap" id="edit-plan-save">Save</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      if (typeof Accessibility !== 'undefined') Accessibility.trapFocus(modal.querySelector('.modal-box'));

      let exCount = (plan.exercises || []).length;

      modal.addEventListener('click', e => {
        if (e.target.id === 'edit-plan-cancel') {
          modal.remove();
          if (typeof Accessibility !== 'undefined') Accessibility.releaseFocus();
        }
        if (e.target.id === 'edit-plan-add-ex') {
          const cont = document.getElementById('edit-plan-exercises');
          if (cont) { cont.insertAdjacentHTML('beforeend', _exerciseRowHTML(exCount++)); }
        }
        if (e.target.classList.contains('plan-ex-del')) {
          e.target.closest('.plan-ex-row')?.remove();
        }
        if (e.target.id === 'edit-plan-save') {
          const name     = document.getElementById('edit-plan-name')?.value.trim();
          const type     = document.getElementById('edit-plan-type')?.value || plan.type;
          if (!name) { UI.showToast('Name required.', 'error'); return; }
          const exercises = _collectExercises(modal);
          // G3: immutable map — plan deletion does NOT touch logs
          const updated = plans.map(p => p.id === planId ? { ...p, name, type, exercises } : p);
          Store.set('workout_plans', updated);
          modal.remove();
          if (typeof Accessibility !== 'undefined') Accessibility.releaseFocus();
          UI.showToast('Plan updated ✅', 'success', 2000);
          _render();
        }
      });
    }

    function _exerciseRowHTML(idx, ex = {}) {
      return `
        <div class="plan-ex-row" data-idx="${idx}">
          <input type="text" class="plan-ex-name" placeholder="Exercise name" value="${ex.name || ''}" aria-label="Exercise name">
          <input type="number" class="plan-ex-sets" placeholder="Sets" value="${ex.sets || 3}" min="1" max="20" aria-label="Sets">
          <input type="number" class="plan-ex-reps" placeholder="Reps" value="${ex.reps || 10}" min="1" max="100" aria-label="Reps">
          <input type="number" class="plan-ex-weight" placeholder="kg" value="${ex.weight || 0}" min="0" step="0.5" aria-label="Weight kg">
          <button class="btn-ghost spring-tap plan-ex-del" aria-label="Remove exercise">✕</button>
        </div>`;
    }

    function _collectExercises(modal) {
      return Array.from(modal.querySelectorAll('.plan-ex-row')).map(row => ({
        name:   row.querySelector('.plan-ex-name')?.value.trim() || '',
        sets:   parseInt(row.querySelector('.plan-ex-sets')?.value || '3'),
        reps:   parseInt(row.querySelector('.plan-ex-reps')?.value || '10'),
        weight: parseFloat(row.querySelector('.plan-ex-weight')?.value || '0'),
      })).filter(ex => ex.name);
    }

    // Plan delete — does NOT touch workout_logs (G8 rule)
    function _deletePlan(planId) {
      const plans = Store.get('workout_plans') || [];
      const plan  = plans.find(p => p.id === planId);
      if (!plan) return;
      UI.showConfirmModal(
        `Delete plan "${plan.name}"? Session logs will be kept.`,
        () => {
          Store.set('workout_plans', plans.filter(p => p.id !== planId));
          UI.showToast(`Plan "${plan.name}" deleted.`, 'warning', 2000);
          _render();
        },
        () => {}
      );
    }

    // ── Initial render ─────────────────────────────────────────────────────────
    _render();

    // G1: Guaranteed cleanup on section unmount — defensive stop regardless of session state
    // RestTimer._endTime=null guard in _tick() ensures no background firing after this
    onCleanup(() => {
      RestTimer.stop();      // clears _endTime sentinel → _tick() becomes no-op if queued
      _stopElapsedTimer();   // clears elapsed display timeout
    });
  }

  return { mount };

})();
