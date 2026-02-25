// js/sections/reports.js
// ReportsModule — LifeOS 26 v3.5.4
// Part 8 — Sections Layer
// Exports: mount(onCleanup)
// Guardrails: G1 G2 G3 G4 G6 G8 enforced
// HIGH-RISK: All date comparisons use Date.now() - new Date(str).getTime() — no undefined dates
// HIGH-RISK: Pre-computed maps prevent nested loop O(n²) — aggregation done ONCE at top
// HIGH-RISK: DataGuard on EVERY chart — no rendering on empty arrays
// HIGH-RISK: No new Date(undefined) — all date strings validated before parse

const ReportsModule = (() => {

  // ─── Date helpers ─────────────────────────────────────────────────────────────
  function _todayStr() { return new Date().toISOString().slice(0, 10); }

  // Safe date difference in ms — guards against undefined/invalid dates
  function _msAgo(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return Infinity;
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? Infinity : Date.now() - t;
  }

  // YYYY-MM-DD string from Date object — always normalized
  function _dateStr(d) { return d.toISOString().slice(0, 10); }

  // Last N calendar date strings
  function _lastNDays(n) {
    return Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (n - 1 - i));
      return _dateStr(d);
    });
  }

  // Day of week name
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ─── DataGuard (from spec) ────────────────────────────────────────────────────
  const DataGuard = {
    studyBarChart:    s => s.length >= 1,
    studyPieChart:    s => new Set(s.map(x => x.subject)).size >= 3,
    habitsCompletion: h => h.some(x => (x.history || []).length >= 3),
    sleepChart:       s => s.length >= 3,
    moodChart:        m => m.length >= 3,
    weightGraph:      w => w.length >= 2,
    volumeChart:      l => l.length >= 3,
    productiveDay:    s => s.length >= 6,
    heatmap:          entries => entries >= 3,
    streakLeaderboard:h => h.length > 0,
    getConfidence:    n => n >= 30 ? 'HIGH' : n >= 15 ? 'MEDIUM' : 'LOW',
  };

  // ─── Sleep consistency (shared logic from spec) ───────────────────────────────
  function _getSleepConsistency(sleepArr) {
    const times = sleepArr.slice(-14).map(s => {
      if (!s.bedtime) return null;
      const [h, m] = s.bedtime.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    }).filter(t => t !== null);
    if (times.length < 3) return null;
    const avg      = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = Math.sqrt(times.reduce((s, t) => s + Math.pow(t - avg, 2), 0) / times.length);
    if (variance <= 30) return { label: 'STABLE',   variance: Math.round(variance), color: 'var(--accent-green)' };
    if (variance <= 60) return { label: 'MODERATE', variance: Math.round(variance), color: 'var(--accent-gold)'  };
    return                     { label: 'UNSTABLE', variance: Math.round(variance), color: 'var(--accent-pink)'  };
  }

  // ─── Chart helpers ────────────────────────────────────────────────────────────

  // Bar chart — values[], labels[], colors?[]
  function _drawBarChart(id, values, labels, colorFn) {
    ChartModule.draw(id, (ctx, W, H, ease) => {
      if (!values.length) return;
      const max   = Math.max(...values, 0.1);
      const barW  = W / values.length - 4;
      values.forEach((v, i) => {
        const x   = i * (W / values.length) + 2;
        const h   = (v / max) * (H - 20) * ease;
        const y   = H - h - 16;
        ctx.fillStyle = colorFn ? colorFn(v, i) : 'var(--accent-study)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barW, h, [4, 4, 0, 0]);
        else ctx.rect(x, y, barW, h);
        ctx.fill();
        // Label
        if (labels && labels[i]) {
          ctx.font      = '10px Inter, sans-serif';
          ctx.fillStyle = 'var(--text-secondary)';
          ctx.textAlign = 'center';
          ctx.fillText(labels[i], x + barW / 2, H - 2);
        }
      });
    });
  }

  // Line chart — multiple series: [{ vals[], color }]
  function _drawLineChart(id, series, labels, H_override) {
    ChartModule.draw(id, (ctx, W, H, ease) => {
      const allVals = series.flatMap(s => s.vals);
      if (!allVals.length) return;
      const max   = Math.max(...allVals, 0.01);
      const min   = Math.min(...allVals, 0);
      const range = max - min || 1;
      const n     = series[0].vals.length;
      if (n < 2) return;
      const stepX = W / (n - 1);

      series.forEach(({ vals, color }) => {
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        vals.forEach((v, i) => {
          const x = i * stepX;
          const y = H - 20 - ((v - min) / range) * (H - 30) * ease;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      });

      // X labels
      if (labels) {
        ctx.font      = '10px Inter, sans-serif';
        ctx.fillStyle = 'var(--text-muted)';
        ctx.textAlign = 'center';
        // Show every ~7th label to avoid overcrowding
        const step = Math.max(1, Math.floor(labels.length / 7));
        labels.forEach((l, i) => {
          if (i % step !== 0 && i !== labels.length - 1) return;
          ctx.fillText(l, i * stepX, H - 2);
        });
      }
    });
  }

  // Donut chart — segments: [{ label, value, color }]
  function _drawDonutChart(id, segments) {
    ChartModule.draw(id, (ctx, W, H, ease) => {
      const total = segments.reduce((s, seg) => s + seg.value, 0);
      if (!total) return;
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 10, inner = r * 0.55;
      let angle = -Math.PI / 2;
      segments.forEach(seg => {
        const slice = (seg.value / total) * Math.PI * 2 * ease;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + slice);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        angle += slice;
      });
      // Inner cutout
      ctx.beginPath();
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fillStyle = 'var(--bg-surface)';
      ctx.fill();
    });
  }

  // Heatmap — 90-day GitHub style
  // Colors resolved from CSS tokens once — no hardcoded rgba in draw loop
  const _HEATMAP_COLORS = (() => {
    const root   = document.documentElement;
    const style  = getComputedStyle(root);
    const empty  = style.getPropertyValue('--heatmap-empty').trim()  || 'rgba(255,255,255,0.04)';
    const accent = style.getPropertyValue('--accent-habits').trim()   || '#10d98a';
    return { empty, accent };
  })();

  // Parse a CSS color into r,g,b components for alpha interpolation
  function _parseAccentRGB(cssColor) {
    // Works for hex (#10d98a) and rgb() values from CSS vars
    const hex = cssColor.trim();
    if (hex.startsWith('#') && hex.length === 7) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return { r, g, b };
    }
    // Fallback to spec accent-habits value
    return { r: 16, g: 217, b: 138 };
  }

  function _drawHeatmap(id, activityByDate) {
    const { r, g, b } = _parseAccentRGB(_HEATMAP_COLORS.accent);

    ChartModule.draw(id, (ctx, W, H, ease) => {
      const days  = 90;
      const cols  = 13; // weeks
      const rows  = 7;  // days of week
      const cellW = Math.floor(W / cols) - 1;
      const cellH = Math.floor(H / rows) - 1;
      const dates = _lastNDays(days);
      const maxAct = Math.max(...dates.map(d => activityByDate[d] || 0), 1);

      dates.forEach((dateStr, i) => {
        const col       = Math.floor(i / 7);
        const row       = i % 7;
        const x         = col * (cellW + 1);
        const y         = row * (cellH + 1);
        const act       = activityByDate[dateStr] || 0;
        const intensity = act / maxAct;

        ctx.globalAlpha = ease;
        // CSS token used: empty → var(--heatmap-empty), active → derived from var(--accent-habits)
        ctx.fillStyle = act === 0
          ? _HEATMAP_COLORS.empty
          : `rgba(${r},${g},${b},${(0.15 + intensity * 0.85).toFixed(2)})`;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, cellW, cellH, 2);
        else ctx.rect(x, y, cellW, cellH);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
  }

  // ─── Aggregation helpers (pre-computed to avoid nested loops) ─────────────────

  // Pre-compute map: date → total study hours
  function _buildStudyByDateMap(sessions) {
    const map = {};
    sessions.forEach(s => {
      if (!s.date || typeof s.date !== 'string') return;
      map[s.date] = (map[s.date] || 0) + (s.durationMins || 0) / 60;
    });
    return map;
  }

  // Pre-compute map: subject → total hours
  function _buildSubjectMap(sessions) {
    const map = {};
    sessions.forEach(s => {
      if (!s.subject) return;
      map[s.subject] = (map[s.subject] || 0) + (s.durationMins || 0) / 60;
    });
    return map;
  }

  // Pre-compute: dayOfWeek (0-6) → total study hours
  function _buildDOWMap(sessions) {
    const map = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    sessions.forEach(s => {
      if (!s.date || typeof s.date !== 'string') return;
      const t = new Date(s.date).getTime();
      if (isNaN(t)) return;
      const dow = new Date(s.date).getDay(); // 0-6
      map[dow] += (s.durationMins || 0) / 60;
    });
    return map;
  }

  // Pre-compute: date → habit completion % for 30 days
  function _buildHabitByDateMap(habits, dates) {
    // Build: date → completedCount, totalCount
    const map = {};
    dates.forEach(d => { map[d] = { completed: 0, total: 0 }; });
    habits.forEach(h => {
      (h.history || []).forEach(entry => {
        if (!entry.date || !map[entry.date]) return;
        map[entry.date].total += 1;
        if (entry.completed) map[entry.date].completed += 1;
      });
    });
    return map;
  }

  // Pre-compute: date → total volume lifted
  function _buildVolumeByWeekMap(logs) {
    const map = {};
    logs.forEach(log => {
      if (!log.date || typeof log.date !== 'string') return;
      const t = new Date(log.date).getTime();
      if (isNaN(t)) return;
      // Week key: year-weekNum
      const d = new Date(log.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const wk = _dateStr(weekStart);
      map[wk] = (map[wk] || 0) + (log.totalVolume || 0);
    });
    return map;
  }

  // Overall activity per date (heatmap) — sum study + workout + habits
  function _buildActivityMap(sessions, logs, habits) {
    const map = {};
    const addToMap = (dateStr, weight) => {
      if (!dateStr || typeof dateStr !== 'string') return;
      map[dateStr] = (map[dateStr] || 0) + weight;
    };
    sessions.forEach(s => addToMap(s.date, (s.durationMins || 0) / 60));
    logs.forEach(l     => addToMap(l.date, (l.durationMins || 0) / 30));
    habits.forEach(h   => (h.history || []).forEach(e => { if (e.completed) addToMap(e.date, 1); }));
    return map;
  }

  // Subject accent colors (cycle)
  const SUBJECT_COLORS = [
    'var(--accent-study)', 'var(--accent-habits)', 'var(--accent-health)',
    'var(--accent-workout)', 'var(--accent-pink)', 'var(--accent-gold)',
  ];

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-reports');
    if (!section) return;

    // ── ONE-TIME aggregation — all Store reads at mount (no repeated reads per chart) ──
    const habits   = Store.get('habits')          || [];
    const sessions = Store.get('study_sessions')  || [];
    const moodLog  = Store.get('mood')            || [];
    const sleepLog = Store.get('sleep')           || [];
    const weights  = Store.get('body_weight')     || [];
    const logs     = Store.get('workout_logs')    || [];

    const todayStr  = _todayStr();
    const WEEK_MS   = 7  * 86400000;
    const TWO_WK_MS = 14 * 86400000;
    const MONTH_MS  = 30 * 86400000;

    // Filter to recent windows — done ONCE here
    const weekSessions = sessions.filter(s => _msAgo(s.date) <= WEEK_MS);
    const last14Sleep  = sleepLog.filter(s => _msAgo(s.date) <= TWO_WK_MS)
                                 .sort((a, b) => a.date.localeCompare(b.date));
    const last14Mood   = moodLog.filter(m => _msAgo(m.timestamp?.slice(0, 10)) <= TWO_WK_MS)
                                .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    const last30Days   = _lastNDays(30);
    const last7Days    = _lastNDays(7);
    const last90Days   = _lastNDays(90);

    // Pre-compute maps — O(n) each, used O(1) in chart loops
    const studyByDate  = _buildStudyByDateMap(sessions);
    const subjectMap   = _buildSubjectMap(weekSessions);
    const dowMap       = _buildDOWMap(sessions);
    const habitByDate  = _buildHabitByDateMap(habits, last30Days);
    const volumeByWeek = _buildVolumeByWeekMap(logs);
    const activityMap  = _buildActivityMap(sessions, logs, habits);

    // Weekly summary values
    const weekStudyH   = weekSessions.reduce((s, x) => s + (x.durationMins || 0), 0) / 60;
    const weekHabitPct = habits.length > 0
      ? Math.round(
          habits.reduce((s, h) => {
            const c = (h.history || []).filter(e => _msAgo(e.date) <= WEEK_MS && e.completed).length;
            return s + Math.min(c, 7);
          }, 0) / (habits.length * 7) * 100
        )
      : 0;
    const weekMoods    = moodLog.filter(m => _msAgo(m.timestamp?.slice(0,10)) <= WEEK_MS);
    const moodAvg      = weekMoods.length
      ? (weekMoods.reduce((s, m) => s + (m.mood || 0), 0) / weekMoods.length).toFixed(1)
      : '--';
    const sleepAvg     = last14Sleep.length
      ? (last14Sleep.reduce((s, e) => s + (e.duration || 0), 0) / last14Sleep.length).toFixed(1)
      : '--';

    // Most productive day
    const dowEntries   = Object.entries(dowMap);
    const peakDOW      = dowEntries.reduce((best, [d, h]) => h > best[1] ? [d, h] : best, ['0', 0]);
    const peakDayName  = DOW_NAMES[parseInt(peakDOW[0])];
    const pdConfidence = DataGuard.getConfidence(sessions.length);

    // Sleep consistency
    const sleepConsistency = _getSleepConsistency(sleepLog);

    // Streak leaderboard
    const sortedHabits = [...habits].sort((a, b) => (b.streak || 0) - (a.streak || 0));

    // InteractionMonitor summary
    let selfAwareness  = null;
    let awarenessWarn  = null;
    if (typeof InteractionMonitor !== 'undefined') {
      selfAwareness = InteractionMonitor.getWeeklySummary?.() || null;
      awarenessWarn = InteractionMonitor.checkAwarenessRule?.() || null;
    }

    // ── Global empty state check ───────────────────────────────────────────────
    const hasAnyData = sessions.length > 0 || habits.length > 0 || sleepLog.length > 0 || moodLog.length > 0;

    // ── Activity count for heatmap DataGuard ──────────────────────────────────
    const activeDayCount = last90Days.filter(d => (activityMap[d] || 0) > 0).length;

    // ── Render HTML ───────────────────────────────────────────────────────────
    section.innerHTML = `<div class="section-content card-stack">

      ${!hasAnyData ? `
        <div class="glass-card reports-empty-card">
          <div class="reports-empty-icon">📊</div>
          <div class="reports-empty-title">Not enough data yet</div>
          <div class="reports-empty-sub">Complete activities to see analytics.</div>
          <button class="btn-primary spring-tap" id="reports-go-dashboard">Go to Dashboard</button>
        </div>
      ` : `

        <!-- ─── 1. PLAIN-ENGLISH WEEKLY SUMMARY ──────────────────────── -->
        <div class="glass-card reports-summary-card">
          <div class="reports-section-title">📋 This Week at a Glance</div>
          <div class="reports-summary-text">
            📚 Studied <strong>${weekStudyH.toFixed(1)}h</strong> &nbsp;·&nbsp;
            ✅ <strong>${weekHabitPct}%</strong> habits &nbsp;·&nbsp;
            😴 avg sleep <strong>${sleepAvg}h</strong> &nbsp;·&nbsp;
            😊 avg mood <strong>${moodAvg}/5</strong>
          </div>
        </div>

        <!-- ─── 14. SELF-AWARENESS SUMMARY (Master Spec) ────────────── -->
        ${selfAwareness ? `
          <div class="glass-card reports-awareness-card">
            <div class="reports-section-title">🧠 Self-Awareness Summary</div>
            ${awarenessWarn ? `
              <div class="reports-awareness-banner">
                ⚠️ You are interacting with the system more than producing output.
              </div>
            ` : ''}
            <div class="reports-awareness-stats">
              <div class="reports-awareness-stat">
                <span class="reports-awareness-label">Study Time</span>
                <span class="reports-awareness-val">${Math.round((selfAwareness.study_active_time || 0) / 60000)}min</span>
              </div>
              <div class="reports-awareness-stat">
                <span class="reports-awareness-label">Workout Time</span>
                <span class="reports-awareness-val">${Math.round((selfAwareness.workout_active_time || 0) / 60000)}min</span>
              </div>
              <div class="reports-awareness-stat">
                <span class="reports-awareness-label">App Interactions</span>
                <span class="reports-awareness-val">${selfAwareness.total_nav_time ? Math.round(selfAwareness.total_nav_time / 60000) + 'min' : '—'}</span>
              </div>
              <div class="reports-awareness-stat">
                <span class="reports-awareness-label">Section Switches</span>
                <span class="reports-awareness-val">${selfAwareness.section_switches || 0}</span>
              </div>
              <div class="reports-awareness-stat">
                <span class="reports-awareness-label">Settings Opened</span>
                <span class="reports-awareness-val">${selfAwareness.settings_opens || 0}</span>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- ─── 2. STUDY HOURS BAR CHART (7 days) ────────────────────── -->
        ${DataGuard.studyBarChart(weekSessions) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">📚 Study Hours (Last 7 Days)</div>
            <canvas id="chart-study-bar" height="140" aria-label="7-day study hours bar chart"></canvas>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">📚 Study Hours</div>
            <div class="reports-chart-empty-msg">Log a study session to see chart.</div>
          </div>
        `}

        <!-- ─── 3. SUBJECT PIE CHART ───────────────────────────────────── -->
        ${DataGuard.studyPieChart(weekSessions) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">📖 Weekly Study Distribution</div>
            <div class="reports-pie-wrap">
              <canvas id="chart-study-pie" height="140" width="140" aria-label="Study subject distribution donut chart"></canvas>
              <div class="reports-pie-legend" id="pie-legend"></div>
            </div>
          </div>
        ` : ''}

        <!-- ─── 4. HABITS TREND (30-day) ──────────────────────────────── -->
        ${DataGuard.habitsCompletion(habits) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">✅ Habit Completion (30 Days)</div>
            <canvas id="chart-habits-trend" height="120" aria-label="Habit completion trend"></canvas>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">✅ Habit Trend</div>
            <div class="reports-chart-empty-msg">Log habits for 3+ days to see trend.</div>
          </div>
        `}

        <!-- ─── 5. SLEEP CHART (14 days) ──────────────────────────────── -->
        ${DataGuard.sleepChart(last14Sleep) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">😴 Sleep Duration (14 Days)</div>
            <canvas id="chart-sleep" height="120" aria-label="Sleep duration chart"></canvas>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">😴 Sleep Chart</div>
            <div class="reports-chart-empty-msg">Log sleep for 3+ days to see chart.</div>
          </div>
        `}

        <!-- ─── 6. SLEEP CONSISTENCY CARD ────────────────────────────── -->
        ${sleepConsistency && DataGuard.sleepChart(last14Sleep) ? `
          <div class="glass-card reports-consistency-card">
            <div class="reports-section-title">🌙 Sleep Consistency</div>
            <div class="reports-consistency-label" data-consistency="${sleepConsistency.label.toLowerCase()}">
              ${sleepConsistency.label}
            </div>
            <div class="reports-consistency-sub">
              Bedtime variance: ±${sleepConsistency.variance}min
            </div>
          </div>
        ` : ''}

        <!-- ─── 7. MOOD TREND (14 days) ───────────────────────────────── -->
        ${DataGuard.moodChart(last14Mood) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">😊 Mood & Energy Trend (14 Days)</div>
            <canvas id="chart-mood" height="120" aria-label="Mood and energy trend chart"></canvas>
            <div class="reports-mood-legend">
              <span class="reports-legend-dot reports-legend-dot--mood"></span> Mood
              <span class="reports-legend-dot reports-legend-dot--energy"></span> Energy
            </div>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">😊 Mood Trend</div>
            <div class="reports-chart-empty-msg">Log mood for 3+ days to see trend.</div>
          </div>
        `}

        <!-- ─── 8. BODY WEIGHT GRAPH ──────────────────────────────────── -->
        ${DataGuard.weightGraph(weights) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">⚖️ Weight Progress</div>
            <canvas id="chart-weight" height="120" aria-label="Body weight line chart"></canvas>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">⚖️ Body Weight</div>
            <div class="reports-chart-empty-msg">
              Log weight for 2+ days to see graph.
              <button class="btn-ghost spring-tap" id="reports-go-health">Log Weight in Health →</button>
            </div>
          </div>
        `}

        <!-- ─── 9. VOLUME PROGRESS ────────────────────────────────────── -->
        ${DataGuard.volumeChart(logs) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">💪 Weekly Volume Progress</div>
            <canvas id="chart-volume" height="120" aria-label="Weekly workout volume chart"></canvas>
          </div>
        ` : ''}

        <!-- ─── 10. MOST PRODUCTIVE DAY ───────────────────────────────── -->
        ${DataGuard.productiveDay(sessions) ? `
          <div class="glass-card reports-productive-card">
            <div class="reports-section-title">📈 Peak Performance Day</div>
            <div class="reports-productive-day">You peak on <strong>${peakDayName}s</strong> 📈</div>
            <div class="reports-productive-hours">${peakDOW[1].toFixed(1)}h avg study</div>
            <div class="reports-productive-confidence">Confidence: <strong>${pdConfidence}</strong>
              ${pdConfidence === 'LOW' ? '(need more data)' : pdConfidence === 'MEDIUM' ? '(getting clearer)' : '(solid pattern!)'}
            </div>
          </div>
        ` : ''}

        <!-- ─── 11. ACTIVITY HEATMAP (90 days) ───────────────────────── -->
        ${DataGuard.heatmap(activeDayCount) ? `
          <div class="glass-card reports-chart-card">
            <div class="reports-section-title">🗓️ Activity Heatmap (90 Days)</div>
            <div class="reports-heatmap-wrap">
              <canvas id="chart-heatmap" height="80" aria-label="90-day activity heatmap"></canvas>
            </div>
            <div class="reports-heatmap-legend">
              <span>Less</span>
              <div class="reports-heatmap-legend-dots">
                <span class="heatmap-dot heatmap-dot--0"></span>
                <span class="heatmap-dot heatmap-dot--1"></span>
                <span class="heatmap-dot heatmap-dot--2"></span>
                <span class="heatmap-dot heatmap-dot--3"></span>
              </div>
              <span>More</span>
            </div>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">🗓️ Activity Heatmap</div>
            <div class="reports-chart-empty-msg">Complete activities on 3+ days to see heatmap.</div>
          </div>
        `}

        <!-- ─── 12. STREAK LEADERBOARD ────────────────────────────────── -->
        ${DataGuard.streakLeaderboard(habits) ? `
          <div class="glass-card reports-leaderboard-card">
            <div class="reports-section-title">🏆 Streak Leaderboard</div>
            <div class="reports-leaderboard-list">
              ${sortedHabits.slice(0, 10).map((h, i) => `
                <div class="reports-leaderboard-item">
                  <span class="reports-leaderboard-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}</span>
                  <span class="reports-leaderboard-emoji">${h.emoji || '✅'}</span>
                  <span class="reports-leaderboard-name">${h.name}</span>
                  <span class="reports-leaderboard-streak">🔥 ${h.streak || 0}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="glass-card reports-empty-chart">
            <div class="reports-chart-empty-title">🏆 Streak Leaderboard</div>
            <div class="reports-chart-empty-msg">Add habits to see streak rankings.</div>
          </div>
        `}

        <!-- ─── 13. EXPORT BUTTONS ────────────────────────────────────── -->
        <div class="glass-card reports-export-card">
          <div class="reports-section-title">💾 Export Data</div>
          <div class="reports-export-btns">
            <button class="btn-primary spring-tap" id="reports-export-json">📤 Export JSON</button>
            <button class="btn-secondary spring-tap" id="reports-export-csv">📊 Export CSV</button>
          </div>
        </div>

      `}

    </div>`;

    // ── Draw charts (DataGuard checked in HTML — only exists if guard passed) ──

    // Set CSS color for sleep consistency via JS (no inline style in HTML)
    const consistencyLabel = section.querySelector('.reports-consistency-label[data-consistency]');
    if (consistencyLabel && sleepConsistency) {
      consistencyLabel.style.color = sleepConsistency.color;
    }

    const chartCleanups = [];

    // 2. Study Bar Chart
    if (DataGuard.studyBarChart(weekSessions)) {
      const vals   = last7Days.map(d => studyByDate[d] || 0);
      const labels = last7Days.map(d => d.slice(5));
      _drawBarChart('chart-study-bar', vals, labels, v =>
        v >= 4 ? 'var(--accent-green)' : v >= 2 ? 'var(--accent-study)' : 'var(--accent-orange)'
      );
      chartCleanups.push(() => ChartModule.remove('chart-study-bar'));
    }

    // 3. Subject Pie Chart
    if (DataGuard.studyPieChart(weekSessions)) {
      const subjects = Object.entries(subjectMap);
      const segments = subjects.map(([label, value], i) => ({
        label, value, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
      }));
      _drawDonutChart('chart-study-pie', segments);
      chartCleanups.push(() => ChartModule.remove('chart-study-pie'));

      // Legend
      const legendEl = document.getElementById('pie-legend');
      if (legendEl) {
        legendEl.innerHTML = segments.map((s, idx) => `
          <div class="pie-legend-item">
            <span class="pie-legend-dot" data-cidx="${idx}"></span>
            <span class="pie-legend-label">${s.label}</span>
            <span class="pie-legend-val">${s.value.toFixed(1)}h</span>
          </div>
        `).join('');
        // Set dot colors via JS setProperty — no inline HTML styles (spec compliant)
        legendEl.querySelectorAll('.pie-legend-dot[data-cidx]').forEach(dot => {
          dot.style.background = segments[parseInt(dot.dataset.cidx)]?.color || 'var(--accent-study)';
        });
      }
    }

    // 4. Habits Trend Chart
    if (DataGuard.habitsCompletion(habits)) {
      const vals   = last30Days.map(d => {
        const e = habitByDate[d];
        return (!e || !e.total) ? 0 : Math.round(e.completed / e.total * 100);
      });
      const labels = last30Days.map((d, i) => i % 7 === 0 ? d.slice(5) : '');
      _drawBarChart('chart-habits-trend', vals, labels, v =>
        v >= 80 ? 'var(--accent-green)' : v >= 60 ? 'var(--accent-gold)' : 'var(--accent-pink)'
      );
      chartCleanups.push(() => ChartModule.remove('chart-habits-trend'));
    }

    // 5. Sleep Chart (bars = duration, implied quality via opacity)
    if (DataGuard.sleepChart(last14Sleep)) {
      const vals   = last14Sleep.map(s => s.duration || 0);
      const labels = last14Sleep.map(s => s.date.slice(5));
      _drawBarChart('chart-sleep', vals, labels, v =>
        v >= 8 ? 'var(--accent-green)' : v >= 6 ? 'var(--accent-study)' : 'var(--accent-orange)'
      );
      chartCleanups.push(() => ChartModule.remove('chart-sleep'));
    }

    // 7. Mood & Energy line chart
    if (DataGuard.moodChart(last14Mood)) {
      const moodVals   = last14Mood.map(m => m.mood   || 0);
      const energyVals = last14Mood.map(m => m.energy || 0);
      const labels     = last14Mood.map(m => (m.timestamp || '').slice(5, 10));
      _drawLineChart('chart-mood', [
        { vals: moodVals,   color: 'var(--accent-pink)'  },
        { vals: energyVals, color: 'var(--accent-study)'  },
      ], labels);
      chartCleanups.push(() => ChartModule.remove('chart-mood'));
    }

    // 8. Weight graph
    if (DataGuard.weightGraph(weights)) {
      const sorted     = [...weights].sort((a, b) => a.date.localeCompare(b.date));
      const weightVals = sorted.map(w => w.weight);
      const wLabels    = sorted.map(w => w.date.slice(5));
      _drawLineChart('chart-weight', [
        { vals: weightVals, color: 'var(--accent-workout)' },
      ], wLabels);
      chartCleanups.push(() => ChartModule.remove('chart-weight'));
    }

    // 9. Volume Progress
    if (DataGuard.volumeChart(logs)) {
      const weeks  = Object.keys(volumeByWeek).sort().slice(-8);
      const vVals  = weeks.map(w => volumeByWeek[w] || 0);
      const vLabels = weeks.map(w => w.slice(5));
      _drawBarChart('chart-volume', vVals, vLabels, () => 'var(--accent-workout)');
      chartCleanups.push(() => ChartModule.remove('chart-volume'));
    }

    // 11. Heatmap
    if (DataGuard.heatmap(activeDayCount)) {
      _drawHeatmap('chart-heatmap', activityMap);
      chartCleanups.push(() => ChartModule.remove('chart-heatmap'));
    }

    // Register all chart cleanups
    chartCleanups.forEach(fn => onCleanup(fn));

    // ── Wire listeners ─────────────────────────────────────────────────────────

    const goDashBtn = document.getElementById('reports-go-dashboard');
    if (goDashBtn) {
      const h = () => { if (typeof LifeOS !== 'undefined') LifeOS.navigate('dashboard'); };
      goDashBtn.addEventListener('click', h);
      onCleanup(() => goDashBtn.removeEventListener('click', h));
    }

    const goHealthBtn = document.getElementById('reports-go-health');
    if (goHealthBtn) {
      const h = () => { if (typeof LifeOS !== 'undefined') LifeOS.navigate('health'); };
      goHealthBtn.addEventListener('click', h);
      onCleanup(() => goHealthBtn.removeEventListener('click', h));
    }

    const exportJsonBtn = document.getElementById('reports-export-json');
    if (exportJsonBtn) {
      const h = () => DataProtection.exportJSON();
      exportJsonBtn.addEventListener('click', h);
      onCleanup(() => exportJsonBtn.removeEventListener('click', h));
    }

    const exportCsvBtn = document.getElementById('reports-export-csv');
    if (exportCsvBtn) {
      const h = () => DataProtection.exportCSV?.();
      exportCsvBtn.addEventListener('click', h);
      onCleanup(() => exportCsvBtn.removeEventListener('click', h));
    }

    // Heatmap tap — show day summary
    const heatmapCanvas = document.getElementById('chart-heatmap');
    if (heatmapCanvas && DataGuard.heatmap(activeDayCount)) {
      const h = e => {
        const rect    = heatmapCanvas.getBoundingClientRect();
        const x       = e.clientX - rect.left;
        const y       = e.clientY - rect.top;
        const cellW   = rect.width  / 13;
        const cellH   = rect.height / 7;
        const col     = Math.floor(x / cellW);
        const row     = Math.floor(y / cellH);
        const idx     = col * 7 + row;
        if (idx >= 0 && idx < 90) {
          const dateStr = last90Days[idx];
          const act     = activityMap[dateStr] || 0;
          UI.showToast(`${dateStr}: ${act > 0 ? `${act.toFixed(1)} activity units` : 'No activity'}`, 'info', 2000);
        }
      };
      heatmapCanvas.addEventListener('click', h);
      onCleanup(() => heatmapCanvas.removeEventListener('click', h));
    }
  }

  return { mount };

})();
