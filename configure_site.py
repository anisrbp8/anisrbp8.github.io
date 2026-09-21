#!/usr/bin/env python3
from pathlib import Path
import argparse, os, re
ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description='Replace the placeholder site URL in SEO metadata and sitemap.')
p.add_argument('--url', default=os.environ.get('URL',''))
a=p.parse_args()
url=a.url.strip().rstrip('/')
if not url:
    raise SystemExit('Missing --url (example: --url https://www.example.fr)')
if not re.match(r'^https://', url):
    raise SystemExit('Use an HTTPS URL.')
for pattern in ('*.html','*.xml','*.txt'):
    for f in ROOT.rglob(pattern):
        if any(part in {'test-output'} for part in f.parts): continue
        s=f.read_text(encoding='utf-8')
        if 'https://anis-rojbi.example' in s:
            f.write_text(s.replace('https://anis-rojbi.example',url),encoding='utf-8')
print('Configured public URL:',url)
