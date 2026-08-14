// Settings: the kingdom in your own hands.
//
// A phone player has no developer console, so without this screen there was no
// way to back a save up, move it to another device, or start over — and exactly
// one copy of it, in localStorage, on a platform that clears localStorage for
// sites you have not opened in a week.
//
// So: export, import, reset, and an honest word about what the browser might do
// to a save that is only ever kept in one place.

import { el, short } from './dom.js';
import { STORAGE_KEY, BACKUP_KEY, describeSave, serialize } from '../state.js';
import { canOfferInstall, promptToInstall } from './install.js';

/** Is the game running as an installed app rather than a browser tab? */
export function isInstalled() {
  return globalThis.matchMedia?.('(display-mode: standalone)').matches === true
    || globalThis.navigator?.standalone === true;
}

/** iOS clears storage for sites unopened for a week; installing is the exemption. */
function isIosBrowserTab() {
  const ua = globalThis.navigator?.userAgent ?? '';
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes('Macintosh') && (globalThis.navigator?.maxTouchPoints ?? 0) > 1);
  return iOS && !isInstalled();
}

function fileName(state) {
  const date = new Date().toISOString().slice(0, 10);
  return `kingdom-${date}-${state.residents.length}-people.json`;
}

function ago(ms) {
  if (!ms) return 'never';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The settings sheet.
 *
 * `handlers` supplies the things only main.js can do: apply an imported save,
 * start a new kingdom, and re-render.
 */
export function settingsSheet(state, handlers, onClose) {
  const status = el('div.pi-note', { text: '' });
  const say = (text, kind = '') => {
    status.textContent = text;
    status.className = `pi-note ${kind}`;
  };

  return el('div', {}, [
    el('h3.sheet-title', { text: 'Settings' }),
    el('p.sheet-sub', { text: 'Your kingdom, and what happens to it.' }),

    backupCard(state, handlers, say, status),
    safetyCard(state),
    preferencesCard(state, handlers),
    dangerCard(handlers, onClose),

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', { text: 'Close', on: { click: onClose } }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Export and import
// ---------------------------------------------------------------------------

function backupCard(state, handlers, say, status) {
  const importBox = el('textarea.import-box', {
    rows: '3',
    placeholder: 'Paste a saved kingdom here, then press Load',
    'aria-label': 'Paste a saved kingdom',
  });

  return el('div.card', {}, [
    el('div.card-title', { text: 'Back it up' }),
    el('div.pi-note', {
      text: 'A kingdom lives in this browser and nowhere else. Keep a copy '
        + 'somewhere you trust, especially before changing phones.',
    }),

    el('div.kv', {}, [
      el('span', { text: 'Last exported' }),
      el('b', { text: ago(state.settings.lastExportAt) }),
    ]),

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', {
        text: '⬇ Save to a file',
        on: {
          click: () => {
            try {
              downloadSave(state);
              state.settings.lastExportAt = Date.now();
              handlers.onChanged?.();
              say('Saved. Keep it somewhere that is not this phone.', 'pos');
            } catch (err) {
              say(`Could not save a file: ${err.message}`, 'neg');
            }
          },
        },
      }),
      el('button.btn', {
        text: '⧉ Copy',
        on: {
          click: async () => {
            try {
              await globalThis.navigator.clipboard.writeText(serialize(state));
              state.settings.lastExportAt = Date.now();
              handlers.onChanged?.();
              say('Copied. Paste it somewhere safe.', 'pos');
            } catch {
              say('This browser would not let the game reach the clipboard. '
                + 'Use Save to a file instead.', 'neg');
            }
          },
        },
      }),
    ]),

    el('div.card-title', { text: 'Bring one back', style: { marginTop: '10px' } }),
    importBox,
    el('div.btn-row', {}, [
      el('button.btn', {
        text: 'Load from a file',
        on: { click: () => pickFile((text) => loadInto(text, handlers, say)) },
      }),
      el('button.btn', {
        text: 'Load pasted',
        on: { click: () => loadInto(importBox.value, handlers, say) },
      }),
    ]),
    status,
  ]);
}

function downloadSave(state) {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: fileName(state) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(then) {
  const input = el('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(then);
  });
  input.click();
}

/**
 * Read a pasted or opened save, and say what it is before replacing anything.
 *
 * Never silently: overwriting a kingdom is the most destructive thing this
 * screen can do, so it happens in two steps and the second one names what is
 * about to arrive.
 */
function loadInto(text, handlers, say) {
  if (!text || !text.trim()) {
    say('Nothing to load — paste a save, or open a file.', 'neg');
    return;
  }
  let incoming;
  try {
    incoming = handlers.parse(text);
  } catch (err) {
    say(`That is not a kingdom this game can read: ${err.message}`, 'neg');
    return;
  }

  const about = describeSave(incoming);
  const ok = globalThis.confirm(
    `Replace your kingdom with this one?\n\n`
    + `${about.residents} people, ${about.towns} town${about.towns === 1 ? '' : 's'}, `
    + `${short(about.tiles)} tiles explored, ${about.studies} studies.\n`
    + `Saved ${about.savedAt ? new Date(about.savedAt).toLocaleString() : 'at an unknown time'}.\n\n`
    + `Your current kingdom will be kept as a backup, but do not rely on that.`
  );
  if (!ok) {
    say('Left alone.', '');
    return;
  }
  handlers.onImport(incoming);
}

// ---------------------------------------------------------------------------
// What the browser might do to it
// ---------------------------------------------------------------------------

function safetyCard(state) {
  const rows = [
    el('div.kv', {}, [
      el('span', { text: 'Installed to the home screen' }),
      el('b', { class: isInstalled() ? 'pos' : '', text: isInstalled() ? 'yes' : 'not yet' }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Storage marked as persistent' }),
      el('b', {
        class: state.settings.persisted ? 'pos' : '',
        text: state.settings.persisted ? 'yes' : 'not granted',
      }),
    ]),
  ];

  if (isIosBrowserTab()) {
    rows.push(el('div.pi-note', {
      class: 'neg',
      text: 'Safari clears saved data for sites you have not opened in about a '
        + 'week. Add this to your home screen (Share, then Add to Home Screen) '
        + 'and that stops applying — or keep an exported copy.',
    }));
  } else if (!isInstalled()) {
    rows.push(el('div.pi-note', {
      text: 'Installing the game to your home screen makes its save far harder '
        + 'for the browser to clear, and lets it open without a connection.',
    }));
  }

  // Chromium hands us a real install prompt; Safari never does, which is why
  // the iOS note above spells out the Share-menu route by hand instead.
  if (canOfferInstall()) {
    rows.push(el('button.btn.btn-primary', {
      text: '⬇ Install to your home screen',
      style: { width: '100%', marginTop: '8px' },
      on: { click: () => promptToInstall() },
    }));
  }

  return el('div.card', {}, [el('div.card-title', { text: 'How safe is it' }), ...rows]);
}

// ---------------------------------------------------------------------------
// Preferences and starting over
// ---------------------------------------------------------------------------

function preferencesCard(state, handlers) {
  const vibrate = state.settings.vibrate !== false;

  return el('div.card', {}, [
    el('div.card-title', { text: 'Preferences' }),
    el('button.palette-item', {
      style: { background: 'transparent' },
      on: {
        click: () => {
          state.settings.vibrate = !vibrate;
          handlers.onChanged?.();
          handlers.onRefresh?.();
        },
      },
    }, [
      el('div.pi-icon', { text: vibrate ? '✓' : '—' }),
      el('div.pi-body', {}, [
        el('div.pi-name', { text: 'A small buzz when you build' }),
        el('div.pi-note', { text: 'Ignored by devices that cannot, which includes iPhones.' }),
      ]),
    ]),
  ]);
}

function dangerCard(handlers, onClose) {
  return el('div.card', { style: { borderColor: 'var(--danger)' } }, [
    el('div.card-title', { style: { color: 'var(--danger)' }, text: 'Start again' }),
    el('div.pi-note', {
      text: 'A new kingdom, a new world, nothing kept. Export first if there is '
        + 'any chance you will want this one back.',
    }),
    el('button.btn.btn-danger', {
      text: 'Abandon this kingdom',
      style: { width: '100%', marginTop: '8px' },
      on: {
        click: () => {
          if (!globalThis.confirm('Abandon this kingdom and start a new one?')) return;
          if (!globalThis.confirm('Really? Everything in it goes.')) return;
          handlers.onReset();
          onClose();
        },
      },
    }),
  ]);
}

export { STORAGE_KEY, BACKUP_KEY };
