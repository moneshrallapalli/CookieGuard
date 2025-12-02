from setuptools import setup, find_packages

setup(
    name='cookieguard-ml',
    version='1.0.0',
    description='Machine Learning Pipeline for CookieGuard',
    author='CookieGuard Team',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    python_requires='>=3.8',
    install_requires=[
        'numpy>=1.21.0',
        'pandas>=1.3.0',
        'scikit-learn>=1.0.0',
        'requests>=2.26.0',
        'beautifulsoup4>=4.9.3',
        'selenium>=4.0.0',
        'onnx>=1.10.0',
        'skl2onnx>=1.10.0',
        'tqdm>=4.62.0',
    ],
    extras_require={
        'dev': [
            'jupyter>=1.0.0',
            'matplotlib>=3.4.0',
            'seaborn>=0.11.0',
        ]
    }
)
