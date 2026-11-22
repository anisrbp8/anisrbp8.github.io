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
    return { exists: true, focused: el === document.activeElement, visible: el.getClientRects().length > 0,
      expanded: el.getAttribute('aria-expanded'), invalid: el.getAttribute('aria-invalid'),
      checked: el.checked, open: el.open, value: el.value, text: el.textContent.trim(),
      css: el.className, grid: el.getAttribute('data-grid-size'), width: window.innerWidth };
  }
  async function run(command) {
    const { action, selector, value } = command;
    const node = selector && query(selector);
    if (action === 'focus') { node.focus(); return state(selector); }
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
  if (url.pathname.startsWith('/__vo/') && url.pathname !== '/__vo/narrow') {
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
  if (url.pathname === '/__vo/narrow') {
    // Safari's actual layout viewport is narrowed inside the specified frame.
    const source = '/' + current.file + '?vo=' + current.id;
    return send(200, `<!doctype html><html lang="en"><title>Small viewport</title><body style="margin:0"><iframe title="Site académique" src="${source}" style="display:block;width:390px;height:100vh;border:0"></iframe></body></html>`, 'text/html;charset=utf-8');
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
  current = { id: ++sessionId, file };
  execFileSync('/usr/bin/open', ['-a','Safari', origin + (narrow ? '/__vo/narrow?vo=' : '/'+file+'?vo=')+current.id]);
  const info=await action('ready'); await delay(450); return info;
}
async function capture(fn) { return (await vo.capture(async()=>{await fn(); await delay(400);},{capture:true})).spokenPhrase || ''; }
async function key(stroke) { await vo.press(stroke,{capture:true}); return await vo.lastSpokenPhrase() || ''; }
async function speak(command) { await vo.perform(vo.keyboardCommands[command],{capture:true}); return (await vo.lastSpokenPhrase()) || ''; }
async function focus(selector) {
  const spoken = await capture(()=>action('focus',selector));
  const currentFocus = await speak('describeItemWithKeyboardFocus');
  return [spoken,currentFocus].filter(Boolean).join(' | ');
}
async function state(selector) { return action('state',selector); }
async function checkPage(file,name,run,narrow=false) {
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
    await action('focus','main'); await vo.nextHeading({capture:true});
    check('First heading',await vo.lastSpokenPhrase(),[/anis rojbi/,/heading|titre/]);
    await vo.nextLink({capture:true}); check('Next link',await vo.lastSpokenPhrase(),[/link|lien/]);
  });
  await checkPage(home,'Small menu and reading preferences',async check=>{
    const menu='.mobile-menu-toggle'; const reading='.reading-tools > summary';
    check('Menu name, button and collapsed state',await focus(menu),[/menu/,/button|bouton/,/collapsed|repli|ferm|reduit/],(await state(menu)).expanded==='false');
    const open=await key('Enter');
    check('Expanded menu state',[open,await speak('describeItemWithKeyboardFocus')].join(' | '),[/expanded|develop|ouvert/],(await state(menu)).expanded==='true');
    check('First mobile navigation link',await key('Tab'),[en?/home/:/accueil/,/link|lien/],(await state('.mobile-panel a')).focused);
    const close=await key('Escape'); check('Escape restores menu focus',[close,await speak('describeItemWithKeyboardFocus')].join(' | '),[/menu/],(await state(menu)).focused&&(await state(menu)).expanded==='false');
    check('Reading preferences',await focus(reading),[en?/reading preferences/:/confort de lecture/]);
    await key('Enter'); const box='#reading-space'; check('Spacing checkbox',await focus(box),[/check|case/,/spacing|espacements|espace/]);
    const change=await key('Space'); check('Spacing changed',[change,await speak('describeItemWithKeyboardFocus')].join(' | '),[/checked|coche|appliqu|applied/],(await state(box)).checked);
    await focus('#reading-reset'); check('Preferences reset',await key('Enter'),[/retabli|restored/],!(await state(box)).checked);
  },true);
  await checkPage(home,'Granularity demonstration',async check=>{
    const summary='#granularity-demo > summary'; check('Disclosure title',await focus(summary),[/detail|granul/]);
    await key('Enter'); await speak('moveCursorToKeyboardFocus');
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
    check('Dialog and close control',[a,await focus(close)].join(' | '),[/dialog/,/fermer|close/],(await state(close)).focused);
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
    server=http.createServer((req,res)=>handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();}));
    await new Promise((resolve,reject)=>server.once('error',reject).listen(8894,'127.0.0.1',resolve));
    await vo.start({capture:true,restoreUserScreenReader:false});started=true;report.controllerAsset=vo.version;report.stage='Reading pages';save();
    for (const language of languages) {
      if (!['fr','en'].includes(language)) throw Error('Unexpected test language');
      await audit(language === 'en');
    }
  } catch(error) {report.error=error.stack;} finally {
    if(started) await vo.stop().catch(error=>report.stopError=error.message);
    server?.closeAllConnections();server?.close();
    const checks=report.scenarios.flatMap(s=>s.checks); report.total=checks.length;report.passed=checks.filter(c=>c.passed).length;
    report.complete=report.scenarios.length===6*languages.length&&!report.error&&report.scenarios.every(s=>!s.error);
    save();console.log(JSON.stringify({complete:report.complete,total:report.total,passed:report.passed,error:report.error}));
    if(!report.complete||report.passed!==report.total)process.exitCode=1;
  }
})();
