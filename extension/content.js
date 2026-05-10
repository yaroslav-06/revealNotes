const BATCH_SIZE = 5; // analyze N comments at a time to control cost

function getComments() {
  // New Reddit: shreddit-comment elements (new design) and legacy
  const comments = [];

  // New Reddit (shreddit)
  document.querySelectorAll('shreddit-comment').forEach(el => {
    const body = el.querySelector('[slot="comment"] p, .md p');
    const text = body ? body.innerText.trim() : el.innerText.trim();
    if (text.length > 30) comments.push({ el, text });
  });

  // Fallback: old Reddit / hybrid
  if (comments.length === 0) {
    document.querySelectorAll('.usertext-body .md').forEach(el => {
      const text = el.innerText.trim();
      if (text.length > 30) comments.push({ el, text });
    });
  }

  return comments;
}

function getOrCreateBadge(commentEl) {
  const existing = commentEl.querySelector('.car-badge');
  if (existing) return existing;

  const badge = document.createElement('div');
  badge.className = 'car-badge';
  badge.innerHTML = '<span class="car-score">...</span>';

  // Insert at top of comment element
  const target = commentEl.querySelector('[slot="comment"]') || commentEl;
  target.prepend(badge);
  return badge;
}

function setBadge(badge, score, note) {
  const scoreEl = badge.querySelector('.car-score');
  scoreEl.textContent = `${score}%`;

  badge.dataset.note = note;

  if (score >= 70) badge.classList.add('car-green');
  else if (score >= 40) badge.classList.add('car-yellow');
  else badge.classList.add('car-red');

  badge.classList.remove('car-loading');
}

function showTooltip(badge, note) {
  let tip = document.getElementById('car-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'car-tooltip';
    document.body.appendChild(tip);
  }
  tip.textContent = note;
  tip.style.display = 'block';

  const rect = badge.getBoundingClientRect();
  tip.style.top = `${window.scrollY + rect.bottom + 6}px`;
  tip.style.left = `${window.scrollX + rect.left}px`;
}

function hideTooltip() {
  const tip = document.getElementById('car-tooltip');
  if (tip) tip.style.display = 'none';
}

document.addEventListener('mouseover', e => {
  const badge = e.target.closest('.car-badge');
  if (badge && badge.dataset.note) showTooltip(badge, badge.dataset.note);
});
document.addEventListener('mouseout', e => {
  if (e.target.closest('.car-badge')) hideTooltip();
});

async function analyzeComments() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    alert('CollegeAdvice Rater: Please set your Anthropic API key in the extension popup.');
    return;
  }

  const comments = getComments();
  if (comments.length === 0) {
    alert('No comments found on this page. Make sure you\'re on a Reddit post.');
    return;
  }

  // Mark all as loading
  comments.forEach(({ el }) => {
    const badge = getOrCreateBadge(el);
    badge.classList.add('car-loading');
  });

  // Process in batches
  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    const batch = comments.slice(i, i + BATCH_SIZE);
    await analyzeBatch(batch, apiKey);
  }
}

async function analyzeBatch(batch, apiKey) {
  const prompt = buildPrompt(batch.map(c => c.text));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('CAR API error:', err);
      batch.forEach(({ el }) => {
        const badge = getOrCreateBadge(el);
        badge.classList.remove('car-loading');
        badge.querySelector('.car-score').textContent = '?';
        badge.dataset.note = 'API error — check your key.';
        badge.classList.add('car-red');
      });
      return;
    }

    const data = await response.json();
    const text = data.content[0].text;

    let results;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      results = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('CAR parse error:', text);
      return;
    }

    batch.forEach(({ el }, idx) => {
      const r = results[idx];
      if (!r) return;
      const badge = getOrCreateBadge(el);
      setBadge(badge, r.score, r.note);
    });
  } catch (err) {
    console.error('CAR fetch error:', err);
  }
}

function buildPrompt(comments) {
  const commentList = comments.map((text, i) =>
    `Comment ${i + 1}:\n"${text.slice(0, 600)}"`
  ).join('\n\n');

  return `You are an expert on US college admissions with deep knowledge of GPA ranges, SAT/ACT scores, acceptance rates, financial aid, application strategies, and common advice pitfalls.

Analyze each Reddit comment below for factual accuracy and quality of advice for college applications. Consider:
- Are statistics (acceptance rates, score ranges, GPA cutoffs) accurate?
- Is the advice actionable and sound?
- Are there common misconceptions or outdated information?
- Is the advice overly anecdotal or misleading?

For each comment, respond with a score (0-100) where:
- 80-100: Accurate, well-reasoned advice
- 50-79: Mostly correct but has minor errors or oversimplifications
- 20-49: Significant inaccuracies or misleading framing
- 0-19: Wrong or harmful advice

Respond ONLY with a JSON array, one object per comment, in order:
[{"score": 85, "note": "One sentence explaining the rating."}, ...]

${commentList}`;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ANALYZE') analyzeComments();
});
