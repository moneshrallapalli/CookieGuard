import json
import random
from pathlib import Path

def generate_mock_cookies(num_cookies=1000):
    """Generate mock cookie data for quick testing"""

    categories = ['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown']

    # Common cookie patterns
    cookie_patterns = {
        'essential': [
            ('session_id', 'abc123def456', True, True),
            ('csrf_token', 'xyz789uvw321', True, True),
            ('auth_token', 'token_12345', True, True),
            ('PHPSESSID', 'sess_abcdef', False, False),
        ],
        'analytics': [
            ('_ga', 'GA1.2.123456789.1234567890', False, False),
            ('_gid', 'GA1.2.987654321.0987654321', False, False),
            ('_gat', '1', False, False),
            ('__utma', '111111111.222222222.333333333.444444444.555555555.1', False, False),
        ],
        'advertising': [
            ('_fbp', 'fb.1.1234567890123.1234567890', False, False),
            ('fr', '1234567890abcdef...', False, False),
            ('IDE', 'AHWqTUm...', False, False),
            ('id', 'a1b2c3d4e5f6', False, False),
        ],
        'social': [
            ('c_user', '1234567890', False, False),
            ('datr', 'abc123...', False, False),
            ('guest_id', 'v1%3A1234567890', False, False),
        ],
        'functional': [
            ('lang', 'en-US', False, False),
            ('theme', 'dark', False, False),
            ('cart_items', '3', False, False),
        ],
        'unknown': [
            ('random_cookie', 'some_value', False, False),
            ('temp_data', '123', False, False),
        ]
    }

    domains = [
        'example.com', 'test.com', 'demo.com', 'website.com',
        'google.com', 'facebook.com', 'twitter.com', 'linkedin.com',
        'amazon.com', 'cnn.com', 'nytimes.com', 'youtube.com'
    ]

    cookies = []

    for i in range(num_cookies):
        category = random.choices(
            categories,
            weights=[200, 150, 250, 200, 100, 100],  # Weight distribution
            k=1
        )[0]

        pattern = random.choice(cookie_patterns[category])
        name, base_value, secure, http_only = pattern

        # Add variation to values
        value = f"{base_value}_{random.randint(1000, 9999)}"

        cookie = {
            'name': name,
            'value': value,
            'domain': random.choice(domains),
            'path': '/',
            'secure': secure,
            'httpOnly': http_only,
            'sameSite': random.choice(['Strict', 'Lax', 'None']),
            'expirationDate': random.randint(1700000000, 1800000000) if random.random() > 0.3 else None,
            'source_url': f'https://{random.choice(domains)}',
            'hostOnly': random.random() > 0.5,
            'label': category  # Ground truth label
        }

        cookies.append(cookie)

    return cookies


def main():
    print("Generating mock training data...")

    # Create directories
    raw_dir = Path('data/raw')
    processed_dir = Path('data/processed')
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)

    # Generate cookies
    cookies = generate_mock_cookies(1000)

    # Save to raw directory
    raw_path = raw_dir / 'cookies.json'
    with open(raw_path, 'w') as f:
        json.dump(cookies, f, indent=2)

    print(f"✓ Generated {len(cookies)} mock cookies")
    print(f"✓ Saved to {raw_path}")

    # Also save as labeled data
    labeled_path = processed_dir / 'labeled_cookies.json'
    with open(labeled_path, 'w') as f:
        json.dump(cookies, f, indent=2)

    print(f"✓ Saved labeled data to {labeled_path}")

    # Show label distribution
    label_counts = {}
    for cookie in cookies:
        label = cookie['label']
        label_counts[label] = label_counts.get(label, 0) + 1

    print("\nLabel distribution:")
    for label, count in sorted(label_counts.items()):
        print(f"  {label}: {count}")

    print("\n✓ Mock data generation complete!")


if __name__ == '__main__':
    main()
