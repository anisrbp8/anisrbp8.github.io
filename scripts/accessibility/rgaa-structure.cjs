// RGAA 6, 8 and 9. Inspect the rendered link names, language, headings and lists
// of each public page at desktop and mobile widths, including the opened mobile menu.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {once} = require('node:events');
const http = require('node:http');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-output', 'rgaa-structure');
const report = {browser: '', pages: {}, errors: []};
const normalise = text => text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function publicServer() {
  const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.jpg':'image/jpeg'};
  return http.createServer((request, response) => {
    const requested = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + requested + (requested.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(bytes);
    });
  });
}

function documentData() {
  const text = el => el.textContent.trim().replace(/\s+/g, ' ');
  const links = [...document.querySelectorAll('a[href]')].map(link => {
    const portions = [];
    function collect(node) {
      if (node.nodeType === Node.TEXT_NODE) { portions.push(node.textContent); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches('.visually-hidden,[aria-hidden="true"],[hidden]')) return;
      if (node.tagName === 'IMG') { portions.push(node.alt); return; }
      if (['block', 'flex', 'grid'].includes(getComputedStyle(node).display)) portions.push(' ');
      node.childNodes.forEach(collect);
    }
    collect(link);
    return {href: link.getAttribute('href'), visibleLabel: portions.join('').trim().replace(/\s+/g, ' ')};
  });
  return {
    links, title: document.title, lang: document.documentElement.lang,
    doctype: document.doctype?.name, duplicatedIds: [...document.querySelectorAll('[id]')].map(n=>n.id).filter((id,i,ids)=>ids.indexOf(id)!==i),
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(n => [n.tagName.toLowerCase(), text(n)]),
    lists: [...document.querySelectorAll('ol,ul,dl')].map(n => ({type:n.tagName.toLowerCase(),items:n.querySelectorAll(':scope > li,:scope > dt,:scope > div > dt').length})),
    languages: [...document.querySelectorAll('body [lang]')].map(n => [n.lang, text(n).slice(0,180)]),
    bibliography: [...document.querySelectorAll('[data-publication] h3')].map(n=>[n.closest('[lang]').lang, text(n)]),
    quotes: document.querySelectorAll('q,blockquote').length
  };
}

async function capture(page, dialogOpen = false) {
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach(n => { n.open = true; });
  });
  const toggle = page.locator('.mobile-menu-toggle');
  if (!dialogOpen && await toggle.isVisible()) await toggle.click();
  // The floating shortcut is exposed only after scrolling a long page.
  if (!dialogOpen) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const data = await page.evaluate(documentData);
  const cdp = await page.context().newCDPSession(page);
  try {
    const snapshot = await cdp.send('DOMSnapshot.captureSnapshot', {computedStyles: []});
    const nodes = snapshot.documents[0].nodes;
    const linkIds = nodes.backendNodeId.filter((_,i) =>
      snapshot.strings[nodes.nodeName[i]] === 'A' && nodes.attributes[i].some((attribute,index) =>
        index % 2 === 0 && snapshot.strings[attribute] === 'href'));

    assert.equal(data.links.length, linkIds.length, 'Links in DOM and CDP snapshot');
    const {nodes: tree} = await cdp.send('Accessibility.getFullAXTree');
    const exposed = new Map(tree.filter(n => !n.ignored && n.role?.value === 'link').map(n => [n.backendDOMNodeId,n.name?.value || '']));
    data.links.forEach((link,i) => {
      link.exposed = exposed.has(linkIds[i]);
      link.accessibleName = exposed.get(linkIds[i]) || '';
    });
    const structuralRoles = ['list','heading','main','navigation','complementary','banner','contentinfo'];
    data.accessibilityTree = tree.filter(n => !n.ignored && structuralRoles.includes(n.role?.value))
                                 .map(n => [n.role.value, n.name?.value || '']);
    return data;
  } finally { await cdp.detach(); }
}

async function inspect(browser, base, name) {
  const item = report.pages[name] = {};
  for (const width of [1280,375]) {
    const page = await browser.newPage({viewport:{width,height:850}});
    try {
      await page.goto(base+'/'+name, {waitUntil:'load'});
      if (width === 1280) {
        const closed = path.join(output,'states',name.replace(/\.html$/, '-closed.html'));
        fs.mkdirSync(path.dirname(closed),{recursive:true});
        fs.writeFileSync(closed,await page.content());
      }
      item[width] = await capture(page);
      if (width === 1280) {
        const domFile = path.join(output, 'dom', name);
        fs.mkdirSync(path.dirname(domFile), {recursive:true});
        fs.writeFileSync(domFile, await page.content());
        const openers = page.locator('[data-figure-open]');
        const number = await openers.count();
        if (number) {
          item.figures = [];
          for (let i = 0; i < number; i++) {
            await openers.nth(i).click();
            const current = await capture(page, true);
            const links = current.links.filter(l => l.exposed);
            assert.ok(links.length, 'The opened figure has its original-image link');
            for (const l of links) {
              if (!l.accessibleName.trim() || !normalise(l.accessibleName).includes(normalise(l.visibleLabel)))
                report.errors.push({name, figure:i+1, href:l.href, issue:'Open figure link name'});
            }
            item.figures.push({links, title: await page.locator('dialog[open] h2').innerText()});
            const file = path.join(output,'states',name.replace(/\.html$/, '-figure-'+(i+1)+'.html'));
            fs.mkdirSync(path.dirname(file),{recursive:true});
            fs.writeFileSync(file,await page.content());
            await page.keyboard.press('Escape');
          }
        }
        if (name.endsWith('publications.html')) {
          const visible = page.locator('.publication-list > li:visible');
          const all = await visible.count();
          await page.locator('#publication-year').selectOption('2023');
          const filtered = await visible.count();
          item.filter = {all, filtered};
          assert.equal(all,17);
          assert.equal(filtered,2);
        }
      }
    } finally { await page.close(); }
  }
  const desktop = item[1280], mobile = item[375];
  assert.equal(desktop.links.length,mobile.links.length);
  assert.deepEqual(desktop.duplicatedIds, []);
  assert.equal(desktop.doctype,'html');
  assert.ok(['fr','en'].includes(desktop.lang));
  assert.equal(desktop.headings.filter(h=>h[0]==='h1').length,1);
  assert.ok(desktop.headings.every((h,i) => h[1] && (i===0 || Number(h[0][1]) <= Number(desktop.headings[i-1][0][1])+1)));
  assert.ok(desktop.lists.every(l=>l.items>0));
  for (const [i,desk] of desktop.links.entries()) {
    const mob = mobile.links[i];
    assert.equal(desk.href,mob.href, 'Matching destinations between layouts');
    if (desk.exposed || mob.exposed) {
      for (const state of [desk,mob].filter(s=>s.exposed)) {
        if (!state.accessibleName.trim() || !normalise(state.accessibleName).includes(normalise(state.visibleLabel)))
          report.errors.push({name, href:state.href, issue:'Link name', visible:state.visibleLabel, accessible:state.accessibleName});
      }
    } else {
      report.errors.push({name,href:desk.href,issue:'Link unavailable in both layouts'});
    }
  }
}

async function main() {
  fs.mkdirSync(output,{recursive:true});
  let server, browser;
  try {
    server = publicServer();
    server.listen(0, '127.0.0.1'); await once(server,'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const options = process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']} : {};
    browser = await chromium.launch(options); report.browser = browser.version();
    const files = ['', 'en/'].flatMap(dir => fs.readdirSync(path.join(root,dir)).filter(p => p.endsWith('.html')).sort().map(p => dir + p));
    assert.equal(files.length,29);
    for (const name of files) {
      try { await inspect(browser,base,name); }
      catch (error) { report.errors.push({name, issue:error.message}); }
    }
  } catch (error) { report.errors.push({issue:error.stack}); }
  finally {
    if (browser) await browser.close();
    if (server) server.close();
    fs.writeFileSync(path.join(output,'preuves.json'), JSON.stringify(report));
    console.log(JSON.stringify({pages:Object.keys(report.pages).length,errors:report.errors}));
    if (report.errors.length) process.exitCode=1;
  }
}
main();
