/* Educational block averaging, not an implementation of a published method. */
(() => {
  'use strict';
  const en = document.documentElement.lang.toLowerCase().startsWith('en');
  const ns = 'http://www.w3.org/2000/svg';
  document.querySelectorAll('[data-granularity-demo]').forEach((demo) => {
    const controls = demo.querySelector('[data-demo-controls]');
    const select = demo.querySelector('select');
    const reset = demo.querySelector('[data-demo-reset]');
    const cells = demo.querySelector('[data-demo-cells]');
    const status = demo.querySelector('[data-demo-status]');
    const description = demo.querySelector('desc');
    if (!controls || !select || !reset || !cells || !status || !description) return;
    const originalDescription = description.textContent;
    // Sample a fixed 32 x 32 binary house at pixel centres. No external image/data.
    const sample = (x, y) => {
      const roof = y >= 3 && y < 14 && Math.abs(x - 16) <= (y - 3) * 12 / 11;
      const body = x >= 7 && x < 25 && y >= 14 && y < 29;
      const door = x >= 13 && x < 19 && y >= 21;
      return roof || (body && !door) ? 1 : 0;
    };
    const render = () => {
      const n = Number(select.value);
      if (![8, 16, 32].includes(n)) return;
      const block = 32 / n;
      const fragment = document.createDocumentFragment();
      let occupied = 0;
      for (let row = 0; row < n; row++) {
        for (let column = 0; column < n; column++) {
          let sum = 0;
          for (let y = 0; y < block; y++) {
            for (let x = 0; x < block; x++) {
              sum += sample(column * block + x + .5, row * block + y + .5);
            }
          }
          if (!sum) continue;
          occupied++;
          const rect = document.createElementNS(ns, 'rect');
          rect.setAttribute('x', String(column * block));
          rect.setAttribute('y', String(row * block));
          rect.setAttribute('width', String(block));
          rect.setAttribute('height', String(block));
          rect.setAttribute('fill-opacity', String(sum / (block * block)));
          fragment.append(rect);
        }
      }
      cells.replaceChildren(fragment);
      const message = en
        ? `${n} by ${n} grid: ${n * n} cells, ${occupied} containing part of the house. Larger blocks retain fewer boundary details.`
        : `Grille ${n} par ${n} : ${n * n} cellules, dont ${occupied} contiennent une partie de la maison. Les blocs plus grands conservent moins de d\u00e9tails des contours.`;
      // Keep the shape meaning in plain text and announce just the changed view.
      status.textContent = message;
      description.textContent = `${originalDescription} ${message}`;
      demo.dataset.gridSize = String(n);
    };
    // Only reveal usable controls after a successful first rendering.
    try {
      render();
      controls.hidden = false;
      select.addEventListener('change', render);
      reset.addEventListener('click', () => { select.value = '16'; render(); });
    } catch (error) {
      controls.hidden = true;
      console.warn('Granularity demo unavailable; static description retained.', error);
    }
  });
})();
