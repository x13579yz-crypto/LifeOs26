// js/sections/dashboard.js
// DashboardModule — LifeOS 26 v3.5.3
// Part 7 — Sections Layer
// Exports: mount(onCleanup)
// Guardrails: G1 G2 G3 G4 G6 enforced

const DashboardModule = (() => {

  // ─── Status helpers ───────────────────────────────────────────────────────────

  function _getStudyStatus(studiedH, goalH) {
    const pct = goalH > 0 ? studiedH / goalH : 0;
    if (pct > 1.1)  return { label: 'AHEAD',    color: 'var(--accent-green)' };
    if (pct >= 0.6) return { label: 'ON TRACK', color: 'var(--accent-study)' };
    return                  { label: 'BEHIND',  color: 'var(--accent-orange)' };
  }

  function _getHabitStability(habits) {
    if (!habits.length) return { color: 'var(--accent-pink)' };
    const total    = habits.reduce((sum, h) => sum + (h.history || []).slice(-7).filter(d => d.completed).length, 0);
    const possible = habits.length * 7;
    const ratio    = possible > 0 ? total / possible : 0;
    if (ratio >= 0.85) return { color: 'var(--accent-habits)' };
    if (ratio >= 0.60) return { color: 'var(--accent-gold)' };
    return                    { color: 'var(--accent-pink)' };
  }

  function _getHydrationStatus(count, goal) {
    const pct = goal > 0 ? count / goal : 0;
    return pct >= 0.75
      ? { color: 'var(--accent-study)' }
      : { color: 'var(--accent-orange)' };
  }

  function _getRiskHabits(habits) {
    return habits.filter(h => {
      const hist           = (h.history || []).slice(-3);
      const missedYest     = hist.length >= 1 && !hist[hist.length - 1]?.completed;
      const twoOfLastThree = hist.filter(d => !d.completed).length >= 2;
      return (missedYest || twoOfLastThree) && (h.streak || 0) >= 3;
    });
  }

  function _greeting() {
    const h    = new Date().getHours();
    const profile = Store.get('profile') || {};
    const name = profile.name || 'Friend';
    if (h >= 5  && h < 12) return { text: `Good Morning, ${name}`,   emoji: '☀️',  color: 'var(--greeting-morning)' };
    if (h >= 12 && h < 17) return { text: `Good Afternoon, ${name}`, emoji: '🌤️', color: 'var(--greeting-afternoon)' };
    if (h >= 17 && h < 21) return { text: `Good Evening, ${name}`,   emoji: '🌅',  color: 'var(--greeting-evening)' };
    return                         { text: `Good Night, ${name}`,     emoji: '🌙',  color: 'var(--greeting-night)' };
  }

  function _todayStr() { return new Date().toISOString().slice(0, 10); }
  function _fullDate() { return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }

  // ─── Chart: Ring ──────────────────────────────────────────────────────────────

  // Design token: ring track colour resolved from CSS — no hardcoded rgba (design-system purity)
  // Falls back to semi-transparent white if CSS var not set in root
  const _RING_TRACK_COLOR = (() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--ring-track-color').trim();
    return v || 'rgba(255,255,255,0.06)';
  })();

  function _drawRing(canvasId, pct, color, emoji) {
    ChartModule.draw(canvasId, (ctx, W, H, ease) => {
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 8;
      const startAngle = -Math.PI / 2;

      // Track ring — CSS token, no hardcoded rgba
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = _RING_TRACK_COLOR;
      ctx.lineWidth   = 8;
      ctx.stroke();

      // Progress
      if (pct > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, startAngle + Math.PI * 2 * Math.min(pct, 1) * ease);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 8;
        ctx.lineCap     = 'round';
        ctx.stroke();
      }

      // Center emoji
      ctx.font            = `${Math.round(r * 0.55)}px serif`;
      ctx.textAlign       = 'center';
      ctx.textBaseline    = 'middle';
      ctx.fillText(emoji, cx, cy);
    });
  }

  // ─── Chart: Sparkline ─────────────────────────────────────────────────────────

  function _drawSparkline(canvasId, values) {
    ChartModule.draw(canvasId, (ctx, W, H, ease) => {
      if (values.length < 2) return;
      const max  = Math.max(...values, 1);
      const step = W / (values.length - 1);
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = i * step;
        const y = H - (v / max) * H * ease;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'var(--accent-study)';
      ctx.lineWidth   = 2;
      ctx.stroke();
    });
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-dashboard');
    if (!section) return;

    // G3: Read from Store — never mutate result directly
    const habits       = Store.get('habits')         || [];
    const settings     = Store.get('settings')       || {};
    const sessions     = Store.get('study_sessions') || [];
    const moodLog      = Store.get('mood')           || [];
    const checkins     = Store.get('checkins')       || [];
    const workoutPlans = Store.get('workout_plans')  || [];

    const today      = _todayStr();
    const dayOfWeek  = new Date().getDay();

    // Today's study
    const todayStudyH = sessions
      .filter(s => s.date === today)
      .reduce((sum, s) => sum + (s.durationMins || 0), 0) / 60;
    const goalH = settings.studyGoalHours || 4;

    // Habit completion
    const completedCount = habits.filter(h => h.completedToday).length;
    const habitPct       = habits.length > 0 ? completedCount / habits.length : 0;

    // Hydration
    const todayCheckin   = checkins.find(c => c.date === today) || {};
    const hydrationCount = todayCheckin.hydration || 0;
    const hydrationGoal  = settings.hydrationGoal || 8;

    // 7-day sparkline data
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      return sessions.filter(s => s.date === ds).reduce((sum, s) => sum + (s.durationMins || 0), 0) / 60;
    });
    const hasSparklineData = last7.filter(v => v > 0).length >= 3;

    // Weekly summary
    const weekMs     = 7 * 86400000;
    const weekSess   = sessions.filter(s => Date.now() - new Date(s.date).getTime() < weekMs);
    const weekStudyH = weekSess.reduce((sum, s) => sum + (s.durationMins || 0), 0) / 60;
    const weekHabitPct = habits.length > 0
      ? Math.round(habits.reduce((sum, h) => {
          const c = (h.history || []).filter(e => {
            return (Date.now() - new Date(e.date).getTime()) < weekMs && e.completed;
          }).length;
          return sum + Math.min(c, 7);
        }, 0) / (habits.length * 7) * 100)
      : 0;
    const weekMoods = moodLog.filter(m => Date.now() - new Date(m.date).getTime() < weekMs);
    const moodAvg   = weekMoods.length
      ? (weekMoods.reduce((s, m) => s + (m.mood || 0), 0) / weekMoods.length).toFixed(1)
      : '--';

    // Today's workout plan
    const todayPlan = workoutPlans.find(p => (p.schedule || []).includes(dayOfWeek));

    // Challenge
    let challengeText;
    if (habitPct < 0.6)        challengeText = 'Complete any 2 habits today 🎯';
    else if (habitPct <= 0.85) challengeText = 'Complete morning habits + 30min study 📚';
    else                       challengeText = 'Full habits + 2h study + workout! 🔥';

    // Streak cards
    const topStreaks  = [...habits].sort((a, b) => (b.streak || 0) - (a.streak || 0)).slice(0, 2);
    const riskHabits  = _getRiskHabits(habits);

    // Danger banner
    const showDanger  = new Date().getHours() >= 21 && habits.some(h => !h.completedToday && (h.streak || 0) >= 3);
    const dangerCount = habits.filter(h => !h.completedToday && (h.streak || 0) >= 3).length;

    const g       = _greeting();
    const todayMood = moodLog.find(m => m.date === today);

    // ── Render HTML ──────────────────────────────────────────────────────────────
    section.innerHTML = `<div class="section-content card-stack">

      <div class="glass-card dash-greeting-card">
        <div class="dash-greeting-row">
          <div>
            <div class="dash-greeting-text">${g.text} ${g.emoji}</div>
            <div class="dash-date">${_fullDate()}</div>
          </div>
          <button class="dash-avatar-btn spring-tap" id="dash-profile-btn" aria-label="Go to profile">
            ${(Store.get('profile') || {}).avatar || '👤'}
          </button>
        </div>
      </div>

      ${showDanger ? `
        <button class="dash-danger-banner spring-tap" id="dash-danger-btn">
          ⚠️ Complete habits before midnight! ${dangerCount} habit(s) at risk.
        </button>
      ` : ''}

      ${habits.length === 0 ? `
        <div class="glass-card dash-empty-card">
          <div class="dash-empty-icon">🌱</div>
          <div class="dash-empty-title">No habits yet</div>
          <div class="dash-empty-sub">Add your first habit to start tracking your progress.</div>
          <button class="btn-primary spring-tap" id="dash-add-habit-btn">Add First Habit</button>
        </div>
      ` : `
        <div class="glass-card dash-rings-card">
          <div class="dash-rings-row">
            <div class="dash-ring-wrap">
              <canvas id="ring-study" width="80" height="80" aria-label="Study progress ring"></canvas>
              <div class="dash-ring-label">Study</div>
              <div class="dash-ring-sub">${todayStudyH.toFixed(1)}/${goalH}h</div>
            </div>
            <div class="dash-ring-wrap">
              <canvas id="ring-habits" width="80" height="80" aria-label="Habit completion ring"></canvas>
              <div class="dash-ring-label">Habits</div>
              <div class="dash-ring-sub">${completedCount}/${habits.length}</div>
            </div>
            <div class="dash-ring-wrap">
              <canvas id="ring-hydration" width="80" height="80" aria-label="Hydration ring"></canvas>
              <div class="dash-ring-label">Water</div>
              <div class="dash-ring-sub">${hydrationCount}/${hydrationGoal}</div>
            </div>
          </div>
        </div>
      `}

      <div class="glass-card dash-mood-card">
        <div class="dash-card-title">How are you feeling? 😊</div>
        <div class="dash-mood-row" id="dash-mood-btns" role="group" aria-label="Log your mood">
          ${['😴','😐','🙂','😊','🔥'].map((e, i) => `
            <button class="dash-mood-btn spring-tap${todayMood && todayMood.mood === i + 1 ? ' dash-mood-btn--active' : ''}"
              data-mood="${i + 1}" aria-label="Mood ${i + 1}/5">${e}</button>
          `).join('')}
        </div>
        ${todayMood ? `<div class="dash-mood-logged">Today's mood: ${todayMood.mood}/5 ✓</div>` : ''}
      </div>

      <div class="glass-card dash-challenge-card">
        <div class="dash-card-title">Daily Challenge 🎯</div>
        <div class="dash-challenge-text">${challengeText}</div>
      </div>

      ${habits.length > 0 ? `
        <div class="dash-card-title dash-card-title--outer">Top Streaks 🔥</div>
        <div class="dash-streak-row">
          ${topStreaks.map(h => `
            <div class="glass-card dash-streak-card">
              <div class="dash-streak-emoji">${h.emoji || '✅'}</div>
              <div class="dash-streak-name">${h.name}</div>
              <div class="dash-streak-count">🔥 ${h.streak || 0}</div>
            </div>
          `).join('')}
          ${riskHabits[0] ? `
            <div class="glass-card dash-streak-card dash-streak-card--risk">
              <div class="dash-streak-emoji">⚠️</div>
              <div class="dash-streak-name">${riskHabits[0].name}</div>
              <div class="dash-streak-count dash-streak-count--risk">At Risk</div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="glass-card dash-workout-card">
        <div class="dash-card-title">Today's Workout</div>
        ${todayPlan
          ? `<div class="dash-workout-name">💪 ${todayPlan.name}</div>`
          : `<div class="dash-workout-rest">😴 Rest Day — Recovery is training too.</div>`}
      </div>

      <div class="glass-card dash-summary-card">
        <div class="dash-card-title">This Week</div>
        <div class="dash-summary-text">
          📚 ${weekStudyH.toFixed(1)}h study &nbsp;·&nbsp; ✅ ${weekHabitPct}% habits &nbsp;·&nbsp; 😊 avg mood ${moodAvg}/5
        </div>
      </div>

      ${hasSparklineData ? `
        <div class="glass-card dash-sparkline-card">
          <div class="dash-card-title">7-Day Study Trend 📈</div>
          <canvas id="sparkline-study" height="60" aria-label="7-day study trend sparkline"></canvas>
        </div>
      ` : ''}

      <div class="badge-row" id="dashboard-badge-row"></div>

    </div>`;

    // ── Draw rings (G4: habits.length > 0 guard already applied in HTML) ─────────
    if (habits.length > 0) {
      _drawRing('ring-study',     todayStudyH / Math.max(goalH, 0.01),        _getStudyStatus(todayStudyH, goalH).color, '📚');
      _drawRing('ring-habits',    habitPct,                                     _getHabitStability(habits).color,          '✅');
      _drawRing('ring-hydration', hydrationCount / Math.max(hydrationGoal, 1), _getHydrationStatus(hydrationCount, hydrationGoal).color, '💧');

      // G2: cleanup charts
      onCleanup(() => {
        ChartModule.remove('ring-study');
        ChartModule.remove('ring-habits');
        ChartModule.remove('ring-hydration');
      });
    }

    // G4: DataGuard for sparkline already checked (hasSparklineData)
    if (hasSparklineData) {
      _drawSparkline('sparkline-study', last7);
      onCleanup(() => ChartModule.remove('sparkline-study'));
    }

    // Badge hydration (component 10)
    BadgeSystem.hydrate();

    // ── Wire listeners ───────────────────────────────────────────────────────────

    const profileBtn = document.getElementById('dash-profile-btn');
    if (profileBtn) {
      const h = () => LifeOS.navigate('profile');
      profileBtn.addEventListener('click', h);
      onCleanup(() => profileBtn.removeEventListener('click', h));
    }

    const addHabitBtn = document.getElementById('dash-add-habit-btn');
    if (addHabitBtn) {
      const h = () => LifeOS.navigate('habits');
      addHabitBtn.addEventListener('click', h);
      onCleanup(() => addHabitBtn.removeEventListener('click', h));
    }

    const dangerBtn = document.getElementById('dash-danger-btn');
    if (dangerBtn) {
      const h = () => LifeOS.navigate('habits');
      dangerBtn.addEventListener('click', h);
      onCleanup(() => dangerBtn.removeEventListener('click', h));
    }

    // Mood buttons — tap logs instantly, no modal (spec requirement)
    const moodBtns = document.getElementById('dash-mood-btns');
    if (moodBtns) {
      const handler = e => {
        const btn = e.target.closest('[data-mood]');
        if (!btn) return;
        const moodVal = parseInt(btn.dataset.mood);
        const today   = _todayStr();
        // G3: Read → filter → push → set (never mutate in place)
        const moodArr  = Store.get('mood') || [];
        const filtered = moodArr.filter(m => m.date !== today);
        filtered.push({ mood: moodVal, energy: null, note: '', date: today, timestamp: new Date().toISOString() });
        Store.set('mood', filtered);
        EventBus.emit('health:mood-logged', { mood: moodVal, date: today });
        UI.showToast(`Mood logged: ${btn.textContent}`, 'success', 2000);
        // Update active state visually
        moodBtns.querySelectorAll('[data-mood]').forEach(b => b.classList.remove('dash-mood-btn--active'));
        btn.classList.add('dash-mood-btn--active');
        const loggedEl = section.querySelector('.dash-mood-logged');
        if (loggedEl) loggedEl.textContent = `Today's mood: ${moodVal}/5 ✓`;
        else {
          const div = document.createElement('div');
          div.className   = 'dash-mood-logged';
          div.textContent = `Today's mood: ${moodVal}/5 ✓`;
          moodBtns.parentNode.appendChild(div);
        }
      };
      moodBtns.addEventListener('click', handler);
      onCleanup(() => moodBtns.removeEventListener('click', handler));
    }

    // G6: EventBus — re-hydrate badges on earn
    const onBadge = () => BadgeSystem.hydrate();
    EventBus.on('badge:earned', onBadge);
    onCleanup(() => EventBus.off('badge:earned', onBadge));
  }

  return { mount };

})();
