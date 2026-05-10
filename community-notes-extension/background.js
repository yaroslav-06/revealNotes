const API_BASE = 'http://45.55.80.161:3000';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'API_CALL') return;

  const { method = 'GET', path, token, body } = msg;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async response
});
