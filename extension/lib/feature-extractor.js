const TRACKING_PATTERNS = [
  /^(_ga|_gid|_gat)/,
  /^(__utm[a-z])/,
  /^(fr|datr|c_user)/,
  /^(_fbp|_fbc)/,
  /(uuid|guid|visitor|session|tracker|analytics)/i,
  /^(id|uid|user_id|sess)/,
  /(doubleclick|adsense|adserver)/i
];
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/
];
class FeatureExtractor {
  extractFeatures(cookie) {
    const features = {};
    features.nameLength = cookie.name.length;
    features.valueLength = cookie.value.length;
    features.hasSecure = cookie.secure ? 1 : 0;
    features.hasHttpOnly = cookie.httpOnly ? 1 : 0;
    features.sameSite = this.encodeSameSite(cookie.sameSite);
    features.isSession = !cookie.expirationDate || cookie.session ? 1 : 0;
    features.expirationDays = this.getExpirationDays(cookie.expirationDate);
    features.isFirstParty = this.isFirstParty(cookie.domain, cookie.hostOnly);
    features.domainDepth = (cookie.domain.match(/\./g) || []).length;
    features.nameEntropy = this.calculateEntropy(cookie.name);
    features.valueEntropy = this.calculateEntropy(cookie.value);
    features.matchesTrackingPattern = this.matchesPatterns(cookie.name, TRACKING_PATTERNS);
    features.hasPII = this.matchesPatterns(cookie.value, PII_PATTERNS);
    features.hasUUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(cookie.value);
    features.hasNumericOnly = /^\d+$/.test(cookie.value);
    features.hasBase64 = /^[A-Za-z0-9+/=]{20,}$/.test(cookie.value);
    return features;
  }
  calculateEntropy(str) {
    if (!str || str.length === 0) return 0;
    const freq = {};
    for (let char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }
    let entropy = 0;
    const len = str.length;
    for (let char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
  encodeSameSite(sameSite) {
    const mapping = {
      'strict': 2,
      'lax': 1,
      'none': 0,
      'no_restriction': 0
    };
    return mapping[sameSite?.toLowerCase()] ?? 0;
  }
  getExpirationDays(expirationDate) {
    if (!expirationDate) return 0;
    const now = Date.now() / 1000;
    const days = (expirationDate - now) / (60 * 60 * 24);
    return Math.max(0, Math.min(days, 365 * 10));
  }
  isFirstParty(domain, hostOnly) {
    return hostOnly ? 1 : 0;
  }
  matchesPatterns(text, patterns) {
    return patterns.some(pattern => pattern.test(text)) ? 1 : 0;
  }
  featuresToArray(features) {
    return [
      features.nameLength,
      features.valueLength,
      features.hasSecure,
      features.hasHttpOnly,
      features.sameSite,
      features.isSession,
      features.expirationDays,
      features.isFirstParty,
      features.domainDepth,
      features.nameEntropy,
      features.valueEntropy,
      features.matchesTrackingPattern,
      features.hasPII,
      features.hasUUID,
      features.hasNumericOnly,
      features.hasBase64
    ];
  }
  getFeatureNames() {
    return [
      'nameLength',
      'valueLength',
      'hasSecure',
      'hasHttpOnly',
      'sameSite',
      'isSession',
      'expirationDays',
      'isFirstParty',
      'domainDepth',
      'nameEntropy',
      'valueEntropy',
      'matchesTrackingPattern',
      'hasPII',
      'hasUUID',
      'hasNumericOnly',
      'hasBase64'
    ];
  }
}
export default new FeatureExtractor();
