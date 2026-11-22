// Evidence from the real NVDA output exposed by Guidepup. DOM observations are
// recorded separately from the words captured from the screen reader.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { firefox } = require('playwright');
const { nvda, NVDAKeyCodeCommands: commands } = require('@guidepup/guidepup');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-output', 'rgaa-nvda');
const base = 'http://127.0.0.1:8887';
const result = { revision: process.env.GITHUB_SHA || 'local', system: `${os.type()} ${os.release()}`, scenarios: [], messagesIntercepted: 0 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (value, expected) => normalize(value).includes(normalize(expected));
const outputHas = (value, pattern) => pattern.test(normalize(value));
const save = () => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
let browser, page, server, started = false, networkMode = 'failure';

async function spokenDuring(action) {
  return (await nvda.capture(async () => { await action(); await delay(180); }, { capture: true })).spokenPhrase;
}
async function key(stroke) {
  await nvda.press(stroke, { capture: true });
  return nvda.lastSpokenPhrase();
}
async function nameAtFocus(locator) {
  const first = await spokenDuring(() => locator.focus());
  await nvda.perform(commands.reportCurrentFocus, { capture: true });
  return [first, await nvda.lastSpokenPhrase()].filter(Boolean).join(' | ');
}
async function openPage(file, width = 1240) {
  await page.setViewportSize({ width, height: 840 });
  await page.goto(base + '/' + file, { waitUntil: 'load' });
  await page.bringToFront();
  await page.locator('main h1').waitFor();
  await nvda.perform(commands.exitFocusMode, { capture: false });
  // Firefox/Windows can initially leave the screen reader in browser chrome.
  // Guidepup's Firefox example places the cursor in the document before reading.
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await nvda.perform(commands.readNextFocusableItem, { capture: false });
  await nvda.perform(commands.toggleBetweenBrowseAndFocusMode, { capture: false });
  await nvda.perform(commands.toggleBetweenBrowseAndFocusMode, { capture: false });
  await nvda.perform(commands.exitFocusMode, { capture: false });
  await nvda.press('Control+Home', { capture: false });
  await delay(200);
}
async function scenario(file, name, action) {
  const row = { file, name, checks: [] };
  result.scenarios.push(row);
  function record(check, transcript, condition, expected, state = true) {
    const speechMatched = typeof expected === 'function' ? expected(transcript) : outputHas(transcript, expected);
    row.checks.push({ check, transcript, state, speechMatched, passed: Boolean(condition && speechMatched) });
  }
  try { await action(record); }
  catch (error) { row.error = error.message; }
  row.passed = !row.error && row.checks.length > 0 && row.checks.every(x => x.passed);
  save();
  console.log(`${row.passed ? 'PASS' : 'REVIEW'} ${file} ${name}: ${row.checks.filter(x => x.passed).length}/${row.checks.length}${row.error ? ' ' + row.error : ''}`);
}
async function focusIs(locator) { return locator.evaluate(el => el === document.activeElement); }
async function auditLanguage(en) {
  const prefix = en ? 'en/' : '';
  const home = prefix + 'index.html';
  const publications = prefix + 'publications.html';
  const research = en ? 'en/research.html' : 'recherche.html';
  const contact = prefix + 'contact.html';

  await scenario(home, 'Reading headings and links in browse mode', async record => {
    await openPage(home);
    await nvda.nextHeading({ capture: true });
    const title = await nvda.lastSpokenPhrase();
    record('Read the page heading with H', title, true, text => words(text, 'Anis Rojbi') && /titre|heading/.test(normalize(text)));
    await nvda.nextLink({ capture: true });
    const link = await nvda.lastSpokenPhrase();
    record('Read the next link with K', link, true, /lien|link/);
  });
  await scenario(home, 'Mobile menu and reading preferences', async record => {
    await openPage(home, 390);
    const menu = page.locator('.mobile-menu-toggle');
    const initial = await nameAtFocus(menu);
    record('Menu name, button role, closed state', initial, (await menu.getAttribute('aria-expanded')) === 'false', text => /menu/.test(normalize(text)) && /bouton|button/.test(normalize(text)) && /repli|redui|contract|ferm|collapsed/.test(normalize(text)));
    const opened = await key('Enter');
    const expanded = await menu.getAttribute('aria-expanded');
    await nvda.perform(commands.reportCurrentFocus, { capture: true });
    record('Open menu by keyboard and hear its new state', [opened, await nvda.lastSpokenPhrase()].join(' | '), expanded === 'true', /develop|ouvert|expanded/);
    const firstLink = await key('Tab');
    record('Reach first mobile navigation link', firstLink, await focusIs(page.locator('.mobile-panel a').first()), en ? /home/ : /accueil/);
    await key('Escape');
    const closed = await nameAtFocus(menu);
    record('Escape restores focus and announces closed menu', closed, await focusIs(menu) && await menu.getAttribute('aria-expanded') === 'false', /menu/);
    const reading = page.locator('.reading-tools > summary');
    const before = await nameAtFocus(reading);
    record('Preferences disclosure is named', before, true, en ? /reading preferences/ : /confort de lecture/);
    const toggle = await key('Enter');
    record('Open reading preferences with Enter', toggle, await page.locator('.reading-tools').getAttribute('open') !== null, /develop|ouvert|expanded|couleurs|colours/);
    const spacing = page.locator('#reading-space');
    const spacingLabel = await nameAtFocus(spacing);
    record('Spacing checkbox role and name', spacingLabel, true, t => /case|check box|checkbox/.test(normalize(t)) && /espace|espacements|spacing/.test(normalize(t)));
    const changed = await key('Space');
    record('Changed reading preference reported', changed, await spacing.isChecked(), /coche|checked|appliqu|applied/);
    const reset = page.locator('#reading-reset');
    await nameAtFocus(reset);
    const resetSpeech = await key('Enter');
    record('Restoration announced from live status', resetSpeech, !(await spacing.isChecked()), /retabli|restored/);
  });
  await scenario(home, 'Interactive granularity demonstration', async record => {
    await openPage(home);
    const summary = page.locator('#granularity-demo > summary');
    const summaryName = await nameAtFocus(summary);
    record('Demonstration disclosure has its visible name', summaryName, true, t => /detail|granul/.test(normalize(t)));
    await key('Enter');
    const graphic = page.locator('.granularity-image');
    await nvda.perform(commands.exitFocusMode, { capture: false });
    await nvda.perform(commands.moveToNextGraphic, { capture: true });
    const graphicSpeech = await nvda.lastSpokenPhrase();
    record('NVDA graphic command reads the house title', graphicSpeech, await graphic.isVisible(), en ? /synthetic house image/ : /image synthetique de maison/);
    record('Graphic conveys the triangular roof and door opening', graphicSpeech, true,
      t => en ? /triangular roof/.test(normalize(t)) && /door/.test(normalize(t)) : /toit triangulaire/.test(normalize(t)) && /porte/.test(normalize(t)));
    const select = page.locator('#granularity-level');
    const selectName = await nameAtFocus(select);
    record('Level selector has a name and role', selectName, await select.isVisible(), t => /detail|level/.test(normalize(t)) && /liste|combo|menu/.test(normalize(t)));
    const status = await spokenDuring(() => select.selectOption('32'));
    record('Updated grid dimensions and cell count announced', status, await page.locator('[data-granularity-demo]').getAttribute('data-grid-size') === '32', t=>/32/.test(normalize(t)) && /cellul|cells/.test(normalize(t)));
  });
  await scenario(publications, 'Filters, counts and citation copying', async record => {
    await openPage(publications);
    const year = page.locator('#publication-year');
    const initial = await nameAtFocus(year);
    record('Year filter label and role', initial, true, t => /annee|year/.test(normalize(t)) && /liste|combo|menu/.test(normalize(t)));
    const filtered = await spokenDuring(() => year.selectOption('2026'));
    const count = await page.locator('[data-publication]:visible').count();
    record('Bibliography change announces the count', filtered, count > 0 && count < 17, /publication/ , { visible: count });
    const details = page.locator('[data-publication]:visible details').first();
    await nameAtFocus(details.locator('summary')); await key('Enter');
    const copy = details.locator('button.citation-copy');
    record('Copy reference button label and role', await nameAtFocus(copy), await copy.isVisible(), t=> /copi|copy/.test(normalize(t)) && /button|bouton/.test(normalize(t)));
    const copied = await key('Enter');
    record('Clipboard success or selection fallback announced', copied, Boolean(await details.locator('.copy-status').innerText()), /copi|copied|selectionne|selected/);
  });
  await scenario(research, 'Scientific figure dialog', async record => {
    await openPage(research);
    const link = page.locator('[data-figure-open]').first();
    record('Figure opener has a meaningful name', await nameAtFocus(link), true, /figure/);
    const first = await key('Enter');
    const dialog = page.locator('dialog[open]');
    const close = dialog.locator('button').first();
    const dialogSpeech = first + ' | ' + await nameAtFocus(close);
    record('Dialog opens, is named and identifies its close button', dialogSpeech, await dialog.isVisible() && await focusIs(close), t => /dialog/.test(normalize(t)) && /fermer|close/.test(normalize(t)));
    const restored = await key('Escape');
    record('Escape closes dialog and restores figure link', restored + ' | ' + await nameAtFocus(link), await focusIs(link) && !(await dialog.count()), /figure/);
  });
  await scenario(contact, 'Required fields, errors and simulated service responses', async record => {
    await openPage(contact);
    const form = page.locator('form[data-contact-form]');
    const name = form.locator('[name=name]'); const email = form.locator('[name=email]');
    const message = form.locator('[name=message]'); const submit = form.locator('[type=submit]');
    record('Required name and edit-control role', await nameAtFocus(name), await name.getAttribute('required') !== null, t => /nom|name/.test(normalize(t)) && /obligatoire|required/.test(normalize(t)) && /edition|edit|zone de texte|texte/.test(normalize(t)));
    await nameAtFocus(submit);
    const invalid = await key('Enter');
    record('Missing field and associated error', invalid + ' | ' + await nameAtFocus(name), await focusIs(name) && await name.getAttribute('aria-invalid')==='true', /obligatoire|required|invalide|invalid/);
    await name.fill('Test'); await email.fill('test@example.org'); await form.locator('[name=subject]').fill('Test'); await message.fill('Essai local.');
    const status = form.locator('[data-form-status]');
    networkMode = 'failure'; await nameAtFocus(submit);
    const failed = await key('Enter');
    record('Service refusal and retained message', failed, await status.evaluate(el=>el.classList.contains('is-error')) && await message.inputValue()==='Essai local.', /conserve|accepter|kept|could not accept/);
    networkMode = 'success'; await nameAtFocus(submit);
    const sent = await key('Enter');
    record('Positive response and confirmation', sent, await status.evaluate(el=>el.classList.contains('is-success')) && await message.inputValue()==='', /envoye|sent/);
  });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    server = spawn('python', ['-m','http.server','8887','--bind','127.0.0.1','--directory',root], { stdio: 'ignore' });
    for (let i=0;i<35;i++) { try { if ((await fetch(base+'/index.html')).ok) break; } catch {} await delay(200); }
    browser = await firefox.launch({ headless: false });
    result.browser = 'Firefox ' + browser.version();
    page = await browser.newPage({ viewport: { width: 1240, height: 840 } });
    page.setDefaultTimeout(6000);
    await page.route('https://formspree.io/**', route => {
      result.messagesIntercepted++;
      return route.fulfill({ status: networkMode === 'success' ? 200 : 503, contentType:'application/json', body: JSON.stringify(networkMode === 'success' ? {ok:true} : {error:'temporarily unavailable'}) });
    });
    await nvda.start({ capture: true, settings: { general: { language: 'fr' } } });
    started = true; result.screenReader = `NVDA ${nvda.version}`;
    await auditLanguage(false); await auditLanguage(true);
  } catch (error) { result.error = error.stack; }
  finally {
    if (started) await nvda.stop().catch(error => { result.stopError=error.message; });
    await browser?.close(); server?.kill();
    const all = result.scenarios.flatMap(s=>s.checks);
    result.complete = !result.error && result.scenarios.length===12;
    result.passed = result.complete && result.scenarios.every(s=>s.passed);
    result.successfulChecks=all.filter(c=>c.passed).length;
    result.totalChecks=all.length;
    save(); console.log(JSON.stringify({complete:result.complete, checks:result.totalChecks, passed:result.successfulChecks, error:result.error}));
    // Always keep each individual result. Incomplete execution or unmet assertions
    // require reviewing the captured actual speech before any conformance claim.
    if (!result.passed) process.exitCode=1;
  }
})();
