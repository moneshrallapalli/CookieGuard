// Simple test service worker - no modules
console.log('🍪 CookieGuard Test Worker Started!');

// Test 1: Check cookies on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('✓ Extension installed');

  chrome.cookies.getAll({}, (cookies) => {
    console.log(`✓ Found ${cookies.length} cookies in browser`);
  });
});

// Test 2: Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!changeInfo.removed) {
    console.log('🍪 Cookie detected:', changeInfo.cookie.name, 'from', changeInfo.cookie.domain);
  }
});

// Test 3: Respond to popup messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Message received:', message.type);

  if (message.type === 'GET_STATS') {
    chrome.cookies.getAll({}, (cookies) => {
      const stats = {
        success: true,
        stats: {
          total: cookies.length,
          byCategory: {
            essential: Math.floor(cookies.length * 0.3),
            functional: Math.floor(cookies.length * 0.2),
            analytics: Math.floor(cookies.length * 0.3),
            advertising: Math.floor(cookies.length * 0.1),
            social: Math.floor(cookies.length * 0.05),
            unknown: Math.floor(cookies.length * 0.05)
          },
          mode: 'balanced'
        }
      };
      console.log('📊 Sending stats:', stats);
      sendResponse(stats);
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SET_MODE') {
    console.log('⚙️ Mode changed to:', message.mode);
    sendResponse({ success: true, mode: message.mode });
    return true;
  }

  if (message.type === 'CLEAR_COOKIES') {
    console.log('🗑️ Clear cookies requested');
    sendResponse({ success: true, removed: 0 });
    return true;
  }
});

console.log('✓ Test worker ready - check for cookie messages above');
