(() => {
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
          limit: 100
        }
      })
    });
    const rows = await res.json();
    return rows
      .filter(r => r.document)
      .map(r => {
        const f = r.document.fields;
        return {
          docPath: r.document.name,
          body: f.body?.stringValue || '',
          university: f.university?.stringValue || '?',
          email: f.email?.stringValue || '',
          createdAt: f.createdAt?.timestampValue || '',
          upvotes: parseInt(f.upvotes?.integerValue || '0'),
          upvotedBy: (f.upvotedBy?.arrayValue?.values || []).map(v => v.stringValue)
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
          createdAt:  { timestampValue: new Date().toISOString() },
          upvotes:    { integerValue: '0' },
          upvotedBy:  { arrayValue: { values: [] } }
        }
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to post note');
    }
    return res.json();
  }

  async function upvoteNote(docPath, user) {
    const projectId = FB_PROJECT_ID;
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.idToken}`
        },
        body: JSON.stringify({
          writes: [{
            transform: {
              document: docPath,
              fieldTransforms: [
                {
                  fieldPath: 'upvotes',
                  increment: { integerValue: '1' }
                },
                {
                  fieldPath: 'upvotedBy',
                  appendMissingElements: {
                    values: [{ stringValue: user.uid }]
                  }
                }
              ]
            }
          }]
        })
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to upvote');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  function sortNotes(notes, by) {
    return [...notes].sort((a, b) =>
      by === 'votes'
        ? b.upvotes - a.upvotes
        : new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  // ── Render note card ─────────────────────────────────────────────────────

  function renderNote(note, user) {
    const color = uniColor(note.university);
    const hasVoted = user && note.upvotedBy.includes(user.uid);
    const canVote = user && !hasVoted;

    const el = document.createElement('div');
    el.className = 'cn-note';
    el.innerHTML = `
      <div class="cn-note-top">
        <div class="cn-chip" style="background:${color}18;color:${color};border-color:${color}40">
          ${note.university}
        </div>
        <span class="cn-time">${timeAgo(note.createdAt)}</span>
      </div>
      <div class="cn-body">${escapeHtml(note.body)}</div>
      <div class="cn-note-footer">
        <button class="cn-upvote ${hasVoted ? 'cn-voted' : ''} ${!user ? 'cn-disabled' : ''}"
          data-path="${note.docPath}" title="${!user ? 'Sign in to vote' : hasVoted ? 'Already voted' : 'Upvote'}">
          ▲ <span class="cn-vote-count">${note.upvotes}</span>
        </button>
        ${!user ? '<span class="cn-vote-hint">sign in to vote</span>' : ''}
      </div>
    `;

    const btn = el.querySelector('.cn-upvote');
    if (canVote) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await upvoteNote(note.docPath, user);
          note.upvotes++;
          note.upvotedBy.push(user.uid);
          btn.classList.add('cn-voted');
          btn.querySelector('.cn-vote-count').textContent = note.upvotes;
        } catch (e) {
          btn.disabled = false;
        }
      });
    }

    return el;
  }

  // ── Build sidebar HTML ───────────────────────────────────────────────────

  const root = document.createElement('div');
  root.id = 'cn-root';
  root.innerHTML = `
    <div id="cn-toggle" title="Community Notes">
      📝
      <span id="cn-count-badge" class="cn-hidden"></span>
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
          🎓 <a id="cn-login-link">Sign in with .edu</a> to add notes
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
    const countEl = document.getElementById('cn-note-count');
    countEl.textContent = notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''}` : '';

    if (!sorted.length) {
      list.innerHTML = `<div class="cn-empty">No notes yet — be the first.</div>`;
      return;
    }
    list.innerHTML = '';
    sorted.forEach(n => list.appendChild(renderNote(n, user)));
  }

  function renderCompose() {
    const form = document.getElementById('cn-compose-form');
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
      notes = await fetchNotes();
      renderList();
      updateBadge();
    } catch {
      document.getElementById('cn-notes-list').innerHTML = `<div class="cn-empty">Could not load notes.</div>`;
    }
  }

  // ── Sidebar open/close ───────────────────────────────────────────────────

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

  const textarea = document.getElementById('cn-textarea');
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
      await postNote(body, user);
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

  // ── Init — load count for badge silently ────────────────────────────────

  loadAuth();
  fetchNotes().then(n => { notes = n; updateBadge(); }).catch(() => {});
})();
