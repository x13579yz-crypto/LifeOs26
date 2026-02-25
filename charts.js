// ═══════════════════════════════════════════════════════════════
// js/system/charts.js — LifeOS 26 v3.5.1
// Canvas chart renderer with rAF animation + ResizeObserver.
// Depends on: Logger
//
// RULE 45: NEVER start canvas animation without ChartModule.draw()
// RULE 50: Always devicePixelRatio scaling
// RULE 80: ChartModule.remove(canvasId) MUST be called in section cleanup
// FIX 5 (v3.5.1): cancelAll() also called by SectionLifecycle.unmount()
// ═══════════════════════════════════════════════════════════════

const ChartModule = (() => {
  const _frames   = {};        // canvasId → rAF handle
  const _active   = new Map(); // canvasId → renderFn
  const _observed = new Map(); // canvasId → observed element (stable ref for unobserve)
  let   _ro       = null;      // shared ResizeObserver

  /**
   * Draw a chart on a canvas element.
   * renderFn(ctx, W, H, ease) — called each animation frame.
   * ease goes 0→1 with easeInOut curve.
   *
   * @param {string}   canvasId  - id of <canvas> element
   * @param {Function} renderFn  - draw function
   */
  function draw(canvasId, renderFn) {
    // Cancel any existing animation on this canvas
    if (_frames[canvasId]) {
      cancelAnimationFrame(_frames[canvasId]);
      delete _frames[canvasId];
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return Logger.warn(`ChartModule: canvas not found: ${canvasId}`);

    _active.set(canvasId, renderFn);
    _animate(canvas, renderFn);

    // Shared ResizeObserver — re-renders all active charts on resize
    if (!_ro) {
      _ro = new ResizeObserver(() => {
        _active.forEach((fn, id) => {
          const c = document.getElementById(id);
          if (c) _animate(c, fn);
        });
      });
    }
    const _observeTarget = canvas.parentElement || canvas;
    _observed.set(canvasId, _observeTarget);
    _ro.observe(_observeTarget);
  }

  /**
   * RULE 80: Call this in section cleanup for every chart.
   * Cancels animation, removes from active map, unobserves resize.
   */
  function remove(canvasId) {
    if (_frames[canvasId]) {
      cancelAnimationFrame(_frames[canvasId]);
      delete _frames[canvasId];
    }
    _active.delete(canvasId);
    const _observeTarget = _observed.get(canvasId);
    if (_observeTarget && _ro) _ro.unobserve(_observeTarget);
    _observed.delete(canvasId);
  }

  /**
   * FIX 5 (v3.5.1): Cancel ALL active charts.
   * Called by SectionLifecycle.unmount() as safety net.
   */
  function cancelAll() {
    Object.keys(_frames).forEach(id => {
      cancelAnimationFrame(_frames[id]);
      delete _frames[id];
    });
    if (_ro) { _ro.disconnect(); _ro = null; }
    _active.clear();
    _observed.clear();
  }

  // ── Internal animation loop ───────────────────────────────────

  function _animate(canvas, renderFn) {
    const id = canvas.id;

    // Cancel previous frame for this canvas
    if (_frames[id]) cancelAnimationFrame(_frames[id]);

    // RULE 50: devicePixelRatio scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;

    // Skip zero-size canvas (hidden elements)
    if (W === 0 || H === 0) return;

    let t = 0;

    const frame = () => {
      t = Math.min(t + 0.03, 1);
      // easeInOut curve
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      ctx.clearRect(0, 0, W, H);

      try {
        renderFn(ctx, W, H, ease);
      } catch (e) {
        Logger.error(`ChartModule: renderFn error [${id}]`, e);
        cancelAnimationFrame(_frames[id]);
        delete _frames[id];
        return;
      }

      if (t < 1) {
        _frames[id] = requestAnimationFrame(frame);
      } else {
        delete _frames[id];
      }
    };

    _frames[id] = requestAnimationFrame(frame);
  }

  // ── Drawing Helpers ───────────────────────────────────────────

  /**
   * Draw a rounded-top bar (for bar charts).
   * h <= 0 is safely skipped.
   */
  function roundedBar(ctx, x, y, w, h, r = 4) {
    if (h <= 0) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x,     y + h);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /**
   * Create a vertical linear gradient from a hex color.
   * Falls back gracefully on invalid hex.
   */
  function gradient(ctx, x1, y1, x2, y2, colorHex, alpha = 0.8) {
    const hex = (colorHex || '').replace('#', '');
    const g   = ctx.createLinearGradient(x1, y1, x2, y2);

    if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) {
      // Fallback — opaque blue-ish
      g.addColorStop(0, `rgba(77,159,255,${alpha})`);
      g.addColorStop(1, 'rgba(77,159,255,0)');
      return g;
    }

    const r  = parseInt(hex.slice(0, 2), 16);
    const gv = parseInt(hex.slice(2, 4), 16);
    const b  = parseInt(hex.slice(4, 6), 16);

    g.addColorStop(0, `rgba(${r},${gv},${b},${alpha})`);
    g.addColorStop(1, `rgba(${r},${gv},${b},0)`);
    return g;
  }

  return { draw, remove, cancelAll, roundedBar, gradient };
})();
