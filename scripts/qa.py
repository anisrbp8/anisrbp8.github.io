#!/usr/bin/env python3
"""Validate the deployed site's local navigation and asset graph."""
from pathlib import Path
from collections import Counter
import csv
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json,re,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='anisrojbi.fr'
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.ids=[];self.refs=[];self.h1=0;self.lang=None;self.issues=[];self.forms=0;self.labels=set();self.form_fields={};self.has_form_status=False
  self.in_footer=False;self.in_statement_link=False;self.footer_statement_labels=[]
  self.feed(text)
  if self.forms:
   required={'name','email','subject','message'}
   missing=sorted(required-set(self.form_fields))
   if missing:self.issues.append('Missing required contact fields: '+', '.join(missing))
   for name in sorted(required & set(self.form_fields)):
    field=self.form_fields[name]
    if not field.get('required'):self.issues.append('Contact field not required: '+name)
    if not field.get('id') or field.get('id') not in self.labels:self.issues.append('Contact field without explicit label: '+name)
   if '_gotcha' not in self.form_fields:self.issues.append('Missing contact honeypot')
   if not self.has_form_status:self.issues.append('Missing accessible form status')
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='footer':self.in_footer=True
  if self.in_footer and tag=='a' and Path(urlsplit(a.get('href','')).path).name in {'accessibilite.html','accessibility.html'}:
   self.in_statement_link=True
   self.footer_statement_labels.append('')
  if tag=='html': self.lang=a.get('lang')
  if tag=='h1': self.h1+=1
  if 'id' in a:self.ids.append(a['id'])
  if tag=='img' and 'alt' not in a:self.issues.append('Missing image alternative')
  if tag=='form':
   self.forms+=1
   action=a.get('action','');method=a.get('method','').lower();u=urlsplit(action)
   if not (u.scheme=='https' and u.netloc=='formspree.io' and u.path.startswith('/f/')):self.issues.append('Form without approved HTTPS Formspree endpoint')
   if method!='post':self.issues.append('Contact form must use POST')
  if tag=='label' and a.get('for'):self.labels.add(a['for'])
  if tag in {'input','textarea','select'} and a.get('name'):
   self.form_fields[a['name']]={'id':a.get('id'),'required':'required' in a}
  if 'data-form-status' in a and a.get('role')=='status' and a.get('aria-live') in {'polite','assertive'}:self.has_form_status=True
  for key in ['href','src','action']:
   if a.get(key):self.refs.append(a[key])
  if a.get('srcset'):
   self.refs.extend(x.strip().split()[0] for x in a['srcset'].split(','))
 def handle_data(self,data):
  if self.in_statement_link:self.footer_statement_labels[-1]+=data
 def handle_endtag(self,tag):
  if tag=='a':self.in_statement_link=False
  if tag=='footer':self.in_footer=False

def audit_totals(pages):
    with (ROOT / 'audit/rgaa-2026-11/grille.csv').open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        criteria = reader.fieldnames[2:]
    if len(set(criteria)) != 106:
        raise ValueError('Expected the 106 RGAA 4.1.2 criteria in the published matrix')
    if len(rows) != len(pages) or {row['Page'] for row in rows} != pages:
        raise ValueError('The published audit matrix must cover every HTML page exactly once')
    totals = Counter()
    for criterion in criteria:
        values = {row[criterion] for row in rows}
        if not values <= {'C', 'NC', 'NA', 'NT'}:
            raise ValueError(f'Unknown result for criterion {criterion}: {values}')
        # One failed page prevents a pass. An unfinished check cannot establish a pass.
        result = next(code for code in ('NC', 'NT', 'C', 'NA') if code in values)
        totals[result] += 1
    return totals

files=sorted(p for p in ROOT.rglob('*.html') if not any(x in {'node_modules','test-output','.git'} for x in p.parts));parsed={p:Page(p.read_text()) for p in files};issues=[];checks=0
totals = audit_totals({p.relative_to(ROOT).as_posix() for p in files})
met = totals['C']
applicable = met + totals['NC'] + totals['NT']
percentage = f'{100 * met / applicable:.1f}'
fr_percent = percentage.replace('.', ',') + ' %'
en_percent = percentage + '%'
footer_labels = {
    'fr': 'Accessibilité · ' + fr_percent + (' (bilan provisoire)' if totals['NT'] else ''),
    'en': 'Accessibility · ' + en_percent + (' (interim result)' if totals['NT'] else '')
}
statements = {
    'accessibilite.html': f'{met} critères validés sur {applicable} applicables ({fr_percent})',
    'en/accessibility.html': f'{met} of {applicable} applicable criteria met ({en_percent})'
}
for name, result in statements.items():
    if f'<strong id="audit-result">{result}</strong>' not in (ROOT / name).read_text():
        issues.append([name, 'The published result must agree with the audit matrix'])
for p,page in parsed.items():
 rel=str(p.relative_to(ROOT));text=p.read_text()
 for issue in page.issues:issues.append([rel,issue])
 expected_footer=footer_labels.get(page.lang)
 if not expected_footer or [' '.join(label.split()) for label in page.footer_statement_labels]!=[expected_footer]:
  issues.append([rel,'Footer link does not match the published audit result in this language'])
 if not page.lang:issues.append([rel,'Missing language'])
 if page.h1!=1:issues.append([rel,'Expected one h1'])
 if len(set(page.ids))!=len(page.ids):issues.append([rel,'Duplicate IDs'])
 if '.example' in text or 'data-netlify' in text:issues.append([rel,'Stale deployment configuration'])
 if not re.search(r'<title>[^<]+</title>',text):issues.append([rel,'Missing title'])
 if re.search(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',text):issues.append([rel,'Public receiving email in HTML'])
 for ref in page.refs:
  u=urlsplit(ref)
  if u.scheme and u.scheme not in ('http','https'):continue
  if u.netloc and u.netloc!=ORIGIN:continue
  path=unquote(u.path)
  target=(ROOT/path.lstrip('/') if path.startswith('/') or u.netloc else p.parent/path).resolve() if path else p
  if target.is_dir():target=target/'index.html'
  checks+=1
  if not target.is_file():issues.append([rel,'Missing resource: '+ref]);continue
  if u.fragment and target.suffix=='.html' and unquote(u.fragment) not in parsed[target].ids:issues.append([rel,'Missing anchor: '+ref])
for p in (ROOT/'assets/css').glob('*.css'):
 for ref in re.findall(r'url\([\'\"]?([^\)\'\"]+)',p.read_text()):
  if ref.startswith(('data:','http','#')):continue
  if not (p.parent/ref).is_file():issues.append([str(p.relative_to(ROOT)),'Missing CSS asset: '+ref])
for loc in ET.parse(ROOT/'sitemap.xml').findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
 u=urlsplit(loc.text);p=ROOT/u.path.lstrip('/')
 if p.is_dir():p=p/'index.html'
 if u.netloc!=ORIGIN or not p.is_file():issues.append(['sitemap.xml','Invalid URL: '+loc.text])
json.loads((ROOT/'site.webmanifest').read_text())
result={'pages':len(files),'local_references_checked':checks,'images':len(list((ROOT/'assets/img').glob('*'))),'pdf_documents':len(list((ROOT/'assets/docs').glob('*.pdf'))),'issues':issues,'passed':not issues}
(ROOT/'VALIDATION-REPORT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(bool(issues))
