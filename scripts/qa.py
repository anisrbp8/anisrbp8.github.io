#!/usr/bin/env python3
"""Validate the deployed site's local navigation and asset graph."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json,re,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='anisrojbi.fr'
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.ids=[];self.refs=[];self.h1=0;self.lang=None;self.issues=[];self.forms=0;self.labels=set();self.form_fields={};self.has_form_status=False;self.feed(text)
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
files=sorted(p for p in ROOT.rglob('*.html') if not any(x in {'node_modules','test-output','.git'} for x in p.parts));parsed={p:Page(p.read_text()) for p in files};issues=[];checks=0
for p,page in parsed.items():
 rel=str(p.relative_to(ROOT));text=p.read_text()
 for issue in page.issues:issues.append([rel,issue])
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
