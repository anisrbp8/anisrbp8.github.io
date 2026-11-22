// Render every page, all supported reading themes and the figure dialog.
// Automated measurements supplement the per-figure, visual and AT evaluations.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const report={pages:{},errors:[],browser:null};
const base=process.env.BASE_URL||'http://127.0.0.1:8997';
const server=process.env.BASE_URL?null:spawn('python3',['-m','http.server','8997','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});

// Return aggregates and selectors for every failed colour pair. Page/inline
// SVG text in bitmaps is inspected separately at full resolution.
function measure(){
 const colour=value=>{
  const parts=value.match(/[\d.]+/g);
  if(!parts||parts.length<3)throw new Error('Unsupported rendered colour '+value);
  return parts.map(Number);
 };
 const over=(fg,bg)=>fg.slice(0,3).map((n,i)=>n*(fg[3]??1)+bg[i]*(1-(fg[3]??1)));
 const luminance=rgb=>rgb.slice(0,3).reduce((v,c,i)=>{const x=c/255;return v+([.2126,.7152,.0722][i])*(x<=.04045?x/12.92:((x+.055)/1.055)**2.4)},0);
 const ratio=(a,b)=>{const l=luminance(a),r=luminance(b);return (Math.max(l,r)+.05)/(Math.min(l,r)+.05)};
 const rgb=arr=>arr.map(Math.round).join(',');
 const desc=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'.'+String(el.className||'').trim().split(/\s+/).join('.'));
 const cache=new Map();const under=(el)=>{
  if(!el)return [255,255,255];if(cache.has(el))return cache.get(el);
  const bg=colour(getComputedStyle(el).backgroundColor);const result=(bg[3]??1)===1?bg.slice(0,3):over(bg,under(el.parentElement));cache.set(el,result);return result;
 };
 const rootVisit=document.querySelector('dialog[open]')||document.body;
 const all=[...rootVisit.querySelectorAll('*')].filter(el=>el instanceof HTMLElement&&el.checkVisibility({opacityProperty:true,visibilityProperty:true})&&el.getClientRects().length);
 const pairs={},failures=[],aaaFailures=[],outlines=[];let textNodes=0,controls=0,min=100,minSmall=100,minLarge=100;
 for(const el of all){
  const css=getComputedStyle(el);const tg=el.tagName.toLowerCase();if(el.matches('option,script,style,noscript,:disabled,[aria-disabled="true"]'))continue;
  // Ancestors such as a focus ring and a button background may be distinct.
  const bg=under(el), fg=over(colour(css.color),bg);let visibleText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
  const generated=['::before','::after'].filter(p=>!['none','normal','""','\'\''].includes(getComputedStyle(el,p).content));
  if(el.matches('input:not([type="checkbox"]):not([type="radio"]),textarea'))visibleText=true;
  if(el.matches('select'))visibleText=true;
  if(visibleText||generated.length){
   const colors=visibleText?[{fg,bg,font:parseFloat(css.fontSize),weight:parseInt(css.fontWeight)||400,part:''}]:[];
   for(const ps of generated){const st=getComputedStyle(el,ps);const psBg=over(colour(st.backgroundColor),bg);colors.push({fg:over(colour(st.color),psBg),bg:psBg,font:parseFloat(st.fontSize),weight:parseInt(st.fontWeight)||400,part:ps});}
   for(const c of colors){
    const large=c.font>=24||(c.weight>=700&&c.font>=18.5);
    const threshold=large?3:4.5,enhanced=large?4.5:7;
    const val=ratio(c.fg,c.bg);const key=rgb(c.fg)+' / '+rgb(c.bg);pairs[key]=(pairs[key]||0)+1;textNodes++;min=Math.min(min,val);
    if(large)minLarge=Math.min(minLarge,val);else minSmall=Math.min(minSmall,val);
    const detail={kind:'text',element:desc(el)+c.part,pair:key,ratio:+val.toFixed(3),size:c.font,weight:c.weight,text:(el.textContent||'').trim().slice(0,55)};
    if(val+.00001<threshold)failures.push({...detail,threshold});
    if(val+.00001<enhanced)aaaFailures.push({...detail,threshold:enhanced});
   }
  }
  if(el.matches('select,input:not([type="checkbox"]):not([type="radio"]),textarea,button,.button,.mobile-menu-toggle,.figure-viewport')){
   const border=colour(css.borderTopColor),inside=ratio(bg,under(el.parentElement)),edge=ratio(over(border,under(el.parentElement)),under(el.parentElement));
   const drawn=parseFloat(css.borderTopWidth)>0&&!['none','hidden'].includes(css.borderTopStyle);controls++;
   // Only fields that are blank without their boundary depend on the edge.
   // Buttons with a visible label and native indicators are assessed separately.
   if(el.matches('input:not([type="checkbox"]):not([type="radio"]),textarea')&&Math.max(inside,drawn?edge:1)<3)failures.push({kind:'field boundary',element:desc(el),pair:rgb(border)+' / '+rgb(under(el.parentElement)),ratio:+edge.toFixed(3)});
   outlines.push([desc(el),+(drawn?edge:0).toFixed(2),+inside.toFixed(2)]);
  }
 }
 return {textNodes,controls,minimumTextContrast:textNodes?+min.toFixed(3):null,minimumSmallText:minSmall===100?null:+minSmall.toFixed(3),minimumLargeText:minLarge===100?null:+minLarge.toFixed(3),pairs,failures,aaaFailures,controlContrast:outlines};
}

async function exercise(){
 for(let i=0;i<35;i++){try{const response=await fetch(base);if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}:{});
 try{
  report.browser=browser.version();
  const files=fs.readdirSync(root).filter(f=>f.endsWith('.html')).concat(fs.readdirSync(path.join(root,'en')).filter(f=>f.endsWith('.html')).map(f=>'en/'+f)).sort();
  const modes=['default','light','dark','cream'];
  for(const name of files){report.pages[name]={};
   for(const width of [320,1280]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();
    try{
     await page.goto(base+'/'+name);const hasTheme=await page.locator('#reading-theme').count();const states={};report.pages[name][width]=states;
     await page.evaluate(()=>{for(const el of document.querySelectorAll('details'))el.open=true});
     const mobile=page.locator('.mobile-menu-toggle');if(await mobile.isVisible()&&await mobile.getAttribute('aria-expanded')==='false')await mobile.click();
     for(const mode of hasTheme?modes:['default']){
      if(hasTheme){
       await page.locator('.reading-tools').evaluate(el=>{el.open=true});
       await page.selectOption('#reading-theme',mode);
      }
      states[mode]=await page.evaluate(measure);
      const anchor=page.locator('#article-figure-8 [data-figure-open], #featured-figure-home [data-figure-open]').first();
      if(await anchor.count()){
       await anchor.focus();await page.keyboard.press('Enter');const dialog=page.locator('dialog[open]');await dialog.waitFor();
       const fg=dialog.locator('figure');const caption=await fg.locator('figcaption').innerText();const long=dialog.locator('.expanded-figure-description');
       if((await fg.getAttribute('aria-label'))!==caption||!(await long.innerText()).trim())throw new Error('Dialog caption or detailed description missing');
       states[mode+'-dialog']=await page.evaluate(measure);await page.keyboard.press('Escape');
      }
      if(await page.locator('[data-contact-form]').count()){
       await page.locator('[data-contact-form] button[type=submit]').click();
       states[mode+'-errors']=await page.evaluate(measure);
       for(const [field,value] of Object.entries({name:'Audit',email:'audit@example.invalid',subject:'RGAA',message:'Message de démonstration.'})){
        await page.locator('#contact-'+field).fill(value);
       }
       // Responses below are intercepted in Chromium before the network.
       const endpoint='https://formspree.io/f/mwlpbykp';
       const submit=page.locator('[data-contact-form] button[type=submit]');
       await page.route(endpoint,route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"audit"}'}));
       await submit.click();await page.locator('[data-form-alert].is-error').waitFor();
       states[mode+'-service-error']=await page.evaluate(measure);await page.unroute(endpoint);
       await page.route(endpoint,route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
       await submit.click();await page.locator('[data-form-status].is-success').waitFor();
       states[mode+'-service-success']=await page.evaluate(measure);await page.unroute(endpoint);
      }
     }
     await page.emulateMedia({forcedColors:'active'});states.forced=await page.evaluate(measure);
    }catch(error){report.errors.push(name+' '+width+': '+error.message)}finally{await context.close()}
   }
  }
 }finally{await browser.close()}
}
(async()=>{try{await exercise()}catch(e){report.errors.push(e.stack)}finally{
 server?.kill();const out=path.join(root,'test-output');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'rgaa-images-colours.json'),JSON.stringify(report));
 const failed=[];
 for(const [name,widths] of Object.entries(report.pages)){
  for(const [width,states] of Object.entries(widths)){
   for(const [mode,results] of Object.entries(states)){
    if(results.failures.length) failed.push({name,width,mode,failures:results.failures.slice(0,3)});
   }
  }
 }
 console.log(JSON.stringify({pages:Object.keys(report.pages).length,errors:report.errors,lowContrast:failed.slice(0,40)}));if(report.errors.length||failed.length)process.exitCode=1;
}})();
