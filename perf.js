// ═══════════════════════════════════════════════════════════════
// js/foundation/perf.js — LifeOS 26 v3.5.1
// Performance budget enforcement. Depends on: Logger.
// RULE 25: Perf.measure() wraps all section renders + chart draws
// RULE 27: handles async Promises
// ═══════════════════════════════════════════════════════════════

const Perf = (() => {

  // Budget map: operation name → max allowed ms
  const BUDGETS = {
    'section-render':   100,
    'chart-draw-frame':  16,
    'daily-reset':       50,
  };

  /**
   * Measure execution time of fn.
   * Works for both sync and async (Promise-returning) functions.
   * Logs a warning if budget is exceeded.
   *
   * @param {string}   name - budget key
   * @param {Function} fn   - function to measure
   * @returns result of fn (sync value or Promise)
   */
  function measure(name, fn) {
    // Graceful degradation — very old browser without performance API
    if (!window.performance) {
      try { return fn(); }
      catch (e) { throw e; }
    }

    const t = performance.now();
    let r;

    try {
      r = fn();
    } catch (e) {
      // Sync throw — still log budget miss, then re-throw so caller handles it
      _check(name, performance.now() - t);
      throw e;
    }

    // RULE 27: async path — measure after Promise resolves or rejects
    if (r && typeof r.then === 'function') {
      return r.then(
        result => { _check(name, performance.now() - t); return result; },
        err    => { _check(name, performance.now() - t); return Promise.reject(err); }
      );
    }

    // Sync path — success
    _check(name, performance.now() - t);
    return r;
  }

  function _check(name, ms) {
    if (BUDGETS[name] && ms > BUDGETS[name]) {
      Logger.warn(`Perf budget exceeded: ${name}`, {
        budget: BUDGETS[name],
        actual: ms.toFixed(1),
      });
    }
  }

  /**
   * Report First Contentful Paint timing once.
   * Called once in LifeOS.init() — RULE 26.
   */
  function reportPaintTiming() {
    if (!window.performance?.getEntriesByType) return;
    requestAnimationFrame(() => {
      const entries = performance.getEntriesByType('paint');
      const fcp = entries.find(e => e.name === 'first-contentful-paint');
      if (fcp) Logger.info('FCP', { ms: fcp.startTime.toFixed(0) });
    });
  }

  return { measure, reportPaintTiming };
})();
