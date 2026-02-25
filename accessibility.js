// ═══════════════════════════════════════════════════════════════
// js/system/accessibility.js — LifeOS 26 v3.5.1
// Accessibility utilities: ARIA announcer, focus trap, font scale.
// Depends on: Logger, EventBus
//
// RULE 15: html lang="en" (set in index.html)
// RULE 18: aria-announcer live region (in index.html)
// RULE 19: Modals: focus trapped + Escape closes + focus returns
// RULE 23: Font size via --font-scale + applyFontScale() (v3.4 FIX — implemented)
// RULE 24: High contrast via data-contrast="high" attribute
// ═══════════════════════════════════════════════════════════════

const Accessibility = (() => {
  let _trapCleanup     = null; // current focus trap cleanup fn
  let _preTrapFocus    = null; // element to restore focus to after modal closes

  /**
   * Announce a message to screen readers via aria-live region.
   * @param {string} msg      - text to announce
   * @param {string} priority - 'polite' (default) or 'assertive'
   */
  function announce(msg, priority = 'polite') {
    const el = document.getElementById('aria-announcer');
    if (!el) return;
    el.setAttribute('aria-live', priority);
    // Clear first — browsers won't re-announce same text
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = msg; });
  }

  /**
   * Trap keyboard focus inside a container (modal pattern).
   * Escape key emits 'ui:modal-close'.
   * @param   {HTMLElement} container
   * @returns {Function}    cleanup fn — call when modal closes
   */
  function trapFocus(container) {
    const SEL = [
      'button:not([disabled])', '[href]',
      'input:not([disabled])', 'select', 'textarea',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusable = [...container.querySelectorAll(SEL)];
    if (!focusable.length) return () => {};

    _preTrapFocus = document.activeElement; // remember for restore

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    first.focus();

    const handler = e => {
      if (e.key === 'Escape') {
        EventBus.emit('ui:modal-close');
        return;
      }
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handler);

    _trapCleanup = () => container.removeEventListener('keydown', handler);
    return _trapCleanup;
  }

  /**
   * Release focus trap and restore focus to pre-modal element.
   * Call after modal is removed from DOM.
   */
  function releaseFocus() {
    if (_trapCleanup) {
      _trapCleanup();
      _trapCleanup = null;
    }
    // Return focus to element that opened the modal
    if (_preTrapFocus && typeof _preTrapFocus.focus === 'function') {
      _preTrapFocus.focus();
      _preTrapFocus = null;
    }
  }

  /**
   * Apply font scale — sets --font-scale CSS variable.
   * Valid values: 0.85 (S), 1.0 (M), 1.15 (L), 1.3 (XL)
   * RULE 23 (v3.4 FIX): fully implemented here.
   */
  function applyFontScale(scale) {
    const VALID = [0.85, 1.0, 1.15, 1.3];
    const s = VALID.includes(Number(scale)) ? Number(scale) : 1.0;
    document.documentElement.style.setProperty('--font-scale', s);
    Logger.info('Accessibility: font scale applied', { scale: s });
  }

  /**
   * Enable high contrast mode.
   * Adds data-contrast="high" to <html>.
   */
  function enableHighContrast() {
    document.documentElement.setAttribute('data-contrast', 'high');
    Logger.info('Accessibility: high contrast enabled');
  }

  /**
   * Disable high contrast mode.
   */
  function disableHighContrast() {
    document.documentElement.removeAttribute('data-contrast');
    Logger.info('Accessibility: high contrast disabled');
  }

  return { announce, trapFocus, releaseFocus, applyFontScale, enableHighContrast, disableHighContrast };
})();
