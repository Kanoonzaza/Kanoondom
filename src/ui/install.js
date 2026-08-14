// Registering the service worker, and keeping it honest about updates.
//
// The interesting decision here is WHEN to check for a new version. An idle
// game's sessions do not begin with a page load — they begin with somebody
// coming back to a tab that has been sitting there. So the check runs on
// `visibilitychange`, which is exactly the moment a session starts, rather than
// on a timer that would mostly fire at nobody.
//
// And an update is never applied on its own. Reloading out from under a player
// to install something they did not ask for is precisely the kind of thing this
// game does not do.

/** Somewhere to keep the running registration for the update check. */
let registration = null;
let reloading = false;

/**
 * Is a service worker worth registering here?
 *
 * Skipped on localhost unless explicitly asked for with `?sw=1`. A cache-first
 * worker and an afternoon of editing source files fight each other, and the
 * worker always wins — which is a confusing hour for whoever is developing.
 */
function shouldRegister() {
  if (!('serviceWorker' in globalThis.navigator)) return false;

  const { hostname, protocol } = globalThis.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  if (local) return new URLSearchParams(globalThis.location.search).get('sw') === '1';

  // Everywhere else it needs a secure context anyway.
  return protocol === 'https:';
}

export function registerServiceWorker({ onUpdateReady } = {}) {
  if (!shouldRegister()) return;

  const start = async () => {
    try {
      registration = await globalThis.navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.warn('The offline layer could not be installed:', err);
      return;
    }

    // A worker that is already waiting was downloaded on a previous visit.
    if (registration.waiting && globalThis.navigator.serviceWorker.controller) {
      onUpdateReady?.(() => applyUpdate(registration));
    }

    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        // `controller` tells an UPDATE apart from a first install. On a first
        // install there is nothing to offer: the player already has this
        // version, it simply became available offline.
        if (incoming.state === 'installed' && globalThis.navigator.serviceWorker.controller) {
          onUpdateReady?.(() => applyUpdate(registration));
        }
      });
    });

    // Returning to the page IS the start of a session for a game like this.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration?.update?.().catch(() => {});
    });
  };

  // After the game is up. Nothing here is needed to play, and on a slow phone
  // the install fetches every file the app owns.
  if ('requestIdleCallback' in globalThis) {
    globalThis.requestIdleCallback(start, { timeout: 4000 });
  } else {
    setTimeout(start, 2000);
  }
}

function applyUpdate(reg) {
  if (reloading) return;

  globalThis.navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Guarded: without this, a controllerchange that arrives for any other
    // reason turns into a reload loop.
    if (reloading) return;
    reloading = true;
    globalThis.location.reload();
  });

  reg.waiting?.postMessage('SKIP_WAITING');
}

/**
 * The Install button, when the browser offers one.
 *
 * Chromium fires `beforeinstallprompt` and lets the prompt be shown later, on a
 * real gesture. Safari never fires it, which is why ui/settings.js also spells
 * out the Share-menu route by hand.
 */
let deferredPrompt = null;

export function watchForInstallOffer(onAvailable) {
  globalThis.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();          // keep it for our own button
    deferredPrompt = event;
    onAvailable?.(true);
  });

  globalThis.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    onAvailable?.(false);
  });
}

export function canOfferInstall() {
  return deferredPrompt !== null;
}

export async function promptToInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}
