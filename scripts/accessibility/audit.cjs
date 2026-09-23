const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root=path.resolve(__dirname,'../..'), out=path.join(root,'test-output');
fs.mkdirSync(out,{recursive:true});
const paths=fs.readdirSync(root).filter(x=>x.endsWith('.html')).concat(fs.readdirSync(path.join(root,'en')).filter(x=>x.endsWith('.html')).map(x=>'en/'+x)).sort();
const server=spawn('python3',['-m','http.server','8877','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const report={date:new Date().toISOString(),tools:{axe:require('axe-core').version,playwright:require('playwright/package.json').version},scope:paths,checks:[],keyboard:[],limitations:['Automated checks cannot establish full RGAA or WCAG AAA conformance.','Screen-reader testing, scientific content readability, PDF reading order and third-party destinations require human review.']};
(async()=>{
 let browser;
 try {
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:8877/');break;}catch{await new Promise(r=>setTimeout(r,200));}}
  browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']} : {});
  for(const width of [1280,320]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
   for(const file of paths){
    const errors=[];const handler=e=>errors.push(e.message);page.on('pageerror',handler);
    await page.goto('http://127.0.0.1:8877/'+file,{waitUntil:'networkidle'});
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','wcag2aaa','best-practice']},rules:{'color-contrast-enhanced':{enabled:true},'target-size':{enabled:true}}});const simplify=x=>({id:x.id,impact:x.impact,description:x.description,help:x.help,helpUrl:x.helpUrl,nodes:x.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary,any:n.any.map(c=>({id:c.id,data:c.data,message:c.message}))}))});return {violations:r.violations.map(simplify),incomplete:r.incomplete.map(simplify),passes:r.passes.length};});
    const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth+1,elements:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('.table-wrap')}).slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,80)}))}));
    await page.addStyleTag({content:'* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}'});
    const textSpacingOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    const item={file,width,...axe,overflow,textSpacingOverflow,errors};report.checks.push(item);
    console.log(`${file} @${width}: ${axe.violations.length} violations, ${axe.incomplete.length} review items, overflow=${overflow.page}, spacing=${textSpacingOverflow}`);
    if (axe.violations.length) console.log('FINDINGS '+JSON.stringify({file,width,violations:axe.violations}));
    if (axe.incomplete.length) console.log('REVIEW '+JSON.stringify({file,width,items:axe.incomplete.map(x=>({id:x.id,nodes:x.nodes.map(n=>({target:n.target,summary:n.summary}))}))}));
    if(overflow.page||textSpacingOverflow) console.log('LAYOUT '+JSON.stringify({file,width,overflow,textSpacingOverflow}));
    page.off('pageerror',handler);
   }
   // Keyboard controls are tested in a fresh page state.
   await page.goto('http://127.0.0.1:8877/index.html');
   await page.keyboard.press('Tab');
   const skip=await page.evaluate(()=>document.activeElement.classList.contains('skip-link'));
   await page.keyboard.press('Enter');
   const skipTarget=await page.evaluate(()=>document.activeElement.id==='main-content');
   report.keyboard.push({width,test:'Skip link reaches main',passed:skip&&skipTarget});
   if(width===320){
    const enhancedToggle=page.locator('.mobile-menu-toggle');
    if(await enhancedToggle.count()){
     await enhancedToggle.focus();
     await page.keyboard.press('Enter');
     const opened=(await enhancedToggle.getAttribute('aria-expanded'))==='true' && (await page.locator('.mobile-panel').getAttribute('hidden'))===null;
     await page.keyboard.press('Escape');
     const closed=(await enhancedToggle.getAttribute('aria-expanded'))==='false' && (await page.locator('.mobile-panel').getAttribute('hidden'))!==null;
     const restored=await page.evaluate(()=>document.activeElement.matches('.mobile-menu-toggle'));
     report.keyboard.push({width,test:'Mobile menu opens and Escape restores focus',passed:opened&&closed&&restored});
    }else{
     const fallbackSummary=page.locator('details.mobile-menu > summary');
     await fallbackSummary.focus();
     await page.keyboard.press('Enter');
     const opened=await page.locator('details.mobile-menu').getAttribute('open')!==null;
     await page.keyboard.press('Escape');
     const closed=await page.locator('details.mobile-menu').getAttribute('open')===null;
     report.keyboard.push({width,test:'Mobile menu fallback opens and closes',passed:opened&&closed});
    }
   }
   await page.goto('http://127.0.0.1:8877/index.html');
   await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
   await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:false});
   await page.close();
  }
  // Text-only enlargement is different from a narrow viewport.
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  for(const file of paths){
   await page.goto('http://127.0.0.1:8877/'+file);
   await page.addStyleTag({content:'html{font-size:200%!important}'});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   report.keyboard.push({file,test:'Text enlarged 200 percent without page overflow',passed:!overflow});
  }
  // User-controlled reading modes must retain readable content and working controls.
  for (const width of [1280,320]) {
    const modePage=await browser.newPage({viewport:{width,height:900}});
    await modePage.goto('http://127.0.0.1:8877/index.html');
    await modePage.locator('.reading-tools summary').click();
    await modePage.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    for (const theme of ['default','light','dark','cream']) {
      await modePage.locator('#reading-theme').selectOption(theme);
      const checks=await modePage.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','wcag2aaa']},rules:{'color-contrast-enhanced':{enabled:true},'target-size':{enabled:true}}});return r.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
      report.keyboard.push({test:'Reading theme '+theme,width,passed:checks.length===0,violations:checks});
    }
    await modePage.locator('#reading-theme').selectOption('default');
    await modePage.locator('#reading-space').check();
    const spaced=await modePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    report.keyboard.push({test:'User spacing control',width,passed:spaced});
    await modePage.locator('#reading-size').selectOption('200');
    const enlarged=await modePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    if (!enlarged) console.log('ENLARGED_OVERFLOW '+JSON.stringify(await modePage.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && (r.right>innerWidth+1 || e.scrollWidth>e.clientWidth+1) && !e.closest('.table-wrap')}).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,70),width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth})))));
    report.keyboard.push({test:'User size control at 200 percent',width,passed:enlarged});
    await modePage.locator('#reading-reset').click();
    report.keyboard.push({test:'Reading controls reset',width,passed:await modePage.evaluate(()=>!document.documentElement.hasAttribute('data-reading-theme')&&!document.documentElement.hasAttribute('data-reading-size')&&!document.documentElement.hasAttribute('data-reading-space'))});
    await modePage.close();
  }
  report.summary={pages:paths.length,renderedChecks:report.checks.length,violations:report.checks.reduce((s,x)=>s+x.violations.length,0),reviewItems:report.checks.reduce((s,x)=>s+x.incomplete.length,0),layoutFailures:report.checks.filter(x=>x.overflow.page||x.textSpacingOverflow).length,keyboardFailures:report.keyboard.filter(x=>!x.passed).length};
  console.log(JSON.stringify(report.summary));
  console.log('EXTRA_CHECKS '+JSON.stringify(report.keyboard));
  process.exitCode=Object.entries(report.summary).some(([k,v])=>['violations','layoutFailures','keyboardFailures'].includes(k)&&v>0)?1:0;
 }catch(e){report.error=e.stack;console.error(e);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,'accessibility-results.json'),JSON.stringify(report,null,2));if(browser)await browser.close();server.kill();}
})();
