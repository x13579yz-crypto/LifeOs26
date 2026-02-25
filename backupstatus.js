// ═══════════════════════════════════════════════════════════════
// js/system/backupstatus.js — LifeOS 26 v3.5.1
// Backup status: shield icon + badge dot + modal warnings.
// Depends on: Logger, Store, EventBus, UI, DataProtection
//
// MASTER SPEC RULES:
//   71: SAFE(0-30d) / WARNING(31-60d) / CRITICAL(60+d)
//   72: pulse stops when Profile opened OR backup exported
//   73: WARNING modal dismissed per-day; CRITICAL cannot be permanently dismissed
//   74: silent auto-download PROHIBITED — user must click button
//   FIX 9 (v3.5.1): DOM selectors cached in init() — no repeated getElementById
// ═══════════════════════════════════════════════════════════════

const BackupStatus = (() => {
  let _sessionModalShown = false;

  // FIX 9A: cached DOM references — set in init()
  let _shieldEl = null;
  let _dotEl    = null;
  let _cardEl   = null;

  // ── Status Logic ──────────────────────────────────────────────

  function getDaysSinceBackup() {
    const settings = Store.get('settings');
    if (!settings.lastExportDate) return 999;
    return Math.floor((Date.now() - new Date(settings.lastExportDate)) / 86400000);
  }

  function getStatus() {
    const days = getDaysSinceBackup();
    if (days <= 30) return 'SAFE';
    if (days <= 60) return 'WARNING';
    return 'CRITICAL';
  }

  // ── Shield + Badge Rendering ──────────────────────────────────

  function updateShield() {
    const status = getStatus();
    const days   = getDaysSinceBackup();

    // FIX 9: use cached selectors; fallback if init() not yet called
    const shield = _shieldEl || document.getElementById('backup-shield-icon');
    const dot    = _dotEl    || document.getElementById('profile-badge-dot');
    const card   = _cardEl   || document.getElementById('backup-status-card');

    if (shield) {
      shield.setAttribute('data-status', status);
      shield.className = `backup-shield backup-shield--${status.toLowerCase()}`;
      shield.textContent = status === 'SAFE' ? '🛡️' : status === 'WARNING' ? '⚠️' : '🔺';
    }

    // Badge dot and pulse
    if (status === 'SAFE') {
      if (dot) dot.hidden = true;
      shield?.classList.remove('backup-pulse');
    } else if (status === 'WARNING') {
      if (dot) {
        dot.hidden = false;
        dot.style.background = 'var(--shield-warning)';
      }
      shield?.classList.remove('backup-pulse');
    } else { // CRITICAL
      if (dot) {
        dot.hidden = false;
        dot.style.background = 'var(--shield-critical)';
      }
      shield?.classList.add('backup-pulse');
    }

    if (card) _renderCard(card, status, days);
    EventBus.emit('backup:status-changed', { status, days });
  }

  // ── Backup Status Card ────────────────────────────────────────

  function _renderCard(card, status, days) {
    const msgs = {
      SAFE: {
        icon:  '🛡️',
        title: 'Backup Safe',
        color: 'var(--shield-safe)',
        body:  days === 999 ? 'No backup yet — export to protect your data' : `Last backup: ${days} day(s) ago`,
      },
      WARNING: {
        icon:  '⚠️',
        title: 'Backup Recommended',
        color: 'var(--shield-warning)',
        body:  `${days} days since last backup`,
      },
      CRITICAL: {
        icon:  '🔴',
        title: 'Backup Required',
        color: 'var(--shield-critical)',
        body:  `${days} days since last backup!`,
      },
    };

    const m = msgs[status];
    card.innerHTML = `
      <div class="glass-card backup-card backup-card--${status.toLowerCase()}">
        <div style="display:flex;align-items:center;gap:12px;padding:16px">
          <span style="font-size:24px">${m.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:${m.color}">${m.title}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px">${m.body}</div>
          </div>
          <button id="btn-download-backup" class="btn-primary" style="font-size:13px;padding:8px 14px;flex-shrink:0">
            Download Backup
          </button>
        </div>
      </div>`;

    // RULE 74: user must explicitly click — never auto-download
    document.getElementById('btn-download-backup')?.addEventListener('click', () => {
      DataProtection.exportJSON();
    });
  }

  // ── Backup Warning Modal ──────────────────────────────────────

  /**
   * RULE 73: WARNING modal dismissed per-day (not permanently).
   *          CRITICAL modal cannot be permanently dismissed.
   */
  function showBackupModal(status) {
    if (_sessionModalShown && status !== 'CRITICAL') return;

    if (status === 'WARNING') {
      // Per-day dismissal — check if already shown today
      const shownDate = localStorage.getItem('lifeos_backup_modal_date');
      const today     = new Date().toISOString().slice(0, 10);
      if (shownDate === today) return;
      localStorage.setItem('lifeos_backup_modal_date', today);
    }

    _sessionModalShown = true;

    const days    = getDaysSinceBackup();
    const isCrit  = status === 'CRITICAL';
    const title   = isCrit ? '🔴 Backup Required!' : '⚠️ Backup Recommended';
    const message = isCrit
      ? `It has been ${days} days since your last backup. Your data is at risk. Please download a backup now.`
      : `It has been ${days} days since your last backup. We recommend backing up monthly.`;

    UI.showConfirmModal(
      `<strong style="color:var(--${isCrit ? 'shield-critical' : 'shield-warning'})">${title}</strong><br><br>${message}`,
      () => DataProtection.exportJSON(), // confirm = download
      () => {}                           // cancel = dismiss (WARNING only — CRITICAL re-shows next session)
    );

    if (isCrit) {
      // RULE 73: CRITICAL resets so it shows again next session
      _sessionModalShown = false;
    }
  }

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    // FIX 9: cache DOM selectors once at init — no repeated getElementById per call
    _shieldEl = document.getElementById('backup-shield-icon');
    _dotEl    = document.getElementById('profile-badge-dot');
    _cardEl   = document.getElementById('backup-status-card');

    // Shield click → navigate to profile
    if (_shieldEl) {
      _shieldEl.addEventListener('click',  () => LifeOS.navigate('profile'));
      _shieldEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          LifeOS.navigate('profile');
        }
      });
    }

    updateShield();

    const days   = getDaysSinceBackup();
    const status = getStatus();
    if (days > 30) showBackupModal(status);

    // RULE 72: Stop pulse when Profile tab is opened
    EventBus.on('app:navigate', ({ to }) => {
      if (to === 'profile') {
        _shieldEl?.classList.remove('backup-pulse');
        // Re-cache card element — it's rendered fresh each time profile mounts
        _cardEl = document.getElementById('backup-status-card');
      }
    });

    // RULE 72: Re-update shield after export (pulse stops on SAFE)
    EventBus.on('data:exported', () => {
      setTimeout(() => {
        _cardEl = document.getElementById('backup-status-card'); // may have been re-rendered
        updateShield();
      }, 500);
    });

    Logger.info('BackupStatus ready', { status, days });
  }

  return { init, getStatus, getDaysSinceBackup, updateShield, showBackupModal };
})();
