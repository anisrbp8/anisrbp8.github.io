"""Contrôles d’interface locaux. Tout envoi vers l’extérieur est intercepté."""
import asyncio, functools, http.server, json, os, shutil, sys, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

folder=Path(os.environ.get('FORM_AUDIT_OUTPUT', Path(__file__).resolve().parent))
folder.mkdir(parents=True,exist_ok=True)
site=Path(sys.argv[1]).resolve()
phase=sys.argv[2]
langfiles=sorted(p.relative_to(site).as_posix() for p in [*site.glob('*.html'),*site.glob('en/*.html')])
endpoint='https://formspree.io/f/mwlpbykp'

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

class Server(http.server.ThreadingHTTPServer):
    daemon_threads=True

server=Server(('127.0.0.1',0),functools.partial(Handler,directory=str(site)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)+'/'

async def guard(route):
    if route.request.url.startswith(base): await route.continue_()
    else: await route.abort()

async def setup(browser,**opts):
    context=await browser.new_context(**opts)
    await context.route('**/*', guard)
    return context

async def single_page(browser, p, width):
    ctx=await setup(browser,viewport={'width':width,'height':900})
    pg=await ctx.new_page();await pg.goto(base+p)
    reading=pg.locator('.reading-tools > summary');await reading.focus();await pg.keyboard.press('Enter')
    await pg.locator('#reading-theme').wait_for(state='visible')
    for selector in ['[data-granularity-demo] > summary','#granularity-demo > summary']:
        el=pg.locator(selector)
        if await el.count() and not await pg.locator('#granularity-level').is_visible():
            await el.focus();await pg.keyboard.press('Enter')
    all_fields=await pg.evaluate(r"""() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(e=>!e.closest('[inert]')&&e.getClientRects().length).map(e=>{
        const label=e.labels[0], er=e.getBoundingClientRect(), lr=label.getBoundingClientRect(),r=document.createRange();
        const text=[...label.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(text)r.selectNodeContents(text);const tr=text?r.getBoundingClientRect():lr;
        return {id:e.id,type:e.type,visibleLabel:label.innerText.trim(),labelFor:label.htmlFor,associated:e.labels.length===1,required:e.required,autocomplete:e.autocomplete,max:e.maxLength,
            help:(e.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean).map(i=>document.getElementById(i)?.innerText),
            title:e.title,al:e.getAttribute('aria-label'),alb:e.getAttribute('aria-labelledby'),
            preceding:label.nextElementSibling===e||label.contains(e),above:lr.bottom<=er.top+1,left:lr.right<=er.left+1,
            checkRight:tr.left>=er.right-1,checkBelow:tr.top>=er.bottom-1,checkGapBelow:Math.round(tr.top-er.bottom),
            verticalGap:Math.round(er.top-lr.bottom),optgroups:e.tagName==='SELECT'?e.querySelectorAll('optgroup').length:null,
            options:e.tagName==='SELECT'?[...e.options].map(o=>o.text):null}
    })""")
    # Native associated labels are also checked against the browser's calculated accessible name.
    field_names=[]
    for field in all_fields:
        loc=pg.locator('#'+field['id'])
        snap=await loc.aria_snapshot()
        field_names.append({'id':field['id'],'tree':snap.splitlines()[0]})
    buttons=await pg.locator('button:visible').evaluate_all("""es=>es.map(e=>({text:e.innerText.trim(),aria:e.getAttribute('aria-label'),title:e.title,id:e.id,icon:e.querySelector('[aria-hidden]')?.innerText}))""")
    counts=await pg.evaluate("""()=>({headings:document.querySelectorAll('h1').length,positive:[...document.querySelectorAll('[tabindex]')].filter(e=>e.tabIndex>0).length,formCount:document.forms.length,groups:[...document.querySelectorAll('fieldset,[role=group],[role=radiogroup]')].map(g=>({legend:g.querySelector('legend')?.innerText||g.getAttribute('aria-label'),visible:!!g.getClientRects().length})),pending:document.querySelectorAll('form [type="file"],[type="password"]').length})""")
    # Tab through the complete page, including all controls disclosed above. Compare real traversal to displayed DOM order.
    markup=await pg.evaluate("""()=>{
        const closed=[...document.querySelectorAll('details:not([open])')];
        const visible=e=>e.getClientRects().length && !e.closest('[inert]') &&
          closed.every(d=>!d.contains(e) || d.querySelector(':scope > summary')?.contains(e));
        return [...document.querySelectorAll('a[href],button,select,input,textarea,summary,[tabindex]')]
          .filter(e=>e.tabIndex>=0 && !e.disabled && visible(e))
          .map((e,i)=>{e.dataset.auditFocusId=String(i+1);return e.dataset.auditFocusId;});
    }""")
    # Focus the first active link, then let the keyboard traverse. Chromium may close
    # an opened mobile menu as focus exits. It is still collapsed here by design.
    await pg.locator('[data-audit-focus-id="'+markup[0]+'"]').focus()
    seq=[]
    for _ in range(min(len(markup)+2,250)):
        ident=await pg.evaluate("()=>document.activeElement.dataset.auditFocusId||''")
        if ident and ident in seq:break
        if not ident:break
        seq.append(ident)
        await pg.keyboard.press('Tab')
    # Confirm the reverse traversal from the last displayed element.
    await pg.locator('[data-audit-focus-id="'+markup[-1]+'"]').focus()
    backwards=[]
    for _ in range(min(len(markup)+2,250)):
        ident=await pg.evaluate("()=>document.activeElement.dataset.auditFocusId||''")
        if not ident or ident in backwards:break
        backwards.append(ident)
        await pg.keyboard.press('Shift+Tab')
    readings={}
    for id_,v in [('reading-theme','dark'),('reading-size','125')]:
        loc=pg.locator('#'+id_);await loc.focus();await loc.select_option(v)
        readings[id_]=(await pg.evaluate('document.activeElement.id'),await pg.locator('#reading-status').inner_text())
    await pg.locator('#reading-space').focus();await pg.keyboard.press('Space')
    readings['reading-space']=(await pg.evaluate('document.activeElement.id'),await pg.locator('#reading-space').is_checked())
    await pg.locator('#reading-reset').focus();await pg.keyboard.press('Enter')
    readings['reset']=(await pg.evaluate('document.activeElement.id'),await pg.locator('#reading-status').inner_text())
    out={'page':p,'width':width,'fields':all_fields,'names':field_names,'buttons':buttons,'counts':counts,'focusOrderPass':seq==markup and backwards==markup[::-1],'forward':seq==markup,'backward':backwards==markup[::-1],'reverseTabCount':len(backwards),'tabCount':len(seq),'tabExpected':len(markup),'tabMissing':sorted(set(markup)-set(seq)),'readingActions':readings}
    if 'publications.html' in p:
        await pg.locator('#publication-topic').focus();await pg.locator('#publication-topic').select_option('accessibility')
        await pg.locator('#publication-year').focus();await pg.locator('#publication-year').select_option('2025')
        out['filter']={'zero':await pg.locator('[data-publication]:visible').count(), 'announced':await pg.locator('#publication-count').inner_text(),'focus':await pg.evaluate('document.activeElement.id'),'role':await pg.locator('#publication-count').get_attribute('role')}
        await pg.locator('.publication-filters button').focus();await pg.keyboard.press('Enter');out['filter']['resetCount']=await pg.locator('[data-publication]:visible').count()
        await pg.locator('.citation summary').first.focus();await pg.keyboard.press('Enter');await pg.keyboard.press('Tab')
        await pg.keyboard.press('Enter');await pg.wait_for_function("document.querySelector('.copy-status').textContent.length>0")
        out['copy']=(await pg.locator('.copy-status').first.get_attribute('role'),await pg.locator('.copy-status').first.inner_text())
    if 'index.html' in p:
        dem=pg.locator('#granularity-level');await dem.focus();await dem.select_option('8')
        out['demo']=(await pg.locator('[data-demo-status]').get_attribute('role'),await pg.locator('[data-demo-status]').inner_text(),await pg.evaluate('document.activeElement.id'))
    if p.endswith(('research.html','recherche.html')):
        collection=pg.locator('.figure-collection')
        for group in await collection.all():
            if not await group.evaluate('e=>e.open'):
                await group.locator(':scope > summary').focus();await pg.keyboard.press('Enter')
        out['dialogs']=[]
        for link in await pg.locator('[data-figure-open]').all():
            record={'invitation':await link.inner_text(),'href':await link.get_attribute('href'),'popup':await link.get_attribute('aria-haspopup')}
            await link.focus();await pg.keyboard.press('Enter')
            dialog=pg.locator('.figure-dialog[open]');await dialog.wait_for()
            record['initial']=await dialog.locator('button').first.evaluate('e=>e===document.activeElement')
            await pg.keyboard.press('Shift+Tab')
            record['reverseReachesLast']=await dialog.evaluate("""d=>{
                const active=document.activeElement;
                return d.contains(active) && active!==d.querySelector('button');
            }""")
            await pg.keyboard.press('Tab')
            record['wrapsToClose']=await dialog.locator('button').first.evaluate('e=>e===document.activeElement')
            await pg.keyboard.press('Escape')
            await pg.wait_for_function('!document.querySelector(".figure-dialog").open')
            record['restored']=await link.evaluate('e=>e===document.activeElement')
            out['dialogs'].append(record)
    await ctx.close();return out

async def contact(browser,page_name,nojs=False):
    en=page_name.startswith('en/')
    ctx=await setup(browser,java_script_enabled=not nojs,viewport={'width':320,'height':900},locale='en-US' if en else 'fr-FR')
    page=await ctx.new_page(); record={'page':page_name,'js':not nojs}
    captured=[];mode='error';block=asyncio.Event()
    async def intercept(route):
        captured.append({'method':route.request.method,'url':route.request.url,'data':route.request.post_data,'nav':route.request.is_navigation_request()})
        if nojs:
            synthetic_status=422 if mode=='native-rejection' else 200
            await route.fulfill(status=synthetic_status,content_type='text/html; charset=utf-8',body='<html lang="en"><title>Local test receipt</title><h1>Local navigation test</h1></html>')
        elif mode=='delay':
            await block.wait();await route.fulfill(status=200,json={'next':'/thanks'})
        elif mode=='error':
            await route.fulfill(status=422,json={'errors':[{'field':'name','code':'REQUIRED_FIELD_EMPTY'},{'field':'email','code':'TYPE_EMAIL'}]})
        elif mode=='unknown':
            await route.fulfill(status=503,json={'error':'service unavailable'})
        elif mode=='html':
            await route.fulfill(status=200,content_type='text/html',body='<h1>Confirmation missing</h1>')
        elif mode=='offline':
            await route.abort()
        else:await route.fulfill(status=200,json={'ok':True})
    await page.route(endpoint,intercept)
    await page.goto(base+page_name)
    form=page.locator('form[data-contact-form]');submit=form.locator('[type=submit]')
    await submit.focus();await page.keyboard.press('Enter')
    record['blank']={'focus':await page.evaluate('document.activeElement.id'),'xhr':len(captured),'required':await form.locator(':required').count(),'nativeFirst':await form.locator('#contact-name').evaluate('e=>e.validity.valueMissing'),'fieldErrors':await form.locator('[aria-invalid=true]').count(),'associated':await form.locator('[aria-invalid=true]').evaluate_all(r"""es=>es.every(e=>(e.getAttribute('aria-describedby')||'').split(/\s+/).some(id=>document.getElementById(id)?.textContent.trim()))""")}
    await page.locator('#contact-name').fill('Example');await page.locator('#contact-email').fill('bad')
    await page.locator('#contact-subject').fill('Local test');await page.locator('#contact-message').fill('Intercepted at browser')
    await submit.focus();await page.keyboard.press('Enter')
    record['format']={'focus':await page.evaluate('document.activeElement.id'),'nativeType':await form.locator('#contact-email').evaluate('e=>e.validity.typeMismatch'),'requests':len(captured),'nativeMessage':await form.locator('#contact-email').evaluate('e=>e.validationMessage'),'persistent':await form.locator('#contact-email-error').all_text_contents()}
    await page.locator('#contact-email').fill('example@example.org')
    if nojs:
        record['nativeNotice']=await page.locator('form noscript').inner_text()
        record['nativeReturns']={}
        for mode in ['native-rejection','native-success']:
            await page.locator('#contact-name').fill('Example')
            await page.locator('#contact-email').fill('example@example.org')
            await page.locator('#contact-subject').fill('Local test')
            await page.locator('#contact-message').fill('Intercepted at browser')
            await submit.click();await page.wait_for_url(endpoint)
            await page.go_back();await page.wait_for_selector('#contact-message')
            record['nativeReturns'][mode]={'post':captured[-1], 'draftAfterBack':await page.locator('#contact-message').input_value()}
        record['nativePost']=captured[-1]
        record['backDraft']=await page.locator('#contact-message').input_value();record['pageAfterBack']=page.url
    else:
        record['testedModes']={}
        for scenario in ['error','unknown','html','offline','delay','success']:
            mode=scenario;await page.locator('#contact-name').fill('  ' if mode=='error' else 'Example')
            await page.locator('#contact-email').fill('example@example.org');await page.locator('#contact-message').fill('Intercepted at browser')
            await submit.focus();await page.keyboard.press('Enter')
            if mode=='delay':
                await page.wait_for_function("document.querySelector('[type=submit]').getAttribute('aria-disabled')==='true'")
                attempts=len(captured)
                await form.evaluate('f=>f.requestSubmit()')
                await page.locator('#contact-message').fill('New text written while waiting')
                signalFocus=await page.evaluate('document.activeElement.id')
                block.set()
            await page.wait_for_function("document.querySelector('[type=submit]').getAttribute('aria-disabled')!=='true'")
            result=await page.evaluate("""()=>({focus:document.activeElement.id||document.activeElement.tagName,status:document.querySelector('[data-form-status]').innerText,alert:document.querySelector('[role=alert]')?.innerText||'',message:document.getElementById('contact-message').value,errors:[...document.querySelectorAll('.form-field-error')].map(e=>[e.id,e.innerText]),role:document.querySelector('[data-form-status]').getAttribute('role')})""")
            if mode=='delay':result.update(singleRequest=attempts==len(captured), focusWhileTyping=signalFocus)
            record['testedModes'][mode]=result
            if mode=='error':
                await page.locator('#contact-name').fill('Example')
                await page.locator('#contact-email').fill('new@example.org')
                record['correctedErrors']={'left':await form.locator('[aria-invalid=true]').count(),'alert':await form.locator('[role=alert]').inner_text()}
        record['requestsIntercepted']=len(captured)
    await ctx.close();return record

async def provider_return(browser, lang):
    """Read the public no-script receipt, never submitting a message."""
    url = 'https://formspree.io/thanks' + ('?language=fr' if lang == 'fr' else '')
    context = await browser.new_context(java_script_enabled=False)
    async def allow_read_only(route):
        request = route.request
        if request.method == 'GET' and urlsplit(request.url).hostname == 'formspree.io':
            await route.continue_()
        else:
            await route.abort()
    await context.route('**/*', allow_read_only)
    page = await context.new_page()
    result = {'url': url, 'lang': lang}
    try:
        response = await page.goto(url, timeout=12000, wait_until='domcontentloaded')
        result['http'] = response.status if response else None
        result['documentLang'] = await page.locator('html').get_attribute('lang')
        result['heading'] = await page.locator('h1').all_text_contents()
        back = page.locator('main a[onclick]')
        if result['http'] == 200 and await back.count() == 1:
            result['back'] = await back.evaluate("""e=>({
                text:e.innerText.trim(), tabIndex:e.tabIndex, href:e.getAttribute('href'),
                role:e.getAttribute('role'), onclick:e.getAttribute('onclick')
            })""")
            for key in ['Tab','Shift+Tab']:
                order=[]
                for _ in range(4):
                    await page.keyboard.press(key)
                    order.append(await page.evaluate("""()=>{
                        const e=document.activeElement;
                        return {tag:e.tagName, href:e.getAttribute('href'),
                            isReturn:e.matches('main a[onclick]')};
                    }"""))
                result[key]=order
    except Exception as error:
        result['error'] = str(error)
    finally:
        await context.close()
    return result

async def main():
    async with async_playwright() as pw:
        chrome=os.environ.get('CHROMIUM_EXECUTABLE_PATH') or shutil.which('google-chrome') or shutil.which('chromium')
        browser=await pw.chromium.launch(executable_path=chrome,args=['--no-sandbox'])
        sem=asyncio.Semaphore(4)
        async def bounded(p,w):
            async with sem:
                try:return await single_page(browser,p,w)
                except Exception as e:return {'page':p,'width':w,'error':str(e)}
        async def bounded_contact(p,nojs):
            async with sem:
                try:return await contact(browser,p,nojs)
                except Exception as e:return {'page':p,'js':not nojs,'error':str(e)}
        pairs=await asyncio.gather(*[bounded(p,w) for w in (320,1280) for p in langfiles])
        contacts=await asyncio.gather(*[bounded_contact(p,f) for p in ['contact.html','en/contact.html'] for f in [False,True]])
        provider = await asyncio.gather(*(provider_return(browser,lang) for lang in ['fr','en']))
        (folder/(phase+'.json')).write_text(json.dumps({'browser':browser.version,'pages':pairs,'contacts':contacts,'providerReturns':provider},ensure_ascii=False,indent=2))
        await browser.close()
        print(len(pairs),'page/largeur;',len(contacts),'parcours contact ; exceptions',[(e.get('page'),e.get('error')) for e in [*pairs,*contacts] if 'error'in e])
        print('Différences clavier',[(a['page'],a['width'],a['tabCount'],a['tabExpected']) for a in pairs if 'error' not in a and not a['focusOrderPass']])
        print('Mode champs',[(a['page'],a['js'],a.get('testedModes',{}).get('error'),a.get('backDraft')) for a in contacts])
        failure = [a['page'] for a in pairs if 'error' in a or not a['focusOrderPass']]
        for item in contacts:
            if 'error' in item:
                failure.append(item['page'])
                continue
            if item['js']:
                modes=item['testedModes']
                valid = (all(modes[k]['alert'] and not modes[k]['status'] for k in ['error','unknown','html','offline'])
                    and modes['delay']['singleRequest'] and modes['delay']['focus']=='contact-message'
                    and modes['success']['status'] and not modes['success']['message'] and modes['success']['focus']=='BUTTON'
                    and item['correctedErrors']=={'left':0,'alert':''})
            else:
                valid = all(r['post']['method']=='POST' and r['post']['url']==endpoint and r['draftAfterBack']=='Intercepted at browser'
                    for r in item['nativeReturns'].values())
            if not valid:
                failure.append(item['page'])
        for item in pairs:
            if any(not (d['initial'] and d['reverseReachesLast'] and d['wrapsToClose'] and d['restored']) for d in item.get('dialogs',[])):
                failure.append(item['page'])
        if failure:
            raise AssertionError('Échecs de navigation ou de validation : '+', '.join(failure))
asyncio.run(main());server.shutdown()
