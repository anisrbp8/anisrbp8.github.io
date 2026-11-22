const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '../..');
const files = ['', 'en/'].flatMap(prefix => fs.readdirSync(path.join(root, prefix))
  .filter(name => name.endsWith('.html')).sort().map(name => prefix + name));
const mime = {'.html':'text/html', '.svg':'image/svg+xml', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png'};
const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + route + (route.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {res.writeHead(404).end();return;}
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

async function readWithoutStyles(page) {
  return page.evaluate(() => {
    const visible = element => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    };
    const elements = [...document.querySelector('main').querySelectorAll('h1,h2,h3,h4,p,dt,dd,li,figcaption,label,summary,a[href]')];
    const baseline = elements.filter(visible);
    const before = baseline.map(e => e.textContent.trim()).filter(Boolean);
    const bgImages = [...document.querySelectorAll('main *')].filter(e => visible(e) && getComputedStyle(e).backgroundImage.includes('url(')).map(e => e.tagName + '.' + e.className);
    for (const sheet of document.styleSheets) sheet.disabled = true;
    const missing = baseline.filter(e => e.textContent.trim() && !visible(e)).map(e => e.textContent.slice(0,70));
    const headings = [...document.querySelectorAll('main h1,main h2,main h3')].filter(visible).map(e => e.textContent.trim());
    const nativeLabels = [...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible)
      .filter(e => !e.closest('[hidden]') && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.labels?.length && !e.textContent.trim()).map(e => e.outerHTML.slice(0,105));
    const links = [...document.querySelectorAll('main a[href]')].filter(visible).length;
    for (const sheet of document.styleSheets) sheet.disabled = false;
    return {textBlocks:before.length, missing, headings, links, nativeLabels, bgImages};
  });
}

async function tabThroughPage(page) {
  // Start by using the same Tab and Enter an unassisted keyboard user would use.
  await page.keyboard.press('Tab');
  const skip = await page.locator('.skip-link').evaluate(link => link === document.activeElement);
  await page.keyboard.press('Enter');
  const main = await page.locator('main').evaluate(el => el === document.activeElement);
  // Start again at the top, including the header in the measured keyboard order.
  await page.reload({waitUntil:'networkidle'});
  const sequence = [], invisible = [], obscured = [], weakOutline = [], smallTargets = [];
  const anchors = new Set();
  for (let n = 0; n < 300; n++) {
    await page.keyboard.press('Tab');
    const item = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body || e === document.documentElement) return null;
      const all = [...document.querySelectorAll('a,button,input,select,textarea,summary,[tabindex]')];
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      const box = [...e.getClientRects()].find(b => b.width && b.height && b.top < innerHeight && b.bottom > 0) || r;
      const inside = [0.2,0.5,0.8].flatMap(x => [0.2,0.5,0.8].map(y => {
        const px = Math.max(0,Math.min(innerWidth-1,box.left+box.width*x)), py = Math.max(0,Math.min(innerHeight-1,box.top+box.height*y));
        const top = document.elementFromPoint(px,py);
        return Boolean(top && (e === top || e.contains(top) || top.contains(e)));
      }));
      return {
        idx:all.indexOf(e), name:(e.getAttribute('aria-label') || e.innerText || e.labels?.[0]?.textContent || e.tagName).trim().slice(0,100),
        id:e.id,tag:e.tagName,rect:[r.width,r.height],outline:s.outlineStyle,thickness:parseFloat(s.outlineWidth), 
        offscreen:box.bottom<=0||box.top>=innerHeight||box.right<=0||box.left>=innerWidth,
        exposed:inside.some(Boolean),legalInline:!!e.closest('p,figcaption,li p,address,dd>p'),targetSizeExempt:e.tagName==='SUMMARY'&&s.display==='list-item',
        group:e.closest('main,header,footer,aside,nav')?.tagName
      };
    });
    if (!item) {if(sequence.length)break;continue;}
    if (anchors.has(item.idx)) break;
    anchors.add(item.idx);sequence.push({i:item.idx,n:item.name,zone:item.group});
    if(item.offscreen || !item.rect[0] || !item.rect[1]) invisible.push(item);
    if(!item.exposed) obscured.push(item);
    if(item.outline==='none'||item.thickness<2)weakOutline.push(item);
    if((item.rect[0]<44||item.rect[1]<44)&&!item.legalInline)smallTargets.push({name:item.name,tag:item.tag,size:item.rect});
  }
  return {skip,main,sequence,invisible,obscured,weakOutline,smallTargets};
}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const report = {records:[], failures:[]};
  try {
    browser = await chromium.launch();
    for (const width of [1280,320]) {
      const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      for (const file of files) {
        await page.goto(origin+'/'+file,{waitUntil:'networkidle'});
        const keyboard = await tabThroughPage(page);
        const cssOff = await readWithoutStyles(page);
        const layout = await page.evaluate(() => ({
          width:innerWidth,scroll:document.documentElement.scrollWidth,
          landmarks:[...document.querySelectorAll('header,main,footer,nav')].map(e=>[e.tagName,e.getAttribute('aria-label')]),
          direction:getComputedStyle(document.body).writingMode,
          events:[...document.querySelectorAll('[accesskey],[onmouseover],[onmouseenter],[onfocus]')].map(e=>e.tagName),
          styles:[...document.querySelectorAll('big,blink,center,font,marquee,strike,tt,table[align],[bgcolor]')].map(e=>e.tagName)
        }));
        if(!keyboard.skip||!keyboard.main||layout.scroll>width+1||cssOff.missing.length||keyboard.invisible.length||keyboard.obscured.length||keyboard.weakOutline.length) {
          report.failures.push({file,width,skip:keyboard.skip,main:keyboard.main,scroll:layout.scroll,css:cssOff.missing,
            invisible:keyboard.invisible.map(e=>e.name),obscured:keyboard.obscured.map(e=>e.name),outline:keyboard.weakOutline.map(e=>e.name)});
        }
        report.records.push({file,width,keyboard,cssOff,layout});
      }
      await page.close();
    }
  } catch(error) {report.error=String(error.stack||error);}
  finally {
    await browser?.close();server.close();
    fs.mkdirSync(path.join(root,'test-output'),{recursive:true});
    fs.writeFileSync(path.join(root,'test-output/rgaa-layout.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({pages:report.records.length,failures:report.failures,error:report.error}));
    if (report.failures.length||report.error||report.records.length!==files.length*2)process.exitCode=1;
  }
})();
