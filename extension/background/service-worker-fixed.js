console.log('🍪 CookieGuard Service Worker Loading...');
const DB_NAME = 'CookieGuardDB';
const DB_VERSION = 3; 
const STORES = {
  COOKIES: 'cookies',
  CLASSIFICATIONS: 'classifications',
  SETTINGS: 'settings',
  FINGERPRINTS: 'fingerprints',
  CNAME_CLOAKING: 'cname_cloaking' 
};
class DBManager {
  constructor() {
    this.db = null;
  }
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✓ Database initialized');
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORES.COOKIES)) {
          const cookieStore = db.createObjectStore(STORES.COOKIES, {
            keyPath: 'id',
            autoIncrement: true
          });
          cookieStore.createIndex('domain', 'domain', { unique: false });
          cookieStore.createIndex('name', 'name', { unique: false });
          cookieStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.CLASSIFICATIONS)) {
          const classStore = db.createObjectStore(STORES.CLASSIFICATIONS, {
            keyPath: 'cookieId'
          });
          classStore.createIndex('category', 'category', { unique: false });
          classStore.createIndex('confidence', 'confidence', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.FINGERPRINTS)) {
          const fingerprintStore = db.createObjectStore(STORES.FINGERPRINTS, {
            keyPath: 'id',
            autoIncrement: true
          });
          fingerprintStore.createIndex('type', 'type', { unique: false });
          fingerprintStore.createIndex('domain', 'domain', { unique: false });
          fingerprintStore.createIndex('timestamp', 'timestamp', { unique: false });
          fingerprintStore.createIndex('url', 'url', { unique: false });
          console.log('✓ Fingerprints store created');
        }
        if (!db.objectStoreNames.contains(STORES.CNAME_CLOAKING)) {
          const cnameStore = db.createObjectStore(STORES.CNAME_CLOAKING, {
            keyPath: 'id',
            autoIncrement: true
          });
          cnameStore.createIndex('domain', 'domain', { unique: false });
          cnameStore.createIndex('trackerDomain', 'trackerDomain', { unique: false });
          cnameStore.createIndex('timestamp', 'timestamp', { unique: false });
          cnameStore.createIndex('cookieName', 'cookieName', { unique: false });
          console.log('✓ CNAME cloaking store created');
        }
      };
    });
  }
  async addCookie(cookieData) {
    const tx = this.db.transaction([STORES.COOKIES], 'readwrite');
    const store = tx.objectStore(STORES.COOKIES);
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...cookieData,
        timestamp: Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async addClassification(cookieId, classification) {
    const tx = this.db.transaction([STORES.CLASSIFICATIONS], 'readwrite');
    const store = tx.objectStore(STORES.CLASSIFICATIONS);
    return new Promise((resolve, reject) => {
      const request = store.put({
        cookieId,
        ...classification,
        timestamp: Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getAllCookies(limit = 1000) {
    const tx = this.db.transaction([STORES.COOKIES], 'readonly');
    const store = tx.objectStore(STORES.COOKIES);
    return new Promise((resolve, reject) => {
      const request = store.getAll(null, limit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getStatsByCategory() {
    const tx = this.db.transaction([STORES.CLASSIFICATIONS], 'readonly');
    const store = tx.objectStore(STORES.CLASSIFICATIONS);
    const index = store.index('category');
    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        const classifications = request.result;
        const stats = classifications.reduce((acc, item) => {
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        }, {});
        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }
  async getSetting(key) {
    const tx = this.db.transaction([STORES.SETTINGS], 'readonly');
    const store = tx.objectStore(STORES.SETTINGS);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }
  async setSetting(key, value) {
    const tx = this.db.transaction([STORES.SETTINGS], 'readwrite');
    const store = tx.objectStore(STORES.SETTINGS);
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async addFingerprint(fingerprintData) {
    const tx = this.db.transaction([STORES.FINGERPRINTS], 'readwrite');
    const store = tx.objectStore(STORES.FINGERPRINTS);
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...fingerprintData,
        timestamp: fingerprintData.timestamp || Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getFingerprintStats() {
    const tx = this.db.transaction([STORES.FINGERPRINTS], 'readonly');
    const store = tx.objectStore(STORES.FINGERPRINTS);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const fingerprints = request.result;
        const stats = {
          total: fingerprints.length,
          byType: {},
          byDomain: {},
          recentCount: 0
        };
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        fingerprints.forEach(fp => {
          stats.byType[fp.type] = (stats.byType[fp.type] || 0) + 1;
          stats.byDomain[fp.domain] = (stats.byDomain[fp.domain] || 0) + 1;
          if (fp.timestamp > oneDayAgo) {
            stats.recentCount++;
          }
        });
        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }
  async addCNAMECloaking(cloakingData) {
    const tx = this.db.transaction([STORES.CNAME_CLOAKING], 'readwrite');
    const store = tx.objectStore(STORES.CNAME_CLOAKING);
    return new Promise((resolve, reject) => {
      const request = store.add({
        ...cloakingData,
        timestamp: cloakingData.timestamp || Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getCNAMEStats() {
    const tx = this.db.transaction([STORES.CNAME_CLOAKING], 'readonly');
    const store = tx.objectStore(STORES.CNAME_CLOAKING);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const cloakings = request.result;
        const stats = {
          total: cloakings.length,
          byDomain: {},
          byTracker: {},
          recentCount: 0,
          uniqueDomains: new Set(),
          uniqueTrackers: new Set()
        };
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        cloakings.forEach(c => {
          stats.byDomain[c.domain] = (stats.byDomain[c.domain] || 0) + 1;
          stats.byTracker[c.trackerDomain] = (stats.byTracker[c.trackerDomain] || 0) + 1;
          stats.uniqueDomains.add(c.domain);
          stats.uniqueTrackers.add(c.trackerDomain);
          if (c.timestamp > oneDayAgo) {
            stats.recentCount++;
          }
        });
        stats.uniqueDomains = stats.uniqueDomains.size;
        stats.uniqueTrackers = stats.uniqueTrackers.size;
        resolve(stats);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
const dbManager = new DBManager();
const CATEGORIES = {
  ESSENTIAL: 'essential',
  FUNCTIONAL: 'functional',
  ANALYTICS: 'analytics',
  ADVERTISING: 'advertising',
  SOCIAL: 'social',
  UNKNOWN: 'unknown'
};
class SimpleClassifier {
  classify(cookie) {
    const name = cookie.name.toLowerCase();
    const domain = cookie.domain.toLowerCase();
    if (this.isEssential(name, domain, cookie)) {
      return {
        category: CATEGORIES.ESSENTIAL,
        confidence: 0.95,
        method: 'rules'
      };
    }
    if (this.isAnalytics(name, domain)) {
      return {
        category: CATEGORIES.ANALYTICS,
        confidence: 0.9,
        method: 'rules'
      };
    }
    if (this.isAdvertising(name, domain)) {
      return {
        category: CATEGORIES.ADVERTISING,
        confidence: 0.9,
        method: 'rules'
      };
    }
    if (this.isSocial(domain)) {
      return {
        category: CATEGORIES.SOCIAL,
        confidence: 0.85,
        method: 'rules'
      };
    }
    if (this.isFunctional(name, domain, cookie)) {
      return {
        category: CATEGORIES.FUNCTIONAL,
        confidence: 0.7,
        method: 'rules'
      };
    }
    if (/tracking|track|ad|pixel|campaign|visitor|uuid|guid/i.test(name)) {
      return {
        category: CATEGORIES.ADVERTISING,
        confidence: 0.6,
        method: 'rules-fallback'
      };
    }
    console.log(`⚠️ Unknown cookie: ${name} on ${domain}`);
    return {
      category: CATEGORIES.UNKNOWN,
      confidence: 0.5,
      method: 'rules'
    };
  }
  isEssential(name, domain, cookie) {
    const essentialPatterns = [
      /^(session|csrf|xsrf|auth|token)/i,
      /^(cookie.?consent|cookie.?banner)/i,
      /^(laravel|phpsessid|jsessionid)/i,
      /^(SIDCC|__Secure-.*SIDCC|NID|HSID|SSID|APISID|SAPISID)/i  
    ];
    const essentialDomains = ['google.com', 'gstatic.com', 'youtube.com'];
    return essentialPatterns.some(p => p.test(name)) ||
           (cookie.secure && cookie.httpOnly && cookie.hostOnly) ||
           (essentialDomains.some(d => domain.includes(d)) && cookie.secure);
  }
  isAnalytics(name, domain) {
    const analyticsPatterns = [
      /^(_ga|_gid|_gat)/,
      /^(__utm[a-z])/,
      /(analytics|stats)/i
    ];
    const analyticsDomains = ['google-analytics.com', 'googletagmanager.com'];
    return analyticsPatterns.some(p => p.test(name)) ||
           analyticsDomains.some(d => domain.includes(d));
  }
  isAdvertising(name, domain) {
    const adPatterns = [
      /^(_fbp|_fbc|fr|ide|test_cookie|_gcl|DSID|AID|TAID)/i,
      /(doubleclick|adsense|adserver|adtech|adform|criteo|taboola|outbrain)/i,
      /^(uid|uuid|visitor|vid|_kuid)/i,
      /(track|pixel|campaign|retarget)/i
    ];
    const adDomains = [
      'doubleclick.net', 'adsense.google.com', 'criteo.com', 'criteo.net',
      'taboola.com', 'outbrain.com', 'adsrvr.org', 'quantserve.com',
      'pubmatic.com', 'rubiconproject.com', 'adnxs.com'
    ];
    return adPatterns.some(p => p.test(name)) ||
           adDomains.some(d => domain.includes(d));
  }
  isSocial(domain) {
    const socialWidgetDomains = [
      'connect.facebook.net',    
      'platform.twitter.com',    
      'platform.linkedin.com',   
      'widgets.pinterest.com',   
      'embed.reddit.com'         
    ];
    return socialWidgetDomains.some(d => domain.includes(d));
  }
  isFunctional(name, domain, cookie) {
    if (cookie.hostOnly && !cookie.expirationDate) {
      return true;
    }
    const linkedInPatterns = /^(bcookie|bscookie|lang|lidc|li_at|li_theme|timezone|sdui_ver|li_sugr|aam_uuid|g_state|liap|lms_ads|lms_analytics|dfpfpt|fptctx2|_guid|_pxvid|UserMatchHistory|AnalyticsSyncHistory)/i;
    if (domain.includes('linkedin.com') && linkedInPatterns.test(name)) {
      return true;
    }
    const facebookPatterns = /^(c_user|xs|datr|locale|wd)/i;
    if (domain.includes('facebook.com') && facebookPatterns.test(name)) {
      return true;
    }
    if (/^__cf_bm/i.test(name)) {
      return true;
    }
    if (/^(AMCV_|AMCVS_)/i.test(name)) {
      return true;
    }
    return false;
  }
}
const classifier = new SimpleClassifier();
class SimpleCNAMEDetector {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 3600000; 
    this.trackerDomains = new Set([
      'eulerian.net', 'demdex.net', 'omtrdc.net', 'tagcommander.com',
      'criteo.com', 'criteo.net', 'pardot.com', 'oracleinfinity.io',
      'google-analytics.com', 'googletagmanager.com', 'doubleclick.net'
    ]);
  }
  async checkCookie(cookie) {
    const domain = (cookie.domain || '').replace(/^\./, '');
    const parts = domain.split('.');
    if (parts.length <= 2) {
      return { cloaked: false };
    }
    if (this.cache.has(domain)) {
      const cached = this.cache.get(domain);
      if (Date.now() - cached.time < this.cacheTTL) {
        return cached.result;
      }
    }
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${domain}&type=CNAME`;
      const response = await fetch(url, { headers: { 'Accept': 'application/dns-json' } });
      if (!response.ok) {
        return { cloaked: false, error: 'DNS query failed' };
      }
      const data = await response.json();
      const cname = data.Answer?.find(r => r.type === 5)?.data?.replace(/\.$/, '');
      if (!cname) {
        const result = { cloaked: false };
        this.cache.set(domain, { result, time: Date.now() });
        return result;
      }
      const isTracker = Array.from(this.trackerDomains).some(t =>
        cname.endsWith(t) || cname.endsWith('.' + t)
      );
      const result = {
        cloaked: isTracker,
        domain: domain,
        cname: cname,
        trackerDomain: isTracker ? Array.from(this.trackerDomains).find(t =>
          cname.endsWith(t) || cname.endsWith('.' + t)
        ) : null
      };
      this.cache.set(domain, { result, time: Date.now() });
      return result;
    } catch (error) {
      console.warn('[CNAME] Detection error:', error);
      return { cloaked: false, error: error.message };
    }
  }
}
const cnameDetector = new SimpleCNAMEDetector();
const MODES = {
  OBSERVE: 'observe',
  BALANCED: 'balanced',
  STRICT: 'strict'
};
let currentMode = MODES.OBSERVE;  
let processingQueue = [];
let isProcessing = false;
let processedCookies = new Set();  
async function hashValue(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
function getCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https://' : 'http://';
  const domain = cookie.domain.startsWith('.') ?
    cookie.domain.substring(1) : cookie.domain;
  return `${protocol}${domain}${cookie.path}`;
}
function shouldBlock(classification) {
  if (currentMode === MODES.OBSERVE) return false;
  if (classification.category === 'essential') return false;
  if (currentMode === MODES.STRICT) {
    return classification.category === 'advertising' ||
           classification.category === 'social' ||
           classification.category === 'analytics';
  }
  if (currentMode === MODES.BALANCED) {
    return classification.category === 'advertising' ||
           classification.category === 'social';
  }
  return false;
}
async function processQueue() {
  if (processingQueue.length === 0) {
    isProcessing = false;
    return;
  }
  isProcessing = true;
  const cookie = processingQueue.shift();
  try {
    const classification = classifier.classify(cookie);
    cnameDetector.checkCookie(cookie).then(async (cnameResult) => {
      if (cnameResult.cloaked) {
        console.log(`🔗 CNAME Cloaking detected: ${cnameResult.domain} → ${cnameResult.cname} (Tracker: ${cnameResult.trackerDomain})`);
        const saved = await dbManager.addCNAMECloaking({
          domain: cnameResult.domain,
          cname: cnameResult.cname,
          trackerDomain: cnameResult.trackerDomain,
          cookieName: cookie.name,
          cookieDomain: cookie.domain
        });
        console.log(`✅ CNAME detection saved to DB with ID: ${saved}`);
        if (classification.category === 'functional' || classification.category === 'unknown') {
          classification.category = 'advertising';
          classification.confidence = 0.9;
          classification.cnameCloaked = true;
        }
      }
    }).catch(err => console.warn('[CNAME] Check failed:', err));
    const cookieId = await dbManager.addCookie({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      valueHash: await hashValue(cookie.value),
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expirationDate: cookie.expirationDate,
      hostOnly: cookie.hostOnly,
      session: cookie.session
    });
    await dbManager.addClassification(cookieId, classification);
    console.log(`🍪 Classified: ${cookie.name} (${cookie.domain}) → ${classification.category} (${classification.confidence})`);
    if (shouldBlock(classification)) {
      await chrome.cookies.remove({
        url: getCookieUrl(cookie),
        name: cookie.name
      });
      console.log(`🚫 Blocked ${classification.category} cookie: ${cookie.name}`);
    }
  } catch (error) {
    console.error('Error processing cookie:', error);
  }
  setTimeout(processQueue, 0);
}
async function handleFingerprintDetected(data, sender) {
  try {
    const url = new URL(data.url);
    const domain = url.hostname;
    await dbManager.addFingerprint({
      type: data.fingerprintType,
      method: data.details.method,
      details: JSON.stringify(data.details),
      domain: domain,
      url: data.url,
      timestamp: data.timestamp
    });
    console.log(`🔍 Fingerprinting detected: ${data.fingerprintType} on ${domain}`);
  } catch (error) {
    console.error('Error storing fingerprint:', error);
  }
}
async function handleFingerprintSummary(summary, url, sender) {
  try {
    console.log('📊 Fingerprinting summary:', summary);
  } catch (error) {
    console.error('Error handling fingerprint summary:', error);
  }
}
async function initializeExtension() {
  console.log('🔄 Initializing CookieGuard...');
  try {
    await dbManager.init();
    console.log('✓ Database initialized');
    const savedMode = await dbManager.getSetting('mode');
    currentMode = savedMode || MODES.OBSERVE;
    console.log('✓ CookieGuard ready, mode:', currentMode);
    if (currentMode === MODES.OBSERVE) {
      console.log('⚠️ OBSERVE MODE: Not blocking any cookies');
    } else {
      console.log('🛡️ PROTECTION MODE:', currentMode, '- blocking enabled');
    }
  } catch (error) {
    console.error('❌ Initialization error:', error);
  }
}
initializeExtension();
chrome.runtime.onInstalled.addListener(async () => {
  console.log('✓ CookieGuard installed');
  await initializeExtension();
});
chrome.runtime.onStartup.addListener(async () => {
  console.log('✓ Browser started');
  await initializeExtension();
});
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.removed) return;
  const cookie = changeInfo.cookie;
  const cookieId = `${cookie.domain}:${cookie.name}:${cookie.value}`;
  if (processedCookies.has(cookieId)) {
    return;
  }
  processedCookies.add(cookieId);
  setTimeout(() => {
    processedCookies.delete(cookieId);
  }, 60000);
  processingQueue.push(cookie);
  if (!isProcessing) {
    processQueue();
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    handleGetStats().then(sendResponse);
    return true;
  }
  if (message.type === 'FINGERPRINT_DETECTED') {
    handleFingerprintDetected(message.data, sender);
    return false; 
  }
  if (message.type === 'FINGERPRINT_SUMMARY') {
    handleFingerprintSummary(message.data, message.url, sender);
    return false;
  }
  if (message.type === 'SET_MODE') {
    handleSetMode(message.mode).then(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_COOKIES') {
    handleClearCookies(message.category).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_DASHBOARD_DATA') {
    handleGetDashboardData().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_ADVANCED_STATS') {
    handleGetAdvancedStats().then(result => {
      console.log('📤 Sending advanced stats response:', result);
      sendResponse(result);
    }).catch(err => {
      console.error('❌ Error in GET_ADVANCED_STATS:', err);
      sendResponse({ fingerprintCount: 0, cnameCount: 0, fingerprints: [], cnameDetections: [] });
    });
    return true;
  }
});
async function handleGetStats() {
  try {
    const [categoryStats, totalCookies, fingerprintStats, cnameStats] = await Promise.all([
      dbManager.getStatsByCategory(),
      dbManager.getAllCookies(1),
      dbManager.getFingerprintStats(),
      dbManager.getCNAMEStats()
    ]);
    const total = Object.values(categoryStats).reduce((a, b) => a + b, 0);
    return {
      success: true,
      stats: {
        total,
        byCategory: categoryStats,
        mode: currentMode,
        fingerprinting: fingerprintStats,
        cnameCloaking: cnameStats 
      }
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { success: false, error: error.message };
  }
}
async function handleSetMode(mode) {
  if (!Object.values(MODES).includes(mode)) {
    return { success: false, error: 'Invalid mode' };
  }
  currentMode = mode;
  await dbManager.setSetting('mode', mode);
  console.log('⚙️ Mode changed to:', mode);
  return { success: true, mode: currentMode };
}
async function handleClearCookies(category) {
  try {
    const cookies = await chrome.cookies.getAll({});
    let removed = 0;
    for (const cookie of cookies) {
      const classification = classifier.classify(cookie);
      if (!category || classification.category === category) {
        await chrome.cookies.remove({
          url: getCookieUrl(cookie),
          name: cookie.name
        });
        removed++;
      }
    }
    console.log(`🗑️ Cleared ${removed} cookies`);
    return { success: true, removed };
  } catch (error) {
    console.error('Error clearing cookies:', error);
    return { success: false, error: error.message };
  }
}
async function handleGetDashboardData() {
  try {
    const allCookies = await dbManager.getAllCookies(5000);
    const cookiesWithClassifications = await Promise.all(
      allCookies.map(async (cookie) => {
        const classification = await dbManager.getClassification(cookie.id);
        return {
          ...cookie,
          classification: classification || { category: 'unknown', confidence: 0.5 }
        };
      })
    );
    console.log(`📊 Dashboard data: ${cookiesWithClassifications.length} cookies`);
    return {
      success: true,
      data: cookiesWithClassifications
    };
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    return { success: false, error: error.message };
  }
}
async function handleGetAdvancedStats() {
  try {
    const fingerprintsTx = dbManager.db.transaction([STORES.FINGERPRINTS], 'readonly');
    const fingerprintsStore = fingerprintsTx.objectStore(STORES.FINGERPRINTS);
    const fingerprints = await new Promise((resolve, reject) => {
      const request = fingerprintsStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cnameTx = dbManager.db.transaction([STORES.CNAME_CLOAKING], 'readonly');
    const cnameStore = cnameTx.objectStore(STORES.CNAME_CLOAKING);
    const cnameDetections = await new Promise((resolve, reject) => {
      const request = cnameStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const processedFingerprints = fingerprints.map(fp => ({
      technique: fp.type,
      domain: fp.domain,
      timestamp: fp.timestamp,
      method: fp.method
    }));
    console.log(`📊 Advanced stats: ${fingerprints.length} fingerprints, ${cnameDetections.length} CNAME detections`);
    return {
      fingerprintCount: fingerprints.length,
      cnameCount: cnameDetections.length,
      fingerprints: processedFingerprints,
      cnameDetections: cnameDetections
    };
  } catch (error) {
    console.error('Error getting advanced stats:', error);
    return {
      fingerprintCount: 0,
      cnameCount: 0,
      fingerprints: [],
      cnameDetections: []
    };
  }
}
console.log('✓ CookieGuard Service Worker Loaded Successfully!');
