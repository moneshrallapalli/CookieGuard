import json
import time
import requests
from pathlib import Path
from typing import List, Dict
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from tqdm import tqdm


class CookieDataCollector:
    def __init__(self, output_dir: str = 'data/raw'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.driver = None

    def setup_driver(self):
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')

        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.set_page_load_timeout(30)

    def collect_cookies_from_url(self, url: str) -> List[Dict]:
        if not self.driver:
            self.setup_driver()

        try:
            self.driver.get(url)
            time.sleep(3)

            cookies = self.driver.get_cookies()

            enriched_cookies = []
            for cookie in cookies:
                enriched_cookie = {
                    'name': cookie.get('name'),
                    'value': cookie.get('value'),
                    'domain': cookie.get('domain'),
                    'path': cookie.get('path', '/'),
                    'secure': cookie.get('secure', False),
                    'httpOnly': cookie.get('httpOnly', False),
                    'sameSite': cookie.get('sameSite', 'None'),
                    'expirationDate': cookie.get('expiry'),
                    'source_url': url,
                    'hostOnly': not cookie.get('domain', '').startswith('.')
                }
                enriched_cookies.append(enriched_cookie)

            return enriched_cookies

        except Exception as e:
            print(f"Error collecting cookies from {url}: {e}")
            return []

    def collect_from_url_list(self, urls: List[str], output_file: str = 'cookies.json'):
        all_cookies = []

        for url in tqdm(urls, desc="Collecting cookies"):
            cookies = self.collect_cookies_from_url(url)
            all_cookies.extend(cookies)
            time.sleep(2)

        output_path = self.output_dir / output_file
        with open(output_path, 'w') as f:
            json.dump(all_cookies, f, indent=2)

        print(f"Collected {len(all_cookies)} cookies from {len(urls)} URLs")
        print(f"Saved to {output_path}")

        return all_cookies

    def fetch_easylist_domains(self) -> List[str]:
        url = 'https://easylist.to/easylist/easylist.txt'
        try:
            response = requests.get(url, timeout=30)
            lines = response.text.split('\n')

            domains = []
            for line in lines:
                if line.startswith('||') and '$' in line:
                    domain = line.split('||')[1].split('^')[0].split('/')[0]
                    if domain and '.' in domain:
                        domains.append(domain)

            domains = list(set(domains))[:1000]

            output_path = self.output_dir / 'easylist_domains.json'
            with open(output_path, 'w') as f:
                json.dump(domains, f, indent=2)

            print(f"Fetched {len(domains)} domains from EasyList")
            return domains

        except Exception as e:
            print(f"Error fetching EasyList: {e}")
            return []

    def generate_training_urls(self) -> List[str]:
        """Generate diverse URL list for training data collection"""

        fortune_500_sample = [
            'https://www.walmart.com',
            'https://www.amazon.com',
            'https://www.apple.com',
            'https://www.cvs.com',
            'https://www.google.com',
            'https://www.microsoft.com',
            'https://www.facebook.com',
            'https://www.netflix.com',
            'https://www.twitter.com',
            'https://www.youtube.com'
        ]

        news_sites = [
            'https://www.cnn.com',
            'https://www.bbc.com',
            'https://www.nytimes.com',
            'https://www.reuters.com',
            'https://www.theguardian.com',
            'https://www.washingtonpost.com',
            'https://www.forbes.com'
        ]

        tech_sites = [
            'https://www.techcrunch.com',
            'https://www.theverge.com',
            'https://www.wired.com',
            'https://www.arstechnica.com',
            'https://www.reddit.com',
            'https://www.github.com',
            'https://www.stackoverflow.com'
        ]

        ecommerce_sites = [
            'https://www.ebay.com',
            'https://www.etsy.com',
            'https://www.target.com',
            'https://www.bestbuy.com',
            'https://www.homedepot.com'
        ]

        social_media = [
            'https://www.linkedin.com',
            'https://www.instagram.com',
            'https://www.pinterest.com',
            'https://www.tiktok.com'
        ]

        # Sites known for heavy tracking
        ad_heavy_sites = [
            'https://www.weather.com',
            'https://www.espn.com',
            'https://www.yahoo.com',
            'https://www.msn.com',
            'https://www.buzzfeed.com'
        ]

        return fortune_500_sample + news_sites + tech_sites + ecommerce_sites + social_media + ad_heavy_sites

    def close(self):
        if self.driver:
            self.driver.quit()


def main():
    collector = CookieDataCollector()

    print("Fetching EasyList tracking domains...")
    collector.fetch_easylist_domains()

    print("\nGenerating URL list...")
    urls = collector.generate_training_urls()

    print("\nCollecting cookies from URLs...")
    collector.collect_from_url_list(urls)

    collector.close()
    print("\nData collection complete!")


if __name__ == '__main__':
    main()
