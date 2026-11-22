// Complement axe with interaction, preference persistence and native fallback checks.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const server = spawn('python3', ['-m','http.server','8880','--bind','127.0.0.1','--directory',root], {stdio:'ignore'});
const checks = [];
const record = (test, passed, detail) => checks.push({test,passed,detail});
(async () => {
 let browser, runError = null;
 try {
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:8880');break;}catch{await new Promise(r=>setTimeout(r,200));}}
  browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']} : {});
  const page=await browser.newPage({viewport:{width:320,height:900}});
  for(const file of ['index.html','en/index.html']) {
   await page.goto('http://127.0.0.1:8880/'+file);
   const images=await page.evaluate(async()=>Promise.all([...document.images].filter(i=>i.getAttribute('src')||i.getAttribute('srcset')).map(async i=>{i.loading='eager';try{await i.decode();return i.naturalWidth>0;}catch{return false;}})));
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
   await menuToggle.click();
   await page.locator('.mobile-panel a').last().focus();
   await page.keyboard.press('Tab');
   record(file+' tabbing out closes the menu without obscuring or moving the next focus target',await page.evaluate(()=>{
    const e=document.activeElement,r=e.getBoundingClientRect();
    const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return document.querySelector('.mobile-panel').hidden===true && e.matches('.utility-links a') && (top===e || e.contains(top));
   }));
   record(file+' back-to-top link stays in the document flow',await page.locator('.back-to-top').evaluate(e=>getComputedStyle(e).position==='static'));
   // A viewport switch must not strand focus in links hidden by the desktop layout.
   await menuToggle.click();
   await page.locator('.mobile-panel a').first().focus();
   await page.setViewportSize({width:1280,height:900});
   // The matchMedia change event may run after the viewport update resolves.
   // Check the settled browser state instead of racing that event.
   const desktopFocusRestored = await page.waitForFunction(() =>
    document.activeElement?.matches('.desktop-nav a') &&
    document.querySelector('.mobile-panel')?.hidden === true,
    null, {timeout: 5000}
   ).then(() => true, () => false);
   record(file+' resizing to desktop restores visible keyboard focus', desktopFocusRestored);
   await page.locator('.desktop-nav a').nth(2).focus();
   await page.setViewportSize({width:320,height:900});
   record(file+' resizing to mobile keeps keyboard focus on the menu button',
    await page.waitForFunction(()=>document.activeElement?.matches('.mobile-menu-toggle'),null,{timeout:5000}).then(()=>true,()=>false));
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
  // Contact form: verify native validation and accessible feedback without sending real messages.
  for (const file of ['contact.html','en/contact.html']) {
   const formPage=await browser.newPage({viewport:{width:320,height:900}});
   await formPage.route('https://formspree.io/**', route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
   await formPage.goto('http://127.0.0.1:8880/'+file);
   const contactForm=formPage.locator('form[data-contact-form]');
   const email=contactForm.locator('input[name="email"]');
   record(file+' untouched fields have no premature error state',
    await contactForm.locator('[aria-invalid="true"],.form-field-error').count()===0
    && await email.evaluate(e=>getComputedStyle(e).borderColor!=='rgb(141, 30, 30)'));
   record(file+' required fields are enforced natively',await contactForm.evaluate(f=>!f.checkValidity()));
   record(file+' invalid fields have persistent associated explanations',
    await contactForm.locator('.form-field-error').count()===4
    && await contactForm.locator('textarea[name="message"]').getAttribute('aria-describedby')==='message-help contact-message-error');
   await contactForm.locator('input[name="name"]').fill('Accessibility Test');
   await email.fill('not-an-email');
   await contactForm.locator('input[name="subject"]').fill('Test');
   await contactForm.locator('textarea[name="message"]').fill('Form accessibility test');
   record(file+' invalid email is rejected natively',await email.evaluate(el=>!el.checkValidity()));
   await email.fill('test@example.org');
   record(file+' correcting values removes errors but retains help',
    await contactForm.locator('.form-field-error').count()===0
    && await contactForm.locator('textarea[name="message"]').getAttribute('aria-describedby')==='message-help');
   await contactForm.locator('button[type="submit"]').click();
   const status=contactForm.locator('[data-form-status]');
   await formPage.waitForFunction(() => document.querySelector('[data-form-status]')?.classList.contains('is-success'), null, {timeout:5000});
   record(file+' successful submit announces status and moves focus',
    await status.evaluate(el=>el.classList.contains('is-success') && el.getAttribute('role')==='status' && document.activeElement===el));
   // Both failures are intercepted locally: no contact message is sent.
   for (const failure of ['server','network']) {
    await formPage.unroute('https://formspree.io/**');
    await formPage.route('https://formspree.io/**',route=>failure==='server'
     ? route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'})
     : route.abort('failed'));
    await contactForm.locator('input[name="name"]').fill('Accessibility Test');
    await email.fill('test@example.org');
    await contactForm.locator('input[name="subject"]').fill('Test');
    await contactForm.locator('textarea[name="message"]').fill('Local intercepted accessibility check');
    await contactForm.locator('button[type="submit"]').click();
    await formPage.waitForFunction(()=>document.querySelector('[data-form-status]')?.classList.contains('is-error'),null,{timeout:5000});
    record(file+' '+failure+' error is announced, preserves text and allows retry',
     await status.evaluate(el=>el.textContent.length>0 && el.classList.contains('is-error') && document.activeElement===el)
     && await contactForm.locator('textarea[name="message"]').inputValue()==='Local intercepted accessibility check'
     && await contactForm.locator('button[type="submit"]').isEnabled());
   }
   // Some intermediaries return HTTP 200 with an HTML page instead of a delivery receipt.
   await formPage.unroute('https://formspree.io/**');
   await formPage.route('https://formspree.io/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<p>Sign in</p>'}));
   await contactForm.locator('button[type="submit"]').click();
   await formPage.waitForFunction(()=>document.querySelector('[data-form-status]').classList.contains('is-error'));
   record(file+' a 200 HTML response cannot erase the draft or announce success',
    await contactForm.locator('textarea').inputValue()==='Local intercepted accessibility check' && await status.evaluate(e=>document.activeElement===e));
   await formPage.unroute('https://formspree.io/**');
   await formPage.route('https://formspree.io/**',route=>route.fulfill({status:422,json:{errors:[{field:'email',code:'TYPE_EMAIL'}]}}));
   await contactForm.locator('button[type="submit"]').click();
   await formPage.waitForFunction(()=>document.querySelector('[name="email"]').getAttribute('aria-invalid')==='true');
   record(file+' a service-side rejection identifies and focuses the affected field',
    await email.evaluate(e=>document.activeElement===e && document.getElementById(e.getAttribute('aria-describedby')).textContent.length>0));
   await email.fill('revised@example.org');
   await formPage.unroute('https://formspree.io/**');
   let accept;
   const pending=new Promise(resolve=>{accept=resolve;});
   await formPage.route('https://formspree.io/**',async route=>{await pending;await route.fulfill({status:200,json:{next:'/thanks'}});});
   await contactForm.locator('button[type="submit"]').click();
   await contactForm.locator('textarea').fill('Edited while waiting for confirmation');
   accept();
   await formPage.waitForFunction(()=>document.querySelector('[data-form-status]').classList.contains('is-success'));
   record(file+' a confirmed submission preserves edits made in flight',
    await contactForm.locator('textarea').inputValue()==='Edited while waiting for confirmation');
   await contactForm.locator('textarea').fill('Local intercepted accessibility check');
   // Test the actual abort timer with virtual time and a local fetch stub.
   await formPage.clock.install();
   await formPage.evaluate(()=>{
    window.testContactRequests=0;
    window.fetch=(_url,options)=>new Promise((_resolve,reject)=>{
     window.testContactRequests++;
     options.signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true});
    });
   });
   await contactForm.evaluate(f=>{f.requestSubmit();f.requestSubmit();});
   record(file+' repeated submit starts only one request',await formPage.evaluate(()=>window.testContactRequests===1));
   await formPage.clock.fastForward(30001);
   await formPage.waitForFunction(()=>document.querySelector('[data-form-status]').classList.contains('is-error'));
   record(file+' timeout preserves the draft and restores the submit button',
    await contactForm.locator('textarea[name="message"]').inputValue()==='Local intercepted accessibility check'
    && await contactForm.locator('button[type="submit"]').isEnabled()
    && await status.evaluate(e=>document.activeElement===e));
   await formPage.close();
  }
  const fallback=await browser.newPage({javaScriptEnabled:false,viewport:{width:320,height:900}});
  await fallback.goto('http://127.0.0.1:8880');await fallback.locator('.mobile-menu summary').focus();await fallback.keyboard.press('Enter');await fallback.keyboard.press('Tab');
  record('Native mobile navigation works without JavaScript',await fallback.locator('.mobile-panel a').first().evaluate(e=>document.activeElement===e));
  await fallback.locator('.reading-tools summary').click();
  record('No-JavaScript reading control explanation is visible',await fallback.locator('.reading-tools noscript p').isVisible());
  record('Reading controls that need JavaScript are absent from the fallback tab order',await fallback.locator('#reading-theme').isHidden());
 }catch(e){runError=e.message;console.error(e);process.exitCode=1;}finally{
  const result={checks,error:runError,passed:checks.length>0&&!runError&&checks.every(x=>x.passed)};
  fs.mkdirSync(path.join(root,'test-output'),{recursive:true});
  fs.writeFileSync(path.join(root,'test-output/interaction-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(!result.passed)process.exitCode=1;
  await browser?.close();server.kill();
 }
})();
