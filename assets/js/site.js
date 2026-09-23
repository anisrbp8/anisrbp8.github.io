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
    const closeOnDesktop = (event) => {
      if (event.matches) setOpen(false);
    };
    if (desktop.addEventListener) desktop.addEventListener('change', closeOnDesktop);
    else if (desktop.addListener) desktop.addListener(closeOnDesktop);
  });
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
