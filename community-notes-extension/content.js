(() => {
  // Prevent double injection
  if (document.getElementById('cn-root')) return;

  const PAGE_URL = window.location.origin + window.location.pathname;

  // ── Firestore helpers ────────────────────────────────────────────────────

  async function fetchNotes() {
    const res = await fetch(`${FB_FIRESTORE_URL}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'notes' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'url' },
              op: 'EQUAL',
              value: { stringValue: PAGE_URL }
            }
          },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit: 50
        }
      })
    });
    const rows = await res.json();
    return rows
      .filter(r => r.document)
      .map(r => {
        const f = r.document.fields;
        return {
          id: r.document.name,
          body: f.body?.stringValue || '',
          university: f.university?.stringValue || '?',
          email: f.email?.stringValue || '',
          createdAt: f.createdAt?.timestampValue || ''
        };
      });
  }

  async function postNote(body, user) {
    const res = await fetch(`${FB_FIRESTORE_URL}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.idToken}`
      },
      body: JSON.stringify({
        fields: {
          url:        { stringValue: PAGE_URL },
          body:       { stringValue: body },
          university: { stringValue: user.university },
          email:      { stringValue: user.email },
          createdAt:  { timestampValue: new Date().toISOString() }
        }
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to post note');
    }
    return res.json();
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function timeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function uniColor(uni) {
    const colors = [
      '#7c6af7','#4caf8a','#f7a74c','#f74c7c','#4cb8f7',
      '#a74cf7','#f7d74c','#4cf7a7','#f74c4c','#4c7cf7'
    ];
    let hash = 0;
    for (const c of uni) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  function renderNote(note) {
    const color = uniColor(note.university);
    const div = document.createElement('div');
    div.className = 'cn-note';
    div.innerHTML = `
      <div class="cn-note-header">
        <div class="cn-avatar" style="background:${color}">${note.university[0]}</div>
        <div class="cn-meta">
          <span class="cn-uni" style="color:${color}">${note.university}</span>
          <span class="cn-time">${timeAgo(note.createdAt)}</span>
        </div>
      </div>
      <div class="cn-body">${escapeHtml(note.body)}</div>
    `;
    return div;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Build UI ─────────────────────────────────────────────────────────────

  const root = document.createElement('div');
  root.id = 'cn-root';
  root.innerHTML = `
    <div id="cn-toggle" title="Community Notes">
      <span id="cn-toggle-icon">📝</span>
      <span id="cn-count-badge" class="cn-hidden">0</span>
    </div>
    <div id="cn-sidebar">
      <div id="cn-sidebar-inner">
        <div id="cn-header">
          <div id="cn-header-left">
            <span id="cn-header-icon">📝</span>
            <div>
              <div id="cn-header-title">Community Notes</div>
              <div id="cn-header-url">${window.location.hostname}</div>
            </div>
          </div>
          <button id="cn-close">✕</button>
        </div>

        <div id="cn-notes-list">
          <div class="cn-loading">Loading notes…</div>
        </div>

        <div id="cn-compose">
          <div id="cn-compose-inner">
            <textarea id="cn-textarea" placeholder="Share what you know about this page…" maxlength="500"></textarea>
            <div id="cn-compose-footer">
              <span id="cn-char-count">0 / 500</span>
              <button id="cn-submit">Post Note</button>
            </div>
          </div>
          <div id="cn-login-prompt">
            <div id="cn-login-icon">🎓</div>
            <div id="cn-login-text">Sign in with your <strong>.edu email</strong> to add notes</div>
            <div id="cn-login-sub">Click the extension icon to sign in</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── State ────────────────────────────────────────────────────────────────

  let sidebarOpen = false;
  let currentUser = null;
  let notes = [];

  // ── Load auth state ──────────────────────────────────────────────────────

  function refreshAuth() {
    chrome.storage.local.get('user', ({ user }) => {
      currentUser = user || null;
      renderCompose();
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.user) {
      currentUser = changes.user.newValue || null;
      renderCompose();
    }
  });

  // ── Render ───────────────────────────────────────────────────────────────

  function renderNotesList() {
    const list = document.getElementById('cn-notes-list');
    if (notes.length === 0) {
      list.innerHTML = `
        <div class="cn-empty">
          <div class="cn-empty-icon">🔍</div>
          <div class="cn-empty-text">No notes yet for this page.</div>
          <div class="cn-empty-sub">Be the first to add context.</div>
        </div>`;
      return;
    }
    list.innerHTML = '';
    notes.forEach(n => list.appendChild(renderNote(n)));
  }

  function updateCountBadge() {
    const badge = document.getElementById('cn-count-badge');
    if (notes.length > 0) {
      badge.textContent = notes.length;
      badge.classList.remove('cn-hidden');
    } else {
      badge.classList.add('cn-hidden');
    }
  }

  function renderCompose() {
    const compose = document.getElementById('cn-compose-inner');
    const prompt = document.getElementById('cn-login-prompt');
    if (currentUser) {
      compose.style.display = 'flex';
      prompt.style.display = 'none';
    } else {
      compose.style.display = 'none';
      prompt.style.display = 'flex';
    }
  }

  async function loadNotes() {
    document.getElementById('cn-notes-list').innerHTML = '<div class="cn-loading">Loading notes…</div>';
    try {
      notes = await fetchNotes();
      renderNotesList();
      updateCountBadge();
    } catch (e) {
      document.getElementById('cn-notes-list').innerHTML = '<div class="cn-loading">Failed to load notes.</div>';
    }
  }

  // ── Sidebar open/close ───────────────────────────────────────────────────

  function openSidebar() {
    sidebarOpen = true;
    document.getElementById('cn-sidebar').classList.add('cn-open');
    document.getElementById('cn-toggle').classList.add('cn-active');
    refreshAuth();
    loadNotes();
  }

  function closeSidebar() {
    sidebarOpen = false;
    document.getElementById('cn-sidebar').classList.remove('cn-open');
    document.getElementById('cn-toggle').classList.remove('cn-active');
  }

  document.getElementById('cn-toggle').addEventListener('click', () => {
    sidebarOpen ? closeSidebar() : openSidebar();
  });

  document.getElementById('cn-close').addEventListener('click', closeSidebar);

  // ── Post note ────────────────────────────────────────────────────────────

  const textarea = document.getElementById('cn-textarea');
  const charCount = document.getElementById('cn-char-count');
  const submitBtn = document.getElementById('cn-submit');

  textarea.addEventListener('input', () => {
    charCount.textContent = `${textarea.value.length} / 500`;
  });

  submitBtn.addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (!body || !currentUser) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';
    try {
      await postNote(body, currentUser);
      textarea.value = '';
      charCount.textContent = '0 / 500';
      await loadNotes();
    } catch (e) {
      alert('Failed to post note: ' + e.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Note';
    }
  });

  // ── Message from popup ───────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_SIDEBAR') {
      sidebarOpen ? closeSidebar() : openSidebar();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────

  refreshAuth();

  // Auto-load note count for badge without opening sidebar
  fetchNotes().then(n => {
    notes = n;
    updateCountBadge();
  }).catch(() => {});
})();
