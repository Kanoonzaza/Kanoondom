// The save, and the two ways it can be lost.
//
// A kingdom is months of somebody's evenings kept in one localStorage key on a
// platform that is entitled to clear it. Two failures are worth defending
// against in code rather than in hope:
//
//   * a write that runs out of quota part way through, leaving a truncated
//     save where a good one used to be
//   * a migration that goes wrong on a save this build has never seen, after
//     the original has already been overwritten
//
// Both are covered by a second slot, and by never overwriting the backup with
// something we have not successfully read.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, serialize, deserialize, describeSave,
  saveToStorage, loadFromStorage, clearStorage,
  STORAGE_KEY, BACKUP_KEY, SCHEMA_VERSION,
} from '../src/state.js';
import { clearTerritoryFog } from '../src/sim/world.js';
import { advanceTicks } from '../src/sim/tick.js';

/** The smallest localStorage that behaves like one, plus a way to break it. */
function fakeStorage() {
  const store = new Map();
  return {
    failWrites: false,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem(k, v) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
    get size() { return store.size; },
    keys: () => [...store.keys()],
  };
}

function withStorage(storage, run) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage, configurable: true, writable: true,
  });
  try {
    return run();
  } finally {
    if (had) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: previous, configurable: true, writable: true,
      });
    } else {
      delete globalThis.localStorage;
    }
  }
}

function livedInKingdom(seed = 5) {
  const state = newGame(seed, { now: 0 });
  state.stats.tilesCleared += clearTerritoryFog(state);
  advanceTicks(state, 500);
  return state;
}

test('a save round-trips through storage unchanged', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    const state = livedInKingdom();
    assert.equal(saveToStorage(state, 1000), true);

    const back = loadFromStorage();
    assert.equal(back.seed, state.seed);
    assert.equal(back.time.totalTicks, state.time.totalTicks);
    assert.deepEqual(back.resources, state.resources);
  });
});

test('a full store is reported, not swallowed', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    storage.failWrites = true;
    assert.equal(
      saveToStorage(livedInKingdom(), 1000), false,
      'the caller has to be able to tell the player'
    );
  });
});

test('a backup is kept once a day, and not more often', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    const state = livedInKingdom();
    const day = 24 * 60 * 60 * 1000;

    saveToStorage(state, day);
    assert.equal(storage.getItem(BACKUP_KEY), null, 'nothing to back up on the first save');

    saveToStorage(state, day + 1000);
    const first = storage.getItem(BACKUP_KEY);
    assert.ok(first, 'the second save copies the first aside');

    saveToStorage(state, day + 2000);
    assert.equal(storage.getItem(BACKUP_KEY), first, 'and does not churn it every save');

    saveToStorage(state, day * 3);
    assert.notEqual(storage.getItem(BACKUP_KEY), first, 'but does refresh it after a day');
  });
});

test('an unreadable save falls back to the backup, and says so', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    const state = livedInKingdom();
    const day = 24 * 60 * 60 * 1000;
    saveToStorage(state, day);
    saveToStorage(state, day * 2);          // now there is a backup
    assert.ok(storage.getItem(BACKUP_KEY));

    // A write cut off half way through is exactly what a full quota leaves.
    storage.setItem(STORAGE_KEY, storage.getItem(STORAGE_KEY).slice(0, 400));

    const back = loadFromStorage();
    assert.ok(back, 'the kingdom survives a truncated save');
    assert.equal(back.seed, state.seed);
    assert.equal(
      back.restoredFromBackup, true,
      'and the player must be told it is not the save they left'
    );
  });
});

test('nothing is lost when there is no backup and no save', () => {
  withStorage(fakeStorage(), () => {
    assert.equal(loadFromStorage(), null, 'an empty store is a new game, not an error');
  });
});

test('a save is copied aside before any migration touches it', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    const state = livedInKingdom();
    const old = JSON.parse(serialize(state, 1000));
    old.schemaVersion = 1;                     // as if written by an older build
    storage.setItem(STORAGE_KEY, JSON.stringify(old));

    loadFromStorage();

    const kept = storage.getItem(BACKUP_KEY);
    assert.ok(kept, 'the pre-migration save is the one worth keeping');
    assert.equal(
      JSON.parse(kept).schemaVersion, 1,
      'and it is kept exactly as it was, before the migration ran'
    );
  });
});

test('a save from a newer build is refused rather than mangled', () => {
  const state = livedInKingdom();
  const future = JSON.parse(serialize(state, 1000));
  future.schemaVersion = SCHEMA_VERSION + 1;

  assert.throws(
    () => deserialize(JSON.stringify(future)),
    /newer version/,
    'guessing at a shape we do not know would corrupt it'
  );
});

test('clearing takes the backup with it', () => {
  const storage = fakeStorage();
  withStorage(storage, () => {
    const state = livedInKingdom();
    const day = 24 * 60 * 60 * 1000;
    saveToStorage(state, day);
    saveToStorage(state, day * 2);
    assert.ok(storage.getItem(BACKUP_KEY));

    clearStorage();
    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.equal(
      storage.getItem(BACKUP_KEY), null,
      'starting again must not leave the old kingdom waiting to be restored'
    );
  });
});

test('a save can describe itself before it replaces anything', () => {
  const state = livedInKingdom();
  const about = describeSave(state);

  assert.equal(about.towns, state.townHalls.length);
  assert.equal(about.residents, state.residents.length);
  assert.equal(about.tiles, state.world.clearedCount);
  assert.equal(about.schemaVersion, SCHEMA_VERSION);
  assert.ok(about.savedAt !== undefined, 'when it was saved is the deciding detail');
});
