// ═══════════════════════════════════════════════════════════════
// js/system/lifecycle.js — LifeOS 26 v3.5.1
// Section mount/unmount registry with cleanup tracking.
// Depends on: Logger, Perf, ChartModule, UI (for renderSectionError)
//
// RULE 3:  Section listeners registered in mount(onCleanup) with cleanup
// RULE 11: SectionLifecycle.mount() try/catch → UI.renderSectionError()
// FIX 3 (v3.5): getRegistrySize() exposed — runtime count enforced in LifeOS
// FIX 5 (v3.5.1): unmount() calls ChartModule.cancelAll() — zero leaked animations
// ═══════════════════════════════════════════════════════════════

const SectionLifecycle = (() => {
  // sectionId → { mountFn: Function, cleanups: Function[] }
  const _registry = new Map();

  /**
   * Register a section module.
   * Called once per section in LifeOS._registerAllSections().
   */
  function register(sectionId, mountFn) {
    _registry.set(sectionId, { mountFn, cleanups: [] });
  }

  /**
   * Mount a section — run its mountFn inside a Perf budget.
   * Any error → UI.renderSectionError() (RULE 11).
   */
  function mount(sectionId) {
    const entry = _registry.get(sectionId);
    if (!entry) return Logger.warn(`SectionLifecycle: not registered: ${sectionId}`);

    entry.cleanups = [];
    const onCleanup = fn => entry.cleanups.push(fn);

    try {
      Perf.measure('section-render', () => entry.mountFn(onCleanup));
    } catch (e) {
      Logger.error(`SectionLifecycle: mount failed: ${sectionId}`, e);
      UI.renderSectionError(sectionId, e.message);
    }
  }

  /**
   * Unmount a section — run all cleanup fns, then cancel charts.
   * FIX 5 (v3.5.1): ChartModule.cancelAll() ensures no leaked rAF or ResizeObserver
   * even if a section forgot to call ChartModule.remove() in its cleanup.
   */
  function unmount(sectionId) {
    const entry = _registry.get(sectionId);
    if (!entry) return;

    // Run each cleanup function individually — one failure must not block others
    entry.cleanups.forEach(fn => {
      try { fn(); }
      catch (e) { Logger.error(`SectionLifecycle: cleanup error [${sectionId}]`, e); }
    });
    entry.cleanups = [];

    // FIX 5: belt-and-suspenders — cancel any remaining chart animations
    ChartModule.cancelAll();
  }

  /**
   * FIX 3 (v3.5): Expose registry size for runtime integrity check.
   * LifeOS._registerAllSections() throws if count ≠ 7.
   */
  function getRegistrySize() {
    return _registry.size;
  }

  return { register, mount, unmount, getRegistrySize };
})();
