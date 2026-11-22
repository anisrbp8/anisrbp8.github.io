// Regression tests for the bilingual academic home additions. No real form submissions.
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'test-output', 'academic-home');
const base = process.env.BASE_URL || 'http://127.0.0.1:8883';
const server = process.env.BASE_URL ? null : spawn('python3', ['-m', 'http.server', '8883', '--bind', '127.0.0.1', '--directory', root], {stdio:'ignore'});
const checks = [];
let browser;
async function check(name, fn) {
  try { await fn(); checks.push({name, passed:true}); }
  catch (error) { checks.push({name, passed:false, error:error.message}); }
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
(async () => {
  fs.mkdirSync(out, {recursive:true});
  try {
    if (server) {
      let ready = false;
      for (let i=0; i<30; i++) {
        try { const response = await fetch(base); if (response.ok) { ready=true; break; } }
        catch { /* Wait for the test server to bind. */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(ready, 'Local test server must be ready');
    }
    browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH, args:['--no-sandbox']} : {});
    for (const width of [1280, 320]) for (const en of [false, true]) {
      const lang = en ? 'EN' : 'FR';
      const file = en ? 'en/index.html' : 'index.html';
      const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/' + file, {waitUntil:'networkidle'});
      await check(`${lang} ${width} academic links and dated content`, async () => {
        assert.equal(await page.locator('body.home').count(), 1);
        assert.equal(await page.locator('.academic-links a').count(), 3);
        assert.equal(await page.locator('.academic-links a').first().getAttribute('href'), 'https://www.researchgate.net/scientific-contributions/Anis-Rojbi-81385993');
        assert.equal(await page.locator('.dated-news > li').count(), 3);
        assert.equal(await page.locator('.dated-news').getByText('Handicap 2026', {exact:false}).count(), 0);
        assert.equal(await page.locator('.selected-publications > li').count(), 5);
        assert.equal(await page.locator('.selected-publications a[href^="https://doi.org/"]').count(), 5);
        await noOverflow(page);
      });
      await check(`${lang} ${width} keyboard-operated granularity and live description`, async () => {
        await page.locator('#granularity-demo > summary').focus();
        await page.keyboard.press('Enter');
        assert.ok(await page.locator('[data-demo-controls]').isVisible());
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'granularity-level');
        const counts=[];
        for (const level of ['8','16','32']) {
          await page.locator('#granularity-level').selectOption(level);
          assert.equal(await page.locator('[data-granularity-demo]').getAttribute('data-grid-size'), level);
          const status = await page.locator('[data-demo-status]').innerText();
          assert.ok(status.includes(String(Number(level) ** 2)));
          assert.ok((await page.locator('#demo-image-description').textContent()).includes(status));
          counts.push(await page.locator('[data-demo-cells] rect').count());
        }
        assert.ok(counts[0] < counts[1] && counts[1] < counts[2], 'Finer sampling should retain more occupied cells');
        await page.locator('[data-demo-reset]').click();
        assert.equal(await page.locator('#granularity-level').inputValue(), '16');
      });
      await check(`${lang} ${width} expanded content axe and screenshots`, async () => {
        await page.locator(en ? '#applications details > summary' : '#candidatures details > summary').click();
        await noOverflow(page);
        await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
        const result = await page.evaluate(() => axe.run(document, {runOnly:{type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
        assert.equal(result.violations.length, 0, JSON.stringify(result.violations.map(v => ({id:v.id,nodes:v.nodes.map(n => n.target)}))));
        for (const [name,selector] of [['hero','.hero'],['news','.academic-updates'],['publications','#selected-publications'],['demo','#granularity']]) {
          await page.locator(selector).screenshot({path:path.join(out,`${lang}-${width}-${name}.png`)});
        }
      });
      await check(`${lang} ${width} text spacing, enlargement and forced colours`, async () => {
        await page.addStyleTag({content:'*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}'});
        await noOverflow(page);
        await page.locator('.reading-tools > summary').click();
        await page.locator('#reading-size').selectOption('200');
        await noOverflow(page);
        await page.locator('#reading-reset').click();
        await page.emulateMedia({forcedColors:'active'});
        await page.locator('#granularity-level').focus();
        assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3));
        assert.equal(errors.length, 0, errors.join('\n'));
      });
      await context.close();
    }
    for (const en of [false,true]) {
      const context = await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:900}});
      const page = await context.newPage();
      await check(`${en?'EN':'FR'} static fallback without JavaScript`, async () => {
        await page.goto(base + '/' + (en?'en/':'') + 'index.html');
        await page.locator('#granularity-demo > summary').click();
        assert.ok(await page.locator('[data-demo-cells] path').isVisible());
        assert.equal(await page.locator('[data-demo-controls]').isVisible(), false);
        assert.equal(await page.locator('.selected-publications > li').count(),5);
        assert.equal(await page.locator('.dated-news > li').count(),3);
        await noOverflow(page);
      });
      await context.close();
    }
  } catch (error) {
    checks.push({name:'Test setup/execution',passed:false,error:error.stack});
  } finally {
    const report={date:new Date().toISOString(),checks,passed:checks.length>0 && checks.every(c=>c.passed)};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    if (!report.passed) process.exitCode=1;
    await browser?.close();
    server?.kill();
  }
})();
