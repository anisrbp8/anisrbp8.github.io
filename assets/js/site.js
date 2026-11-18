(() => {
  'use strict';

  const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
  const labels = isEnglish
    ? {open: 'Open menu', close: 'Close menu'}
    : {open: 'Ouvrir le menu', close: 'Fermer le menu'};

  document.querySelectorAll('details.mobile-menu').forEach((details, index) => {
    const summary = details.querySelector(':scope > summary');
    const panel = details.querySelector(':scope > .mobile-panel');
    if (!summary || !panel) return;

    const container = document.createElement('div');
    container.className = details.className + ' is-enhanced';
    if (details.id) container.id = details.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-menu-toggle';

    const panelId = panel.id || 'mobile-navigation-' + (index + 1);
    panel.id = panelId;
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', labels.open);

    const icon = document.createElement('span');
    icon.className = 'menu-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '☰';

    button.append(icon);
    panel.hidden = true;
    container.append(button, panel);
    details.replaceWith(container);

    const setOpen = (open, restoreFocus = false) => {
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? labels.close : labels.open);
      icon.textContent = open ? '×' : '☰';
      panel.hidden = !open;
      container.classList.toggle('is-open', open);
      if (restoreFocus) button.focus();
    };

    button.addEventListener('click', () => {
      setOpen(button.getAttribute('aria-expanded') !== 'true');
    });

    panel.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('click', (event) => {
      if (button.getAttribute('aria-expanded') === 'true' && !container.contains(event.target)) {
        setOpen(false);
      }
    });

    container.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setOpen(false, true);
      }
    });

    const desktop = window.matchMedia('(min-width: 70.01rem)');
    // A browser can blur a link as its parent becomes display:none, before matchMedia fires.
    let lastFocusInPanel = false;
    document.addEventListener('focusin', event => {lastFocusInPanel = panel.contains(event.target);});
    const closeOnDesktop = (event) => {
      if (!event.matches) return;
      const focusWasInsidePanel = panel.contains(document.activeElement) ||
        (lastFocusInPanel && button.getAttribute('aria-expanded') === 'true');
      setOpen(false);
      // Do not leave keyboard focus inside a menu that is now hidden.
      if (focusWasInsidePanel) {
        const desktopLink = document.querySelector('.desktop-nav a');
        if (desktopLink && desktopLink.getClientRects().length) desktopLink.focus();
        else if (button.getClientRects().length) button.focus();
      }
      lastFocusInPanel = false;
    };
    if (desktop.addEventListener) desktop.addEventListener('change', closeOnDesktop);
    else if (desktop.addListener) desktop.addListener(closeOnDesktop);
  });
})();

// Progressive enhancement: every reference is still available without JavaScript.
(() => {
  'use strict';
  const cards = [...document.querySelectorAll('[data-publication]')];
  if (!cards.length) return;
  const en = document.documentElement.lang === 'en';
  const list = cards[0].parentElement;
  const controls = document.createElement('fieldset');
  controls.className = 'publication-filters';
  const legend = document.createElement('legend');
  legend.textContent = en ? 'Filter publications' : 'Filtrer les publications';
  controls.append(legend);
  const makeSelect = (id, label, entries) => {
    const group = document.createElement('div'), text = document.createElement('label'), select = document.createElement('select');
    text.htmlFor = id; text.textContent = label; select.id = id;
    entries.forEach(([value, name]) => {const option = document.createElement('option');option.value=value;option.textContent=name;select.append(option);});
    group.append(text, select); controls.append(group); return select;
  };
  const topic = makeSelect('publication-topic', en?'Theme':'Thème', [['',en?'All themes':'Tous les thèmes'],['accessibility',en?'Accessibility and assistive technology':'Accessibilité et assistance'],['bci','BCI / EEG'],['signals',en?'Signals and human activity':'Signaux et activité humaine'],['computing',en?'Computing and communications':'Calcul et communications']]);
  const year = makeSelect('publication-year',en?'Year':'Année',[['',en?'All years':'Toutes les années'],...[...new Set(cards.map(c=>c.dataset.year))].sort().reverse().map(y=>[y,y])]);
  const reset=document.createElement('button');reset.type='button';reset.className='button';reset.textContent=en?'Show all':'Tout afficher';controls.append(reset);
  const status=document.createElement('p');status.id='publication-count';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const empty=document.createElement('p');empty.hidden=true;empty.textContent=en?'No publication matches these filters. Use “Show all” to reset.':'Aucune publication ne correspond à ces filtres. Utilisez « Tout afficher » pour les réinitialiser.';
  list.before(controls,status,empty);
  const update=()=>{
    let count=0;
    cards.forEach(card=>{const show=(!topic.value||card.dataset.topics.split(' ').includes(topic.value))&&(!year.value||card.dataset.year===year.value);card.hidden=!show;if(show)count++;});
    status.textContent=en?`${count} of ${cards.length} publications displayed.`:`${count} publication${count>1?'s':''} sur ${cards.length} affichée${count>1?'s':''}.`;
    empty.hidden=count!==0;
  };
  const showAll=()=>{topic.value='';year.value='';update();};
  topic.addEventListener('change',update);year.addEventListener('change',update);reset.addEventListener('click',showAll);
  // A direct bibliography anchor must remain reachable after filtering.
  const revealHash=()=>{const target=cards.find(c=>'#'+c.id===location.hash);if(target?.hidden){showAll();target.scrollIntoView();}};
  window.addEventListener('hashchange',revealHash);
  document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a&&cards.some(c=>'#'+c.id===a.getAttribute('href')&&c.hidden))showAll();});
  update();
  cards.forEach(card=>{
    const citation=card.querySelector('[data-citation]');if(!citation)return;
    const button=document.createElement('button');button.type='button';button.className='button citation-copy';button.textContent=en?'Copy reference':'Copier la référence';
    const feedback=document.createElement('p');feedback.className='copy-status';feedback.setAttribute('role','status');
    citation.after(button,feedback);
    button.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(citation.textContent.trim());feedback.textContent=en?'Reference copied.':'Référence copiée.';}
      catch{const range=document.createRange();range.selectNodeContents(citation);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);feedback.textContent=en?'Text selected. Copy it with your device’s copy command.':'Texte sélectionné. Utilisez la commande Copier de votre appareil.';}
    });
  });
})();

// Native dialog supports Escape and focus containment; original links are the fallback.
(() => {
  'use strict';
  const links=[...document.querySelectorAll('[data-figure-open]')];
  if(!links.length||typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal)return;
  const en=document.documentElement.lang==='en';
  const dialog=document.createElement('dialog');dialog.className='figure-dialog';dialog.setAttribute('aria-labelledby','figure-dialog-title');
  const header=document.createElement('div');header.className='figure-dialog-header';
  const title=document.createElement('h2');title.id='figure-dialog-title';title.textContent=en?'Scientific figure':'Figure scientifique';
  const close=document.createElement('button');close.type='button';close.className='button';close.textContent=en?'Close figure':'Fermer la figure';
  const zoom=document.createElement('button');zoom.type='button';zoom.className='button';zoom.setAttribute('aria-pressed','false');zoom.textContent=en?'Original size':'Taille originale';
  const original=document.createElement('a');original.className='button';original.textContent=en?'Open image file':'Ouvrir le fichier image';
  const viewport=document.createElement('div');viewport.className='figure-viewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label',en?'Scrollable figure':'Figure avec défilement');
  const img=document.createElement('img');img.alt='';viewport.append(img);
  const caption=document.createElement('p');caption.className='figure-dialog-caption';
  header.append(title,close,zoom,original);dialog.append(header,viewport,caption);document.body.append(dialog);
  let opener=null,previousOverflow='';
  links.forEach(link=>{
    link.setAttribute('aria-haspopup','dialog');
    link.addEventListener('click',event=>{
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();opener=link;
      const figure=link.closest('figure');img.src=link.href;img.alt=figure.querySelector('img')?.alt||'';original.href=link.href;
      const captionId=figure.getAttribute('aria-labelledby');
      const shortCaption=captionId?document.getElementById(captionId):figure.querySelector('figcaption');
      caption.textContent=shortCaption?.textContent||'';
      viewport.classList.remove('original-size');zoom.setAttribute('aria-pressed','false');
      previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();close.focus();viewport.scrollTo(0,0);
    });
  });
  zoom.addEventListener('click',()=>{const active=viewport.classList.toggle('original-size');zoom.setAttribute('aria-pressed',String(active));});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const focusables=[...dialog.querySelectorAll('button,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusables[0],last=focusables[focusables.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;opener?.focus();});
})();

(() => {
  'use strict';
  const root = document.documentElement;
  const theme = document.getElementById('reading-theme');
  const size = document.getElementById('reading-size');
  const spacing = document.getElementById('reading-space');
  const reset = document.getElementById('reading-reset');
  const status = document.getElementById('reading-status');
  if (!theme || !size || !spacing || !reset) return;
  const key = 'anis-reading-preferences';
  const defaults = {theme: 'default', size: '100', spacing: false};
  const valid = (value) => ({
    theme: ['default', 'light', 'dark', 'cream'].includes(value?.theme) ? value.theme : 'default',
    size: ['100', '125', '150', '200'].includes(value?.size) ? value.size : '100',
    spacing: value?.spacing === true
  });
  const apply = (value) => {
    theme.value = value.theme; size.value = value.size; spacing.checked = value.spacing;
    if (value.theme === 'default') root.removeAttribute('data-reading-theme');
    else root.dataset.readingTheme = value.theme;
    if (value.size === '100') {root.removeAttribute('data-reading-size');root.style.removeProperty('font-size');}
    else {root.dataset.readingSize = value.size;root.style.fontSize = value.size + '%';}
    if (value.spacing) root.dataset.readingSpace = 'true';
    else root.removeAttribute('data-reading-space');
  };
  try {apply(valid(JSON.parse(localStorage.getItem(key))));} catch {apply(defaults);}
  const update = () => {
    const value = valid({theme:theme.value,size:size.value,spacing:spacing.checked});
    apply(value);
    try {localStorage.setItem(key,JSON.stringify(value));} catch { /* Preferences remain usable for this page. */ }
    status.textContent = root.lang === 'en' ? 'Reading preferences applied.' : 'Préférences de lecture appliquées.';
  };
  [theme,size,spacing].forEach(control => control.addEventListener('change', update));
  reset.addEventListener('click', () => {
    apply(defaults);
    try {localStorage.removeItem(key);} catch { /* Storage may be unavailable. */ }
    status.textContent = root.lang === 'en' ? 'Default reading preferences restored.' : 'Réglages de lecture par défaut rétablis.';
  });
})();


(() => {
  'use strict';

  document.querySelectorAll('form[data-contact-form]').forEach((form) => {
    const status = form.querySelector('[data-form-status]');
    const submit = form.querySelector('button[type="submit"]');
    if (!status || !submit || !window.fetch) return;

    const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
    const messages = isEnglish
      ? {
          sending: 'Sending your message…',
          success: 'Message sent successfully. Thank you — your message has been delivered.',
          error: 'The message could not be sent. Please try again.',
          serverError: 'The message could not be sent. Please check the fields and try again.'
        }
      : {
          sending: 'Envoi de votre message…',
          success: 'Message envoyé avec succès. Merci, votre message a bien été transmis.',
          error: 'Le message n’a pas pu être envoyé. Merci de réessayer.',
          serverError: 'Le message n’a pas pu être envoyé. Vérifiez les champs puis réessayez.'
        };

    form.addEventListener('submit', async (event) => {
      if (!form.checkValidity()) return;

      event.preventDefault();
      status.classList.remove('is-error', 'is-success');
      status.textContent = messages.sending;
      submit.disabled = true;
      submit.setAttribute('aria-disabled', 'true');

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: {Accept: 'application/json'}
        });

        if (!response.ok) {
          status.classList.add('is-error');
          status.textContent = messages.serverError;
          status.focus();
          return;
        }

        form.reset();
        status.classList.add('is-success');
        status.textContent = messages.success;
        status.focus();
      } catch {
        status.classList.add('is-error');
        status.textContent = messages.error;
        status.focus();
      } finally {
        submit.disabled = false;
        submit.removeAttribute('aria-disabled');
      }
    });
  });
})();
