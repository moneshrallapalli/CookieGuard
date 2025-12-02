import json
import pickle
import re
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from feature_extractor import FeatureExtractor
from ground_truth_labeler import GroundTruthLabeler


class ModelTrainer:

    CATEGORIES = ['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown']

    def __init__(self, data_path: str = 'data/processed/labeled_cookies.json'):
        self.data_path = Path(data_path)
        self.feature_extractor = FeatureExtractor()
        self.model = None
        self.X_train = None
        self.X_test = None
        self.y_train = None
        self.y_test = None

    def load_and_prepare_data(self):
        print("Loading labeled data...")
        with open(self.data_path, 'r') as f:
            cookies = json.load(f)

        print(f"Loaded {len(cookies)} labeled cookies")

        print("Extracting features...")
        X = []
        y = []

        for cookie in cookies:
            if 'label' not in cookie:
                continue

            features = self.feature_extractor.extract_features(cookie)
            feature_array = self.feature_extractor.features_to_array(features)

            X.append(feature_array)
            y.append(cookie['label'])

        X = np.array(X)
        y = np.array(y)

        print(f"Feature matrix shape: {X.shape}")
        print(f"Label distribution:")
        unique, counts = np.unique(y, return_counts=True)
        for label, count in zip(unique, counts):
            print(f"  {label}: {count}")

        self.X_train, self.X_test, self.y_train, self.y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        print(f"\nTrain set: {len(self.X_train)} samples")
        print(f"Test set: {len(self.X_test)} samples")

        return X, y

    def train_model(self, n_estimators: int = 100, max_depth: int = 20):
        print("\nTraining Random Forest classifier...")

        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
            class_weight='balanced'
        )

        self.model.fit(self.X_train, self.y_train)

        train_score = self.model.score(self.X_train, self.y_train)
        test_score = self.model.score(self.X_test, self.y_test)

        print(f"Training accuracy: {train_score:.4f}")
        print(f"Testing accuracy: {test_score:.4f}")

        print("\nPerforming cross-validation...")
        cv_scores = cross_val_score(self.model, self.X_train, self.y_train, cv=5)
        print(f"Cross-validation scores: {cv_scores}")
        print(f"Mean CV score: {cv_scores.mean():.4f} (+/- {cv_scores.std() * 2:.4f})")

        return self.model

    def evaluate_model(self):
        print("\nEvaluating model on test set...")

        y_pred = self.model.predict(self.X_test)

        print("\nClassification Report:")
        print(classification_report(self.y_test, y_pred, target_names=self.CATEGORIES))

        print("\nConfusion Matrix:")
        cm = confusion_matrix(self.y_test, y_pred)
        print(cm)

        print("\nFeature Importances:")
        feature_names = self.feature_extractor.get_feature_names()
        importances = self.model.feature_importances_
        indices = np.argsort(importances)[::-1]

        for i in range(min(10, len(feature_names))):
            idx = indices[i]
            print(f"{feature_names[idx]}: {importances[idx]:.4f}")

    def save_model(self, output_path: str = 'models/cookie_classifier.pkl'):
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'wb') as f:
            pickle.dump(self.model, f)

        print(f"\nModel saved to {output_path}")

    def generate_synthetic_labels(self, input_file: str, output_file: str):
        print("Generating synthetic labels based on heuristics...")

        with open(input_file, 'r') as f:
            cookies = json.load(f)

        labeled_cookies = []

        for cookie in cookies:
            label = self._heuristic_label(cookie)
            cookie['label'] = label
            labeled_cookies.append(cookie)

        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(labeled_cookies, f, indent=2)

        print(f"Labeled {len(labeled_cookies)} cookies")
        print(f"Saved to {output_path}")

        label_counts = {}
        for cookie in labeled_cookies:
            label = cookie['label']
            label_counts[label] = label_counts.get(label, 0) + 1

        print("\nLabel distribution:")
        for label, count in sorted(label_counts.items()):
            print(f"  {label}: {count}")

    def _heuristic_label(self, cookie: Dict) -> str:
        name = cookie.get('name', '').lower()
        domain = cookie.get('domain', '').lower()

        if re.match(r'^(session|csrf|xsrf|auth|token)', name):
            return 'essential'
        if re.match(r'^(cookie.?consent|cookie.?banner)', name):
            return 'essential'
        if re.match(r'^(laravel|phpsessid|jsessionid)', name):
            return 'essential'

        if re.match(r'^(_ga|_gid|_gat)', name):
            return 'analytics'
        if re.match(r'^(__utm[a-z])', name):
            return 'analytics'
        if 'analytics' in name or 'stats' in name:
            return 'analytics'

        if re.match(r'^(_fbp|_fbc|fr)', name):
            return 'advertising'
        if 'doubleclick' in domain or 'adsense' in domain:
            return 'advertising'
        if re.match(r'^(id|uid|uuid|visitor)', name):
            return 'advertising'

        if any(social in domain for social in ['facebook', 'twitter', 'linkedin', 'instagram']):
            return 'social'

        if cookie.get('hostOnly', False) and not cookie.get('expirationDate'):
            return 'functional'

        return 'unknown'


def main():
    import re

    trainer = ModelTrainer()

    raw_data_path = Path('data/raw/cookies.json')
    ground_truth_path = Path('data/processed/labeled_cookies_ground_truth.json')

    # Use ground truth labels if available, otherwise generate them
    if not ground_truth_path.exists() and raw_data_path.exists():
        print("=" * 60)
        print("GENERATING GROUND TRUTH LABELS")
        print("=" * 60)

        # Initialize ground truth labeler
        labeler = GroundTruthLabeler()
        labeler.initialize(force_refresh=False)

        # Load raw cookies
        with open(raw_data_path, 'r') as f:
            cookies = json.load(f)

        print(f"\nLabeling {len(cookies)} cookies with ground truth data...")

        # Label cookies
        labeled_cookies, stats = labeler.label_cookies_batch(cookies)

        # Save labeled data
        labeler.save_labeled_data(labeled_cookies, str(ground_truth_path))

        print("\nGround truth labeling complete!")
        print("=" * 60)

    # Use ground truth labels for training
    if ground_truth_path.exists():
        print("\n" + "=" * 60)
        print("TRAINING MODEL WITH GROUND TRUTH LABELS")
        print("=" * 60 + "\n")
        trainer.data_path = ground_truth_path
    else:
        print("\nWARNING: No ground truth labels found!")
        print("Run ground_truth_labeler.py first or ensure cookie data exists.\n")
        return

    trainer.load_and_prepare_data()

    trainer.train_model(n_estimators=100, max_depth=20)

    trainer.evaluate_model()

    trainer.save_model('models/cookie_classifier.pkl')

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE!")
    print("=" * 60)
    print("\nModel trained on REAL tracker databases:")
    print("  • EasyList (46,000+ advertising domains)")
    print("  • EasyPrivacy (46,000+ tracking domains)")
    print("  • Disconnect.me (95,000+ tracker domains)")
    print("\nModel saved to: models/cookie_classifier.pkl")
    print("=" * 60)


if __name__ == '__main__':
    main()
