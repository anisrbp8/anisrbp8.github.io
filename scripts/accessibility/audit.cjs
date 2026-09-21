const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root=path.resolve(__dirname,'../..'), out=path.join(root,'test-output');
fs.mkdirSync(out,{recursive:true});
const paths=fs.readdirSync(root).filter(x=>x.endsWith('.html')).concat(fs.readdirSync(path.join(root,'en')).filter(x=>x.endsWith('.html')).map(x=>'en/'+x)).sort();
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const report={date:new Date().toISOString(),tools:{axe:require('axe-core').version,playwright:require('playwright/package.json').version},scope:paths,checks:[],keyboard:[],limitations:['Automated checks cannot establish full RGAA or WCAG AAA conformance.','Screen-reader testing, scientific content readability, PDF reading order and third-party destinations require human review.']};
(async()=>{
 let browser;
 try {
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:8765/');break;}catch{await new Promise(r=>setTimeout(r,200));}}
  browser=await chromium.launch();
  for(const width of [1280,320]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
   for(const file of paths){
    const errors=[];const handler=e=>errors.push(e.message);page.on('pageerror',handler);
    await page.goto('http://127.0.0.1:8765/'+file,{waitUntil:'networkidle'});
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','wcag2aaa','best-practice']},rules:{'color-contrast-enhanced':{enabled:true}}});const simplify=x=>({id:x.id,impact:x.impact,description:x.description,help:x.help,helpUrl:x.helpUrl,nodes:x.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary,any:n.any.map(c=>({id:c.id,data:c.data,message:c.message}))}))});return {violations:r.violations.map(simplify),incomplete:r.incomplete.map(simplify),passes:r.passes.length};});
    const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth+1,elements:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('.table-wrap')}).slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,80)}))}));
    await page.addStyleTag({content:'* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}'});
    const textSpacingOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    const item={file,width,...axe,overflow,textSpacingOverflow,errors};report.checks.push(item);
    console.log(`${file} @${width}: ${axe.violations.length} violations, ${axe.incomplete.length} review items, overflow=${overflow.page}, spacing=${textSpacingOverflow}`);
    page.off('pageerror',handler);
   }
   // Keyboard controls are tested in a fresh page state.
   await page.goto('http://127.0.0.1:8765/index.html');
   await page.keyboard.press('Tab');
   const skip=await page.evaluate(()=>document.activeElement.classList.contains('skip-link'));
   await page.keyboard.press('Enter');
   const skipTarget=await page.evaluate(()=>document.activeElement.id==='main-content');
   report.keyboard.push({width,test:'Skip link reaches main',passed:skip&&skipTarget});
   if(width===320){
    await page.locator('.mobile-menu summary').focus();await page.keyboard.press('Enter');
    const opened=await page.locator('.mobile-menu').getAttribute('open')!==null;
    await page.keyboard.press('Tab');await page.keyboard.press('Escape');
    const closed=await page.locator('.mobile-menu').getAttribute('open')===null;
    const restored=await page.evaluate(()=>document.activeElement.matches('.mobile-menu summary'));
    report.keyboard.push({width,test:'Mobile menu opens and Escape restores focus',passed:opened&&closed&&restored});
   }
   await page.goto('http://127.0.0.1:8765/index.html');
   await page.screenshot({path:path.join(out,`home-${width}.png`),fullPage:false});
   await page.close();
  }
  // Text-only enlargement is different from a narrow viewport.
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  for(const file of paths){
   await page.goto('http://127.0.0.1:8765/'+file);
   await page.addStyleTag({content:'html{font-size:200%!important}'});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   report.keyboard.push({file,test:'Text enlarged 200 percent without page overflow',passed:!overflow});
  }
  report.summary={pages:paths.length,renderedChecks:report.checks.length,violations:report.checks.reduce((s,x)=>s+x.violations.length,0),reviewItems:report.checks.reduce((s,x)=>s+x.incomplete.length,0),layoutFailures:report.checks.filter(x=>x.overflow.page||x.textSpacingOverflow).length,keyboardFailures:report.keyboard.filter(x=>!x.passed).length};
  console.log(JSON.stringify(report.summary));
  process.exitCode=Object.entries(report.summary).some(([k,v])=>['violations','layoutFailures','keyboardFailures'].includes(k)&&v>0)?1:0;
 }catch(e){report.error=e.stack;console.error(e);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,'accessibility-results.json'),JSON.stringify(report,null,2));if(browser)await browser.close();server.kill();}
})();
