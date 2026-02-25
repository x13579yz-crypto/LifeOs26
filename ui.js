// ═══════════════════════════════════════════════════════════════
// js/system/ui.js — LifeOS 26 v3.5.1
// UI utilities: toasts, modals, section visibility, splash, offline.
// Depends on: Logger, EventBus, Accessibility
//
// RULE 43: NEVER window.confirm() — only UI.showConfirmModal()
// RULE 67: display:none/block for sections
// RULE 20: --text-muted NEVER for interactive/info text
// ═══════════════════════════════════════════════════════════════

const UI = (() => {
  let _toastContainer      = null;
  let _activeModal         = null;
  let _activeModalTeardown = null; // cleanup fn: releaseTrap + unsubEscape

  // ── Toast ─────────────────────────────────────────────────────

  /**
   * Show a toast notification.
   * @param {string} message  - text content
   * @param {string} type     - 'success' | 'error' | 'warning' | 'info'
   * @param {number} duration - ms before auto-dismiss (default 3000)
   */
  function showToast(message, type = 'info', duration = 3000) {
    _ensureToastContainer();

    const toast = document.createElement('div');
    toast.className  = `toast toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    _toastContainer.appendChild(toast);

    // Auto-dismiss
    const dismissTimer = setTimeout(() => _dismissToast(toast), duration);

    // Tap to dismiss early
    toast.addEventListener('click', () => {
      clearTimeout(dismissTimer);
      _dismissToast(toast);
    });
  }

  function _dismissToast(toast) {
    if (!toast.parentNode) return; // already removed
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    // Fallback if animation doesn't fire
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
  }

  function _ensureToastContainer() {
    if (_toastContainer && document.body.contains(_toastContainer)) return;
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'toast-container';
    document.body.appendChild(_toastContainer);
  }

  // ── Confirm Modal ─────────────────────────────────────────────

  /**
   * RULE 43: Use this instead of window.confirm().
   * @param {string}   message    - question text
   * @param {Function} onConfirm  - called if user confirms
   * @param {Function} [onCancel] - called if user cancels
   */
  function showConfirmModal(message, onConfirm, onCancel) {
    _closeActiveModal(); // ensure no stacked modals

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Confirm action');

    overlay.innerHTML = `
      <div class="modal-box" role="document">
        <div class="modal-title">${message}</div>
        <div class="modal-actions">
          <button class="btn-secondary modal-cancel">Cancel</button>
          <button class="btn-danger   modal-confirm">Confirm</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _activeModal = overlay;

    const releaseTrap = Accessibility.trapFocus(overlay);
    let unsubEscape;

    function _close(confirmed) {
      if (typeof unsubEscape === 'function') unsubEscape();
      releaseTrap();
      Accessibility.releaseFocus();
      overlay.remove();
      _activeModal = null;
      _activeModalTeardown = null;
      if (confirmed && typeof onConfirm === 'function') onConfirm();
      if (!confirmed && typeof onCancel === 'function') onCancel();
    }

    overlay.querySelector('.modal-confirm').addEventListener('click', () => _close(true));
    overlay.querySelector('.modal-cancel').addEventListener('click',  () => _close(false));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) _close(false);
    });

    // RULE 19: Escape key handled inside trapFocus via EventBus
    unsubEscape = EventBus.on('ui:modal-close', () => _close(false));

    // Stacking guard — store cleanup so _closeActiveModal() fully teardowns
    _activeModalTeardown = () => { releaseTrap(); if (typeof unsubEscape === 'function') unsubEscape(); };
  }

  /**
   * Show a simple info/alert modal (no confirm/cancel — just dismiss).
   */
  function showAlertModal(message, title = 'Notice') {
    _closeActiveModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    overlay.innerHTML = `
      <div class="modal-box" role="document">
        <div class="modal-title">${title}</div>
        <p class="modal-message">${message}</p>
        <button class="btn-primary modal-ok">OK</button>
      </div>`;

    document.body.appendChild(overlay);
    _activeModal = overlay;

    const releaseTrap = Accessibility.trapFocus(overlay);
    let unsubEscape;

    function _close() {
      if (typeof unsubEscape === 'function') unsubEscape();
      releaseTrap();
      Accessibility.releaseFocus();
      overlay.remove();
      _activeModal = null;
      _activeModalTeardown = null;
    }

    overlay.querySelector('.modal-ok').addEventListener('click', _close);
    overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

    unsubEscape = EventBus.on('ui:modal-close', () => _close());

    // Stacking guard — store cleanup so _closeActiveModal() fully teardowns
    _activeModalTeardown = () => { releaseTrap(); if (typeof unsubEscape === 'function') unsubEscape(); };
  }

  function _closeActiveModal() {
    if (_activeModalTeardown) {
      try { _activeModalTeardown(); } catch {}
      _activeModalTeardown = null;
    }
    if (_activeModal && document.body.contains(_activeModal)) {
      _activeModal.remove();
      _activeModal = null;
    }
  }

  // ── Section Visibility ────────────────────────────────────────

  /**
   * Show a section — remove hidden, add .section-active.
   * RULE 67: display:none/block (via class in CSS, not inline style).
   */
  function showSection(sectionId) {
    const el = document.getElementById(`section-${sectionId}`);
    if (!el) return Logger.warn(`UI.showSection: not found: section-${sectionId}`);
    el.hidden = false;
    // Force reflow so animation restarts (remove + re-add class)
    el.classList.remove('section-active');
    void el.offsetHeight; // trigger reflow
    el.classList.add('section-active');
  }

  /**
   * Hide a section — add hidden, remove .section-active.
   */
  function hideSection(sectionId) {
    const el = document.getElementById(`section-${sectionId}`);
    if (!el) return;
    el.classList.remove('section-active');
    el.hidden = true;
  }

  /** Hide all sections (used during init before first navigate). */
  function hideAllSections() {
    document.querySelectorAll('section[role="region"]').forEach(el => {
      el.classList.remove('section-active');
      el.hidden = true;
    });
  }

  // ── Section Error State ───────────────────────────────────────

  /**
   * RULE 11: Called by SectionLifecycle.mount() on section crash.
   * Renders a user-friendly error inside the crashed section.
   */
  function renderSectionError(sectionId, errorMessage) {
    const el = document.getElementById(`section-${sectionId}`);
    if (!el) return;
    el.innerHTML = `
      <div class="section-error glass-card">
        <div class="section-error-icon">⚠️</div>
        <div class="section-error-title">Section failed to load</div>
        <div class="section-error-body">${sectionId}: ${errorMessage || 'Unknown error'}</div>
        <button class="btn-secondary section-error-reload">Reload App</button>
      </div>`;
    el.querySelector('.section-error-reload')
      .addEventListener('click', () => location.reload());
    Logger.error(`UI: section error rendered [${sectionId}]`, errorMessage);
  }

  // ── Splash Screen ─────────────────────────────────────────────

  /** Show splash — called at start of LifeOS.init() */
  function showSplash() {
    const el = document.getElementById('splash-screen');
    if (el) { el.hidden = false; el.classList.remove('hiding'); }
  }

  /**
   * Hide splash — fades out then removes from layout flow.
   * Keeps DOM node so CSS transition plays.
   */
  function hideSplash() {
    const el = document.getElementById('splash-screen');
    if (!el) return;
    el.classList.add('hiding');
    el.addEventListener('transitionend', () => {
      el.hidden = true; // hidden attr handles display — no inline style needed
    }, { once: true });
    // Fallback if transition doesn't fire (prefers-reduced-motion)
    setTimeout(() => {
      if (!el.hidden) { el.hidden = true; }
    }, 600);
  }

  // ── Offline Banner ────────────────────────────────────────────

  function showOfflineBanner() {
    const el = document.getElementById('offline-banner');
    if (el) el.hidden = false;
  }

  function hideOfflineBanner() {
    const el = document.getElementById('offline-banner');
    if (el) el.hidden = true;
  }

  // ── Theme ─────────────────────────────────────────────────────

  /**
   * Apply theme to document body.
   * @param {string} theme - 'dark' | 'light'
   */
  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    EventBus.emit('theme:changed', { theme });
    Logger.info('UI: theme applied', { theme });
  }

  // ── Undo Toast ────────────────────────────────────────────────

  /**
   * Show a toast with an Undo button.
   * RULE 55: 5-second undo window, EventBus driven.
   * @param {string}   message - e.g. "Habit deleted"
   * @param {Function} undoFn  - called if user taps Undo
   */
  function showUndoToast(message, undoFn) {
    _ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = 'toast toast--info toast--undo';
    toast.innerHTML = `
      <span>${message}</span>
      <button class="btn-ghost toast-undo-btn">Undo</button>`;

    _toastContainer.appendChild(toast);

    let undone = false;

    const timer = setTimeout(() => {
      _dismissToast(toast);
    }, 5000);

    toast.querySelector('button').addEventListener('click', () => {
      if (undone) return;
      undone = true;
      clearTimeout(timer);
      _dismissToast(toast);
      if (typeof undoFn === 'function') undoFn();
    });

    EventBus.emit('ui:undo-available', { undoFn });
  }

  return {
    showToast, showConfirmModal, showAlertModal,
    showSection, hideSection, hideAllSections,
    renderSectionError,
    showSplash, hideSplash,
    showOfflineBanner, hideOfflineBanner,
    applyTheme, showUndoToast,
  };
})();
