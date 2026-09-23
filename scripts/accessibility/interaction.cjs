// Complement axe with interaction, preference persistence and native fallback checks.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const server = spawn('python3', ['-m','http.server','8880','--bind','127.0.0.1','--directory',root], {stdio:'ignore'});
const checks = [];
const record = (test, passed, detail) => checks.push({test,passed,detail});
(async () => {
 let browser;
 try {
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:8880');break;}catch{await new Promise(r=>setTimeout(r,200));}}
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']} : {});
  const page=await browser.newPage({viewport:{width:320,height:900}});
  for(const file of ['index.html','en/index.html']) {
   await page.goto('http://127.0.0.1:8880/'+file);
   const images=await page.evaluate(async()=>Promise.all([...document.images].map(async i=>{try{await i.decode();return i.naturalWidth>0;}catch{return false;}})));
   record(file+' images decode',images.every(Boolean));
   const menuToggle=page.locator('.mobile-menu-toggle');
   await menuToggle.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
   record(file+' mobile navigation links receive focus',await page.evaluate(()=>document.activeElement.matches('.mobile-panel a')));
   await page.keyboard.press('Escape');
   record(file+' menu closes and focus returns',await page.evaluate(()=>{
    const button=document.querySelector('.mobile-menu-toggle');
    const panel=document.querySelector('.mobile-panel');
    return button?.getAttribute('aria-expanded')==='false' && panel?.hidden===true && document.activeElement===button;
   }));
   await page.locator('.reading-tools summary').focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');
   record(file+' reading controls reachable with keyboard',await page.evaluate(()=>document.activeElement.id==='reading-theme'));
   await page.locator('#reading-theme').selectOption('dark');await page.reload();
   record(file+' reading preference survives reload',await page.evaluate(()=>document.documentElement.dataset.readingTheme==='dark'));
   await page.locator('.reading-tools summary').click();await page.locator('#reading-reset').click();
   record(file+' live status after reset',await page.locator('#reading-status').innerText()!=='');
   await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
   await page.keyboard.press('Tab');
   await page.locator('.mobile-menu-toggle').focus();
   record(file+' forced colours focus is outlined',await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=3;}));
   await page.emulateMedia({forcedColors:'none'});
  }
  const fallback=await browser.newPage({javaScriptEnabled:false,viewport:{width:320,height:900}});
  await fallback.goto('http://127.0.0.1:8880');await fallback.locator('.mobile-menu summary').focus();await fallback.keyboard.press('Enter');await fallback.keyboard.press('Tab');
  record('Native mobile navigation works without JavaScript',await fallback.locator('.mobile-panel a').first().evaluate(e=>document.activeElement===e));
  await fallback.locator('.reading-tools summary').click();
  record('No-JavaScript reading control explanation is visible',await fallback.locator('noscript p').isVisible());
  console.log(JSON.stringify({checks,passed:checks.every(x=>x.passed)},null,2));
  fs.mkdirSync(path.join(root,'test-output'),{recursive:true});fs.writeFileSync(path.join(root,'test-output/interaction-results.json'),JSON.stringify({checks,passed:checks.every(x=>x.passed)},null,2));
  if(checks.some(x=>!x.passed))process.exitCode=1;
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser?.close();server.kill();}
})();
