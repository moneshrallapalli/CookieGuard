(function() {
  'use strict';
  
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
  } catch (e) {
    return;
  }
  
  const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  const originalSetItem = Storage.prototype.setItem;
  const cookieAccessLog = new Map();
  function injectFingerprintDetector() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/fingerprint-detector.js');
      script.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('CookieGuard: Failed to inject fingerprint detector:', error);
    }
  }
  if (document.documentElement) {
    injectFingerprintDetector();
  } else {
    const observer = new MutationObserver((mutations, obs) => {
      if (document.documentElement) {
        injectFingerprintDetector();
        obs.disconnect();
      }
    });
    observer.observe(document, { childList: true });
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;
    
    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.id) return;
      
      if (event.data.type === 'FINGERPRINT_DETECTED') {
        chrome.runtime.sendMessage({
          type: 'FINGERPRINT_DETECTED',
          data: {
            fingerprintType: event.data.fingerprintType,
            details: event.data.details,
            url: event.data.url,
            timestamp: event.data.timestamp
          }
        }).catch(() => {});
      } else if (event.data.type === 'FINGERPRINT_SUMMARY') {
        chrome.runtime.sendMessage({
          type: 'FINGERPRINT_SUMMARY',
          data: event.data.summary,
          url: event.data.url,
          timestamp: event.data.timestamp
        }).catch(() => {});
      }
    } catch (err) {
      // Silently ignore extension context errors
    }
  });
  Object.defineProperty(document, 'cookie', {
    get: function() {
      return originalCookieDescriptor.get.call(this);
    },
    set: function(value) {
      try {
        const cookies = parseCookieString(value);
        cookies.forEach(cookie => {
          logCookieAccess('set', cookie);
        });
      } catch (error) {
        console.error('Cookie parse error:', error);
      }
      return originalCookieDescriptor.set.call(this, value);
    },
    configurable: true
  });
  Storage.prototype.setItem = function(key, value) {
    if (key.toLowerCase().includes('cookie') ||
        key.toLowerCase().includes('session') ||
        key.toLowerCase().includes('token')) {
      logStorageAccess('localStorage', key, value);
    }
    return originalSetItem.call(this, key, value);
  };
  function parseCookieString(cookieStr) {
    const cookies = [];
    const parts = cookieStr.split(';').map(p => p.trim());
    if (parts.length === 0) return cookies;
    const [nameValue, ...attributes] = parts;
    const [name, value] = nameValue.split('=');
    if (name && value !== undefined) {
      const cookie = {
        name: name.trim(),
        value: value.trim(),
        domain: window.location.hostname,
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'Lax'
      };
      attributes.forEach(attr => {
        const [key, val] = attr.split('=');
        const attrName = key.toLowerCase().trim();
        if (attrName === 'domain') cookie.domain = val.trim();
        else if (attrName === 'path') cookie.path = val.trim();
        else if (attrName === 'secure') cookie.secure = true;
        else if (attrName === 'httponly') cookie.httpOnly = true;
        else if (attrName === 'samesite') cookie.sameSite = val.trim();
        else if (attrName === 'expires') {
          cookie.expirationDate = new Date(val.trim()).getTime() / 1000;
        }
      });
      cookies.push(cookie);
    }
    return cookies;
  }
  function logCookieAccess(operation, cookie) {
    const key = `${cookie.domain}:${cookie.name}`;
    const now = Date.now();
    const existing = cookieAccessLog.get(key);
    if (existing && now - existing.timestamp < 1000) {
      return;
    }
    cookieAccessLog.set(key, { timestamp: now, operation });
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({
        type: 'JS_COOKIE_ACCESS',
        data: {
          operation,
          cookie,
          url: window.location.href,
          timestamp: now
        }
      }).catch(() => {});
    } catch (err) {
      return;
    }
  }
  function logStorageAccess(storageType, key, value) {
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage({
        type: 'STORAGE_ACCESS',
        data: {
          storageType,
          key,
          valueLength: value.length,
          url: window.location.href,
          timestamp: Date.now()
        }
      }).catch(() => {});
    } catch (err) {
      return;
    }
  }
  const canvasObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.tagName === 'CANVAS') {
          monitorCanvas(node);
        }
      });
    });
  });
  canvasObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  function monitorCanvas(canvas) {
    const originalGetContext = canvas.getContext;
    canvas.getContext = function(contextType, ...args) {
      const context = originalGetContext.apply(this, [contextType, ...args]);
      if (contextType === '2d' || contextType === 'webgl') {
        try {
          if (!chrome.runtime?.id) return context;
          chrome.runtime.sendMessage({
            type: 'FINGERPRINT_ATTEMPT',
            data: {
              type: 'canvas',
              contextType,
              url: window.location.href,
              timestamp: Date.now()
            }
          }).catch(() => {});
        } catch (err) {
          // Ignore
        }
      }
      return context;
    };
  }
  const performanceObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const cookieRelated = entries.filter(entry =>
      entry.name.includes('cookie') ||
      entry.name.includes('track') ||
      entry.name.includes('analytics')
    );
    if (cookieRelated.length > 0) {
      try {
        if (!chrome.runtime?.id) return;
        chrome.runtime.sendMessage({
          type: 'TRACKING_RESOURCE',
          data: {
            resources: cookieRelated.map(e => ({
              name: e.name,
              type: e.initiatorType,
              duration: e.duration
            })),
            url: window.location.href,
            timestamp: Date.now()
          }
        }).catch(() => {});
      } catch (err) {
        return;
      }
    }
  });
  try {
    performanceObserver.observe({ entryTypes: ['resource'] });
  } catch (error) {
    console.error('Performance observer error:', error);
  }
  setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [key, value] of cookieAccessLog.entries()) {
      if (value.timestamp < cutoff) {
        cookieAccessLog.delete(key);
      }
    }
  }, 60000);
})();
