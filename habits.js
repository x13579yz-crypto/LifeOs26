// js/sections/habits.js
// HabitsModule — LifeOS 26 v3.5.3
// Part 7 — Sections Layer
// Exports: mount(onCleanup)
// Guardrails: G1 G3 G6 G7 enforced
// Notes = memory layer ONLY — strictly isolated from habits/analytics

const HabitsModule = (() => {

  // ─── UUID helper ──────────────────────────────────────────────────────────────
  function _uid() { return String(Date.now()) + '_' + Math.random().toString(36).slice(2, 9); }

  // ─── Date helpers ─────────────────────────────────────────────────────────────
  function _todayStr() { return new Date().toISOString().slice(0, 10); }

  // ─── Habit helpers ────────────────────────────────────────────────────────────

  function _renderHabitHistory(habit) {
    // Last 14 days mini-calendar
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i));
      const ds = d.toISOString().slice(0, 10);
      const done = (habit.history || []).some(e => e.date === ds && e.completed);
      return `<div class="habit-hist-dot${done ? ' habit-hist-dot--done' : ''}" title="${ds}"></div>`;
    }).join('');
  }

  function _habitHTML(habit) {
    return `
      <div class="glass-card habit-card spring-tap" data-id="${habit.id}">
        <div class="habit-card-main">
          <div class="habit-card-left">
            <button class="habit-complete-btn${habit.completedToday ? ' habit-complete-btn--done' : ''}"
              data-id="${habit.id}" aria-label="${habit.completedToday ? 'Mark incomplete' : 'Mark complete'} ${habit.name}"
              aria-pressed="${habit.completedToday}">
              ${habit.completedToday ? '✅' : '⬜'}
            </button>
            <div class="habit-info">
              <div class="habit-name">${habit.emoji || '✅'} ${habit.name}</div>
              <div class="habit-meta">${habit.category} · ${habit.frequency}</div>
            </div>
          </div>
          <div class="habit-card-right">
            <div class="streak-badge">🔥 ${habit.streak || 0}</div>
            <button class="btn-ghost habit-edit-btn spring-tap" data-id="${habit.id}" aria-label="Edit ${habit.name}">✏️</button>
            <button class="btn-ghost habit-del-btn spring-tap" data-id="${habit.id}" aria-label="Delete ${habit.name}">🗑️</button>
          </div>
        </div>
        <div class="habit-hist-row">${_renderHabitHistory(habit)}</div>
      </div>
    `;
  }

  // ─── Notes helpers ────────────────────────────────────────────────────────────

  function _noteHTML(note) {
    const isChecklist = note.type === 'checklist';
    const items       = note.items || [];
    const done        = items.filter(i => i.checked);
    const undone      = items.filter(i => !i.checked);
    const ordered     = [...undone, ...done]; // G7: checked items always at bottom

    return `
      <div class="glass-card note-card" data-id="${note.id}" data-type="${note.type}">
        <div class="note-card-header">
          <input class="note-title-input" type="text" value="${note.title || ''}"
            placeholder="${isChecklist ? 'Checklist title…' : 'Note title…'}"
            data-id="${note.id}" aria-label="Note title">
          <div class="note-card-actions">
            <button class="btn-ghost note-move-up spring-tap" data-id="${note.id}" aria-label="Move up">↑</button>
            <button class="btn-ghost note-move-down spring-tap" data-id="${note.id}" aria-label="Move down">↓</button>
            <button class="btn-ghost note-delete-btn spring-tap" data-id="${note.id}" aria-label="Delete note">🗑️</button>
          </div>
        </div>

        ${isChecklist ? `
          <div class="note-checklist" data-id="${note.id}">
            ${ordered.map(item => `
              <div class="note-check-item" data-note="${note.id}" data-item="${item.id}">
                <button class="note-check-toggle${item.checked ? ' note-check-toggle--done' : ''}"
                  data-note="${note.id}" data-item="${item.id}"
                  aria-label="${item.checked ? 'Uncheck' : 'Check'} item"
                  aria-pressed="${item.checked}">
                  ${item.checked ? '☑️' : '☐'}
                </button>
                <span class="note-check-text${item.checked ? ' note-check-text--done' : ''}">${item.text}</span>
                <button class="btn-ghost note-item-del spring-tap" data-note="${note.id}" data-item="${item.id}" aria-label="Delete item">✕</button>
              </div>
            `).join('')}
            ${done.length > 0 ? `
              <button class="btn-ghost note-collapse-btn spring-tap" data-id="${note.id}">
                ${note.collapsed ? `Show ${done.length} checked` : `Hide ${done.length} checked`}
              </button>
            ` : ''}
            <div class="note-add-item-row">
              <input class="note-add-item-input" type="text" placeholder="Add item…"
                data-note="${note.id}" aria-label="Add checklist item">
              <button class="btn-secondary note-add-item-btn spring-tap" data-note="${note.id}">+</button>
            </div>
          </div>
        ` : `
          <textarea class="note-body-input" rows="4"
            placeholder="Write your note…"
            data-id="${note.id}" aria-label="Note body">${note.body || ''}</textarea>
        `}
      </div>
    `;
  }

  // ─── Debounce ─────────────────────────────────────────────────────────────────

  function _debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────

  function mount(onCleanup) {
    const section = document.getElementById('section-habits');
    if (!section) return;

    let activeTab = 'habits'; // 'habits' | 'notes'
    let fabOpen   = false;
    let undoTimer = null;
    let undoHabit = null;

    function _render() {
      // G3: read from Store — never mutate
      const habits = Store.get('habits') || [];
      const notes  = Store.get('notes')  || [];

      section.innerHTML = `<div class="section-content">

        <!-- Tab switcher -->
        <div class="tab-switcher">
          <button class="tab-switcher-btn${activeTab === 'habits' ? ' active' : ''}" data-tab="habits">✅ Habits</button>
          <button class="tab-switcher-btn${activeTab === 'notes'  ? ' active' : ''}" data-tab="notes">📝 Notes</button>
        </div>

        <!-- HABITS TAB -->
        <div id="tab-habits" ${activeTab !== 'habits' ? 'hidden' : ''}>
          ${habits.length === 0 ? `
            <div class="glass-card habits-empty-card">
              <div class="habits-empty-icon">🌱</div>
              <div class="habits-empty-title">No habits yet</div>
              <div class="habits-empty-sub">Build your first daily habit to start your streak.</div>
              <button class="btn-primary spring-tap" id="habit-add-first-btn">+ Add Habit</button>
            </div>
          ` : `
            <div class="card-stack" id="habits-list">
              ${habits.map(_habitHTML).join('')}
            </div>
            <button class="btn-primary habits-add-btn spring-tap" id="habit-add-btn">+ Add Habit</button>
          `}
        </div>

        <!-- NOTES TAB -->
        <div id="tab-notes" ${activeTab !== 'notes' ? 'hidden' : ''}>
          ${notes.length === 0 ? `
            <div class="glass-card notes-empty-card">
              <div class="notes-empty-icon">📝</div>
              <div class="notes-empty-title">No notes yet</div>
              <div class="notes-empty-sub">Tap the + button to create your first note.</div>
            </div>
          ` : `
            <div class="card-stack" id="notes-list">
              ${notes.map(_noteHTML).join('')}
            </div>
          `}
        </div>

        <!-- FAB (Notes) -->
        <div class="fab-options" id="fab-options">
          <button class="fab-option spring-tap" id="fab-add-checklist">☑️ List</button>
          <button class="fab-option spring-tap" id="fab-add-text">📝 Text</button>
        </div>
        <button class="fab-btn spring-tap${fabOpen ? ' open' : ''}" id="habits-fab" aria-label="Add note" aria-expanded="${fabOpen}">
          ${fabOpen ? '×' : '+'}
        </button>

      </div>`;

      _wireEvents();
    }

    // ─── Wire all events after render ──────────────────────────────────────────

    function _wireEvents() {
      const cont = section;

      // ── Tab switcher ──────────────────────────────────────────────────────────
      const tabSwitcher = cont.querySelector('.tab-switcher');
      if (tabSwitcher) {
        tabSwitcher.addEventListener('click', e => {
          const btn = e.target.closest('[data-tab]');
          if (!btn) return;
          activeTab = btn.dataset.tab;
          // Show/hide FAB based on tab
          const fab = document.getElementById('habits-fab');
          if (fab) fab.hidden = activeTab !== 'notes';
          const fabOpts = document.getElementById('fab-options');
          if (fabOpts) fabOpts.hidden = activeTab !== 'notes';
          _render();
        });
      }

      // ── FAB ───────────────────────────────────────────────────────────────────
      const fab = document.getElementById('habits-fab');
      if (fab) {
        fab.hidden = activeTab !== 'notes';
        fab.addEventListener('click', () => {
          fabOpen = !fabOpen;
          const opts = document.getElementById('fab-options');
          if (opts) opts.classList.toggle('visible', fabOpen);
          fab.textContent = fabOpen ? '×' : '+';
          fab.setAttribute('aria-expanded', fabOpen);
        });
      }

      // Tap outside to close FAB
      const outsideHandler = e => {
        if (!e.target.closest('.fab-btn') && !e.target.closest('.fab-options')) {
          fabOpen = false;
          const fab2 = document.getElementById('habits-fab');
          const opts  = document.getElementById('fab-options');
          if (fab2) { fab2.textContent = '+'; fab2.setAttribute('aria-expanded', false); }
          if (opts)  opts.classList.remove('visible');
        }
      };
      document.addEventListener('click', outsideHandler);
      onCleanup(() => document.removeEventListener('click', outsideHandler));

      // FAB: Add text note
      const fabText = document.getElementById('fab-add-text');
      if (fabText) {
        fabText.addEventListener('click', () => {
          _addNote('text');
          fabOpen = false;
        });
      }

      // FAB: Add checklist
      const fabChecklist = document.getElementById('fab-add-checklist');
      if (fabChecklist) {
        fabChecklist.addEventListener('click', () => {
          _addNote('checklist');
          fabOpen = false;
        });
      }

      // ── Habits list events (delegation) ───────────────────────────────────────
      const habitsList = document.getElementById('habits-list') || cont.querySelector('#tab-habits');
      if (habitsList) {
        habitsList.addEventListener('click', e => {
          // Complete toggle
          const completeBtn = e.target.closest('.habit-complete-btn');
          if (completeBtn) { _toggleComplete(completeBtn.dataset.id); return; }

          // Edit
          const editBtn = e.target.closest('.habit-edit-btn');
          if (editBtn) { _editHabit(editBtn.dataset.id); return; }

          // Delete
          const delBtn = e.target.closest('.habit-del-btn');
          if (delBtn) { _deleteHabit(delBtn.dataset.id); return; }

          // Add habit buttons
          if (e.target.id === 'habit-add-btn' || e.target.id === 'habit-add-first-btn') {
            _showAddHabitForm();
          }
        });
      }

      // ── Notes list events (delegation) ────────────────────────────────────────
      const notesList = document.getElementById('notes-list') || cont.querySelector('#tab-notes');
      if (notesList) {
        // Delete note
        notesList.addEventListener('click', e => {
          if (e.target.closest('.note-delete-btn')) {
            const id = e.target.closest('.note-delete-btn').dataset.id;
            UI.showConfirmModal('Delete this note?', () => _deleteNote(id), () => {});
            return;
          }
          // Check item toggle
          const toggleBtn = e.target.closest('.note-check-toggle');
          if (toggleBtn) { _toggleCheckItem(toggleBtn.dataset.note, toggleBtn.dataset.item); return; }

          // Delete item
          const itemDel = e.target.closest('.note-item-del');
          if (itemDel) { _deleteCheckItem(itemDel.dataset.note, itemDel.dataset.item); return; }

          // Move up/down
          const upBtn = e.target.closest('.note-move-up');
          if (upBtn) { _moveNote(upBtn.dataset.id, -1); return; }
          const downBtn = e.target.closest('.note-move-down');
          if (downBtn) { _moveNote(downBtn.dataset.id, 1); return; }

          // Add checklist item via + button
          const addItemBtn = e.target.closest('.note-add-item-btn');
          if (addItemBtn) { _addCheckItem(addItemBtn.dataset.note); return; }

          // Collapse toggle
          const collapseBtn = e.target.closest('.note-collapse-btn');
          if (collapseBtn) { _toggleCollapse(collapseBtn.dataset.id); return; }
        });

        // Title auto-save (debounced) — defined once outside handler (G perf guardrail)
        const debouncedTitleSave = _debounce((noteId, val) => {
          const notes   = Store.get('notes') || [];
          const updated = notes.map(n => n.id === noteId ? { ...n, title: val } : n);
          Store.set('notes', updated);
        }, 600);

        // Body auto-save (debounced) — defined once outside handler, NOT recreated per event
        const debouncedBodySave = _debounce((noteId, val) => {
          const notes   = Store.get('notes') || [];
          const updated = notes.map(n => n.id === noteId ? { ...n, body: val } : n);
          Store.set('notes', updated);
        }, 600);

        notesList.addEventListener('input', e => {
          // Title input
          if (e.target.classList.contains('note-title-input')) {
            debouncedTitleSave(e.target.dataset.id, e.target.value);
            return;
          }
          // Body textarea
          if (e.target.classList.contains('note-body-input')) {
            debouncedBodySave(e.target.dataset.id, e.target.value);
            return;
          }
          // Add item input — Enter key
        });

        notesList.addEventListener('keydown', e => {
          if (e.key === 'Enter' && e.target.classList.contains('note-add-item-input')) {
            const noteId = e.target.dataset.note;
            _addCheckItem(noteId, e.target.value);
            e.target.value = '';
            e.preventDefault();
          }
        });
      }
    }

    // ─── Habit actions ────────────────────────────────────────────────────────────

    function _toggleComplete(habitId) {
      // G3: Store.update for partial mutation
      const habits = Store.get('habits') || [];
      const idx    = habits.findIndex(h => h.id === habitId);
      if (idx === -1) return;

      // G3: deep-enough clone — history array explicitly spread so nested mutations
      // in future code cannot leak back into the Store reference (future-proof G3)
      const habit = {
        ...habits[idx],
        history: [...(habits[idx].history || [])],
      };
      const today   = _todayStr();
      const wasComplete = habit.completedToday;

      habit.completedToday = !wasComplete;

      if (!wasComplete) {
        // Completing
        habit.streak = (habit.streak || 0) + 1;
        habit.longestStreak = Math.max(habit.longestStreak || 0, habit.streak);
        // Add today to history if not already there
        const alreadyLogged = (habit.history || []).some(e => e.date === today);
        if (!alreadyLogged) {
          habit.history = [...(habit.history || []), { date: today, completed: true }];
          // History cap: max 365 entries
          if (habit.history.length > 365) habit.history = habit.history.slice(-365);
        }
        EventBus.emit('habit:completed', { habitId, streak: habit.streak });
        AudioModule.play('habit');
        UI.showToast(`🔥 ${habit.name} — streak ${habit.streak}!`, 'success', 2000);
      } else {
        // Uncompleting
        habit.streak = Math.max(0, (habit.streak || 0) - 1);
        habit.history = (habit.history || []).filter(e => e.date !== today);
      }

      // G3: build new array — no in-place mutation
      const updated = [...habits];
      updated[idx]  = habit;
      Store.set('habits', updated);
      _render();
    }

    function _deleteHabit(habitId) {
      const habits  = Store.get('habits') || [];
      const habit   = habits.find(h => h.id === habitId);
      if (!habit) return;

      // Undo: 5 second window
      undoHabit = habit;
      Store.set('habits', habits.filter(h => h.id !== habitId));
      EventBus.emit('ui:undo-available', { type: 'habit', id: habitId });

      UI.showToast(`Deleted "${habit.name}" — `, 'warning', 5000, {
        undoLabel: 'Undo',
        onUndo: () => {
          clearTimeout(undoTimer);
          const current = Store.get('habits') || [];
          current.unshift(undoHabit);
          Store.set('habits', current);
          undoHabit = null;
          _render();
        },
      });

      undoTimer = setTimeout(() => { undoHabit = null; }, 5000);
      _render();
    }

    function _editHabit(habitId) {
      const habits = Store.get('habits') || [];
      const habit  = habits.find(h => h.id === habitId);
      if (!habit) return;

      const section = document.getElementById('section-habits');
      const modal   = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">Edit Habit</div>
          <input id="edit-habit-name"  type="text"   value="${habit.name}"     placeholder="Name"   aria-label="Habit name">
          <input id="edit-habit-emoji" type="text"   value="${habit.emoji || '✅'}" placeholder="Emoji" aria-label="Emoji" maxlength="2" class="modal-emoji-input">
          <select id="edit-habit-cat" aria-label="Category" class="modal-select">
            ${['health','productivity','fitness','learning','mindfulness','other']
              .map(c => `<option value="${c}"${habit.category === c ? ' selected' : ''}>${c}</option>`).join('')}
          </select>
          <select id="edit-habit-freq" aria-label="Frequency" class="modal-select">
            ${['daily','weekdays','weekends','custom']
              .map(f => `<option value="${f}"${habit.frequency === f ? ' selected' : ''}>${f}</option>`).join('')}
          </select>
          <div class="modal-actions">
            <button class="btn-secondary spring-tap" id="edit-cancel">Cancel</button>
            <button class="btn-primary spring-tap" id="edit-save">Save</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      Accessibility.trapFocus(modal.querySelector('.modal-box'));

      document.getElementById('edit-cancel').onclick = () => { modal.remove(); Accessibility.releaseFocus(); };
      document.getElementById('edit-save').onclick = () => {
        const name  = document.getElementById('edit-habit-name').value.trim();
        const emoji = document.getElementById('edit-habit-emoji').value.trim() || '✅';
        const cat   = document.getElementById('edit-habit-cat').value;
        const freq  = document.getElementById('edit-habit-freq').value;
        if (!name) { UI.showToast('Name cannot be empty.', 'error'); return; }
        const updated = (Store.get('habits') || []).map(h =>
          h.id === habitId ? { ...h, name, emoji, category: cat, frequency: freq } : h
        );
        Store.set('habits', updated);
        modal.remove();
        Accessibility.releaseFocus();
        _render();
      };
    }

    function _showAddHabitForm() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">New Habit</div>
          <input id="new-habit-name"  type="text"  placeholder="Habit name…" aria-label="Habit name" autocomplete="off">
          <input id="new-habit-emoji" type="text"  placeholder="Emoji" aria-label="Emoji" maxlength="2" value="✅" class="modal-emoji-input">
          <select id="new-habit-cat" aria-label="Category" class="modal-select">
            ${['health','productivity','fitness','learning','mindfulness','other']
              .map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <select id="new-habit-freq" aria-label="Frequency" class="modal-select">
            ${['daily','weekdays','weekends'].map(f => `<option value="${f}">${f}</option>`).join('')}
          </select>
          <div class="modal-actions">
            <button class="btn-secondary spring-tap" id="new-habit-cancel">Cancel</button>
            <button class="btn-primary spring-tap" id="new-habit-save">Add</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('new-habit-name').focus();
      Accessibility.trapFocus(modal.querySelector('.modal-box'));

      document.getElementById('new-habit-cancel').onclick = () => { modal.remove(); Accessibility.releaseFocus(); };
      document.getElementById('new-habit-save').onclick = () => {
        const name  = document.getElementById('new-habit-name').value.trim();
        const emoji = document.getElementById('new-habit-emoji').value.trim() || '✅';
        const cat   = document.getElementById('new-habit-cat').value;
        const freq  = document.getElementById('new-habit-freq').value;
        if (!name) { UI.showToast('Name cannot be empty.', 'error'); return; }
        // G3: Read → push → set
        const habits = Store.get('habits') || [];
        habits.push({
          id: _uid(), name, emoji, category: cat, frequency: freq,
          streak: 0, longestStreak: 0, completedToday: false,
          history: [], createdAt: new Date().toISOString(), reminderTime: null, notes: [],
        });
        Store.set('habits', habits);
        modal.remove();
        Accessibility.releaseFocus();
        UI.showToast(`✅ "${name}" added!`, 'success', 2000);
        _render();
      };
    }

    // ─── Notes actions (G7: isolated — no habit/analytics side effects) ──────────

    function _addNote(type) {
      // G7: only touches 'notes' | G3: immutable — no in-place mutation
      const newNote = {
        id:        _uid(),
        type,
        title:     '',
        body:      type === 'text' ? '' : undefined,
        items:     type === 'checklist' ? [] : undefined,
        collapsed: false,
        createdAt: new Date().toISOString(),
      };
      const notes = Store.get('notes') || [];
      Store.set('notes', [newNote, ...notes]);
      _render();
    }

    function _deleteNote(noteId) {
      // G7: only touches 'notes' key
      const notes = Store.get('notes') || [];
      Store.set('notes', notes.filter(n => n.id !== noteId));
      _render();
    }

    function _moveNote(noteId, dir) {
      const notes = Store.get('notes') || [];
      const idx   = notes.findIndex(n => n.id === noteId);
      if (idx === -1) return;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= notes.length) return;
      const updated = [...notes];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      Store.set('notes', updated);
      _render();
    }

    function _toggleCheckItem(noteId, itemId) {
      // G7: only touches 'notes' | G3: immutable — no reference mutation
      const notes   = Store.get('notes') || [];
      const updated = notes.map(n =>
        n.id === noteId && n.items
          ? { ...n, items: n.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) }
          : n
      );
      Store.set('notes', updated);
      _render();
    }

    function _addCheckItem(noteId, textOverride) {
      const input = textOverride !== undefined
        ? textOverride
        : (section.querySelector(`.note-add-item-input[data-note="${noteId}"]`)?.value || '');
      const text = (input || '').trim();
      if (!text) return;
      // G7: only touches 'notes' | G3: immutable
      const notes   = Store.get('notes') || [];
      const updated = notes.map(n =>
        n.id === noteId
          ? { ...n, items: [...(n.items || []), { id: _uid(), text, checked: false }] }
          : n
      );
      Store.set('notes', updated);
      _render();
    }

    function _deleteCheckItem(noteId, itemId) {
      // G7: only touches 'notes' | G3: immutable
      const notes   = Store.get('notes') || [];
      const updated = notes.map(n =>
        n.id === noteId
          ? { ...n, items: (n.items || []).filter(i => i.id !== itemId) }
          : n
      );
      Store.set('notes', updated);
      _render();
    }

    function _toggleCollapse(noteId) {
      // G3: immutable — no reference mutation
      const notes   = Store.get('notes') || [];
      const updated = notes.map(n =>
        n.id === noteId ? { ...n, collapsed: !n.collapsed } : n
      );
      Store.set('notes', updated);
      _render();
    }

    // ── Initial render ───────────────────────────────────────────────────────────
    _render();

    // G1: Section cleanup — clear undo timer
    onCleanup(() => {
      if (undoTimer) clearTimeout(undoTimer);
    });
  }

  return { mount };

})();
