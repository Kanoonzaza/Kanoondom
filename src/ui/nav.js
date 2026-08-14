// The device back gesture.
//
// Android's back button and iOS's back-swipe both arrive as `popstate`, and
// both mean the same thing: undo the last thing that put something in front of
// me. Without any history at all — which is where this game started — the very
// first back gesture leaves the game entirely, which on an installed app reads
// as a crash.
//
// The stack is deliberately shallow, at most three deep:
//
//   0  the World, where you start and where back finally lets you leave
//   1  any other tab
//   2  a sheet, on top of whichever of those you were on
//
// Every tab switch after the first REPLACES rather than pushes, so wandering
// People -> Study -> Forge -> Watch does not build a pile of entries that take
// four presses to get out of. One press goes back to the World; a second leaves.
//
// `popstate` is the only thing in the game allowed to act on a back gesture,
// and UI-initiated closes go THROUGH it — a Close button calls `history.back()`
// rather than closing directly. One authority, so the stack and the screen can
// never disagree about what is open.

import { closeSheetNow, isSheetOpen, setHistoryBridge } from './panels.js';

const BASE = 0;
const TAB = 1;
const SHEET = 2;

let onScreen = null;
let handlingPop = false;

function depth() {
  return globalThis.history.state?.ks ?? BASE;
}

export function initNav({ onScreen: screenHandler }) {
  onScreen = screenHandler;
  globalThis.history.replaceState({ ks: BASE }, '');

  setHistoryBridge({
    // A sheet just opened: put an entry under it to catch the back gesture.
    // Guarded, because several screens reopen a sheet in place to refresh it
    // and that must not stack up entries.
    opened() {
      if (depth() < SHEET) globalThis.history.pushState({ ks: SHEET }, '');
    },

    // Somebody asked to close a sheet. If it is ours to pop, pop it and let
    // `popstate` do the actual closing; otherwise say so and close directly.
    requestClose() {
      if (handlingPop || depth() < SHEET) return false;
      globalThis.history.back();
      return true;
    },
  });

  globalThis.addEventListener('popstate', () => {
    handlingPop = true;
    try {
      const now = depth();
      if (isSheetOpen() && now < SHEET) {
        closeSheetNow();
        return;
      }
      if (now <= BASE) onScreen?.('world');
    } finally {
      handlingPop = false;
    }
  });
}

/**
 * Go to a screen, keeping the back stack honest.
 *
 * Leaving the World pushes one entry. Moving between other tabs replaces it.
 * Returning to the World goes BACK rather than pushing, so the entry is spent
 * rather than accumulated.
 */
export function goToScreen(id) {
  const now = depth();

  if (id === 'world') {
    if (now === TAB) {
      globalThis.history.back();   // popstate switches the screen
      return;
    }
    globalThis.history.replaceState({ ks: BASE }, '');
  } else if (now === BASE) {
    globalThis.history.pushState({ ks: TAB }, '');
  } else {
    globalThis.history.replaceState({ ks: TAB }, '');
  }

  onScreen?.(id);
}
