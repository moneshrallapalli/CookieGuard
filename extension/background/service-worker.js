import dbManager from '../lib/db-manager.js';
import classifier from '../lib/classifier.js';

const MODES = {
  OBSERVE: 'observe',
  BALANCED: 'balanced',
  STRICT: 'strict'
};

let currentMode = MODES.BALANCED;
let processingQueue = [];
let isProcessing = false;

chrome.runtime.onInstalled.addListener(async () => {
  console.log('CookieGuard installed');

  await dbManager.init();
  await classifier.init();

  await dbManager.setSetting('mode', MODES.BALANCED);
  await dbManager.setSetting('blockingEnabled', true);

  chrome.alarms.create('cleanup', { periodInMinutes: 60 });
});

chrome.runtime.onStartup.addListener(async () => {
  await dbManager.init();
  await classifier.init();
  currentMode = await dbManager.getSetting('mode') || MODES.BALANCED;
});

chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.removed) return;

  const cookie = changeInfo.cookie;
  processingQueue.push(cookie);

  if (!isProcessing) {
    processQueue();
  }
});

async function processQueue() {
  if (processingQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const cookie = processingQueue.shift();

  try {
    const startTime = performance.now();

    const classification = await classifier.classify(cookie);

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

    const processingTime = performance.now() - startTime;

    if (processingTime > 10) {
      console.warn(`Cookie processing took ${processingTime}ms`);
    }

    if (shouldBlock(classification)) {
      await chrome.cookies.remove({
        url: getCookieUrl(cookie),
        name: cookie.name
      });
      console.log(`Blocked ${classification.category} cookie: ${cookie.name}`);
    }

    chrome.runtime.sendMessage({
      type: 'COOKIE_CLASSIFIED',
      data: {
        domain: cookie.domain,
        name: cookie.name,
        category: classification.category,
        confidence: classification.confidence
      }
    }).catch(() => {});

  } catch (error) {
    console.error('Error processing cookie:', error);
  }

  setTimeout(processQueue, 0);
}

function shouldBlock(classification) {
  if (currentMode === MODES.OBSERVE) return false;
  if (classification.category === 'essential') return false;

  if (currentMode === MODES.STRICT) {
    return classification.category !== 'functional';
  }

  if (currentMode === MODES.BALANCED) {
    return classification.category === 'advertising' ||
           classification.category === 'social';
  }

  return false;
}

function getCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https://' : 'http://';
  const domain = cookie.domain.startsWith('.') ?
    cookie.domain.substring(1) : cookie.domain;
  return `${protocol}${domain}${cookie.path}`;
}

async function hashValue(value) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup') {
    await dbManager.clearOldData(7);
    classifier.clearCache();
    console.log('Cleanup completed');
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATS') {
    handleGetStats().then(sendResponse);
    return true;
  }

  if (message.type === 'SET_MODE') {
    handleSetMode(message.mode).then(sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_COOKIES') {
    handleClearCookies(message.category).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_COOKIE_DETAILS') {
    handleGetCookieDetails(message.domain).then(sendResponse);
    return true;
  }
});

async function handleGetStats() {
  try {
    const [categoryStats, totalCookies] = await Promise.all([
      dbManager.getStatsByCategory(),
      dbManager.getAllCookies(1)
    ]);

    const total = Object.values(categoryStats).reduce((a, b) => a + b, 0);

    return {
      success: true,
      stats: {
        total,
        byCategory: categoryStats,
        mode: currentMode
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleSetMode(mode) {
  if (!Object.values(MODES).includes(mode)) {
    return { success: false, error: 'Invalid mode' };
  }

  currentMode = mode;
  await dbManager.setSetting('mode', mode);

  return { success: true, mode: currentMode };
}

async function handleClearCookies(category) {
  try {
    const cookies = await chrome.cookies.getAll({});
    let removed = 0;

    for (const cookie of cookies) {
      const classification = await classifier.classify(cookie);

      if (!category || classification.category === category) {
        await chrome.cookies.remove({
          url: getCookieUrl(cookie),
          name: cookie.name
        });
        removed++;
      }
    }

    return { success: true, removed };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleGetCookieDetails(domain) {
  try {
    const cookies = await dbManager.getCookiesByDomain(domain);
    const details = await Promise.all(
      cookies.map(async (cookie) => {
        const classification = await dbManager.getClassification(cookie.id);
        return { ...cookie, classification };
      })
    );

    return { success: true, cookies: details };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

console.log('CookieGuard service worker loaded');
