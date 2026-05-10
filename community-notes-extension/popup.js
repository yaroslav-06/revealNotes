const $ = id => document.getElementById(id);

function extractUniversity(email) {
  const domain = email.split('@')[1] || '';
  const parts = domain.replace('.edu', '').split('.');
  return (parts[parts.length - 1] || parts[0] || '?').toUpperCase();
}

function isEduEmail(email) {
  return email.trim().toLowerCase().endsWith('.edu');
}

// ── API calls ────────────────────────────────────────────────────────────────

async function apiRegister(email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data; // { token, user: { id, email } }
}

async function apiLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data; // { token, user: { id, email } }
}

async function apiLogout(token) {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

async function apiMe(token) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json(); // { id, email }
}

// ── Storage ──────────────────────────────────────────────────────────────────

function saveUser(token, userObj) {
  const university = extractUniversity(userObj.email);
  chrome.storage.local.set({
    user: { token, id: userObj.id, email: userObj.email, university }
  }, showUserPanel);
}

function clearUser() {
  chrome.storage.local.remove('user', showUserPanel);
}

// ── UI ───────────────────────────────────────────────────────────────────────

function setError(msg) {
  $('auth-error').textContent = msg
    .replace('email already in use', 'Account already exists — try signing in.')
    .replace('wrong credentials', 'Wrong email or password.');
}

function showUserPanel() {
  chrome.storage.local.get('user', ({ user }) => {
    $('loading').style.display = 'none';
    if (!user) {
      $('auth-panel').style.display = 'block';
      $('user-panel').style.display = 'none';
      return;
    }
    $('auth-panel').style.display = 'none';
    $('user-panel').style.display = 'block';
    $('user-email').textContent = user.email;
    $('user-uni').textContent = user.university;
    $('user-avatar').textContent = user.email[0].toUpperCase();
  });
}

// Validate stored token on open
async function init() {
  const { user } = await chrome.storage.local.get('user');
  if (user?.token) {
    const me = await apiMe(user.token);
    if (!me) clearUser(); // token expired or revoked
    else showUserPanel();
  } else {
    showUserPanel();
  }
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    $('signin-form').style.display = which === 'signin' ? 'block' : 'none';
    $('signup-form').style.display = which === 'signup' ? 'block' : 'none';
    $('auth-error').textContent = '';
  });
});

// ── Sign up ───────────────────────────────────────────────────────────────────

$('signup-btn').addEventListener('click', async () => {
  const email = $('su-email').value.trim();
  const password = $('su-password').value;
  $('auth-error').textContent = '';

  if (!isEduEmail(email)) { setError('Please use a valid .edu email address.'); return; }
  if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }

  $('signup-btn').textContent = 'Creating account…';
  $('signup-btn').disabled = true;
  try {
    const { token, user } = await apiRegister(email, password);
    saveUser(token, user);
  } catch (e) {
    setError(e.message);
  } finally {
    $('signup-btn').textContent = 'Create Account';
    $('signup-btn').disabled = false;
  }
});

// ── Sign in ───────────────────────────────────────────────────────────────────

$('signin-btn').addEventListener('click', async () => {
  const email = $('si-email').value.trim();
  const password = $('si-password').value;
  $('auth-error').textContent = '';

  $('signin-btn').textContent = 'Signing in…';
  $('signin-btn').disabled = true;
  try {
    const { token, user } = await apiLogin(email, password);
    saveUser(token, user);
  } catch (e) {
    setError(e.message);
  } finally {
    $('signin-btn').textContent = 'Sign In';
    $('signin-btn').disabled = false;
  }
});

// ── Sign out ──────────────────────────────────────────────────────────────────

$('signout-btn').addEventListener('click', async () => {
  const { user } = await chrome.storage.local.get('user');
  if (user?.token) await apiLogout(user.token).catch(() => {});
  clearUser();
});

// ── Open sidebar ──────────────────────────────────────────────────────────────

$('open-sidebar-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    window.close();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

init();
