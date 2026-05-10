(() => {
  if (document.getElementById('cn-root')) return;

  const PAGE_URL = window.location.origin + window.location.pathname;

  // ── API (proxied through background to avoid HTTP/HTTPS mixed content) ───

  function callAPI(method, path, token, body) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'API_CALL', method, path, token, body },
        res => {
          if (!res || res.error) return reject(new Error(res?.error || 'Network error'));
          if (!res.ok) return reject(new Error(res.data?.error || `Request failed (${res.status})`));
          resolve(res.data);
        }
      );
    });
  }

  function apiFetchNotes() {
    return callAPI('GET', `/notes?url=${encodeURIComponent(PAGE_URL)}`);
  }

  function apiPostNote(token, body) {
    return callAPI('POST', '/notes', token, { url: PAGE_URL, body });
  }

  function apiVote(token, noteId, value) {
    return callAPI('POST', `/notes/${noteId}/vote`, token, { value });
  }

  function apiRemoveVote(token, noteId) {
    return callAPI('DELETE', `/notes/${noteId}/vote`, token);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function extractUniversity(email) {
    const domain = (email || '').split('@')[1] || '';
    const parts = domain.replace('.edu', '').split('.');
    return (parts[parts.length - 1] || parts[0] || '?').toUpperCase();
  }

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
    const colors = ['#7c6af7','#3ab8a0','#f5a623','#e05c8a','#4a9eda','#9b6af7','#50c878'];
    let hash = 0;
    for (const c of uni) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(hash) % colors.length];
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function sortNotes(arr, by) {
    return [...arr].sort((a, b) =>
      by === 'votes'
        ? b.score - a.score
        : new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  // ── Vote state (tracked in memory per session) ───────────────────────────
  // Map<noteId, 1 | -1 | null>
  const userVotes = new Map();

  // ── Render note card ─────────────────────────────────────────────────────

  function renderNote(note, user) {
    const uni = extractUniversity(note.authorEmail);
    const color = uniColor(uni);
    const myVote = userVotes.get(note.id) ?? null;
    const canVote = !!user;

    const el = document.createElement('div');
    el.className = 'cn-note';
    el.dataset.id = note.id;

    el.innerHTML = `
      <div class="cn-note-top">
        <div class="cn-chip" style="background:${color}18;color:${color};border-color:${color}40">${uni}</div>
        <span class="cn-time">${timeAgo(note.createdAt)}</span>
      </div>
      <div class="cn-body">${escapeHtml(note.body)}</div>
      <div class="cn-note-footer">
        <div class="cn-votes">
          <button class="cn-vote-btn cn-up ${myVote === 1 ? 'cn-voted-up' : ''}"
            data-note="${note.id}" data-val="1"
            ${!canVote ? 'disabled title="Sign in to vote"' : ''}>▲</button>
          <span class="cn-score">${note.score}</span>
          <button class="cn-vote-btn cn-down ${myVote === -1 ? 'cn-voted-down' : ''}"
            data-note="${note.id}" data-val="-1"
            ${!canVote ? 'disabled title="Sign in to vote"' : ''}>▼</button>
        </div>
        ${!canVote ? '<span class="cn-vote-hint">sign in to vote</span>' : ''}
      </div>
    `;

    if (canVote) {
      el.querySelectorAll('.cn-vote-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const val = parseInt(btn.dataset.val);
          const noteId = parseInt(btn.dataset.note);
          const current = userVotes.get(noteId) ?? null;

          const upBtn   = el.querySelector('.cn-up');
          const downBtn = el.querySelector('.cn-down');
          const scoreEl = el.querySelector('.cn-score');

          try {
            if (current === val) {
              // Toggle off
              await apiRemoveVote(user.token, noteId);
              note.score -= val;
              userVotes.set(noteId, null);
              upBtn.classList.remove('cn-voted-up');
              downBtn.classList.remove('cn-voted-down');
            } else {
              // New vote or flip
              await apiVote(user.token, noteId, val);
              if (current !== null) note.score -= current; // undo previous
              note.score += val;
              userVotes.set(noteId, val);
              upBtn.classList.toggle('cn-voted-up', val === 1);
              downBtn.classList.toggle('cn-voted-down', val === -1);
            }
            scoreEl.textContent = note.score;
          } catch (e) {
            console.error('Vote error:', e.message);
          }
        });
      });
    }

    return el;
  }

  // ── Build sidebar ────────────────────────────────────────────────────────

  const root = document.createElement('div');
  root.id = 'cn-root';
  root.innerHTML = `
    <div id="cn-toggle" title="Community Notes">
      📝<span id="cn-count-badge" class="cn-hidden"></span>
    </div>

    <div id="cn-sidebar">
      <div id="cn-header">
        <div id="cn-header-info">
          <span id="cn-header-title">Community Notes</span>
          <span id="cn-header-host">${window.location.hostname}</span>
        </div>
        <button id="cn-close">✕</button>
      </div>

      <div id="cn-sort-bar">
        <button class="cn-sort-btn cn-sort-active" data-sort="date">Recent</button>
        <button class="cn-sort-btn" data-sort="votes">Top</button>
        <span id="cn-note-count"></span>
      </div>

      <div id="cn-notes-list"></div>

      <div id="cn-compose">
        <div id="cn-compose-form">
          <textarea id="cn-textarea" placeholder="Add context about this page…" maxlength="500"></textarea>
          <div id="cn-compose-row">
            <span id="cn-char-count">0 / 500</span>
            <button id="cn-submit">Post</button>
          </div>
        </div>
        <div id="cn-login-prompt">
          🎓 Sign in with your <strong>.edu email</strong> to add notes
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── State ────────────────────────────────────────────────────────────────

  let open = false;
  let user = null;
  let notes = [];
  let sortBy = 'date';

  // ── Auth ─────────────────────────────────────────────────────────────────

  function loadAuth(cb) {
    chrome.storage.local.get('user', ({ user: u }) => { user = u || null; cb && cb(); });
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes.user) { user = changes.user.newValue || null; renderCompose(); }
  });

  // ── Render ───────────────────────────────────────────────────────────────

  function renderList() {
    const list = document.getElementById('cn-notes-list');
    const sorted = sortNotes(notes, sortBy);
    document.getElementById('cn-note-count').textContent =
      notes.length ? `${notes.length} note${notes.length !== 1 ? 's' : ''}` : '';

    if (!sorted.length) {
      list.innerHTML = `<div class="cn-empty">No notes yet — be the first.</div>`;
      return;
    }
    list.innerHTML = '';
    sorted.forEach(n => list.appendChild(renderNote(n, user)));
  }

  function renderCompose() {
    const form   = document.getElementById('cn-compose-form');
    const prompt = document.getElementById('cn-login-prompt');
    if (user) { form.style.display = 'flex'; prompt.style.display = 'none'; }
    else       { form.style.display = 'none'; prompt.style.display = 'block'; }
  }

  function updateBadge() {
    const b = document.getElementById('cn-count-badge');
    if (notes.length) { b.textContent = notes.length; b.classList.remove('cn-hidden'); }
    else b.classList.add('cn-hidden');
  }

  async function loadNotes() {
    document.getElementById('cn-notes-list').innerHTML = `<div class="cn-empty">Loading…</div>`;
    try {
      notes = await apiFetchNotes();
      renderList();
      updateBadge();
    } catch {
      document.getElementById('cn-notes-list').innerHTML = `<div class="cn-empty">Could not load notes.</div>`;
    }
  }

  // ── Sidebar open / close ─────────────────────────────────────────────────

  function openSidebar() {
    open = true;
    document.getElementById('cn-sidebar').classList.add('cn-open');
    document.getElementById('cn-toggle').classList.add('cn-active');
    loadAuth(() => { renderCompose(); loadNotes(); });
  }

  function closeSidebar() {
    open = false;
    document.getElementById('cn-sidebar').classList.remove('cn-open');
    document.getElementById('cn-toggle').classList.remove('cn-active');
  }

  document.getElementById('cn-toggle').addEventListener('click', () => open ? closeSidebar() : openSidebar());
  document.getElementById('cn-close').addEventListener('click', closeSidebar);

  // ── Sort ─────────────────────────────────────────────────────────────────

  document.querySelectorAll('#cn-root .cn-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#cn-root .cn-sort-btn').forEach(b => b.classList.remove('cn-sort-active'));
      btn.classList.add('cn-sort-active');
      sortBy = btn.dataset.sort;
      renderList();
    });
  });

  // ── Post note ────────────────────────────────────────────────────────────

  const textarea  = document.getElementById('cn-textarea');
  const charCount = document.getElementById('cn-char-count');
  const submitBtn = document.getElementById('cn-submit');

  textarea.addEventListener('input', () => {
    charCount.textContent = `${textarea.value.length} / 500`;
  });

  submitBtn.addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (!body || !user) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '…';
    try {
      await apiPostNote(user.token, body);
      textarea.value = '';
      charCount.textContent = '0 / 500';
      await loadNotes();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post';
    }
  });

  // ── Message from popup ───────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'TOGGLE_SIDEBAR') open ? closeSidebar() : openSidebar();
  });

  // ── Init — silent badge count ────────────────────────────────────────────

  loadAuth();
  apiFetchNotes().then(n => { notes = n; updateBadge(); }).catch(() => {});
})();
