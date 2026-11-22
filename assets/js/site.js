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

    // Keep the next keyboard target visible when focus leaves the disclosure.
    container.addEventListener('focusout', (event) => {
      if (event.relatedTarget && !container.contains(event.relatedTarget)) {
        setOpen(false);
      }
    });

    const desktop = window.matchMedia('(min-width: 70.01rem)');
    // A browser can blur a link as its parent becomes display:none, before matchMedia fires.
    const desktopNav = document.querySelector('.desktop-nav');
    let lastNavigationFocus = null;
    document.addEventListener('focusin', event => {
      lastNavigationFocus = container.contains(event.target) || desktopNav?.contains(event.target)
        ? event.target : null;
    });
    const closeOnDesktop = (event) => {
      const previous = document.activeElement === document.body ? lastNavigationFocus : document.activeElement;
      if (!previous) return;
      if (!event.matches) {
        if (desktopNav?.contains(previous)) button.focus();
        return;
      }
      setOpen(false);
      if (container.contains(previous)) {
        const matching = [...desktopNav.querySelectorAll('a')].find(link => link.href === previous.href);
        const target = matching || (previous.hreflang ? document.querySelector('.lang-link') : desktopNav.querySelector('a'));
        target?.focus();
      }
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
  const emptyHelp=en?'No publication matches these filters. Use “Show all” to reset.':'Aucune publication ne correspond à ces filtres. Utilisez « Tout afficher » pour les réinitialiser.';
  list.before(controls,status);
  const update=()=>{
    let count=0;
    cards.forEach(card=>{const show=(!topic.value||card.dataset.topics.split(' ').includes(topic.value))&&(!year.value||card.dataset.year===year.value);card.hidden=!show;if(show)count++;});
    status.textContent=en?`${count} of ${cards.length} publications displayed.`:`${count} publication${count>1?'s':''} affichée${count>1?'s':''} sur ${cards.length}.`;
    if (count === 0) status.textContent += ' ' + emptyHelp;
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
    const feedback=document.createElement('p');feedback.className='copy-status';feedback.setAttribute('role','status');feedback.setAttribute('aria-atomic','true');
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
  const img=document.createElement('img');
  const expanded=document.createElement('figure');expanded.className='expanded-scientific-figure';expanded.setAttribute('role','figure');
  const caption=document.createElement('figcaption');caption.className='figure-dialog-caption';
  const description=document.createElement('div');description.className='expanded-figure-description';
  header.append(title,close,zoom,original);expanded.append(viewport,caption);dialog.append(header,expanded,description);document.body.append(dialog);
  let opener=null,previousOverflow='';
  links.forEach(link=>{
    link.setAttribute('aria-haspopup','dialog');
    link.addEventListener('click',event=>{
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();opener=link;
      const container=link.closest('.research-figure');
      const figure=container.querySelector('figure');
      img.src=link.href;img.alt=figure.querySelector('img').alt;original.href=link.href;
      if (!img.parentElement) viewport.append(img);
      caption.textContent=figure.querySelector('figcaption').textContent;
      expanded.setAttribute('aria-label',caption.textContent);
      const longText=container.querySelector('.figure-description, .figure-actions a[href*="#article-figure-"]');
      description.replaceChildren();
      if(longText)description.append(longText.cloneNode(true));
      viewport.classList.remove('original-size');zoom.setAttribute('aria-pressed','false');
      previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();close.focus();viewport.scrollTo(0,0);
    });
  });
  zoom.addEventListener('click',()=>{const active=viewport.classList.toggle('original-size');zoom.setAttribute('aria-pressed',String(active));});
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const closedDetails = [...dialog.querySelectorAll('details:not([open])')];
    const focusables = [...dialog.querySelectorAll('button,a[href],summary,[tabindex="0"]')].filter(el =>
      el.getClientRects().length && closedDetails.every(details =>
        !details.contains(el) || details.querySelector(':scope > summary')?.contains(el)));
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
  theme.closest('.reading-fields').hidden = false;
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
    const alert = form.querySelector('[data-form-alert]');
    const submit = form.querySelector('button[type="submit"]');
    if (!status || !alert || !submit || !window.fetch) return;

    const isEnglish = document.documentElement.lang.toLowerCase().startsWith('en');
    const messages = isEnglish
      ? {
          sending: 'Sending your message\u2026',
          success: 'Your message has been sent. Thank you!',
          edited: 'Your message was sent. Changes made after you pressed Send are still in the form.',
          uncertain: 'The service did not confirm delivery. Your text is still in the form.',
          fields: 'Please correct the marked fields and send your message again.',
          rejected: 'The service could not accept this entry. Please check it before trying again.',
          error: 'The connection was interrupted. Delivery could not be confirmed. Your text has been kept; please check your connection before trying again.',
          serverError: 'The service could not accept your message. Your text has been kept. Please try again in a few moments.',
          timeout: 'The service is taking too long to respond. Delivery could not be confirmed. Your text has been kept.',
          required: 'Please complete this required field.',
          email: 'Enter a complete email address, for example name@example.org.'
        }
      : {
          sending: 'Envoi de votre message\u2026',
          success: 'Votre message a bien \u00e9t\u00e9 envoy\u00e9. Merci !',
          edited: 'Votre message a été envoyé. Les modifications apportées après l’envoi sont toujours dans le formulaire.',
          uncertain: 'Le service n’a pas confirmé l’envoi. Votre texte est conservé.',
          fields: 'Corrigez les champs signalés, puis renvoyez votre message.',
          rejected: 'Le service a refusé cette valeur. Vérifiez-la avant de réessayer.',
          error: 'La connexion a \u00e9t\u00e9 interrompue. L\u2019envoi n\u2019a pas pu \u00eatre confirm\u00e9. Votre texte est conserv\u00e9 ; v\u00e9rifiez votre connexion avant de r\u00e9essayer.',
          serverError: 'Le service n\u2019a pas pu accepter votre message. Votre texte est conserv\u00e9. R\u00e9essayez dans quelques instants.',
          timeout: 'Le service met trop de temps \u00e0 r\u00e9pondre. L\u2019envoi n\u2019a pas pu \u00eatre confirm\u00e9. Votre texte est conserv\u00e9.',
          required: 'Renseignez ce champ obligatoire.',
          email: 'Saisissez une adresse \u00e9lectronique compl\u00e8te, par exemple nom@example.org.'
        };

    // Keep native validation, including the no-JavaScript fallback. Add persistent
    // text only after an invalid event, never on an untouched required field.
    const fields = [...form.querySelectorAll('.form-field input, .form-field textarea')];
    const clearFieldError = (field) => {
      const id = field.id + '-error';
      document.getElementById(id)?.remove();
      field.removeAttribute('aria-invalid');
      const descriptions = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
      if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
      else field.removeAttribute('aria-describedby');
    };
    const showFieldError = (field, serviceMessage) => {
      const id = field.id + '-error';
      let error = document.getElementById(id);
      if (!error) {
        error = document.createElement('p');
        error.id = id;
        error.className = 'form-field-error';
        field.after(error);
      }
      error.textContent = serviceMessage || (field.validity.valueMissing ? messages.required
        : field.type === 'email' && field.validity.typeMismatch ? messages.email
        : field.validationMessage);
      field.setAttribute('aria-invalid', 'true');
      const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      descriptions.add(id);
      field.setAttribute('aria-describedby', [...descriptions].join(' '));
    };
    fields.forEach((field) => {
      field.addEventListener('invalid', () => showFieldError(field));
      field.addEventListener('input', () => {
        if (field.validity.valid) clearFieldError(field);
        else if (field.getAttribute('aria-invalid') === 'true') showFieldError(field);
        if (!sending && alert.textContent === messages.fields && !form.querySelector('[aria-invalid="true"]')) {
          alert.textContent = '';
          alert.classList.remove('is-error');
        }
        if (!sending && status.classList.contains('is-success')) {
          status.classList.remove('is-success');
          status.textContent = '';
        }
      });
      field.addEventListener('blur', () => {
        if (field.getAttribute('aria-invalid') === 'true' && !field.validity.valid) showFieldError(field);
      });
    });
    form.addEventListener('reset', () => fields.forEach(clearFieldError));

    let sending = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (sending) return;
      if (!form.reportValidity()) return;

      sending = true;
      const focusAtSubmit = document.activeElement;
      const focusIfUnchanged = target => {
        if (document.activeElement === focusAtSubmit) target.focus();
      };
      alert.textContent = '';
      alert.classList.remove('is-error');
      status.classList.remove('is-success');
      status.textContent = messages.sending;
      // Keep the button in the tab order; the sending flag also covers implicit submissions.
      submit.setAttribute('aria-disabled', 'true');
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller ? window.setTimeout(() => controller.abort(), 30000) : null;
      const submitted = new FormData(form);

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: submitted,
          headers: {Accept: 'application/json'},
          ...(controller ? {signal: controller.signal} : {})
        });

        // Formspree's JSON success response includes ok or a next-page URL.
        // A proxy or a challenge can serve an HTML page with status 200.
        const result = await response.json().catch(() => null);
        const errors = Array.isArray(result?.errors) ? result.errors : [];
        const confirmed = result?.ok === true || (result?.ok !== false && typeof result?.next === 'string' && result.next.length > 0);
        if (!response.ok || !confirmed || errors.length || result?.error) {
          let firstInvalid;
          for (const issue of errors) {
            const field = fields.find(input => input.name === issue?.field);
            if (!field || field.value !== submitted.get(field.name)) continue;
            let hint = messages.rejected;
            if (issue.code === 'REQUIRED_FIELD_EMPTY' || issue.code === 'REQUIRED_FIELD_MISSING') hint = messages.required;
            else if (issue.code === 'TYPE_EMAIL') hint = messages.email;
            showFieldError(field, hint);
            firstInvalid ??= field;
          }
          status.textContent = '';
          alert.classList.add('is-error');
          alert.textContent = firstInvalid ? messages.fields
            : response.ok && !errors.length && !result?.error ? messages.uncertain : messages.serverError;
          if (firstInvalid) focusIfUnchanged(firstInvalid);
          return;
        }

        const changed = fields.some(field => field.value !== submitted.get(field.name));
        if (!changed) form.reset();
        status.classList.add('is-success');
        status.textContent = changed ? messages.edited : messages.success;
        if (!changed) focusIfUnchanged(status);
      } catch (error) {
        status.textContent = '';
        alert.classList.add('is-error');
        alert.textContent = error.name === 'AbortError' ? messages.timeout : messages.error;
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
        sending = false;
        submit.removeAttribute('aria-disabled');
      }
    });
  });
})();
