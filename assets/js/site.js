
(() => {
  'use strict';
  const menus = document.querySelectorAll('.mobile-menu');
  const closeMenu = (menu, restoreFocus = false) => {
    const hadFocus = menu.contains(document.activeElement);
    menu.removeAttribute('open');
    if (restoreFocus && hadFocus) menu.querySelector('summary')?.focus();
  };
  document.addEventListener('click', (event) => {
    menus.forEach((menu) => {
      if (menu.open && (!menu.contains(event.target) || event.target.closest('a'))) closeMenu(menu);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') menus.forEach((menu) => closeMenu(menu, true));
  });
  document.addEventListener('focusin', (event) => {
    menus.forEach((menu) => {
      if (menu.open && !menu.contains(event.target)) closeMenu(menu);
    });
  });
})();
