// js/app.js
// LifeOS — App Orchestrator
// v3.5.1 Production Hardened
// Part 6 — Orchestrator Layer

const LifeOS = (() => {

  const DATA_VERSION  = '3.5.1';
  let   _active       = null; // null until first navigate — avoids false nav time on boot
  let   _installPrompt = null;
  let   _navStartTime  = Date.now(); // v3.5.1 FIX 2: auto-wire nav time tracking

  // ─── Public: init ─────────────────────────────────────────────────────────────

  async function init() {
    // 1. Show splash immediately
    UI.showSplash();

    // 2. Report paint timing
    Perf.reportPaintTiming();

    // 3. Restore from IDB first (before Store.init)
    await DataProtection.restoreIfNeeded();

    // 4. Migrate data keys (Master Spec new keys + version bump)
    _migrateDataIfNeeded();

    // 5. Initialize reactive store
    Store.init();

    // 6. Run daily streak/reset logic
    DailyReset.run();

    // 7. Initialize audio (sets up EventBus listeners for sounds)
    AudioModule.init();

    // 8. Initialize interaction monitor (BEFORE section registration)
    InteractionMonitor.init();

    // 9. Initialize backup status shield
    BackupStatus.init();

    // 10. Initialize badge system (registers EventBus listeners)
    BadgeSystem.init();

    // 11. Register all 7 section modules
    _registerAllSections();

    // 12. Global error handlers
    _setupGlobalErrorHandlers();

    // 13. Offline detection
    _setupOfflineDetection();

    // 14. PWA install prompt listener
    _setupPWAInstall();

    // 15. First launch → show onboarding, skip rest of init
    if (OnboardingModule.isFirstLaunch()) {
      UI.hideSplash();
      OnboardingModule.start();
      return;
    }

    // 16. Navigate to dashboard
    navigate('dashboard');

    // 17. Hide splash after section mounted
    UI.hideSplash();

    // 18. Run badge check on startup
    BadgeSystem.check();

    // 19. Check export reminder (delegates to BackupStatus)
    ExportReminder.check();

    // 20. Init notifications (after user has given context)
    NotificationModule.init();

    // 21. App ready signal
    EventBus.emit('app:ready', { version: DATA_VERSION });
    Logger.info('LifeOS initialized', { version: DATA_VERSION });
  }

  // ─── Public: navigate ─────────────────────────────────────────────────────────

  function navigate(to) {
    // v3.5.1 FIX 6: Focus Guard — checked BEFORE any unmount
    // StudyModule must expose isActiveSession() for this guard to work
    if (
      to !== _active &&
      typeof StudyModule !== 'undefined' &&
      typeof StudyModule.isActiveSession === 'function' &&
      StudyModule.isActiveSession()
    ) {
      UI.showConfirmModal(
        '🎯 Focus Mode Active. Leave study session?',
        () => _doNavigate(to), // confirmed — navigate
        () => {}               // cancelled — stay on study
      );
      return; // do NOT navigate until confirmed
    }
    _doNavigate(to);
  }

  // ─── Private: _doNavigate ─────────────────────────────────────────────────────

  function _doNavigate(to) {
    // v3.5.1 FIX 2: Accumulate nav time before switching sections
    const now = Date.now();
    if (_active) InteractionMonitor.recordNavTime(now - _navStartTime);
    _navStartTime = now;

    const from = _active;

    // Unmount current section (cleanup listeners, timers, charts)
    SectionLifecycle.unmount(from);

    // Update active tracker
    _active = to;

    // Show new section in DOM
    UI.showSection(to);

    // Mount new section (init listeners, render content)
    SectionLifecycle.mount(to);

    // Announce navigation for screen readers
    Accessibility.announce(`Navigated to ${to}`);

    // Update all nav tab aria-current + active class
    document.querySelectorAll('.nav-tab').forEach(btn => {
      const isActive = btn.dataset.section === to;
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      btn.querySelector('.nav-icon-wrap')?.classList.toggle('active', isActive);
    });

    // Record section switch for self-awareness tracking
    InteractionMonitor.recordSectionSwitch();

    // Emit navigate event (InteractionMonitor + StudyModule listen to this)
    EventBus.emit('app:navigate', { from, to });
  }

  // ─── Private: _registerAllSections ───────────────────────────────────────────

  function _registerAllSections() {
    SectionLifecycle.register('dashboard', DashboardModule.mount);
    SectionLifecycle.register('study',     StudyModule.mount);
    SectionLifecycle.register('habits',    HabitsModule.mount);
    SectionLifecycle.register('workout',   WorkoutModule.mount);
    SectionLifecycle.register('health',    HealthModule.mount);
    SectionLifecycle.register('reports',   ReportsModule.mount);
    SectionLifecycle.register('profile',   ProfileModule.mount);

    // v3.5 FIX 3: Runtime registry integrity check — ENFORCED
    const count = SectionLifecycle.getRegistrySize();
    if (count !== 7) {
      const err = `FATAL: Section registry size is ${count}, expected 7. App cannot start.`;
      Logger.error(err);
      throw new Error(err);
    }
    Logger.info('All sections registered', { count: 7 });
  }

  // ─── Private: _migrateDataIfNeeded ───────────────────────────────────────────

  function _migrateDataIfNeeded() {
    const stored = localStorage.getItem('lifeos_data_version');

    // Always run _ensureNewKeys — covers upgrade from v3.4 to Master Spec
    if (stored === DATA_VERSION) {
      _ensureNewKeys();
      return;
    }

    Logger.info('Data migration running', { from: stored || 'none', to: DATA_VERSION });
    _ensureNewKeys();
    localStorage.setItem('lifeos_data_version', DATA_VERSION);
  }

  // Guarantees all Master Spec keys exist without overwriting existing data.
  // NOTE: localStorage.setItem used directly here — intentional.
  // This runs BEFORE Store.init() to seed default values.
  // Store.init() then reads these values into its reactive layer.
  // Schema validation happens inside Store.init() after these keys exist.
  function _ensureNewKeys() {
    const newKeys = [
      {
        key: 'lifeos_notes',
        val: '[]',
      },
      {
        key: 'lifeos_diet_compliance',
        val: '[]',
      },
      {
        key: 'lifeos_interaction_data',
        val: JSON.stringify({
          section_switches:    0,
          settings_opens:      0,
          total_nav_time:      0,
          study_active_time:   0,
          workout_active_time: 0,
          week_start:          '',
        }),
      },
      {
        key: 'lifeos_daily_reset_last',
        val: '""',
      },
    ];

    newKeys.forEach(({ key, val }) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, val);
        Logger.info('Migration: key initialized', { key });
      }
    });
  }

  // ─── Private: _setupGlobalErrorHandlers ──────────────────────────────────────

  function _setupGlobalErrorHandlers() {
    // Catch synchronous JS errors
    window.onerror = (msg, src, line, col, err) => {
      Logger.error('Global JS error', {
        msg,
        src,
        line,
        col,
        stack: err?.stack || null,
      });
      return true; // prevent default browser error handling
    };

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', e => {
      Logger.error('Unhandled promise rejection', {
        reason: e.reason?.message || String(e.reason),
        stack:  e.reason?.stack  || null,
      });
      e.preventDefault();
    });
  }

  // ─── Private: _setupOfflineDetection ─────────────────────────────────────────

  function _setupOfflineDetection() {
    window.addEventListener('online', () => {
      UI.hideOfflineBanner();
      Accessibility.announce('Connection restored');
      Logger.info('App online');
    });

    window.addEventListener('offline', () => {
      UI.showOfflineBanner();
      Accessibility.announce('You are offline. App works — data saves locally.', 'assertive');
      Logger.info('App offline');
    });
  }

  // ─── Private: _setupPWAInstall ────────────────────────────────────────────────

  function _setupPWAInstall() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _installPrompt = e;
      // Reveal install button in Profile section if present
      const btn = document.getElementById('btn-install-app');
      if (btn) btn.removeAttribute('hidden');
      Logger.info('PWA install prompt captured');
    });
  }

  // ─── Public: triggerInstall ───────────────────────────────────────────────────

  function triggerInstall() {
    if (_installPrompt) {
      _installPrompt.prompt();
      _installPrompt.userChoice.then(result => {
        Logger.info('PWA install choice', { outcome: result.outcome });
        _installPrompt = null;
      });
    }
  }

  // ─── Service Worker Registration (at IIFE eval time) ─────────────────────────

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then(reg => Logger.info('Service Worker registered', { scope: reg.scope }))
      .catch(e  => Logger.warn('Service Worker registration failed', e.message));
  }

  // ─── Boot on DOM ready ────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    LifeOS.init().catch(err => {
      Logger.error('LifeOS init failed', { stack: err?.stack });
      // Show minimal fallback UI if init crashes — zero inline CSS
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.innerHTML = `
          <div class="fatal-error-screen">
            <div class="fatal-error-icon">⚠️</div>
            <p class="fatal-error-msg">Something went wrong loading LifeOS.<br>Please reload the page.</p>
          </div>
        `;
      }
    });
  });

  return { init, navigate, triggerInstall };

})();
