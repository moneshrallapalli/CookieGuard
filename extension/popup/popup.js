let currentStats = null;

async function loadStats() {
  try {
    // Try to get stats from background worker
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

    if (response && response.success && response.stats.total > 0) {
      currentStats = response.stats;
      updateUI();
    } else {
      // Fallback: Get cookies directly from Chrome
      console.log('Using Chrome API fallback for stats');
      await loadStatsFromChrome();
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
    // Fallback to Chrome API
    await loadStatsFromChrome();
  }
}

async function loadStatsFromChrome() {
  chrome.cookies.getAll({}, (cookies) => {
    console.log('Got', cookies.length, 'cookies from Chrome');

    // Classify cookies on the fly
    const categorized = {
      essential: 0,
      functional: 0,
      analytics: 0,
      advertising: 0,
      social: 0,
      unknown: 0
    };

    cookies.forEach(cookie => {
      const category = classifyCookie(cookie);
      categorized[category]++;
    });

    currentStats = {
      total: cookies.length,
      byCategory: categorized,
      mode: 'balanced'
    };

    updateUI();
  });
}

function classifyCookie(cookie) {
  const name = cookie.name.toLowerCase();
  const domain = cookie.domain.toLowerCase();

  // Essential
  if (/^(session|csrf|auth|token|sidcc|__secure-.*sidcc|nid)/i.test(name)) {
    return 'essential';
  }
  if (/google\.com|gstatic\.com/.test(domain) && cookie.secure) {
    return 'essential';
  }

  // Analytics
  if (/^(_ga|_gid|_gat|__utm)/i.test(name)) {
    return 'analytics';
  }

  // Advertising
  if (/^(_fbp|_fbc|fr|id|uid)/i.test(name)) {
    return 'advertising';
  }

  // Social
  if (/facebook|twitter|linkedin|instagram/.test(domain)) {
    return 'social';
  }

  // Functional
  if (cookie.hostOnly && !cookie.expirationDate) {
    return 'functional';
  }

  return 'unknown';
}

function updateUI() {
  if (!currentStats) return;

  document.getElementById('total-cookies').textContent = currentStats.total || 0;

  const categories = ['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown'];
  categories.forEach(category => {
    const count = currentStats.byCategory[category] || 0;
    const element = document.getElementById(`count-${category}`);
    if (element) {
      element.textContent = count;
    }
  });

  const blocked = (currentStats.byCategory.advertising || 0) + (currentStats.byCategory.social || 0);
  document.getElementById('blocked-cookies').textContent = blocked;

  document.getElementById('mode-select').value = currentStats.mode || 'balanced';

  const privacyScore = calculatePrivacyScore();
  document.getElementById('privacy-score').textContent = privacyScore;
}

function calculatePrivacyScore() {
  if (!currentStats || currentStats.total === 0) return '--';

  const essential = currentStats.byCategory.essential || 0;
  const functional = currentStats.byCategory.functional || 0;
  const analytics = currentStats.byCategory.analytics || 0;
  const advertising = currentStats.byCategory.advertising || 0;
  const social = currentStats.byCategory.social || 0;

  const total = currentStats.total;

  const score = 100 -
    (advertising / total * 40) -
    (social / total * 30) -
    (analytics / total * 20) -
    (functional / total * 5);

  return Math.max(0, Math.round(score));
}

document.getElementById('mode-select').addEventListener('change', async (e) => {
  const mode = e.target.value;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_MODE',
      mode
    });

    if (response.success) {
      console.log('Mode changed to:', mode);
      setTimeout(loadStats, 500);
    }
  } catch (error) {
    console.error('Failed to change mode:', error);
  }
});

document.getElementById('clear-advertising').addEventListener('click', async () => {
  if (!confirm('Clear all advertising cookies? This cannot be undone.')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_COOKIES',
      category: 'advertising'
    });

    if (response.success) {
      alert(`Removed ${response.removed} advertising cookies`);
      setTimeout(loadStats, 500);
    }
  } catch (error) {
    console.error('Failed to clear cookies:', error);
  }
});

document.getElementById('view-dashboard').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html')
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'COOKIE_CLASSIFIED') {
    setTimeout(loadStats, 100);
  }
});

loadStats();
setInterval(loadStats, 5000);
