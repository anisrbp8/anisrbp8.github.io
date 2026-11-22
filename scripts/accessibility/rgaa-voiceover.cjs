// A regular Safari window receives system keyboard input from Apple's VoiceOver.
// A loopback-only helper observes focus and state. It never generates speech or
// injects text that could enter the accessible tree. The form uses a local stub.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { voiceOver: vo } = require('@guidepup/guidepup');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-output/rgaa-voiceover');
const origin = 'http://127.0.0.1:8894';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalized = s => String(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const languages=(process.env.RGAA_VOICEOVER_LANGUAGES || 'fr,en').split(',');
const report = { revision: process.env.GITHUB_SHA || 'local', languages, scenarios: [], simulatedRequests: [] };
const save = () => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
let current, sessionId = 0, commandId = 0, service = 503, server;
// Runs only inside the temporary loopback preview. No source files are modified.
function instrument() {
  const key = new URLSearchParams(location.search).get('vo');
  const query = selector => document.querySelector(selector);
  function state(selector) {
    const el = query(selector);
    if (!el) return { exists: false };
    const closed=el.closest('details:not([open])');
    const hiddenByDisclosure=closed && closed!==el && !closed.querySelector(':scope > summary')?.contains(el);
    return { exists: true, focused: el === document.activeElement, visible: !hiddenByDisclosure && !el.closest('[hidden]') && el.getClientRects().length > 0,
      expanded: el.getAttribute('aria-expanded'), invalid: el.getAttribute('aria-invalid'),
      checked: el.checked, open: el.open, value: el.value, text: el.textContent.trim(),
      css: el.className, grid: el.getAttribute('data-grid-size'), width: window.innerWidth };
  }
  async function run(command) {
    const { action, selector, value } = command;
    const node = selector && query(selector);
    if (action === 'focus') {
      if (!node) throw Error(`No control matching ${selector}`);
      node.scrollIntoView({ block: 'center' });node.focus({preventScroll:true});
      return state(selector);
    }
    if (action === 'state') return state(selector);
    if (action === 'select') {
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return state(selector);
    }
    if (action === 'populate') {
      const data = { name: 'Test', email: 'test@example.org', subject: 'A11y', message: 'Local test only.' };
      for (const [name, value] of Object.entries(data)) {
        const field = node.elements.namedItem(name); field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    }
    if (action === 'navigate') { setTimeout(()=>location.assign(value),350); return true; }
    if (action === 'ready') return { doc: document.title, width: innerWidth, hasFocus: document.hasFocus(), ua: navigator.userAgent };
    throw new Error('Unknown action');
  }
  async function next() {
    try {
      const response = await fetch(`/__vo/poll?key=${key}`, { cache: 'no-store' });
      if (response.status === 410) return;
      if (response.ok && response.status !== 204) {
        const command = await response.json(); let reply;
        try { reply = { value: await run(command) }; } catch (error) { reply = { error: error.message }; }
        await fetch(`/__vo/done?key=${key}&id=${command.id}`, { method: 'POST', body: JSON.stringify(reply) });
      }
    } finally { setTimeout(next, 75); }
  }
  next();
}
async function handle(req, res) {
  const url = new URL(req.url, origin);
  const send = (status, text = '', type = 'text/plain') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(text);
  };
  if (url.pathname === '/__vo/helper.js') return send(200, `(${instrument.toString()})();`, 'application/javascript');
  if (url.pathname === '/__vo/form') {
    if (req.method !== 'POST') return send(405);
    for await (const _ of req) {} // Discard synthetic form values, never persist them.
    report.simulatedRequests.push({ page: current?.file, status: service });
    return send(service, JSON.stringify(service === 200 ? {ok:true} : {error:'Temporary refusal'}), 'application/json');
  }
  if (url.pathname.startsWith('/__vo/')) {
    if (url.searchParams.get('key') !== String(current?.id)) return send(410);
    if (url.pathname === '/__vo/poll') {
      const op = current.op;
      if (!op || op.delivered) return send(204);
      op.delivered = true; return send(200, JSON.stringify(op.payload), 'application/json');
    }
    if (url.pathname === '/__vo/done' && req.method === 'POST') {
      let body = ''; for await (const part of req) body += part;
      const op = current.op;
      if (op && op.payload.id === Number(url.searchParams.get('id'))) {
        current.op = undefined; const data = JSON.parse(body); data.error ? op.reject(Error(data.error)) : op.resolve(data.value);
      }
      return send(204);
    }
    return send(404);
  }
  const local = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!local.startsWith(root+path.sep) || !fs.existsSync(local) || !fs.statSync(local).isFile()) return send(404);
  let body = fs.readFileSync(local);
  const ext = path.extname(local);
  if (ext === '.html' && url.searchParams.has('vo')) {
    let html = body.toString();
    if (url.pathname.endsWith('/contact.html')) {
      const endpoint = /action="https:\/\/formspree\.io\/f\/mwlpbykp"/g;
      if ((html.match(endpoint)||[]).length !== 1) return send(500,'Unexpected contact action');
      html = html.replace(endpoint, 'action="/__vo/form"');
    }
    body = html.replace('</body>', '<script defer src="/__vo/helper.js"></script></body>');
  }
  const types = {'.html':'text/html;charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
  return send(200,body,types[ext] || 'application/octet-stream');
}
function action(action, selector, value) {
  const now = current;
  return new Promise((resolve,reject)=>{
    const id = ++commandId;
    const timer = setTimeout(()=>{ if (now.op?.payload.id===id) now.op=undefined; reject(Error(`Safari did not respond to ${action} ${selector || ''}`)); },10000);
    now.op = { payload:{id,action,selector,value}, resolve:v=>{clearTimeout(timer);resolve(v);}, reject:e=>{clearTimeout(timer);reject(e);} };
  });
}
async function navigate(file,narrow=false) {
  const next = { id: ++sessionId, file };
  const url = origin+'/'+file+'?vo='+next.id;
  if (current?.ready) await action('navigate',null,url);
  else execFileSync('/usr/bin/open', ['-a','Safari',url]);
  current=next;
  let info;
  try { info=await action('ready'); }
  catch { execFileSync('/usr/bin/open', ['-a','Safari',url]); info=await action('ready'); }
  current.ready=true;await delay(600);
  if(narrow && !(await action('state','.mobile-menu-toggle')).visible) throw Error(`Menu is not collapsed at native Safari window width ${info.width}`);
  return info;
}
function physical(key,shift=false) {
  // System keyboard events in the ordinary Safari window. No DOM event is
  // created by the test. Quartz keycodes 48 and 53 are Tab and Escape.
  const code=key==='Tab'?48:53;
  const script=`ObjC.import('CoreGraphics'); for (const down of [true,false]) { const e = $.CGEventCreateKeyboardEvent(null, ${code}, down); $.CGEventSetFlags(e, ${shift?131072:0}); $.CGEventPost(0,e); }`;
  execFileSync('/usr/bin/osascript',['-l','JavaScript','-e',script],{timeout:4500});
}
// VoiceOver's capture waits for speech. A stuck command ends this run; do
// not dispatch another command in parallel with the system screen reader.
let readerTimeout=false;
async function bounded(task,name,ms=35000) {
  let timeout;
  try { return await Promise.race([task,new Promise((_,reject)=>{timeout=setTimeout(()=>{readerTimeout=true;reject(Error('VoiceOver timeout: '+name));},ms);})]); }
  finally { clearTimeout(timeout); }
}
async function capture(fn) { return (await bounded(vo.capture(async()=>{await fn(); await delay(400);},{capture:true}),'capture')).spokenPhrase || ''; }
async function key(stroke) {
  // VO-Space is the documented default action on a web control. A bare Return
  // can be consumed by Safari rather than invoking the item at the VO cursor.
  if(stroke==='Enter'||stroke==='Space') {
    await bounded(vo.perform(vo.keyboardCommands.moveCursorToKeyboardFocus,{capture:false}),'synchronise keyboard focus');
    await bounded(vo.act({capture:true}),'VO-Space');
  } else if (stroke==='Tab'||stroke==='Escape') {return capture(()=>physical(stroke));}
  else {await bounded(vo.press(stroke,{capture:true}),stroke);}
  return await vo.lastSpokenPhrase() || '';
}
async function speak(command) { await bounded(vo.perform(vo.keyboardCommands[command],{capture:true}),command); return (await vo.lastSpokenPhrase()) || ''; }
async function focus(selector) {
  const initial=await action('focus',selector);
  if(!initial.focused) throw Error('Safari keyboard focus did not reach '+selector);
  // Programmatic focus, even when confirmed by the DOM, can leave the VO cursor
  // on the preceding item. Return to this control with actual system Tab keys.
  physical('Tab',true);await delay(160);
  const spoken=await capture(()=>physical('Tab'));
  if(!(await state(selector)).focused) throw Error('System Tab did not return to '+selector);
  await bounded(vo.perform(vo.keyboardCommands.moveCursorToKeyboardFocus,{capture:false}),'track actual tab focus');
  const currentFocus = await speak('describeItemWithKeyboardFocus');
  return [spoken,currentFocus].filter(Boolean).join(' | ');
}
async function state(selector) { return action('state',selector); }
async function checkPage(file,name,run,narrow=false) {
  if (readerTimeout) throw Error('Stopped after VoiceOver command timeout');
  const row={file,name,checks:[]}; report.scenarios.push(row);
  function check(label,speech,patterns,observed=true,evidence) {
    const matches = patterns.every(re=>re.test(normalized(speech)));
    row.checks.push({label,speech,speechMatched:matches,stateMatched:Boolean(observed),evidence,passed:matches&&Boolean(observed)});
    save();
  }
  try { row.context = await navigate(file,narrow); await run(check); } catch(error) {row.error=error.message;}
  row.passed = !row.error && row.checks.length>0 && row.checks.every(c=>c.passed); save();
  console.log(`${row.passed?'PASS':'REVIEW'} ${file} ${name} ${row.checks.filter(c=>c.passed).length}/${row.checks.length} ${row.error||''}`);
}
async function audit(en) {
  const prefix=en?'en/':''; const home=prefix+'index.html'; const pubs=prefix+'publications.html';
  await checkPage(home,'Headings and links',async check=>{
    await action('focus','main'); await bounded(vo.nextHeading({capture:true}),'next heading');
    check('First heading',await vo.lastSpokenPhrase(),[/anis rojbi/,/heading|titre/]);
    await bounded(vo.nextLink({capture:true}),'next link'); check('Next link',await vo.lastSpokenPhrase(),[/link|lien/]);
  });
  await checkPage(home,'Small menu and reading preferences',async check=>{
    const menu='.mobile-menu-toggle'; const reading='.reading-tools > summary';
    check('Menu name, button and collapsed state',await focus(menu),[/menu/,/button|bouton/,/collapsed|repli|ferm|reduit/],(await state(menu)).expanded==='false');
    const open=await key('Enter');
    check('Expanded menu state',[open,await speak('describeItemWithKeyboardFocus')].join(' | '),[/expanded|develop|ouvert/],(await state(menu)).expanded==='true');
    const firstLink=await key('Tab');
    check('Reach first expanded mobile navigation link with Tab',firstLink,[en?/home/:/accueil/,/link|lien/],(await state('.mobile-panel a')).focused);
    const close=await key('Escape'); check('Escape restores menu focus',[close,await speak('describeItemWithKeyboardFocus')].join(' | '),[/menu/],(await state(menu)).focused&&(await state(menu)).expanded==='false');
    check('Reading preferences',await focus(reading),[en?/reading preferences/:/confort de lecture/]);
    await key('Enter'); const box='#reading-space'; check('Spacing checkbox',await focus(box),[/check|case/,/spacing|espacements|espace/]);
    const change=await key('Space'); check('Spacing changed',[change,await speak('describeItemWithKeyboardFocus')].join(' | '),[/checked|coche|appliqu|applied/],(await state(box)).checked);
    await focus('#reading-reset'); check('Preferences reset',await key('Enter'),[/retabli|restored/],!(await state(box)).checked);
  },true);
  await checkPage(home,'Granularity demonstration',async check=>{
    const summary='#granularity-demo > summary'; check('Disclosure title',await focus(summary),[/detail|granul/]);
    await key('Enter');
    if (!(await state('#granularity-demo')).open) throw Error('VoiceOver default action did not open the demonstration');
    await speak('moveCursorToKeyboardFocus');
    // The adjacent paragraph is a second access route to the shape. Record its
    // own spoken text independently from the SVG image's name/description.
    const adjacent=[];
    for(let item=0;item<4;item++) {
      await bounded(vo.next({capture:true}),'read next item in the demonstration');
      adjacent.push(await vo.lastSpokenPhrase());
      if((en?/triangular roof/:/toit triangulaire/).test(normalized(adjacent.join(' ')))&&(en?/door/:/porte/).test(normalized(adjacent.join(' '))))break;
    }
    check('Shape description in ordinary reading order',adjacent.join(' | '),[en?/triangular roof/:/toit triangulaire/,en?/door/:/porte/]);
    await speak('moveCursorToKeyboardFocus');
    const graphic=await speak('findNextGraphic'); const more=await speak('hearItemDescription');
    const desc=[graphic,more,await speak('describeItem')].join(' | ');
    check('Title of the displayed graphic',desc,[en?/synthetic house image/:/image synthetique de maison/],(await state('.granularity-image')).visible);
    check('Roof and door opening in description',desc,[en?/triangular roof/:/toit triangulaire/,en?/door/:/porte/]);
    const select='#granularity-level'; check('Level label and role',await focus(select),[/detail|level/,/menu|combo|liste|pop up/]);
    const speech=await capture(()=>action('select',select,'32'));
    check('Changed grid status',speech,[/32/,/cellul|cells/],(await state('[data-granularity-demo]')).grid==='32');
  });
  await checkPage(pubs,'Filters and citation',async check=>{
    const year='#publication-year'; check('Year filter',await focus(year),[/year|annee/,/menu|combo|liste|pop up/]);
    const change=await capture(()=>action('select',year,'2026'));check('Publication results change',change,[/publication/],(await state(year)).value==='2026');
    const detail='[data-publication]:not([hidden]) details'; await focus(detail+' summary'); await key('Enter');
    const copy=detail+' button.citation-copy';check('Copy citation button',await focus(copy),[/button|bouton/,/copy|copi/]);
    check('Citation copied or selected',await key('Enter'),[/copi|selected|selectionne/],Boolean((await state(detail+' .copy-status')).text));
  });
  await checkPage(en?'en/research.html':'recherche.html','Figure dialog',async check=>{
    const open='[data-figure-open]'; check('Figure opener',await focus(open),[/figure/]);
    const a=await key('Enter');const close='dialog[open] button';
    check('Dialog and close control',[a,await speak('describeItemWithKeyboardFocus')].join(' | '),[/dialog/,/fermer|close/],(await state(close)).focused);
    const b=await key('Escape');check('Close and restore figure focus',[b,await speak('describeItemWithKeyboardFocus')].join(' | '),[/figure/],(await state(open)).focused && !(await state('dialog[open]')).exists);
  });
  await checkPage(prefix+'contact.html','Contact and simulated service',async check=>{
    const form='form[data-contact-form]'; const name=form+' [name=name]';const send=form+' [type=submit]';const status='[data-form-status]';
    check('Required name and edit control',await focus(name),[/name|nom/,/required|obligatoire/,/edit|text|saisie/]);
    await focus(send);const error=await key('Enter');check('Invalid field and focus',[error,await speak('describeItemWithKeyboardFocus')].join(' | '),[/required|obligatoire|invalid/],(await state(name)).focused&&(await state(name)).invalid==='true');
    await action('populate',form);service=503;await focus(send);
    check('Refusal and retained message',await key('Enter'),[/conserve|accepter|kept|could not accept/],(await state('[data-form-alert]')).css.includes('is-error')&&(await state('[name=message]')).value==='Local test only.');
    service=200;await focus(send);const sent=await key('Enter');
    const confirmations=(normalized(sent).match(en ? /your message has been sent/g : /votre message a bien ete envoye/g)||[]).length;
    check('Successful simulated response with one confirmation',sent,[/envoye|sent/],(await state(status)).css.includes('is-success')&&(await state('[name=message]')).value===''&&confirmations===1,{spokenConfirmations:confirmations});
  });
}
(async()=>{
  fs.mkdirSync(output,{recursive:true}); let started=false;
  try {
    report.system=execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim();
    report.safari=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString','/Applications/Safari.app/Contents/Info.plist'],{encoding:'utf8'}).trim();
    const readerInfo='/System/Library/CoreServices/VoiceOver.app/Contents/Info.plist';
    if(fs.existsSync(readerInfo)) report.voiceOverBundle=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',readerInfo],{encoding:'utf8'}).trim();
    report.stage='Starting VoiceOver';save();
    execFileSync('/usr/bin/open',['-a','Safari','about:blank']);await delay(1300);
    server=http.createServer((req,res)=>handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();}));
    await new Promise((resolve,reject)=>server.once('error',reject).listen(8894,'127.0.0.1',resolve));
    await vo.start({capture:true,restoreUserScreenReader:false});started=true;report.controllerAsset=vo.version;report.stage='Reading pages';
    try {report.observesLiveRegions=vo.getSetting('SCRCUserDefaultsWebObserveLiveRegions');} catch {}
    save();
    for (const language of languages) {
      if (!['fr','en'].includes(language)) throw Error('Unexpected test language');
      await audit(language === 'en');
    }
  } catch(error) {report.error=error.stack;} finally {
    if(started) await bounded(vo.stop(),'VoiceOver shutdown',15000).catch(error=>report.stopError=error.message);
    server?.closeAllConnections();server?.close();
    const checks=report.scenarios.flatMap(s=>s.checks); report.total=checks.length;report.passed=checks.filter(c=>c.passed).length;
    report.complete=report.scenarios.length===6*languages.length&&!report.error&&report.scenarios.every(s=>!s.error);
    save();console.log(JSON.stringify({complete:report.complete,total:report.total,passed:report.passed,error:report.error}));
    if(!report.complete||report.passed!==report.total)process.exitCode=1;
  }
})();
