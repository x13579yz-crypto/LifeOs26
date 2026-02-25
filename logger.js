// ═══════════════════════════════════════════════════════════════
// js/foundation/logger.js — LifeOS 26 v3.5.1
// Circular ring buffer log. DEBUG_MODE = false before ship.
// No dependencies. IIFE pattern.
// ═══════════════════════════════════════════════════════════════

const Logger = (() => {
  let DEBUG_MODE = false; // RULE 53: false before shipping — non-negotiable
  const _log = [];
  const MAX  = 200;

  function _write(level, msg, data) {
    const entry = { ts: Date.now(), level, msg, data: data ?? null };
    _log.push(entry);
    if (_log.length > MAX) _log.shift(); // ring buffer — never grows unbounded

    if (level === 'error') {
      console.error(`[LifeOS] ${msg}`, data ?? '');
    } else if (DEBUG_MODE) {
      if (level === 'warn')  console.warn(`[LifeOS] ${msg}`, data ?? '');
      if (level === 'info')  console.info(`[LifeOS] ${msg}`, data ?? '');
    }
  }

  return {
    info:     (m, d) => _write('info',  m, d),
    warn:     (m, d) => _write('warn',  m, d),
    error:    (m, d) => _write('error', m, d),
    dump:     ()     => JSON.stringify(_log, null, 2),
    setDebug: v      => { DEBUG_MODE = Boolean(v); },
  };
})();
