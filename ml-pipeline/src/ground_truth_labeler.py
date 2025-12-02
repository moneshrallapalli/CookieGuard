"""
Ground Truth Labeler using real tracker databases:
- EasyList (general ad blocking)
- EasyPrivacy (tracking protection)
- Disconnect.me tracker database
"""

import json
import re
import requests
from pathlib import Path
from typing import Dict, List, Set, Optional
from urllib.parse import urlparse
import time


class GroundTruthLabeler:
    """Labels cookies using real-world tracker databases"""

    CATEGORIES = ['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown']

    # Tracker list URLs
    EASYLIST_URL = 'https://easylist.to/easylist/easylist.txt'
    EASYPRIVACY_URL = 'https://easylist.to/easylist/easyprivacy.txt'
    DISCONNECT_URL = 'https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/services.json'

    def __init__(self, cache_dir: str = 'data/tracker_lists'):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Tracker domain sets by category
        self.advertising_domains: Set[str] = set()
        self.analytics_domains: Set[str] = set()
        self.social_domains: Set[str] = set()
        self.all_tracker_domains: Set[str] = set()

        # Known essential/functional patterns (curated from browser cookie research)
        self.essential_patterns = [
            r'^(session|sess|sid|phpsessid|jsessionid|asp\.net_sessionid)',
            r'^(csrf|xsrf|_csrf|csrf_token)',
            r'^(auth|token|jwt|bearer)',
            r'^(cookie.?consent|cookie.?banner|gdpr)',
        ]

        self.functional_patterns = [
            r'^(lang|language|locale|i18n)',
            r'^(timezone|tz)',
            r'^(theme|display|mode)',
            r'^(cart|basket|wishlist)',
            r'^(pref|preference|settings)',
        ]

        self.essential_regex = [re.compile(p, re.IGNORECASE) for p in self.essential_patterns]
        self.functional_regex = [re.compile(p, re.IGNORECASE) for p in self.functional_patterns]

    def download_tracker_lists(self, force_refresh: bool = False):
        """Download and cache tracker lists"""
        print("Downloading tracker lists...")

        # Download EasyList
        easylist_cache = self.cache_dir / 'easylist.txt'
        if force_refresh or not easylist_cache.exists():
            print("  Downloading EasyList...")
            self._download_file(self.EASYLIST_URL, easylist_cache)

        # Download EasyPrivacy
        easyprivacy_cache = self.cache_dir / 'easyprivacy.txt'
        if force_refresh or not easyprivacy_cache.exists():
            print("  Downloading EasyPrivacy...")
            self._download_file(self.EASYPRIVACY_URL, easyprivacy_cache)

        # Download Disconnect
        disconnect_cache = self.cache_dir / 'disconnect.json'
        if force_refresh or not disconnect_cache.exists():
            print("  Downloading Disconnect.me database...")
            self._download_file(self.DISCONNECT_URL, disconnect_cache)

        print("✓ Tracker lists downloaded\n")

    def _download_file(self, url: str, output_path: Path):
        """Download a file with retry logic"""
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(url, timeout=30)
                response.raise_for_status()
                output_path.write_text(response.text, encoding='utf-8')
                return
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"    Retry {attempt + 1}/{max_retries}...")
                    time.sleep(2)
                else:
                    print(f"    Failed to download {url}: {e}")
                    raise

    def parse_tracker_lists(self):
        """Parse downloaded tracker lists into domain sets"""
        print("Parsing tracker lists...")

        # Parse EasyList
        easylist_cache = self.cache_dir / 'easylist.txt'
        if easylist_cache.exists():
            ad_domains = self._parse_adblock_list(easylist_cache)
            self.advertising_domains.update(ad_domains)
            print(f"  EasyList: {len(ad_domains)} advertising domains")

        # Parse EasyPrivacy
        easyprivacy_cache = self.cache_dir / 'easyprivacy.txt'
        if easyprivacy_cache.exists():
            tracking_domains = self._parse_adblock_list(easyprivacy_cache)
            self.analytics_domains.update(tracking_domains)
            print(f"  EasyPrivacy: {len(tracking_domains)} tracking domains")

        # Parse Disconnect
        disconnect_cache = self.cache_dir / 'disconnect.json'
        if disconnect_cache.exists():
            self._parse_disconnect_list(disconnect_cache)

        # Combine all tracker domains
        self.all_tracker_domains = (
            self.advertising_domains |
            self.analytics_domains |
            self.social_domains
        )

        print(f"✓ Total unique tracker domains: {len(self.all_tracker_domains)}\n")

    def _parse_adblock_list(self, file_path: Path) -> Set[str]:
        """Parse AdBlock Plus format lists (EasyList, EasyPrivacy)"""
        domains = set()
        content = file_path.read_text(encoding='utf-8')

        for line in content.split('\n'):
            line = line.strip()

            # Skip comments and empty lines
            if not line or line.startswith('!') or line.startswith('['):
                continue

            # Extract domains from various filter formats
            # ||example.com^ format
            if line.startswith('||') and '^' in line:
                domain = line[2:line.index('^')]
                domain = self._clean_domain(domain)
                if domain:
                    domains.add(domain)

            # |http://example.com format
            elif line.startswith('|http'):
                try:
                    parsed = urlparse(line[1:])
                    domain = self._clean_domain(parsed.netloc)
                    if domain:
                        domains.add(domain)
                except:
                    pass

        return domains

    def _parse_disconnect_list(self, file_path: Path):
        """Parse Disconnect.me JSON tracker database"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Disconnect format: { "categories": { "Advertising": [...], "Analytics": [...], ... } }
            categories = data.get('categories', {})

            # Parse Advertising
            for entry in categories.get('Advertising', []):
                for company_name, company_data in entry.items():
                    for domain_list in company_data.values():
                        if isinstance(domain_list, list):
                            for domain in domain_list:
                                self.advertising_domains.add(self._clean_domain(domain))

            # Parse Analytics
            for entry in categories.get('Analytics', []):
                for company_name, company_data in entry.items():
                    for domain_list in company_data.values():
                        if isinstance(domain_list, list):
                            for domain in domain_list:
                                self.analytics_domains.add(self._clean_domain(domain))

            # Parse Social
            for entry in categories.get('Social', []):
                for company_name, company_data in entry.items():
                    for domain_list in company_data.values():
                        if isinstance(domain_list, list):
                            for domain in domain_list:
                                self.social_domains.add(self._clean_domain(domain))

            print(f"  Disconnect.me:")
            print(f"    Advertising: {len([d for d in self.advertising_domains if d])} domains")
            print(f"    Analytics: {len([d for d in self.analytics_domains if d])} domains")
            print(f"    Social: {len([d for d in self.social_domains if d])} domains")

        except Exception as e:
            print(f"  Error parsing Disconnect.me: {e}")

    def _clean_domain(self, domain: str) -> str:
        """Clean and normalize domain names"""
        if not domain:
            return ''

        # Remove protocol
        domain = re.sub(r'^https?://', '', domain)

        # Remove port
        domain = re.sub(r':\d+', '', domain)

        # Remove path
        domain = domain.split('/')[0]

        # Remove wildcards
        domain = domain.replace('*', '')

        # Remove leading/trailing dots
        domain = domain.strip('.')

        # Convert to lowercase
        domain = domain.lower()

        # Validate domain format
        if not domain or ' ' in domain or len(domain) < 3:
            return ''

        return domain

    def label_cookie(self, cookie: Dict) -> Dict:
        """
        Label a cookie using ground truth tracker databases

        Returns dict with:
        - label: category name
        - confidence: 0.0 to 1.0
        - reason: why this label was chosen
        - sources: which databases matched
        """
        name = cookie.get('name', '').lower()
        domain = cookie.get('domain', '').lower().strip('.')

        # Extract base domain (e.g., "example.com" from "sub.example.com")
        domain_parts = domain.split('.')
        base_domain = '.'.join(domain_parts[-2:]) if len(domain_parts) >= 2 else domain

        sources = []

        # 1. Check essential patterns (highest priority)
        if any(regex.match(name) for regex in self.essential_regex):
            return {
                'label': 'essential',
                'confidence': 0.98,
                'reason': 'Cookie name matches essential pattern',
                'sources': ['pattern_matching']
            }

        # 2. Check if domain is in social tracker list
        if self._domain_in_set(domain, base_domain, self.social_domains):
            sources.append('disconnect.me')
            return {
                'label': 'social',
                'confidence': 0.95,
                'reason': f'Domain {domain} found in social tracker databases',
                'sources': sources
            }

        # 3. Check if domain is in advertising tracker list
        if self._domain_in_set(domain, base_domain, self.advertising_domains):
            sources.extend(['easylist', 'disconnect.me'])
            return {
                'label': 'advertising',
                'confidence': 0.95,
                'reason': f'Domain {domain} found in advertising tracker databases',
                'sources': sources
            }

        # 4. Check if domain is in analytics tracker list
        if self._domain_in_set(domain, base_domain, self.analytics_domains):
            sources.extend(['easyprivacy', 'disconnect.me'])
            return {
                'label': 'analytics',
                'confidence': 0.95,
                'reason': f'Domain {domain} found in analytics tracker databases',
                'sources': sources
            }

        # 5. Check functional patterns
        if any(regex.match(name) for regex in self.functional_regex):
            return {
                'label': 'functional',
                'confidence': 0.85,
                'reason': 'Cookie name matches functional pattern',
                'sources': ['pattern_matching']
            }

        # 6. Heuristic fallback for first-party session cookies
        is_first_party = cookie.get('hostOnly', False)
        is_session = not cookie.get('expirationDate')
        has_secure = cookie.get('secure', False)

        if is_first_party and is_session:
            return {
                'label': 'functional',
                'confidence': 0.70,
                'reason': 'First-party session cookie (likely functional)',
                'sources': ['heuristic']
            }

        # 7. Default to unknown
        return {
            'label': 'unknown',
            'confidence': 0.50,
            'reason': 'No match in tracker databases',
            'sources': []
        }

    def _domain_in_set(self, full_domain: str, base_domain: str, domain_set: Set[str]) -> bool:
        """Check if domain or any parent domain is in the set"""
        # Check full domain
        if full_domain in domain_set:
            return True

        # Check base domain
        if base_domain in domain_set:
            return True

        # Check if any tracker domain is a suffix of this domain
        for tracker_domain in domain_set:
            if full_domain.endswith('.' + tracker_domain) or full_domain == tracker_domain:
                return True

        return False

    def label_cookies_batch(self, cookies: List[Dict]) -> List[Dict]:
        """Label a batch of cookies"""
        labeled_cookies = []

        stats = {cat: 0 for cat in self.CATEGORIES}

        for cookie in cookies:
            label_info = self.label_cookie(cookie)

            # Add label info to cookie
            cookie['label'] = label_info['label']
            cookie['label_confidence'] = label_info['confidence']
            cookie['label_reason'] = label_info['reason']
            cookie['label_sources'] = label_info['sources']

            labeled_cookies.append(cookie)
            stats[label_info['label']] += 1

        return labeled_cookies, stats

    def save_labeled_data(self, labeled_cookies: List[Dict], output_path: str):
        """Save labeled cookies to JSON file"""
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(labeled_cookies, f, indent=2)

        print(f"✓ Saved {len(labeled_cookies)} labeled cookies to {output_path}")

    def initialize(self, force_refresh: bool = False):
        """Initialize the labeler by downloading and parsing all lists"""
        self.download_tracker_lists(force_refresh)
        self.parse_tracker_lists()

        print("Ground truth labeler ready!")
        print(f"  Advertising domains: {len(self.advertising_domains)}")
        print(f"  Analytics domains: {len(self.analytics_domains)}")
        print(f"  Social domains: {len(self.social_domains)}")
        print(f"  Total tracker domains: {len(self.all_tracker_domains)}\n")


def main():
    """Test the ground truth labeler"""
    labeler = GroundTruthLabeler()

    # Initialize (download and parse tracker lists)
    labeler.initialize(force_refresh=False)

    # Check if we have raw cookie data to label
    raw_data_path = Path('data/raw/cookies.json')
    labeled_output_path = Path('data/processed/labeled_cookies_ground_truth.json')

    if raw_data_path.exists():
        print(f"\nLabeling cookies from {raw_data_path}...")

        with open(raw_data_path, 'r') as f:
            cookies = json.load(f)

        print(f"Found {len(cookies)} cookies to label\n")

        # Label all cookies
        labeled_cookies, stats = labeler.label_cookies_batch(cookies)

        # Print statistics
        print("\nLabeling Results:")
        print("=" * 50)
        for category, count in sorted(stats.items()):
            percentage = (count / len(cookies)) * 100
            print(f"  {category:15s}: {count:5d} ({percentage:5.1f}%)")
        print("=" * 50)

        # Save labeled data
        labeler.save_labeled_data(labeled_cookies, labeled_output_path)

        # Show some examples
        print("\nSample labeled cookies:")
        for cookie in labeled_cookies[:5]:
            print(f"\n  Cookie: {cookie['name']}")
            print(f"  Domain: {cookie['domain']}")
            print(f"  Label: {cookie['label']} (confidence: {cookie['label_confidence']:.2f})")
            print(f"  Reason: {cookie['label_reason']}")
            print(f"  Sources: {', '.join(cookie['label_sources']) or 'none'}")

    else:
        print(f"\nNo cookie data found at {raw_data_path}")
        print("Run data_collector.py first to collect cookies, then run this script again.")


if __name__ == '__main__':
    main()
