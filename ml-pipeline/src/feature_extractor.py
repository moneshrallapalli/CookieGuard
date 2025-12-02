import re
import math
import numpy as np
from typing import Dict, List


class FeatureExtractor:

    TRACKING_PATTERNS = [
        r'^(_ga|_gid|_gat)',
        r'^(__utm[a-z])',
        r'^(fr|datr|c_user)',
        r'^(_fbp|_fbc)',
        r'(uuid|guid|visitor|session|tracker|analytics)',
        r'^(id|uid|user_id|sess)',
        r'(doubleclick|adsense|adserver)'
    ]

    PII_PATTERNS = [
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
        r'\b\d{3}-\d{2}-\d{4}\b'
    ]

    def __init__(self):
        self.tracking_regex = [re.compile(p, re.IGNORECASE) for p in self.TRACKING_PATTERNS]
        self.pii_regex = [re.compile(p) for p in self.PII_PATTERNS]

    def extract_features(self, cookie: Dict) -> Dict:
        features = {}

        features['nameLength'] = len(cookie.get('name', ''))
        features['valueLength'] = len(cookie.get('value', ''))
        features['hasSecure'] = 1 if cookie.get('secure', False) else 0
        features['hasHttpOnly'] = 1 if cookie.get('httpOnly', False) else 0
        features['sameSite'] = self._encode_same_site(cookie.get('sameSite'))

        features['isSession'] = 1 if not cookie.get('expirationDate') else 0
        features['expirationDays'] = self._get_expiration_days(cookie.get('expirationDate'))

        features['isFirstParty'] = 1 if cookie.get('hostOnly', False) else 0
        domain = cookie.get('domain', '')
        features['domainDepth'] = domain.count('.')

        name = cookie.get('name', '')
        value = cookie.get('value', '')
        features['nameEntropy'] = self._calculate_entropy(name)
        features['valueEntropy'] = self._calculate_entropy(value)

        features['matchesTrackingPattern'] = self._matches_patterns(name, self.tracking_regex)
        features['hasPII'] = self._matches_patterns(value, self.pii_regex)

        features['hasUUID'] = 1 if re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', value, re.IGNORECASE) else 0
        features['hasNumericOnly'] = 1 if re.match(r'^\d+$', value) else 0
        features['hasBase64'] = 1 if re.match(r'^[A-Za-z0-9+/=]{20,}$', value) else 0

        return features

    def _calculate_entropy(self, text: str) -> float:
        if not text or len(text) == 0:
            return 0.0

        freq = {}
        for char in text:
            freq[char] = freq.get(char, 0) + 1

        entropy = 0.0
        text_len = len(text)
        for count in freq.values():
            p = count / text_len
            entropy -= p * math.log2(p)

        return entropy

    def _encode_same_site(self, same_site) -> int:
        mapping = {
            'strict': 2,
            'lax': 1,
            'none': 0,
            'no_restriction': 0
        }
        if same_site:
            return mapping.get(str(same_site).lower(), 0)
        return 0

    def _get_expiration_days(self, expiration_date) -> float:
        if not expiration_date:
            return 0.0

        try:
            import time
            now = time.time()
            days = (float(expiration_date) - now) / (60 * 60 * 24)
            return max(0, min(days, 365 * 10))
        except:
            return 0.0

    def _matches_patterns(self, text: str, patterns: List) -> int:
        return 1 if any(p.search(text) for p in patterns) else 0

    def features_to_array(self, features: Dict) -> np.ndarray:
        feature_order = [
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
        ]

        return np.array([features.get(f, 0) for f in feature_order])

    def get_feature_names(self) -> List[str]:
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
        ]
