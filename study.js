// js/sections/study.js
// StudyModule — LifeOS 26 v3.5.3
// Part 7 — Sections Layer
// Exports: mount(onCleanup) + isActiveSession()
// Guardrails: G1 G2 G3 G5 G6 enforced
// RULE G5: TIMESTAMP-BASED timer — NEVER setInterval countdown

const StudyModule = (() => {

  // ─── Session state (module-level — survives section remount) ──────────────────
  let _currentSessionActive = false;

  // ─── Focus Guard API (used by LifeOS.navigate) ───────────────────────────────
  function isActiveSession() { return _currentSessionActive; }

  // ─── Timer modes ─────────────────────────────────────────────────────────────
  const MODES = { POMODORO: 'pomodoro', STOPWATCH: 'stopwatch', COUNTDOWN: 'countdown' };

  // ─── Timestamp-based Timer (G5) ──────────────────────────────────────────────
  const StudyTimer = {
    _endTime:  null,
    _startMs:  null,
    _totalMs:  null,
    _tickTO:   null,
    _mode:     MODES.POMODORO,

    start(durationSecs) {
      this.stop();
      this._totalMs = durationSecs * 1000;
      this._endTime = Date.now() + this._totalMs;
      this._startMs = Date.now();
      _currentSessionActive = true;
      EventBus.emit('study:session-started', {});
      this._tick();
    },

    startStopwatch() {
      this.stop();
      this._startMs = Date.now();
      this._mode    = MODES.STOPWATCH;
      _currentSessionActive = true;
      EventBus.emit('study:session-started', {});
      this._tick();
    },

    _tick() {
      if (this._mode === MODES.STOPWATCH) {
        const elapsed = Date.now() - this._startMs;
        EventBus.emit('study:timer-tick', { elapsed, secondsLeft: null, progress: 0 });
        this._tickTO = setTimeout(() => this._tick(), 500);
        return;
      }
      // Countdown / Pomodoro — timestamp-based (G5)
      const remaining   = Math.max(0, this._endTime - Date.now());
      const secondsLeft = Math.ceil(remaining / 1000);
      const progress    = this._totalMs > 0 ? 1 - (remaining / this._totalMs) : 0;
      EventBus.emit('study:timer-tick', { secondsLeft, progress, elapsed: this._totalMs - remaining });
      if (remaining > 0) {
        this._tickTO = setTimeout(() => this._tick(), 500);
      } else {
        this._onComplete();
      }
    },

    _remainingMs: null,   // stored on pause for accurate resume

    pause() {
      if (this._endTime) {
        this._remainingMs = Math.max(0, this._endTime - Date.now()); // snapshot remaining
      }
      clearTimeout(this._tickTO);
      this._tickTO = null;
    },

    resume() {
      if (this._mode === MODES.STOPWATCH) {
        // Stopwatch: no endTime needed, just continue ticking
        this._tick();
        return;
      }
      if (!this._remainingMs) return;
      // Recalculate _endTime from remaining so no drift
      this._endTime = Date.now() + this._remainingMs;
      this._remainingMs = null;
      this._tick();
    },

    stop() {
      clearTimeout(this._tickTO);
      this._tickTO      = null;
      this._endTime     = null;
      this._remainingMs = null;
      this._startMs     = null;
      this._totalMs     = null;
      this._mode        = MODES.POMODORO;
      if (_currentSessionActive) {
        _currentSessionActive = false;
        EventBus.emit('study:session-abandoned', {});
      }
    },

    _onComplete() {
      const durationMs = this._totalMs || (Date.now() - this._startMs);
      _currentSessionActive = false;
      InteractionMonitor.addStudyTime(durationMs);
      EventBus.emit('study:session-complete', { durationMins: Math.round(durationMs / 60000) });
      AudioModule.play('complete');
    },

    getElapsed() {
      if (!this._startMs) return 0;
      return Date.now() - this._startMs;
    },

    isRunning() {
      return this._tickTO !== null;
    },
  };

  // ─── Time formatting ──────────────────────────────────────────────────────────

  function _formatSecs(totalSecs) {
    const s   = Math.max(0, totalSecs);
    const min = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  }

  function _formatMs(ms) {
    return _formatSecs(Math.floor(ms / 1000));
  }

  // ─── Forest visualization ─────────────────────────────────────────────────────

  function _renderForest(canvasId, progress, abandoned) {
    ChartModule.draw(canvasId, (ctx, W, H, ease) => {
      const cx  = W / 2, cy = H;
      const p   = Math.min(progress * ease, 1);
      const color = abandoned ? 'rgba(120,80,40,0.6)' : `rgba(${Math.round(30 + p * 60)},${Math.round(120 + p * 80)},${Math.round(20 + p * 20)},0.85)`;

      // Ground
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, H - 6, W, 6);

      // Trunk
      const trunkH = Math.max(4, p * H * 0.35);
      ctx.fillStyle = abandoned ? 'rgba(100,60,20,0.5)' : 'rgba(120,80,40,0.8)';
      ctx.fillRect(cx - 4, cy - trunkH, 8, trunkH);

      // Canopy (circles layered)
      if (p > 0.1) {
        const canopyR = p * Math.min(W, H) * 0.32;
        [
          { dy: -trunkH - canopyR * 0.6, r: canopyR * 0.75 },
          { dy: -trunkH - canopyR * 0.3, r: canopyR },
          { dy: -trunkH + canopyR * 0.1, r: canopyR * 0.85 },
        ].forEach(({ dy, r }) => {
          ctx.beginPath();
          ctx.arc(cx, cy + dy, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }

      // Label
      ctx.font          = '12px Inter, sans-serif';
      ctx.fillStyle     = 'rgba(180,190,230,0.6)';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'bottom';
      ctx.fillText(abandoned ? '🍂 Withered' : p >= 1 ? '🌳 Grown!' : `🌱 ${Math.round(p * 100)}%`, cx, H - 8);
    });
  }

  // ─── Subject helpers ──────────────────────────────────────────────────────────

  function _saveSession(subjectId, durationMins, mode) {
    if (durationMins < 0.1) return; // ignore < 6 seconds
    // G3: Read → push → set
    const sessions = Store.get('study_sessions') || [];
    sessions.push({
      id:          String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
      subject:     subjectId || 'General',
      durationMins: Math.round(durationMins * 10) / 10,
      mode,
      date:        new Date().toISOString().slice(0, 10),
      timestamp:   new Date().toISOString(),
    });
    Store.set('study_sessions', sessions);
    // Also update forest log
    const forest = Store.get('forest') || [];
    forest.push({ id: String(Date.now()), grown: durationMins >= 25, date: new Date().toISOString().slice(0, 10) });
    Store.set('forest', forest);
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-study');
    if (!section) return;

    // G3: Read Store
    const settings = Store.get('settings')       || {};
    const subjects = Store.get('subjects')        || [];
    const sessions = Store.get('study_sessions')  || [];

    const pomodoroWork  = settings.pomodoroWork  || 25;
    const pomodoroBreak = settings.pomodoroBreak || 5;

    let currentMode      = MODES.POMODORO;
    let currentSubjectId = subjects[0]?.id || 'General';
    let isOnBreak        = false;
    let timerProgress    = 0;
    let timerAbandoned   = false;
    let countdownMins    = 30;

    section.innerHTML = `<div class="section-content card-stack">

      <!-- Subject selector -->
      <div class="glass-card study-subject-card">
        <div class="study-card-title">Subject</div>
        <div class="study-subject-row">
          <select id="study-subject-select" aria-label="Select subject">
            <option value="General">General</option>
            ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <button class="btn-secondary study-add-subject-btn spring-tap" id="study-add-subject-btn">+ Add</button>
        </div>
      </div>

      <!-- Mode selector -->
      <div class="tab-switcher">
        <button class="tab-switcher-btn active" data-mode="${MODES.POMODORO}" id="mode-pomodoro">🍅 Pomodoro</button>
        <button class="tab-switcher-btn" data-mode="${MODES.STOPWATCH}" id="mode-stopwatch">⏱ Stopwatch</button>
        <button class="tab-switcher-btn" data-mode="${MODES.COUNTDOWN}" id="mode-countdown">⏳ Countdown</button>
      </div>

      <!-- Timer display -->
      <div class="glass-card study-timer-card">
        <div class="study-timer-phase" id="study-phase-label">Focus Time 🎯</div>
        <div class="study-timer-display" id="study-timer-display">${_formatSecs(pomodoroWork * 60)}</div>

        <!-- Countdown input (only for countdown mode) -->
        <div class="study-countdown-input" id="study-countdown-input" hidden>
          <label class="study-input-label" for="countdown-mins">Minutes:</label>
          <input id="countdown-mins" type="number" min="1" max="480" value="30" aria-label="Countdown minutes">
        </div>

        <!-- Forest visualization -->
        <canvas id="study-forest-canvas" height="120" aria-label="Focus forest visualization"></canvas>

        <!-- Controls -->
        <div class="study-controls">
          <button class="btn-primary study-btn-start spring-tap" id="study-btn-start">▶ Start</button>
          <button class="btn-secondary study-btn-pause spring-tap" id="study-btn-pause" hidden>⏸ Pause</button>
          <button class="btn-secondary study-btn-resume spring-tap" id="study-btn-resume" hidden>▶ Resume</button>
          <button class="btn-danger study-btn-stop spring-tap" id="study-btn-stop" hidden>■ Stop</button>
        </div>
      </div>

      <!-- Pomodoro config -->
      <div class="glass-card study-config-card" id="study-pomodoro-config">
        <div class="study-card-title">Pomodoro Settings ⚙️</div>
        <div class="study-config-row">
          <label class="study-input-label">Work: <strong id="pomo-work-val">${pomodoroWork}</strong>m</label>
          <input id="pomo-work-slider" type="range" min="5" max="90" step="5" value="${pomodoroWork}" aria-label="Work duration">
        </div>
        <div class="study-config-row">
          <label class="study-input-label">Break: <strong id="pomo-break-val">${pomodoroBreak}</strong>m</label>
          <input id="pomo-break-slider" type="range" min="1" max="30" step="1" value="${pomodoroBreak}" aria-label="Break duration">
        </div>
      </div>

      <!-- Session history -->
      <div class="study-card-title study-card-title--outer">Recent Sessions 📚</div>
      <div class="glass-card study-sessions-card">
        ${sessions.length === 0
          ? `<div class="study-empty-state">No sessions yet — start your first focus session!</div>`
          : [...sessions].reverse().slice(0, 10).map(s => `
              <div class="study-session-item">
                <div class="study-session-info">
                  <div class="study-session-subject">${s.subject}</div>
                  <div class="study-session-meta">${s.date} · ${s.durationMins}min · ${s.mode || 'focus'}</div>
                </div>
                <div class="study-session-badge">📚 ${s.durationMins}m</div>
              </div>
            `).join('')
        }
      </div>

      <!-- Subjects management -->
      <div class="study-card-title study-card-title--outer">Manage Subjects</div>
      <div class="glass-card study-subjects-card" id="study-subjects-list">
        ${subjects.length === 0
          ? `<div class="study-empty-state">No subjects added yet.</div>`
          : subjects.map(s => `
              <div class="study-subject-item" data-id="${s.id}">
                <span class="study-subject-item-name">${s.emoji || '📖'} ${s.name}</span>
                <button class="btn-ghost study-del-subject spring-tap" data-id="${s.id}" aria-label="Delete ${s.name}">✕</button>
              </div>
            `).join('')
        }
      </div>

    </div>`;

    // G2: Forest canvas cleanup
    onCleanup(() => ChartModule.remove('study-forest-canvas'));

    // Draw initial idle forest
    _renderForest('study-forest-canvas', 0, false);

    // ── Timer display update via EventBus ────────────────────────────────────────
    const displayEl = document.getElementById('study-timer-display');
    const phaseEl   = document.getElementById('study-phase-label');

    // Forest redraw throttle — avoid RAF stacking if ChartModule doesn't auto-cancel
    // Only redraw when progress changes by ≥ 0.5% (≈ every ~7s on a 25-min pomodoro)
    let _lastForestProgress = -1;

    function _redrawForestIfChanged(progress, abandoned) {
      if (abandoned || Math.abs(progress - _lastForestProgress) >= 0.005) {
        _lastForestProgress = progress;
        _renderForest('study-forest-canvas', progress, abandoned);
      }
    }

    const onTick = ({ secondsLeft, elapsed, progress }) => {
      timerProgress = progress || 0;
      if (currentMode === MODES.STOPWATCH) {
        if (displayEl) displayEl.textContent = _formatMs(elapsed || 0);
      } else {
        if (displayEl) displayEl.textContent = _formatSecs(secondsLeft || 0);
      }
      // Throttled forest update — prevents RAF stacking on rapid ticks
      _redrawForestIfChanged(timerProgress, false);
    };
    EventBus.on('study:timer-tick', onTick);
    onCleanup(() => EventBus.off('study:timer-tick', onTick));

    // On session complete
    const onComplete = ({ durationMins }) => {
      _saveSession(currentSubjectId, durationMins, currentMode);
      timerProgress = 1;
      _lastForestProgress = -1; // force full redraw on complete
      _renderForest('study-forest-canvas', 1, false);
      // Show controls reset
      _showState('idle');
      UI.showToast(`✅ Session complete! ${durationMins}min logged.`, 'success', 4000);

      // Auto-start break for Pomodoro
      if (currentMode === MODES.POMODORO && !isOnBreak) {
        isOnBreak = true;
        if (phaseEl) phaseEl.textContent = 'Break Time ☕';
        StudyTimer._mode = MODES.POMODORO;
        StudyTimer.start(pomodoroBreak * 60);
        _showState('running');
      } else {
        isOnBreak = false;
        if (phaseEl) phaseEl.textContent = 'Focus Time 🎯';
      }
    };
    EventBus.on('study:session-complete', onComplete);
    onCleanup(() => EventBus.off('study:session-complete', onComplete));

    // ── UI helper: show/hide controls ────────────────────────────────────────────
    function _showState(state) {
      const startBtn  = document.getElementById('study-btn-start');
      const pauseBtn  = document.getElementById('study-btn-pause');
      const resumeBtn = document.getElementById('study-btn-resume');
      const stopBtn   = document.getElementById('study-btn-stop');
      if (!startBtn) return;
      startBtn.hidden  = state !== 'idle';
      pauseBtn.hidden  = state !== 'running';
      resumeBtn.hidden = state !== 'paused';
      stopBtn.hidden   = state === 'idle';
    }

    // ── Mode switcher ─────────────────────────────────────────────────────────────
    const modeRow = section.querySelector('.tab-switcher');
    if (modeRow) {
      const handler = e => {
        const btn = e.target.closest('[data-mode]');
        if (!btn) return;
        if (_currentSessionActive) { UI.showToast('Stop current session first.', 'warning'); return; }
        currentMode = btn.dataset.mode;
        section.querySelectorAll('.tab-switcher-btn').forEach(b => b.classList.toggle('active', b === btn));

        // Show/hide countdown input
        const cdInput = document.getElementById('study-countdown-input');
        const pomoCfg = document.getElementById('study-pomodoro-config');
        if (cdInput) cdInput.hidden = currentMode !== MODES.COUNTDOWN;
        if (pomoCfg) pomoCfg.hidden = currentMode !== MODES.POMODORO;

        // Reset display
        if (displayEl) {
          if (currentMode === MODES.POMODORO)  displayEl.textContent = _formatSecs(pomodoroWork * 60);
          if (currentMode === MODES.STOPWATCH) displayEl.textContent = '00:00';
          if (currentMode === MODES.COUNTDOWN) displayEl.textContent = _formatSecs(countdownMins * 60);
        }
        timerProgress = 0;
        _renderForest('study-forest-canvas', 0, false);
      };
      modeRow.addEventListener('click', handler);
      onCleanup(() => modeRow.removeEventListener('click', handler));
    }

    // ── Start button ─────────────────────────────────────────────────────────────
    const startBtn = document.getElementById('study-btn-start');
    if (startBtn) {
      const handler = () => {
        timerAbandoned = false;
        _lastForestProgress = -1; // force redraw from zero for new session
        _renderForest('study-forest-canvas', 0, false);
        if (currentMode === MODES.STOPWATCH) {
          StudyTimer.startStopwatch();
        } else if (currentMode === MODES.COUNTDOWN) {
          const cdMins = parseInt(document.getElementById('countdown-mins')?.value || '30');
          countdownMins = cdMins;
          StudyTimer._mode = MODES.COUNTDOWN;
          StudyTimer.start(cdMins * 60);
        } else {
          // Pomodoro
          StudyTimer._mode = MODES.POMODORO;
          StudyTimer.start(pomodoroWork * 60);
          if (phaseEl) phaseEl.textContent = 'Focus Time 🎯';
        }
        _showState('running');
      };
      startBtn.addEventListener('click', handler);
      onCleanup(() => startBtn.removeEventListener('click', handler));
    }

    // ── Pause button ─────────────────────────────────────────────────────────────
    const pauseBtn = document.getElementById('study-btn-pause');
    if (pauseBtn) {
      const handler = () => { StudyTimer.pause(); _showState('paused'); };
      pauseBtn.addEventListener('click', handler);
      onCleanup(() => pauseBtn.removeEventListener('click', handler));
    }

    // ── Resume button ─────────────────────────────────────────────────────────────
    const resumeBtn = document.getElementById('study-btn-resume');
    if (resumeBtn) {
      const handler = () => { StudyTimer.resume(); _showState('running'); };
      resumeBtn.addEventListener('click', handler);
      onCleanup(() => resumeBtn.removeEventListener('click', handler));
    }

    // ── Stop button ───────────────────────────────────────────────────────────────
    const stopBtn = document.getElementById('study-btn-stop');
    if (stopBtn) {
      const handler = () => {
        const elapsed = StudyTimer.getElapsed();
        StudyTimer.stop();
        timerAbandoned = true;
        _lastForestProgress = -1; // force abandoned-state redraw
        _renderForest('study-forest-canvas', timerProgress, true);
        _showState('idle');
        // Save partial session if > 2 minutes
        if (elapsed > 2 * 60 * 1000) {
          _saveSession(currentSubjectId, elapsed / 60000, currentMode);
          UI.showToast(`Session saved: ${Math.round(elapsed / 60000)}min`, 'info', 3000);
        } else {
          UI.showToast('Session abandoned — too short to save.', 'warning', 2000);
        }
        isOnBreak = false;
        if (phaseEl) phaseEl.textContent = 'Focus Time 🎯';
        if (displayEl) displayEl.textContent = _formatSecs(pomodoroWork * 60);
      };
      stopBtn.addEventListener('click', handler);
      onCleanup(() => stopBtn.removeEventListener('click', handler));
    }

    // ── Subject select ────────────────────────────────────────────────────────────
    const subjectSelect = document.getElementById('study-subject-select');
    if (subjectSelect) {
      const handler = e => { currentSubjectId = e.target.value; };
      subjectSelect.addEventListener('change', handler);
      onCleanup(() => subjectSelect.removeEventListener('change', handler));
    }

    // ── Add subject ───────────────────────────────────────────────────────────────
    const addSubjectBtn = document.getElementById('study-add-subject-btn');
    if (addSubjectBtn) {
      const handler = () => {
        UI.showPromptModal?.('New subject name:', name => {
          if (!name || !name.trim()) return;
          const subs = Store.get('subjects') || [];
          subs.push({ id: String(Date.now()), name: name.trim(), emoji: '📖' });
          Store.set('subjects', subs);
          UI.showToast(`Subject "${name.trim()}" added.`, 'success');
        });
      };
      addSubjectBtn.addEventListener('click', handler);
      onCleanup(() => addSubjectBtn.removeEventListener('click', handler));
    }

    // ── Delete subject ────────────────────────────────────────────────────────────
    const subjectsList = document.getElementById('study-subjects-list');
    if (subjectsList) {
      const handler = e => {
        const delBtn = e.target.closest('.study-del-subject');
        if (!delBtn) return;
        const id   = delBtn.dataset.id;
        const subs = Store.get('subjects') || [];
        Store.set('subjects', subs.filter(s => s.id !== id));
        UI.showToast('Subject removed.', 'info');
      };
      subjectsList.addEventListener('click', handler);
      onCleanup(() => subjectsList.removeEventListener('click', handler));
    }

    // ── Pomodoro sliders ─────────────────────────────────────────────────────────
    const workSlider = document.getElementById('pomo-work-slider');
    if (workSlider) {
      const handler = e => {
        const val = parseInt(e.target.value);
        const lbl = document.getElementById('pomo-work-val');
        if (lbl) lbl.textContent = val;
        if (!_currentSessionActive && displayEl && currentMode === MODES.POMODORO)
          displayEl.textContent = _formatSecs(val * 60);
        // G3: partial settings update
        const s = Store.get('settings') || {};
        Store.set('settings', { ...s, pomodoroWork: val });
      };
      workSlider.addEventListener('input', handler);
      onCleanup(() => workSlider.removeEventListener('input', handler));
    }

    const breakSlider = document.getElementById('pomo-break-slider');
    if (breakSlider) {
      const handler = e => {
        const val = parseInt(e.target.value);
        const lbl = document.getElementById('pomo-break-val');
        if (lbl) lbl.textContent = val;
        const s = Store.get('settings') || {};
        Store.set('settings', { ...s, pomodoroBreak: val });
      };
      breakSlider.addEventListener('input', handler);
      onCleanup(() => breakSlider.removeEventListener('input', handler));
    }

    // If session was already active when mounting (focus guard allowed), show running state
    if (_currentSessionActive) _showState('running');
  }

  return { mount, isActiveSession };

})();
