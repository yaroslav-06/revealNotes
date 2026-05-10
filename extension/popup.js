const keyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('save');
const analyzeBtn = document.getElementById('analyze');
const status = document.getElementById('status');

chrome.storage.local.get('apiKey', ({ apiKey }) => {
  if (apiKey) keyInput.value = apiKey;
});

saveBtn.addEventListener('click', () => {
  const key = keyInput.value.trim();
  if (!key) return;
  chrome.storage.local.set({ apiKey: key }, () => {
    status.textContent = 'Key saved.';
    status.className = 'saved';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});

analyzeBtn.addEventListener('click', () => {
  const key = keyInput.value.trim();
  if (!key) {
    status.textContent = 'Enter your API key first.';
    return;
  }
  chrome.storage.local.set({ apiKey: key }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE' });
      status.textContent = 'Analyzing comments...';
      window.close();
    });
  });
});
