// From the static site root: node scripts/accessibility/rgaa-documents.cjs
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = process.env.SITE_ROOT || process.cwd();
const { chromium } = require(path.join(root, 'scripts/accessibility/node_modules/playwright'));
const output = process.env.RESULT_DIR || path.join(root, 'test-output/rgaa-documents');
fs.mkdirSync(output, {recursive:true});
const report = {checks:[],errors:[]};
let service, browser;
async function test(label,fn) {
  try {const detail=await fn();report.checks.push({label,passed:true,detail});}
  catch(error){report.errors.push({label,error:String(error.stack||error)});}
}
async function cancel(page,target) {
  await target.scrollIntoViewIfNeeded();
  const box=await target.boundingBox();assert.ok(box);
  const x=box.x+Math.min(12,box.width/2),y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x>30?2:page.viewportSize().width-2,Math.max(2,Math.min(page.viewportSize().height-2,y)));
  await page.mouse.up();
}
(async()=>{
  service=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const p=path.join(root,decodeURIComponent(url.pathname).replace(/\/$/,'/index.html'));
    if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf'})[path.extname(p)]||'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+service.address().port;
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  let popups=0;page.on('popup',()=>{popups++});
  const files=['','en/'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(x=>x.endsWith('.html')).sort().map(x=>dir+x));
  for(const file of files){
    await test(file+' / contenus et commandes en portrait et paysage',async()=>{
      await page.setViewportSize({width:390,height:844});const rs=await page.goto(base+'/'+file);assert.equal(rs.status(),200);
      assert.equal(popups,0);
      await cancel(page,page.locator('.reading-tools>summary'));assert.equal(await page.locator('.reading-tools').getAttribute('open'),null);
      await page.locator('.reading-tools>summary').click();assert.ok(await page.locator('#reading-theme').isVisible());
      await page.locator('.reading-tools>summary').click();
      // Open all page-body disclosures to compare content, including initially collapsed material.
      await page.locator('main details').evaluateAll(items=>items.forEach(e=>e.open=true));
      const collect=async()=>page.locator('main').evaluate(main=>({
        words:main.innerText.replace(/\s+/g,' ').trim(),
        names:[...main.querySelectorAll('a[href],button,select,input:not([type=hidden]),textarea,summary')].filter(e=>e.getClientRects().length).map(e=>[e.tagName,e.id,e.getAttribute('href')||'',e.getAttribute('name')||'']),
        tables:[...document.querySelectorAll('table,[role=table],[role=grid],[role=treegrid]')].map(table=>({
          name:table.caption?.innerText.trim(), columns:[...table.querySelectorAll('thead th')].map(cell=>[cell.scope,cell.textContent.trim()]),
          rows:[...table.querySelectorAll('tbody tr')].map(row=>[...row.cells].map(cell=>[cell.tagName,cell.scope||'',cell.textContent.trim()]))
        })),
        temporal:document.querySelectorAll('video,audio,object,embed,canvas,iframe,svg animate,marquee,blink,meta[http-equiv=refresh i]').length,
        overflow:document.documentElement.scrollWidth>innerWidth+1}));
      assert.equal(await page.evaluate(()=>matchMedia('(orientation:portrait)').matches),true);
      const a=await collect();await page.setViewportSize({width:844,height:390});
      assert.equal(await page.evaluate(()=>matchMedia('(orientation:landscape)').matches),true);
      const b=await collect();assert.equal(b.words,a.words);assert.deepEqual(b.names,a.names);
      assert.deepEqual(a.tables,b.tables);
      if(!['accessibilite.html','en/accessibility.html'].includes(file))assert.equal(a.tables.length,0);
      for(const table of a.tables){
        assert.ok(table.name);assert.ok(table.columns.length>1);assert.ok(table.columns.every(([scope,name])=>scope==='col'&&name));
        assert.ok(table.rows.length);for(const row of table.rows){
          assert.equal(row.length,table.columns.length);assert.equal(row[0][0],'TH');assert.equal(row[0][1],'row');
          assert.ok(row.every(([, ,value])=>value));assert.ok(row.slice(1).every(([tag])=>tag==='TD'));
        }
      }
      assert.equal(a.temporal,0);assert.equal(a.overflow||b.overflow,false);assert.equal(popups,0);
      return {portrait:'390x844',landscape:'844x390',bodyCharacters:a.words.length,visibleControls:a.names.length,newWindows:popups,tables:a.tables,temporal:a.temporal};
    });
  }
  for(const [file,en] of [['index.html',false],['en/index.html',true]]){
    await test(file+' / alternative du média, clavier, pointeur, API',async()=>{
      await page.setViewportSize({width:390,height:844});await page.goto(base+'/'+file);
      await page.locator('#granularity-demo>summary').focus();await page.keyboard.press('Enter');
      const select=page.locator('#granularity-level'),reset=page.locator('[data-demo-reset]'),alternative=page.locator('.demo-text-view'),summary=alternative.locator('summary');
      assert.equal(await page.locator('.granularity-image').evaluate(e=>e.nextElementSibling.matches('details.demo-text-view')),true);
      await page.keyboard.press('Tab');assert.equal(await select.evaluate(el=>el===document.activeElement),true);
      await select.press('Home');const levels=[];
      for(const [value,occupied,part] of [['8',42,28],['16',114,44],['32',354,0]]){
        if(value!=='8')await select.press('ArrowDown');
        assert.equal(await select.inputValue(),value);assert.equal(await page.locator('[data-demo-cells] rect').count(),occupied);
        const fractional=await page.locator('[data-demo-cells] rect').evaluateAll(els=>els.filter(el=>Number(el.getAttribute('fill-opacity'))<1).length);
        assert.equal(fractional,part);
        const status=await page.locator('[data-demo-status]').innerText(),ax=await select.ariaSnapshot();
        assert.ok(status.includes(String(occupied)));assert.ok(ax.includes(en?'Level of detail':'Niveau de détail'));
        assert.ok(await page.locator('.granularity-image').getAttribute('aria-labelledby'));
        levels.push({value,occupied,part,accessibleSelect:ax,accessibleImage:await page.locator('.granularity-image').ariaSnapshot(),status});
      }
      await select.press('Tab');assert.equal(await reset.evaluate(e=>e===document.activeElement),true);
      await reset.press('Space');assert.equal(await select.inputValue(),'16');
      await reset.press('Tab');assert.ok(await summary.evaluate(el=>el===document.activeElement));
      await summary.press('Enter');assert.ok(await alternative.locator('li').first().isVisible());
      const explained=await alternative.innerText();for(const n of ['42','28','114','44','354'])assert.ok(explained.includes(n));
      await select.evaluate(el=>el.scrollIntoView({block:'center'}));
      const hitTest=await select.evaluate(el=>{
        const label=el.labels[0],skip=document.querySelector('.skip-link');
        const middle=element=>{const box=element.getBoundingClientRect();return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);};
        const r=skip.getBoundingClientRect(),style=getComputedStyle(skip);
        return {selectExposed:middle(el)===el,labelExposed:label.contains(middle(label)),skipTop:r.top,skipBottom:r.bottom,skipClip:style.clipPath};
      });
      assert.ok(hitTest.selectExposed&&hitTest.labelExposed);assert.ok(hitTest.skipBottom<=0||hitTest.skipClip!=='none');
      await page.screenshot({path:path.join(output,(en?'en':'fr')+'-demo-controls.png')});
      await summary.evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(output,(en?'en':'fr')+'-demo-text.png')});
      await summary.click();assert.equal(await alternative.getAttribute('open'),null);
      await cancel(page,summary);assert.equal(await alternative.getAttribute('open'),null);
      await summary.click();assert.ok(await alternative.locator('li').first().isVisible());
      await select.selectOption('8');await cancel(page,reset);assert.equal(await select.inputValue(),'8');
      await reset.click();assert.equal(await select.inputValue(),'16');
      return {levels,alternative:explained,hitTest};
    });
    await test(file+' / version textuelle sans JavaScript',async()=>{
      const cx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),p=await cx.newPage();
      await p.goto(base+'/'+file);await p.locator('#granularity-demo>summary').click();const alt=p.locator('.demo-text-view');
      await alt.locator('summary').focus();await p.keyboard.press('Space');assert.equal(await alt.locator('li').count(),3);assert.ok(await alt.locator('li').last().isVisible());await cx.close();return {states:3};
    });
  }
  for(const file of ['research.html','recherche.html','publications.html','en/publications.html','contact.html','en/contact.html']){
    const real=file==='research.html'?'en/research.html':file;
    await test(real+' / annulation avant activation',async()=>{
      await page.goto(base+'/'+real);
      if(real.includes('recher')||real.includes('research')){
        const link=page.locator('[data-figure-open]').first();await cancel(page,link);assert.equal(await page.locator('dialog[open]').count(),0);await link.click();assert.equal(await page.locator('dialog[open]').count(),1);
        const close=page.locator('.figure-dialog-header button').filter({hasText:/Fermer|Close/});await cancel(page,close);assert.equal(await page.locator('dialog[open]').count(),1);await close.click();assert.equal(await page.locator('dialog[open]').count(),0);
      }else if(real.includes('publication')){
        const citation=page.locator('details.citation').first();await citation.locator('summary').click();const copy=citation.locator('button');await cancel(page,copy);assert.equal(await citation.locator('.copy-status').innerText(),'');
        for(const [id,n] of [['music-2017',3],['alphabets-2017',4]]){
          const details=page.locator('#'+id+' details.figure-description'),summary=details.locator('summary');
          await cancel(page,summary);assert.equal(await details.getAttribute('open'),null);
          await summary.focus();await page.keyboard.press('Space');assert.equal(await details.locator('p').count(),n);
          assert.equal(await details.locator('p').last().isVisible(),true);await summary.press('Enter');assert.equal(await details.getAttribute('open'),null);
        }
      }else{
        const name=page.locator('#contact-name');const btn=page.locator('.contact-form button[type=submit]');await cancel(page,btn);assert.notEqual(await name.getAttribute('aria-invalid'),'true');assert.equal(await page.locator('form [aria-invalid="true"]').count(),0);
      }
      return {cancelled:true};
    });
  }
  await context.close();
})().catch(e=>report.errors.push({label:'setup',error:String(e.stack||e)})).finally(async()=>{
  if(browser)await browser.close();if(service)service.close();
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'rgaa-documents.json'),JSON.stringify(report,null,2));
  console.log('RGAA 4/5/13:',report.checks.length,'passed;',report.errors.length,'failed.',JSON.stringify(report.errors));
  if(report.errors.length)process.exitCode=1;
});
