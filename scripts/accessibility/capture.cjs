// Reproducible screenshots and lab navigation measurements; no field-CWV claim.
// BASE_URL=https://anisrojbi.fr PHASE=before node scripts/accessibility/capture.cjs
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const phase=process.env.PHASE||'after';
const base=process.env.BASE_URL||'https://anisrojbi.fr';
const out=path.join(root,'audit/ux-2026-11-15',phase);
const files=['index.html','recherche.html','publications.html','projets.html','enseignement.html','contact.html'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}:{});
 const results=[];
 try{
  for(const [device,viewport] of Object.entries({desktop:{width:1280,height:900},mobile:{width:390,height:844}})){
   for(const file of files){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await context.newPage();
    const cdp=await context.newCDPSession(page);
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:1250000,uploadThroughput:625000});
    await page.addInitScript(()=>{window.lab={lcp:0,cls:0};new PerformanceObserver(l=>{for(const e of l.getEntries())window.lab.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.lab.cls+=e.value}).observe({type:'layout-shift',buffered:true});});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto(base+'/'+file,{waitUntil:'networkidle',timeout:60000});
    await page.evaluate(()=>document.fonts.ready);
    const stats=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0],r=performance.getEntriesByType('resource');return {domContentLoaded:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd),lcp:Math.round(window.lab.lcp),cls:window.lab.cls,requests:r.length+1,transferBytes:n.transferSize+r.reduce((s,x)=>s+x.transferSize,0),encodedBytes:n.encodedBodySize+r.reduce((s,x)=>s+x.encodedBodySize,0),overflow:document.documentElement.scrollWidth>innerWidth,documentHeight:document.documentElement.scrollHeight};});
    await page.screenshot({path:path.join(out,file.replace('.html','')+'-'+device+'.png')});
    if(file==='recherche.html'){
     await page.locator('#axe-3').scrollIntoViewIfNeeded();
     await page.evaluate(async()=>{for(const i of document.querySelectorAll('#axe-3 img')){i.loading='eager';try{await i.decode()}catch{}}});
     await page.screenshot({path:path.join(out,'research-bci-'+device+'.png')});
    }
    results.push({file,device,viewport,status:response.status(),...stats,errors});
    await context.close();
    console.log(phase,device,file,stats.lcp+'ms',stats.encodedBytes+'B');
   }
  }
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({base,phase,date:new Date().toISOString(),conditions:'Chromium, new context per page, cache disabled, 10 Mbit/s downstream, 5 Mbit/s upstream, 40 ms latency; one lab navigation per page; cross-origin sizes may be unavailable without Timing-Allow-Origin',results},null,2)+'\n');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
