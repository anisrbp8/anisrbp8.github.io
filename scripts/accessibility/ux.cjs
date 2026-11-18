// Functional visitor journeys and progressive enhancement, on a local or public site.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const base=process.env.BASE_URL||'http://127.0.0.1:8890';
const server=process.env.BASE_URL?null:spawn('python3',['-m','http.server','8890','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const checks=[];let browser;
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});}}
(async()=>{
 try{
  if(server)for(let i=0;i<30;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,200));}}
  browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}:{});
  for(const width of [1280,320])for(const en of [false,true]){
   const prefix=en?'en/':'',research=en?'research.html':'recherche.html',axis=en?'area':'axe';
   const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
   const page=await ctx.newPage();
   const label=`${en?'EN':'FR'} ${width}`;
   await check(label+' researcher journey: home → theme → representative article',async()=>{
    await page.goto(base+'/'+prefix+'index.html');await page.locator('.visitor-card .card-link').nth(0).click();
    assert.ok(page.url().endsWith(research));await page.locator(`.research-nav a[href="#${axis}-3"]`).click();
    await page.locator(`#${axis}-3 .related-links a`).first().click();
    assert.ok(page.url().endsWith('publications.html#eeg-2025'));assert.ok(await page.locator('#eeg-2025').isVisible());
    assert.equal(await page.locator('#eeg-2025 .doi-link').getAttribute('href'),'https://doi.org/10.3389/fninf.2025.1521805');
   });
   await check(label+' filters combine, announce empty result, and direct anchors reveal papers',async()=>{
    await page.locator('#publication-topic').selectOption('accessibility');await page.locator('#publication-year').selectOption('2025');
    assert.equal(await page.locator('[data-publication]:visible').count(),0);assert.match(await page.locator('#publication-count').innerText(),/^0 /);
    await page.locator('.page-toc a[href="#eeg-2025"]').click();assert.equal(await page.locator('[data-publication]:visible').count(),16);
    await page.locator('#publication-year').selectOption('2023');assert.equal(await page.locator('[data-publication]:visible').count(),2);
    await page.locator('.publication-filters button').click();
   });
   await check(label+' bibliography can be copied with keyboard',async()=>{
    await page.locator('#eeg-2025 .citation summary').focus();await page.keyboard.press('Enter');
    await page.locator('#eeg-2025 .citation-copy').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#eeg-2025 .copy-status').textContent.length>0);
    const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.match(copied,/Gordienko/);assert.match(copied,/10\.3389\/fninf\.2025\.1521805/);
   });
   await check(label+' figure dialog: keyboard, native size, focus containment and Escape',async()=>{
    await page.goto(base+'/'+prefix+research+`#${axis}-3`);
    assert.notEqual(await page.locator('.figure-dialog img').getAttribute('alt'),null,'The unopened figure dialog image must have an explicit text alternative');
    const trigger=page.locator('#article-figure-8 [data-figure-open]');await trigger.focus();await page.keyboard.press('Enter');
    assert.ok(await page.locator('dialog[open]').isVisible());
    const figureCaption=await page.evaluate(()=>{
      const figure=document.querySelector('#article-figure-8');
      const shortCaption=document.getElementById(figure.getAttribute('aria-labelledby')).textContent.trim();
      const dialogCaption=document.querySelector('.figure-dialog-caption').textContent.trim();
      return {shortCaption,dialogCaption};
    });
    assert.equal(figureCaption.dialogCaption,figureCaption.shortCaption,'The dialog must show the short figure caption, not all expanded descriptions or controls');
    await page.locator('.figure-dialog img').evaluate(i=>i.decode());
    assert.equal(await page.locator('.figure-dialog img').evaluate(i=>i.naturalWidth),1417);
    await page.locator('.figure-dialog button[aria-pressed]').click();assert.equal(await page.locator('.figure-dialog button[aria-pressed]').getAttribute('aria-pressed'),'true');
    for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)));}
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>axe.run(document.querySelector('dialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>v.id)));
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);assert.ok(await trigger.evaluate(e=>e===document.activeElement));
   });
   await check(label+' partner journey: projects → contact form and CV',async()=>{
    await page.goto(base+'/'+prefix+'index.html');await page.locator('.visitor-card .card-link').nth(1).click();
    await page.locator('.page-toc a[href="contact.html"]').click();assert.ok(await page.locator('#contact-form').isVisible());
    const cv=await page.locator('main a[href$=".pdf"]').getAttribute('href');const r=await page.request.get(new URL(cv,page.url()).href);assert.equal(r.status(),200);assert.equal((await r.body()).subarray(0,4).toString(),'%PDF');
   });
   await check(label+' student journey: teaching → official master information',async()=>{
    await page.goto(base+'/'+prefix+'index.html');await page.locator('.visitor-card .card-link').nth(2).click();
    assert.ok(await page.locator('#master').isVisible());assert.equal(await page.locator('#master .button-primary').getAttribute('href'),'https://www.univ-paris8.fr/-Master-Technologie-et-Handicap-676-');
   });
   await check(label+' language switch preserves corresponding page',async()=>{
    for(const file of ['index.html',research,'publications.html',en?'projects.html':'projets.html',en?'teaching.html':'enseignement.html','contact.html']){
     await page.goto(base+'/'+prefix+file);await page.locator('.lang-link').click();assert.equal(await page.locator('html').getAttribute('lang'),en?'fr':'en');
     await page.locator('.lang-link').click();assert.equal(await page.locator('html').getAttribute('lang'),en?'en':'fr');
    }
   });
   await ctx.close();
  }
  for(const en of [false,true]){
   const prefix=en?'en/':'',ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:900}}),page=await ctx.newPage();
   await check((en?'EN':'FR')+' no-JavaScript bibliography and figures',async()=>{
    await page.goto(base+'/'+prefix+'publications.html');assert.equal(await page.locator('[data-publication]:visible').count(),16);assert.equal(await page.locator('.publication-filters').count(),0);
    await page.locator('#eeg-2025 .citation summary').click();assert.ok(await page.locator('#eeg-2025 [data-citation]').isVisible());
    await page.goto(base+'/'+prefix+(en?'research.html':'recherche.html'));await page.locator('#article-figure-8 [data-figure-open]').click();assert.match(page.url(),/fninf-19-1521805-g0008.webp$/);
   });await ctx.close();
  }
 }finally{await browser?.close();server?.kill();fs.mkdirSync(path.join(root,'test-output'),{recursive:true});const result={base,checks,passed:checks.every(c=>c.passed)};fs.writeFileSync(path.join(root,'test-output/ux-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});
