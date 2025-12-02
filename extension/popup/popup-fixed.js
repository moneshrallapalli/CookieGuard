let currentStats = null;
let currentDomain = null;
async function loadStats() {
  try {
    let currentMode = 'observe';
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      if (response && response.success && response.stats) {
        currentMode = response.stats.mode || 'observe';
      }
    } catch (e) {
      console.log('Could not get mode from background, using observe');
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    if (!currentTab || !currentTab.url) {
      console.log('No active tab');
      return;
    }
    try {
      const url = new URL(currentTab.url);
      currentDomain = url.hostname;
      console.log('Current domain:', currentDomain);
    } catch (e) {
      console.log('Cannot parse URL:', currentTab.url);
      currentDomain = null;
    }
    if (currentDomain) {
      chrome.cookies.getAll({}, (allCookies) => {
        console.log('Total browser cookies:', allCookies.length);
        const cookies = allCookies.filter(cookie => {
          const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          return currentDomain.endsWith(cookieDomain) || cookieDomain === currentDomain;
        });
        console.log('Found', cookies.length, 'cookies for', currentDomain);
        processAndDisplayStats(cookies, currentMode);
      });
    } else {
      document.getElementById('total-cookies').textContent = '--';
      document.getElementById('blocked-cookies').textContent = '--';
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}
function processAndDisplayStats(cookies, mode = 'observe') {
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
  let blockedCount = 0;
  if (mode === 'balanced') {
    blockedCount = (categorized.advertising || 0) + (categorized.social || 0);
  } else if (mode === 'strict') {
    blockedCount = (categorized.advertising || 0) +
                   (categorized.social || 0) +
                   (categorized.analytics || 0);
  }
  currentStats = {
    total: cookies.length,
    byCategory: categorized,
    blocked: blockedCount,
    mode: mode
  };
  updateUI();
}
function classifyCookie(cookie) {
  const name = cookie.name.toLowerCase();
  const domain = cookie.domain.toLowerCase();
  if (/^(session|csrf|auth|token|sidcc|__secure-.*sidcc|nid|hsid|ssid|apisid|sapisid)/i.test(name)) {
    return 'essential';
  }
  if (/google\.com|gstatic\.com|youtube\.com/.test(domain) && cookie.secure) {
    return 'essential';
  }
  if (/^jsessionid/i.test(name)) {
    return 'essential';
  }
  if (/^(_ga|_gid|_gat|__utm)/i.test(name)) {
    return 'analytics';
  }
  if (/analytics/i.test(name) && !name.startsWith('lms_')) {
    return 'analytics';
  }
  if (/^(_fbp|_fbc|fr|ide|test_cookie)/i.test(name)) {
    return 'advertising';
  }
  if (/doubleclick|adsense|adservice/.test(domain)) {
    return 'advertising';
  }
  if (/connect\.facebook\.net|platform\.twitter\.com|platform\.linkedin\.com|widgets\.pinterest\.com|embed\.reddit\.com/.test(domain)) {
    return 'social';
  }
  if (cookie.hostOnly && !cookie.expirationDate) {
    return 'functional';
  }
  if (/linkedin\.com/.test(domain) && /^(bcookie|bscookie|lang|lidc|li_at|li_theme|timezone|sdui_ver|li_sugr|aam_uuid|g_state|liap|lms_ads|lms_analytics|dfpfpt|fptctx2|_guid|_pxvid|UserMatchHistory|AnalyticsSyncHistory)/i.test(name)) {
    return 'functional';
  }
  if (/facebook\.com/.test(domain) && /^(c_user|xs|datr|locale|wd)/i.test(name)) {
    return 'functional';
  }
  if (/^__cf_bm/i.test(name)) {
    return 'functional';
  }
  if (/^(AMCV_|AMCVS_)/i.test(name)) {
    return 'functional';
  }
  return 'unknown';
}
function updateUI() {
  if (!currentStats) return;
  document.getElementById('total-cookies').textContent = currentStats.total || 0;
  document.getElementById('blocked-cookies').textContent = currentStats.blocked || 0;
  const categories = ['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown'];
  categories.forEach(category => {
    const count = currentStats.byCategory[category] || 0;
    const element = document.getElementById(`count-${category}`);
    if (element) {
      element.textContent = count;
    }
  });
  document.getElementById('mode-select').value = currentStats.mode || 'balanced';
  const privacyScore = calculatePrivacyScore();
  document.getElementById('privacy-score').textContent = privacyScore;
  if (currentDomain) {
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) {
      subtitle.textContent = `Cookies on ${currentDomain}`;
    }
  }
}
function calculatePrivacyScore() {
  if (!currentStats || currentStats.total === 0) return '--';
  const advertising = currentStats.byCategory.advertising || 0;
  const social = currentStats.byCategory.social || 0;
  const analytics = currentStats.byCategory.analytics || 0;
  const functional = currentStats.byCategory.functional || 0;
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
    if (response && response.success) {
      console.log('Mode changed to:', mode);
      currentStats.mode = mode;
      let blockedCount = 0;
      if (mode === 'balanced') {
        blockedCount = (currentStats.byCategory.advertising || 0) + (currentStats.byCategory.social || 0);
      } else if (mode === 'strict') {
        blockedCount = (currentStats.byCategory.advertising || 0) +
                       (currentStats.byCategory.social || 0) +
                       (currentStats.byCategory.analytics || 0);
      }
      currentStats.blocked = blockedCount;
      updateUI();
    }
  } catch (error) {
    console.error('Failed to change mode:', error);
  }
});
document.getElementById('clear-advertising').addEventListener('click', async () => {
  if (!confirm('Clear all advertising cookies from this site?')) {
    return;
  }
  try {
    chrome.cookies.getAll({ domain: currentDomain }, async (cookies) => {
      let removed = 0;
      for (const cookie of cookies) {
        const category = classifyCookie(cookie);
        if (category === 'advertising') {
          const protocol = cookie.secure ? 'https://' : 'http://';
          const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
          const url = `${protocol}${domain}${cookie.path}`;
          await chrome.cookies.remove({ url, name: cookie.name });
          removed++;
        }
      }
      alert(`Removed ${removed} advertising cookies`);
      setTimeout(loadStats, 500);
    });
  } catch (error) {
    console.error('Failed to clear cookies:', error);
  }
});
document.getElementById('view-dashboard').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html')
  });
});
loadStats();
setInterval(loadStats, 2000);
console.log('✓ Popup loaded');
