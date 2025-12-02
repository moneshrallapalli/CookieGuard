class CNAMEDetector {
  constructor() {
    this.dohProviders = {
      cloudflare: 'https://cloudflare-dns.com/dns-query',
      google: 'https://dns.google/resolve'
    };
    this.currentProvider = 'cloudflare';
    this.cnameCache = new Map();
    this.cacheTTL = 3600000; 
    this.trackerDomains = new Set();
    this.stats = {
      totalQueries: 0,
      cacheHits: 0,
      cloakingDetected: 0,
      uniqueCloackedDomains: new Set()
    };
  }
  async init(trackerDomainList = []) {
    console.log('[CNAME Detector] Initializing...');
    if (trackerDomainList.length > 0) {
      trackerDomainList.forEach(domain => {
        this.trackerDomains.add(domain.toLowerCase());
      });
      console.log(`[CNAME Detector] Loaded ${this.trackerDomains.size} tracker domains`);
    }
    if (this.trackerDomains.size === 0) {
      this.loadDefaultTrackerDomains();
    }
    console.log('[CNAME Detector] Ready');
  }
  loadDefaultTrackerDomains() {
    const commonTrackerDomains = [
      'eulerian.net',
      'eulerian.com',
      'demdex.net',
      'omtrdc.net',
      'adobedc.net',
      'tagcommander.com',
      'commander1.com',
      'xiti.com',
      'criteo.com',
      'criteo.net',
      'pardot.com',
      'salesforceliveagent.com',
      'oracleinfinity.io',
      'eloqua.com',
      'cloudfront.net',
      'fastly.net',
      'edgecastcdn.net',
      'google-analytics.com',
      'googletagmanager.com',
      'doubleclick.net',
      'facebook.net',
      'trackercdn.com',
      'tracking.com',
      'analytics-cdn.com'
    ];
    commonTrackerDomains.forEach(domain => {
      this.trackerDomains.add(domain.toLowerCase());
    });
    console.log(`[CNAME Detector] Loaded ${this.trackerDomains.size} default tracker domains`);
  }
  async detectCloaking(domain) {
    if (!domain) {
      return { cloaked: false, error: 'No domain provided' };
    }
    domain = domain.toLowerCase().trim();
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    const cached = this.getCachedResult(domain);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }
    this.stats.totalQueries++;
    try {
      const cnameChain = await this.queryCNAMEChain(domain);
      const cloakingDetected = this.isTrackerInChain(cnameChain);
      const result = {
        cloaked: cloakingDetected.isCloaked,
        domain: domain,
        cnameChain: cnameChain,
        trackerDomain: cloakingDetected.trackerDomain,
        trackerPosition: cloakingDetected.position,
        timestamp: Date.now()
      };
      this.cacheResult(domain, result);
      if (result.cloaked) {
        this.stats.cloakingDetected++;
        this.stats.uniqueCloackedDomains.add(domain);
      }
      return result;
    } catch (error) {
      console.error(`[CNAME Detector] Error checking ${domain}:`, error);
      return {
        cloaked: false,
        domain: domain,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  async queryCNAMEChain(domain) {
    const chain = [domain];
    let currentDomain = domain;
    let maxDepth = 10; 
    let depth = 0;
    while (depth < maxDepth) {
      const cname = await this.queryCNAME(currentDomain);
      if (!cname || cname === currentDomain) {
        break;
      }
      chain.push(cname);
      currentDomain = cname;
      depth++;
    }
    return chain;
  }
  async queryCNAME(domain) {
    try {
      const provider = this.currentProvider;
      const url = this.buildDNSQuery(provider, domain, 'CNAME');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/dns-json'
        }
      });
      if (!response.ok) {
        console.warn(`[CNAME Detector] DNS query failed for ${domain}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (provider === 'cloudflare') {
        return this.parseCloudflareResponse(data);
      } else if (provider === 'google') {
        return this.parseGoogleResponse(data);
      }
      return null;
    } catch (error) {
      console.warn(`[CNAME Detector] DNS query error for ${domain}:`, error);
      return null;
    }
  }
  buildDNSQuery(provider, domain, recordType = 'CNAME') {
    const baseUrl = this.dohProviders[provider];
    if (provider === 'cloudflare') {
      return `${baseUrl}?name=${encodeURIComponent(domain)}&type=${recordType}`;
    } else if (provider === 'google') {
      return `${baseUrl}?name=${encodeURIComponent(domain)}&type=${recordType}`;
    }
    throw new Error(`Unknown DoH provider: ${provider}`);
  }
  parseCloudflareResponse(data) {
    if (!data.Answer || data.Answer.length === 0) {
      return null;
    }
    const cnameRecord = data.Answer.find(record => record.type === 5);
    if (cnameRecord && cnameRecord.data) {
      return cnameRecord.data.replace(/\.$/, '');
    }
    return null;
  }
  parseGoogleResponse(data) {
    if (!data.Answer || data.Answer.length === 0) {
      return null;
    }
    const cnameRecord = data.Answer.find(record => record.type === 5);
    if (cnameRecord && cnameRecord.data) {
      return cnameRecord.data.replace(/\.$/, '');
    }
    return null;
  }
  isTrackerInChain(cnameChain) {
    for (let i = 0; i < cnameChain.length; i++) {
      const domain = cnameChain[i].toLowerCase();
      if (this.trackerDomains.has(domain)) {
        return {
          isCloaked: true,
          trackerDomain: domain,
          position: i
        };
      }
      for (const trackerDomain of this.trackerDomains) {
        if (domain.endsWith('.' + trackerDomain) || domain === trackerDomain) {
          return {
            isCloaked: true,
            trackerDomain: trackerDomain,
            position: i
          };
        }
      }
    }
    return { isCloaked: false };
  }
  cacheResult(domain, result) {
    this.cnameCache.set(domain, {
      result: result,
      timestamp: Date.now()
    });
    if (this.cnameCache.size > 1000) {
      this.cleanupCache();
    }
  }
  getCachedResult(domain) {
    const cached = this.cnameCache.get(domain);
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cnameCache.delete(domain);
      return null;
    }
    return cached.result;
  }
  cleanupCache() {
    const now = Date.now();
    const toDelete = [];
    for (const [domain, cached] of this.cnameCache.entries()) {
      if (now - cached.timestamp > this.cacheTTL) {
        toDelete.push(domain);
      }
    }
    toDelete.forEach(domain => this.cnameCache.delete(domain));
    console.log(`[CNAME Detector] Cache cleanup: removed ${toDelete.length} entries`);
  }
  getStats() {
    return {
      totalQueries: this.stats.totalQueries,
      cacheHits: this.stats.cacheHits,
      cacheHitRate: this.stats.totalQueries > 0
        ? (this.stats.cacheHits / this.stats.totalQueries * 100).toFixed(2) + '%'
        : '0%',
      cloakingDetected: this.stats.cloakingDetected,
      uniqueCloackedDomains: this.stats.uniqueCloackedDomains.size,
      cacheSize: this.cnameCache.size,
      trackerDatabaseSize: this.trackerDomains.size
    };
  }
  clearCache() {
    this.cnameCache.clear();
    console.log('[CNAME Detector] Cache cleared');
  }
  async batchDetect(domains) {
    const results = [];
    const chunkSize = 10;
    for (let i = 0; i < domains.length; i += chunkSize) {
      const chunk = domains.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(domain => this.detectCloaking(domain))
      );
      results.push(...chunkResults);
      if (i + chunkSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    return results;
  }
  extractDomain(cookie) {
    let domain = cookie.domain || '';
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    return domain;
  }
  async checkCookie(cookie) {
    const domain = this.extractDomain(cookie);
    if (!domain) {
      return { cloaked: false, error: 'No domain in cookie' };
    }
    const parts = domain.split('.');
    if (parts.length <= 2) {
      return { cloaked: false, reason: 'Main domain, not a subdomain' };
    }
    const result = await this.detectCloaking(domain);
    result.cookie = {
      name: cookie.name,
      domain: cookie.domain,
      hostOnly: cookie.hostOnly
    };
    return result;
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CNAMEDetector;
}
