const $ = id => document.getElementById(id);

function extractUniversity(email) {
  const domain = email.split('@')[1] || '';
  const parts = domain.replace('.edu', '').split('.');
  const name = parts[parts.length - 1] || parts[0];
  return name.toUpperCase();
}

function isEduEmail(email) {
  return email.trim().toLowerCase().endsWith('.edu');
}

async function firebaseSignUp(email, password) {
  const res = await fetch(`${FB_AUTH_URL}:signUp?key=${FB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Sign up failed');
  return data;
}

async function firebaseSignIn(email, password) {
  const res = await fetch(`${FB_AUTH_URL}:signInWithPassword?key=${FB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Sign in failed');
  return data;
}

function setUser(data) {
  const university = extractUniversity(data.email);
  chrome.storage.local.set({
    user: { email: data.email, university, idToken: data.idToken, uid: data.localId }
  }, showUserPanel);
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

function setError(msg) {
  const friendly = msg
    .replace('EMAIL_EXISTS', 'Account already exists. Try signing in.')
    .replace('INVALID_LOGIN_CREDENTIALS', 'Wrong email or password.')
    .replace('WEAK_PASSWORD : Password should be at least 6 characters', 'Password must be at least 6 characters.')
    .replace('INVALID_EMAIL', 'Invalid email address.');
  $('auth-error').textContent = friendly;
}

// Tab switching
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

$('signup-btn').addEventListener('click', async () => {
  const email = $('su-email').value.trim();
  const password = $('su-password').value;
  $('auth-error').textContent = '';

  if (!isEduEmail(email)) {
    setError('Please use a valid .edu email address.');
    return;
  }
  if (password.length < 6) {
    setError('Password must be at least 6 characters.');
    return;
  }
  $('signup-btn').textContent = 'Creating account...';
  try {
    const data = await firebaseSignUp(email, password);
    setUser(data);
  } catch (e) {
    setError(e.message);
  } finally {
    $('signup-btn').textContent = 'Create Account';
  }
});

$('signin-btn').addEventListener('click', async () => {
  const email = $('si-email').value.trim();
  const password = $('si-password').value;
  $('auth-error').textContent = '';
  $('signin-btn').textContent = 'Signing in...';
  try {
    const data = await firebaseSignIn(email, password);
    setUser(data);
  } catch (e) {
    setError(e.message);
  } finally {
    $('signin-btn').textContent = 'Sign In';
  }
});

$('signout-btn').addEventListener('click', () => {
  chrome.storage.local.remove('user', showUserPanel);
});

$('open-sidebar-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    window.close();
  });
});

// Init
showUserPanel();
