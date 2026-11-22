"""Sample spoken output of the real Google TalkBack service on a fresh Android device."""
import json
import re
import subprocess
import time
import traceback
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = Path('test-output/mobile-access')
OUT.mkdir(exist_ok=True,parents=True)
BASE = 'http://127.0.0.1:8941/'
APP = 'com.google.android.marvin.talkback'
CHROME = 'com.android.chrome'
report = {'environment':{},'checks':[],'details':[]}
def run(*args, timeout=25, check=True):
    p=subprocess.run([str(a) for a in args],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout,check=False)
    if check and p.returncode:
        raise RuntimeError(f'{args[0]} exited {p.returncode}: {p.stdout[-400:]}')
    return p.stdout.strip()
def adb(*args,**kwargs):
    return run('adb',*args,**kwargs)
def sh(*args,**kwargs):
    return adb('shell',*args,**kwargs)
def compact(s):
    return ' '.join(re.sub(r'[^a-z0-9 ]',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).split())
def command(action,arg):
    return json.loads(run('node',HERE/'chrome.mjs',action,arg) or 'null')
def read(expression):return command('read',expression)
def tap(x,y):
    sh('input','tap',round(x),round(y))
def double(x,y):
    x,y=int(x),int(y)
    sh(f'input tap {x} {y}; sleep 0.05; input tap {x} {y}')
def key(value):
    sh('input','keyevent',value)
def ui_nodes():
    # Only before TalkBack starts. UIAutomator could interrupt another accessibility service.
    sh('uiautomator','dump','/sdcard/rgaa-device.xml',timeout=18)
    data=adb('exec-out','cat','/sdcard/rgaa-device.xml')
    return list(ET.fromstring(data).iter('node'))
def box(node):
    x1,y1,x2,y2=map(int,re.findall(r'-?\d+',node.get('bounds')))
    return (x1+x2)//2,(y1+y2)//2
def ui_tap(labels,attempts=4,must=True):
    for i in range(attempts):
        nodes=ui_nodes()
        for el in nodes:
            label=(el.get('text') or el.get('content-desc','')).strip().lower()
            if label in labels and el.get('enabled')=='true':
                tap(*box(el));time.sleep(.45);return label
        if attempts>1 and i < attempts-1:sh('input','swipe',WIDTH//2,int(.77*HEIGHT),WIDTH//2,int(.32*HEIGHT),350)
    if must:raise RuntimeError('Android preferences did not show '+repr(labels)+'. Visible: '+repr([n.get('text') for n in nodes if n.get('text')][:35]))
def verify_chrome():
    sh('am','start','-a','android.intent.action.VIEW','-d',BASE+'contact.html',CHROME);time.sleep(1.2)
    for _ in range(4):
        nodes=ui_nodes()
        if any(n.get('class')=='android.webkit.WebView' and n.get('package')==CHROME for n in nodes):break
        labels={'use without an account','continue without an account','accept & continue','accept and continue','no thanks','no, thanks','use without an account','got it','skip','continue','not now'}
        if not ui_tap(labels,1,False):break
        time.sleep(1.2)
    adb('forward','tcp:9223','localabstract:chrome_devtools_remote')
    if not read('document.querySelector("form[data-contact-form]")!==null'):
        command('goto',BASE+'contact.html');time.sleep(1)
    assert read('document.querySelector("form[data-contact-form]")!==null')
    webviews=[n for n in ui_nodes() if n.get('class')=='android.webkit.WebView' and n.get('package')==CHROME]
    if webviews:
        return int(re.findall(r'\d+',webviews[0].get('bounds'))[1])
    return int(read('(screen.height - window.innerHeight)*devicePixelRatio'))
def enable_logging():
    settings=sh('cmd','package','query-activities','--brief','-c','android.accessibilityservice.SERVICE_SETTINGS',APP)
    components=re.findall(r'('+re.escape(APP)+r'/[\.\w$]+PreferencesActivity)',settings)
    for component in [*components,APP+'/com.android.talkback.TalkBackPreferencesActivity',APP+'/.TalkBackPreferencesActivity']:
        result=sh('am','start','-n',component,check=False)
        if not any(x in result for x in ('Error','Exception','does not exist')):break
    else:raise RuntimeError('TalkBack preferences could not be opened')
    time.sleep(.8)
    ui_tap({'advanced settings','advanced'},12)
    ui_tap({'developer settings','developer options'},14)
    ui_tap({'log output level','log level'},8)
    ui_tap({'verbose'},3)
    ui_tap({'ok','enable','allow','turn on','yes'},1,False)
def environment():
    pkgs=set(x.replace('package:','') for x in sh('pm','list','packages').splitlines())
    if APP not in pkgs or CHROME not in pkgs:raise RuntimeError('Official Chrome and TalkBack must both be installed')
    for pkg in [APP,CHROME]:
        summary=sh('dumpsys','package',pkg)
        report['environment'][pkg]=re.search(r'\bversionName=(\S+)',summary).group(1)
    report['environment']['sdk']=sh('getprop','ro.build.version.sdk')
    report['environment']['fingerprint']=sh('getprop','ro.build.fingerprint')
    report['environment']['tts']=sh('settings','get','secure','tts_default_synth')
    global WIDTH,HEIGHT,TOP
    WIDTH,HEIGHT=map(int,re.findall(r'(\d+)x(\d+)',sh('wm','size'))[-1])
    TOP=verify_chrome()
    report['environment']['webViewTopInitial']=TOP
    enable_logging()
    service=APP+'/.TalkBackService'
    sh('settings','put','secure','enabled_accessibility_services',service)
    sh('settings','put','secure','accessibility_enabled','1');time.sleep(3.5)
    services=sh('dumpsys','accessibility')
    relevant=[l.strip()[:350] for l in services.splitlines() if ('touchExplorationEnabled' in l or 'TalkBackService' in l or 'Bound services' in l)]
    report['environment']['services']=relevant[:15]
    out=' '.join(relevant)
    if 'TalkBackService' not in out or not re.search(r'touchExplorationEnabled[=:]\s*true',services,re.I):
        raise RuntimeError('No active TalkBack touch-exploration service is listed by the system')
    # Bring the actual candidate back to the front after the first-run tutorial.
    sh('am','start','-a','android.intent.action.VIEW','-d',BASE+'contact.html',CHROME)
    time.sleep(1)
def goto(path):
    command('goto',BASE+path)
    for _ in range(15):
        if read('document.readyState')=='complete':break
        time.sleep(.2)
    time.sleep(.75)
def heard():
    logs=adb('logcat','-d','-v','brief',timeout=20)
    lines=[]
    for line in logs.splitlines():
        if 'SpeechController' not in line: continue
        m=re.search(r'Speaking fragment text=(.*?), utteranceId=',line,re.I)
        if m:lines.append(m.group(1).strip())
    return lines
def sample(label,action,expected):
    adb('logcat','-c'); result=action();time.sleep(1)
    utterances=heard()
    corpus=compact(' '.join(utterances))
    terms=[compact(x) for x in expected]
    if any(t not in corpus for t in terms):
        time.sleep(1.6); utterances=heard();corpus=compact(' '.join(utterances))
    passed=all(t in corpus for t in terms)
    report['checks'].append({'sample':label,'passed':passed,'requiredWords':expected,'talkback':utterances,'observation':result})
    print(('PASS ' if passed else 'REVIEW ')+label+': '+str(utterances)[-500:],flush=True)
    return passed
def xy(selector,adjust=0):
    q=json.dumps(selector)
    expression=f"""(async()=>{{const e=document.querySelector({q});if(!e)throw Error('Missing target '+{q});e.scrollIntoView({{block:'center',behavior:'instant'}});await new Promise(r=>setTimeout(r,200));const b=e.getBoundingClientRect();const y=Math.max(4,Math.min(innerHeight-4,b.y+Math.min(b.height/2,24)));return [Math.max(6,Math.min(innerWidth-6,b.x+Math.min(b.width/2,80)))*devicePixelRatio,y*devicePixelRatio,devicePixelRatio];}})()"""
    x,y,dpr=read(expression)
    return round(x),round(y+TOP+adjust*dpr)
def inspect(label,selector,expected):
    coord=xy(selector)
    return sample(label,lambda:(tap(*coord),coord)[1],expected)
def touchActivate(selector):
    coord=xy(selector);tap(*coord);time.sleep(.45);double(*coord);time.sleep(.45)
    return coord
def select_key(selector,keyname):
    # Activate the Android native picker, then use the virtual device keyboard.
    touchActivate(selector)
    time.sleep(.35);key(keyname);time.sleep(.25);key('KEYCODE_ENTER')
    time.sleep(.5)
    return read('document.querySelector('+json.dumps(selector)+').value')
def tapdemo(en):
    home='en/' if en else ''
    goto(home+'index.html#granularity')
    touchActivate('#granularity-demo > summary')
    if not read('document.querySelector("#granularity-demo").open'):raise RuntimeError('The TalkBack double tap did not open the disclosure')
    d='EN' if en else 'FR'
    inspect(d+' house description','#demo-description',['house','roof','door'] if en else ['maison','toit','porte'])
    inspect(d+' scientific demo graphic','.granularity-image',['house'] if en else ['maison'])
    inspect(d+' current detail level','#granularity-level',['detail'] if en else ['détail'])
    sample(d+' coarse level and live output',lambda:select_key('#granularity-level','KEYCODE_MOVE_HOME'),['8','blocks'] if en else ['8','blocs'])
    sample(d+' fine level and live output',lambda:select_key('#granularity-level','KEYCODE_MOVE_END'),['32','blocks'] if en else ['32','blocs'])
def journey(en):
    pre='en/' if en else ''; d='EN' if en else 'FR'
    goto(pre+'contact.html')
    inspect(d+' mobile menu name','.mobile-menu-toggle',['menu'])
    sample(d+' mobile menu opening',lambda:touchActivate('.mobile-menu-toggle'),['menu'])
    if read('document.querySelector(".mobile-menu-toggle").getAttribute("aria-expanded")==="true"'):
        sample(d+' navigation by the TalkBack next-item gesture',lambda:sh('input','swipe',WIDTH//3,HEIGHT//2,2*WIDTH//3,HEIGHT//2,140),['home'] if en else ['accueil'])
        touchActivate('.mobile-menu-toggle')
    inspect(d+' mandatory name','#contact-name',['name','required'] if en else ['nom','obligatoire'])
    sample(d+' next mandatory email by swipe',lambda:sh('input','swipe',WIDTH//3,HEIGHT//2,2*WIDTH//3,HEIGHT//2,140),['email','required'] if en else ['adresse','obligatoire'])
    inspect(d+' section with reading controls','.reading-tools summary',['reading'] if en else ['lecture'])
    touchActivate('.reading-tools summary')
    if read('document.querySelector(".reading-tools").open'):
        sample(d+' reading preferences status',lambda:touchActivate('#reading-space'),['preferences','applied'] if en else ['préférences','appliquées'])
        touchActivate('#reading-reset')
    # Only the local test receiver is ever used, regardless of the UI outcome.
    read("""(()=>{const f=document.querySelector('form[data-contact-form]');f.action='/_test/accepted';for(const [n,v] of Object.entries({name:'Test',email:'test@example.org',subject:'Test',message:'Test local'})){f.elements[n].value=v;f.elements[n].dispatchEvent(new Event('input',{bubbles:true}));}return f.action;})()""")
    sample(d+' locally intercepted successful contact status',lambda:touchActivate('button[type=submit]'),['message','sent'] if en else ['message','envoyé'])
    goto(pre+'publications.html')
    inspect(d+' publication year filter','#publication-year',['year'] if en else ['année'])
    sample(d+' publication count after native picker',lambda:select_key('#publication-year','KEYCODE_DPAD_DOWN'),['publications'] if en else ['publication'])
    touchActivate('#eeg-2025 .citation summary')
    if read('!!document.querySelector("#eeg-2025 .citation[open]")'):
        sample(d+' copy reference feedback',lambda:touchActivate('#eeg-2025 .citation-copy'),['reference'] if en else ['référence'])
    goto(pre+('research.html' if en else 'recherche.html')+'#axe-3')
    inspect(d+' research figure alternative','#article-figure-2 img',['EEG'] if en else ['EEG'])
    sample(d+' figure dialog and its close button',lambda:touchActivate('#article-figure-2 [data-figure-open]'),['close'] if en else ['fermer'])
    if read('!!document.querySelector("dialog[open]")'):touchActivate('dialog[open] button')
def attempt(group,test):
    try:test()
    except Exception as err:
        report['details'].append({'group':group,'error':str(err)})
        print('REVIEW '+group+' '+str(err),flush=True)
try:
    environment()
    for en in [False,True]:
        attempt('Main controls '+str(en),lambda:journey(en))
        attempt('House demonstration '+str(en),lambda:tapdemo(en))
except Exception as err:
    report['details'].append({'group':'Android setup','error':str(err),'trace':traceback.format_exc()[-1000:]})
finally:
    report['summary']={'recorded':len(report['checks']),'passed':sum(x['passed'] for x in report['checks']),'details':len(report['details'])}
    (OUT/'speech.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report['summary']),report['details'],flush=True)
if not report['checks'] or report['summary']['passed']!=len(report['checks']) or report['details']:
    raise SystemExit(1)
