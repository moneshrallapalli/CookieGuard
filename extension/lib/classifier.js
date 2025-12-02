import featureExtractor from './feature-extractor.js';
const CATEGORIES = {
  ESSENTIAL: 'essential',
  FUNCTIONAL: 'functional',
  ANALYTICS: 'analytics',
  ADVERTISING: 'advertising',
  SOCIAL: 'social',
  UNKNOWN: 'unknown'
};
const CACHE_TTL = 5 * 60 * 1000;
class Classifier {
  constructor() {
    this.session = null;
    this.cache = new Map();
    this.modelLoaded = false;
  }
  async init() {
    try {
      if (typeof ort === 'undefined') {
        console.warn('ONNX Runtime not loaded, using rule-based classification');
        return;
      }
      const modelPath = chrome.runtime.getURL('models/cookie-classifier.onnx');
      this.session = await ort.InferenceSession.create(modelPath);
      this.modelLoaded = true;
      console.log('ML model loaded successfully');
    } catch (error) {
      console.error('Failed to load ML model:', error);
      this.modelLoaded = false;
    }
  }
  async classify(cookie) {
    const cacheKey = `${cookie.domain}:${cookie.name}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }
    let result;
    if (this.modelLoaded && this.session) {
      result = await this.mlClassify(cookie);
    } else {
      result = this.ruleBasedClassify(cookie);
    }
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    return result;
  }
  async mlClassify(cookie) {
    try {
      const features = featureExtractor.extractFeatures(cookie);
      const featureArray = featureExtractor.featuresToArray(features);
      const tensor = new ort.Tensor('float32', featureArray, [1, featureArray.length]);
      const feeds = { input: tensor };
      const results = await this.session.run(feeds);
      const output = results.output.data;
      const maxIndex = output.indexOf(Math.max(...output));
      const confidence = output[maxIndex];
      const categories = Object.values(CATEGORIES);
      const category = categories[maxIndex] || CATEGORIES.UNKNOWN;
      return {
        category,
        confidence,
        method: 'ml',
        features
      };
    } catch (error) {
      console.error('ML classification failed, falling back to rules:', error);
      return this.ruleBasedClassify(cookie);
    }
  }
  ruleBasedClassify(cookie) {
    const features = featureExtractor.extractFeatures(cookie);
    const name = cookie.name.toLowerCase();
    const domain = cookie.domain.toLowerCase();
    if (this.isEssential(name, domain, features)) {
      return {
        category: CATEGORIES.ESSENTIAL,
        confidence: 0.95,
        method: 'rules',
        features
      };
    }
    if (this.isAnalytics(name, domain)) {
      return {
        category: CATEGORIES.ANALYTICS,
        confidence: 0.9,
        method: 'rules',
        features
      };
    }
    if (this.isAdvertising(name, domain)) {
      return {
        category: CATEGORIES.ADVERTISING,
        confidence: 0.9,
        method: 'rules',
        features
      };
    }
    if (this.isSocial(domain)) {
      return {
        category: CATEGORIES.SOCIAL,
        confidence: 0.85,
        method: 'rules',
        features
      };
    }
    if (features.isFirstParty && features.isSession) {
      return {
        category: CATEGORIES.FUNCTIONAL,
        confidence: 0.7,
        method: 'rules',
        features
      };
    }
    return {
      category: CATEGORIES.UNKNOWN,
      confidence: 0.5,
      method: 'rules',
      features
    };
  }
  isEssential(name, domain, features) {
    const essentialPatterns = [
      /^(session|csrf|xsrf|auth|token)/i,
      /^(cookie.?consent|cookie.?banner)/i,
      /^(laravel|phpsessid|jsessionid)/i
    ];
    return essentialPatterns.some(p => p.test(name)) ||
           (features.hasSecure && features.hasHttpOnly && features.isFirstParty);
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
      /^(id|uid|uuid|visitor)/i,
      /^(_fbp|_fbc|fr)/,
      /(doubleclick|adsense|adserver|adtech)/i
    ];
    const adDomains = ['doubleclick.net', 'adsense.google.com', 'facebook.com'];
    return adPatterns.some(p => p.test(name)) ||
           adDomains.some(d => domain.includes(d));
  }
  isSocial(domain) {
    const socialDomains = [
      'facebook.com', 'twitter.com', 'linkedin.com',
      'instagram.com', 'pinterest.com', 'reddit.com'
    ];
    return socialDomains.some(d => domain.includes(d));
  }
  clearCache() {
    this.cache.clear();
  }
}
export default new Classifier();
