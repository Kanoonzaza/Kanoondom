// Overlay sheets and toasts.
//
// Sheets slide up from the bottom; toasts stack above the tab bar. Notices are
// never blocking modals — a popup that stops the game fights the "no rush"
// pillar, so even important news is something you can read and dismiss at your
// own pace.

import { el, mount, clear } from './dom.js';

let closeHandler = null;

export function openSheet(content, { onClose } = {}) {
  const overlay = document.getElementById('overlay');
  closeHandler = onClose ?? closeSheet;

  const sheet = el('div.sheet', {}, [el('div.sheet-handle'), content]);
  sheet.addEventListener('click', (event) => event.stopPropagation());

  mount(overlay, sheet);
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.onclick = () => closeHandler?.();
}

export function closeSheet() {
  const overlay = document.getElementById('overlay');
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  clear(overlay);
  closeHandler = null;
}

export function isSheetOpen() {
  return !document.getElementById('overlay').classList.contains('hidden');
}

/**
 * Transient notice.
 * @param {object} opts { title, rows: [[label, value, cls]], kind, ms, onTap }
 */
export function toast({ title, rows = [], kind = '', ms = 6000, onTap = null }) {
  const host = document.getElementById('toasts');

  const node = el(`div.toast`, { class: kind }, [
    el('div.toast-title', { text: title }),
    ...rows.map(([label, value, cls]) =>
      el('div.toast-row', {}, [
        el('span', { text: label }),
        el('b', { class: cls ?? '', text: value }),
      ])
    ),
  ]);

  if (onTap) node.addEventListener('click', onTap);

  host.append(node);
  // Keep at most three on screen so a fast-forward does not bury the game.
  while (host.children.length > 3) host.firstChild.remove();

  setTimeout(() => node.remove(), ms);
  return node;
}
