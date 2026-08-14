// Overlay sheets and toasts.
//
// Sheets slide up from the bottom; toasts stack above the tab bar. Notices are
// never blocking modals — a popup that stops the game fights the "no rush"
// pillar, so even important news is something you can read and dismiss at your
// own pace.
//
// A sheet can be dismissed four ways, which is deliberate: the scrim, its own
// button, a swipe down on the grip, and (from M4) the device back gesture.
// Everything funnels through `closeSheet`, so there is one place that puts the
// page back the way it was.

import { el, mount, clear } from './dom.js';

let closeHandler = null;
let returnFocusTo = null;

/**
 * How this module talks to the back stack, without knowing anything about it.
 *
 * ui/nav.js installs the bridge; if nothing does, sheets simply close directly
 * and the game behaves exactly as it did before there was any history at all.
 */
let historyBridge = null;

export function setHistoryBridge(bridge) {
  historyBridge = bridge;
}

const reducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export function openSheet(content, { onClose } = {}) {
  const overlay = document.getElementById('overlay');
  const app = document.getElementById('app');
  const wasOpen = isSheetOpen();

  closeHandler = onClose ?? closeSheet;

  // Where to put the player back when this closes. Only captured on the way in:
  // several screens reopen a sheet in place to refresh it, and that must not
  // overwrite the button they actually came from.
  if (!wasOpen) {
    returnFocusTo = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  const grip = el('div.sheet-grip', {}, [el('div.sheet-handle')]);
  const sheet = el('div.sheet', { tabindex: '-1' }, [grip, content]);
  sheet.addEventListener('click', (event) => event.stopPropagation());
  wireSwipeToDismiss(sheet, grip);

  mount(overlay, sheet);
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.onclick = () => closeHandler?.();

  // The page behind a sheet is neither scrollable nor reachable. `inert` does
  // in one attribute what a hand-rolled focus trap does badly: it takes the
  // whole subtree out of the tab order and out of the accessibility tree.
  document.body.classList.add('sheet-open');
  app?.setAttribute('inert', '');

  if (!wasOpen) sheet.focus({ preventScroll: true });
  historyBridge?.opened();
}

/**
 * Close a sheet because somebody asked to — a button, the scrim, a swipe, or
 * finishing an action.
 *
 * This goes through the BACK STACK rather than closing directly, so that a
 * Close button and the device back gesture are the same event. Otherwise the
 * stack keeps an entry for a sheet that is no longer on screen, and the next
 * back press appears to do nothing.
 */
export function closeSheet() {
  if (!isSheetOpen()) return;
  if (historyBridge?.requestClose()) return;   // popstate will finish the job
  closeSheetNow();
}

/** Actually take the sheet off the screen. Only `popstate` and the line above. */
export function closeSheetNow() {
  const overlay = document.getElementById('overlay');
  if (overlay.classList.contains('hidden')) return;

  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  clear(overlay);
  closeHandler = null;

  document.body.classList.remove('sheet-open');
  document.getElementById('app')?.removeAttribute('inert');

  // Focus goes back where it came from, so a keyboard or switch user is not
  // dropped at the top of the document every time they read something.
  if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
  returnFocusTo = null;
}

export function isSheetOpen() {
  return !document.getElementById('overlay').classList.contains('hidden');
}

/**
 * Drag the grip down to dismiss.
 *
 * Only the grip, never the sheet body: a sheet scrolls, and a drag that starts
 * anywhere inside it would spend its life arguing with that scroll about which
 * of them the gesture belonged to. A wide invisible grip above the visible pill
 * gives the gesture somewhere unambiguous to live.
 */
function wireSwipeToDismiss(sheet, grip) {
  let startY = 0;
  let lastY = 0;
  let lastAt = 0;
  let velocity = 0;
  let dragging = false;

  const move = (dy) => {
    sheet.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };

  grip.addEventListener('pointerdown', (event) => {
    dragging = true;
    startY = lastY = event.clientY;
    lastAt = event.timeStamp;
    velocity = 0;
    sheet.classList.add('dragging');
    // Capture keeps the drag alive if the finger slides off the grip, but it is
    // allowed to throw. It is a convenience, never a requirement — the same
    // guard the map needs on its own pointers.
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer went away before we could claim it */
    }
  });

  grip.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dt = event.timeStamp - lastAt;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;   // px per ms
    lastY = event.clientY;
    lastAt = event.timeStamp;
    move(event.clientY - startY);
  });

  const release = (event) => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');

    const travelled = event.clientY - startY;
    // Either a decisive flick, or far enough that they clearly meant it.
    const dismissed = velocity > 0.5 || travelled > sheet.offsetHeight * 0.3;

    if (!dismissed) {
      if (!reducedMotion()) sheet.classList.add('closing');
      move(0);
      setTimeout(() => sheet.classList.remove('closing'), 180);
      return;
    }

    if (reducedMotion()) {
      closeHandler?.();
      return;
    }
    sheet.classList.add('closing');
    sheet.style.transform = `translateY(${sheet.offsetHeight}px)`;
    sheet.style.opacity = '0';
    setTimeout(() => closeHandler?.(), 150);
  };

  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);
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
