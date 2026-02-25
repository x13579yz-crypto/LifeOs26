// ═══════════════════════════════════════════════════════════════
// js/system/audio.js — LifeOS 26 v3.5.1
// Web Audio synthesis — no audio files needed.
// Depends on: Logger, EventBus
//
// RULE 44: NEVER new AudioContext() inline — only AudioModule.play()
// RULE 48: AudioContext availability checked before use
// ═══════════════════════════════════════════════════════════════

const AudioModule = (() => {
  let _ctx = null;

  // Sound definitions — frequency, duration, waveform, gain
  const SOUNDS = {
    bell:     { freq: 523.25, dur: 0.8,  type: 'sine',     gain: 0.4 },
    chime:    { freq: 659.25, dur: 0.5,  type: 'sine',     gain: 0.3 },
    complete: { freq: 783.99, dur: 0.3,  type: 'sine',     gain: 0.4 },
    habit:    { freq: 880.00, dur: 0.25, type: 'triangle', gain: 0.3 },
  };

  function _getCtx() {
    // RULE 48: check availability
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!_ctx || _ctx.state === 'closed') {
      try { _ctx = new AudioCtx(); }
      catch (e) { Logger.warn('AudioModule: context creation failed', e.message); return null; }
    }
    return _ctx;
  }

  function play(type) {
    const s   = SOUNDS[type] || SOUNDS.bell;
    const ctx = _getCtx();
    if (!ctx) return;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();

    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = s.freq;
      osc.type            = s.type;

      gain.gain.setValueAtTime(s.gain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s.dur);

      osc.start();
      osc.stop(ctx.currentTime + s.dur);
    } catch (e) {
      Logger.warn('AudioModule: play failed', { type, error: e.message });
    }
  }

  function init() {
    // Wire EventBus events → audio cues
    EventBus.on('habit:completed',           () => play('habit'));
    EventBus.on('study:session-complete',    () => play('complete'));
    EventBus.on('workout:rest-end',          () => play('chime'));
    EventBus.on('workout:session-complete',  () => play('bell'));
  }

  return { play, init };
})();
