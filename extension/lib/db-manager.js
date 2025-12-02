const DB_NAME = 'CookieGuardDB';
const DB_VERSION = 2; 
const STORES = {
  COOKIES: 'cookies',
  CLASSIFICATIONS: 'classifications',
  SETTINGS: 'settings',
  FINGERPRINTS: 'fingerprints' 
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
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
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
  async getCookiesByDomain(domain) {
    const tx = this.db.transaction([STORES.COOKIES], 'readonly');
    const store = tx.objectStore(STORES.COOKIES);
    const index = store.index('domain');
    return new Promise((resolve, reject) => {
      const request = index.getAll(domain);
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
  async getClassification(cookieId) {
    const tx = this.db.transaction([STORES.CLASSIFICATIONS], 'readonly');
    const store = tx.objectStore(STORES.CLASSIFICATIONS);
    return new Promise((resolve, reject) => {
      const request = store.get(cookieId);
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
  async clearOldData(daysToKeep = 7) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const tx = this.db.transaction([STORES.COOKIES], 'readwrite');
    const store = tx.objectStore(STORES.COOKIES);
    const index = store.index('timestamp');
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
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
  async getFingerprintsByType(type, limit = 100) {
    const tx = this.db.transaction([STORES.FINGERPRINTS], 'readonly');
    const store = tx.objectStore(STORES.FINGERPRINTS);
    const index = store.index('type');
    return new Promise((resolve, reject) => {
      const request = index.getAll(type, limit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getFingerprintsByDomain(domain, limit = 100) {
    const tx = this.db.transaction([STORES.FINGERPRINTS], 'readonly');
    const store = tx.objectStore(STORES.FINGERPRINTS);
    const index = store.index('domain');
    return new Promise((resolve, reject) => {
      const request = index.getAll(domain, limit);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async getAllFingerprints(limit = 1000) {
    const tx = this.db.transaction([STORES.FINGERPRINTS], 'readonly');
    const store = tx.objectStore(STORES.FINGERPRINTS);
    return new Promise((resolve, reject) => {
      const request = store.getAll(null, limit);
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
  async clearOldFingerprints(daysToKeep = 7) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const tx = this.db.transaction([STORES.FINGERPRINTS], 'readwrite');
    const store = tx.objectStore(STORES.FINGERPRINTS);
    const index = store.index('timestamp');
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}
export default new DBManager();
