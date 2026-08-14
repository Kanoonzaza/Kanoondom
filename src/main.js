// Wiring: the game loop, screen routing, input, autosave.
//
// The only module allowed to touch both the simulation and the DOM.

import {
  newGame, loadFromStorage, saveToStorage, deserialize, requestPersistence,
  seasonIndex, yearOf, seasonName, ticksIntoSeason,
  dayPeriod, dayNumber, isFullMoon,
} from './state.js';
import { advanceTicks } from './sim/tick.js';
import {
  peaceLevel, unlockedRing, nextGate, monarchRank, hallRadius,
  clearTerritoryFog, territoryTiles, zoneLabel, zoneOf,
} from './sim/world.js';
import { el, mount, short } from './ui/dom.js';
import { createMapView, tileSheet, buildSheet, centreOn, mapMode } from './ui/map.js';
import { openSheet, closeSheet, isSheetOpen, toast } from './ui/panels.js';
import { initNav, goToScreen } from './ui/nav.js';
import { settingsSheet } from './ui/settings.js';
import { renderPeople, residentSheet } from './ui/people.js';
import { renderStudy } from './ui/study.js';
import { renderForge, skillSheet } from './ui/forge.js';
import { welcomeSheet, worthShowing } from './ui/welcome.js';
import { forge, raiseAll, autoEquip } from './sim/equipment.js';
import { learn } from './sim/skills.js';
import { equipmentDef } from './content/equipment.js';
import { skillDef } from './content/skills.js';
import {
  startResearch, cancelResearch, promote, checkMapRewards, townRank,
} from './sim/research.js';
import { runSurvey } from './sim/survey.js';
import { renderWatch, battleSheet } from './ui/watch.js';
import { incubate, feed, bandOf, creatureFor } from './sim/creatures.js';
import { creatureDef, colourDef, ROLES, categoryDef } from './content/creatures.js';
import { clearNest, enterCave, graceRemaining } from './sim/raids.js';
import { nestSites, threatLabel } from './sim/monsters.js';
import { rehouse, freeBeds, totalBeds } from './sim/residents.js';
import { marry } from './sim/marriage.js';
import { professionDef } from './content/professions.js';
import { TICKS_PER_SEASON, SPEEDS, ZONE_UNLOCKS, DAY } from './content/config.js';
import {
  beginCatchUp, runCatchUpChunk, catchUpDone, finishCatchUp,
} from './sim/offline.js';
import { place, remove, upgrade, repair, palette, canPlace } from './sim/facilities.js';
import { BACKUP_KEY, serialize } from './state.js';
import { invalidateTerrain } from './ui/map.js';
import { productionRates, storageCapacity, fullStores } from './sim/economy.js';
import { RESOURCES, RESOURCE_IDS } from './content/resources.js';
import { facilityDef } from './content/facilities.js';

let state = null;
let speed = 1;
let mapView = null;

const view = { screen: 'world' };

let screenDirty = true;
let hudDirty = true;
let paintQueued = false;

/** Set when another window has taken this kingdom over. Nothing runs after it. */
let frozen = false;

/**
 * How a long absence is walked.
 *
 * `instantTicks` is two hours — below that the whole span resolves in a few
 * milliseconds and a progress card would be a flicker for nothing.
 */
const CATCH_UP = {
  instantTicks: 2 * 60 * 60,
  firstChunk: 20000,
  minChunk: 2000,
  maxChunk: 400000,
  targetMs: 15,
};

/**
 * Ask for a repaint. Flags only — the loop paints on its next frame.
 *
 * That coalescing is the whole point: a fast-forward that finishes four
 * buildings and two studies at once used to cost six full screen teardowns in
 * a single frame, because `handleReport` calls this once per event. Now it
 * costs one. When the loop is parked — a paused game, or a hidden page — a
 * single microtask stands in for the missing frame.
 */
function markDirty() {
  screenDirty = true;
  hudDirty = true;
  if (rafId !== 0 || paintQueued || !state) return;
  paintQueued = true;
  queueMicrotask(() => {
    paintQueued = false;
    if (state) paint(performance.now());
  });
}

// --- boot ------------------------------------------------------------------

function boot() {
  let restoredFromBackup = false;
  try {
    state = loadFromStorage();
    restoredFromBackup = state?.restoredFromBackup === true;
    if (state) delete state.restoredFromBackup;
  } catch (err) {
    console.warn('Could not read the save:', err.message);
    state = null;
  }

  if (!state) {
    state = newGame();
    // You start knowing your own land.
    state.stats.tilesCleared += clearTerritoryFog(state);
    save();
  }

  speed = state.settings.defaultSpeed ?? 1;

  buildTabs();
  // Before anything can open a sheet: the welcome panel needs a stack to sit on.
  initNav({ onScreen: showScreen });
  // Paint before the first animation frame: a backgrounded tab never gets one.
  paint(performance.now());
  resume();

  if (restoredFromBackup) {
    // Never quietly. Handing somebody an older kingdom without saying so is its
    // own kind of loss — they would find the gap themselves, later, and wonder.
    toast({
      title: 'Restored from a backup',
      rows: [
        ['', 'The main save could not be read, so the last backup was used.', 'neg'],
        ['', 'You may have lost up to a day. Export a copy from Settings.'],
      ],
      kind: 'warn',
      ms: 14000,
      onTap: openSettings,
    });
  }

  document.getElementById('settings-btn')?.addEventListener('click', openSettings);
  guardAgainstASecondWindow();

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', () => saveToStorage(state));

  // A rotation or a split-screen resize changes how big the canvas is, and the
  // map is the one thing on the page that cannot lay itself out again in CSS.
  const relayout = () => { mapView?.redraw(); markDirty(); };
  globalThis.addEventListener('resize', relayout);
  globalThis.addEventListener('orientationchange', relayout);
}

/**
 * Bring the kingdom to the present, then let time run again.
 *
 * Boot and a return from a hidden page take the SAME path, and that is the
 * point. A backgrounded page is not a paused game: it is an absence, and an
 * absence is the one thing this whole game is built around. Until this existed
 * the live loop clamped its frame delta to five seconds, so returning to a tab
 * that had sat hidden for an hour credited five ticks and quietly dropped the
 * other fifty-nine minutes. Installed on a phone — where the page can stay
 * alive for days — that would have broken the promise outright, in exactly
 * the situation this game is meant to be best at.
 */
function resume() {
  let run = null;
  try {
    run = beginCatchUp(state);
  } catch (err) {
    console.error('Offline catch-up failed:', err);
    startPlaying();
    return;
  }

  if (run.elapsedSeconds < 1) {
    startPlaying();
    return;
  }

  // A short absence resolves in well under a frame; interrupting the page with
  // a progress card for it would be worse than the wait.
  if (run.simulated <= CATCH_UP.instantTicks) {
    while (!catchUpDone(run)) runCatchUpChunk(state, run, run.simulated);
    settle(finishCatchUp(state, run));
    return;
  }

  walkTheAbsence(run);
}

/**
 * Simulate a long absence in slices, yielding the thread between them.
 *
 * A month is up to 2.6 million ticks. In one call that is a frozen white page
 * before anything has been drawn, which on a phone is a page the system may
 * simply kill. So the span is walked in slices sized to fit a frame, the page
 * says what it is doing while it works, and the browser stays answerable
 * throughout.
 *
 * The kingdom that comes out is identical either way: `advanceTicks` walks
 * segments, so N ticks in one call and N ticks in pieces visit the same
 * boundaries in the same order. `tests/offline.test.js` asserts it directly.
 */
function walkTheAbsence(run) {
  const progress = catchUpCard();
  mount(document.getElementById('screen'), progress.node);

  let budget = CATCH_UP.firstChunk;

  const slice = () => {
    const started = performance.now();
    try {
      runCatchUpChunk(state, run, budget);
    } catch (err) {
      console.error('Offline catch-up failed:', err);
      settle(null);
      return;
    }
    const spent = performance.now() - started;

    // Aim each slice at a frame's worth of work. A slow phone takes smaller
    // bites and a fast one takes bigger ones, and neither is ever locked up for
    // long enough to be noticed.
    //
    // Growth is capped at double per slice. Without that, one unrepresentatively
    // quick first slice sent the budget straight to the ceiling and the next
    // slice blocked for 105ms — seven times the target — before the measurement
    // pulled it back. Doubling reaches the right size in a handful of slices and
    // never overshoots by more than one.
    if (spent > 0) {
      const scaled = Math.min(budget * (CATCH_UP.targetMs / spent), budget * 2);
      budget = Math.max(CATCH_UP.minChunk, Math.min(CATCH_UP.maxChunk, Math.round(scaled)));
    }

    if (catchUpDone(run)) {
      settle(finishCatchUp(state, run));
      return;
    }

    progress.update(run.report.ticks, run.simulated);
    setTimeout(slice, 0);
  };

  setTimeout(slice, 0);
}

/** Show the welcome-back panel, if the absence earned one, and start the clock. */
function settle(welcome) {
  // The welcome-back panel replaces the old stack of toasts. Four toasts
  // fighting for the same corner is not a summary — and the one thing that
  // actually teaches (which store filled, and when) was the easiest to miss.
  if (worthShowing(welcome)) {
    openSheet(welcomeSheet(state, welcome, {
      onGoTo: goToScreen,
    }, closeSheet));
  }
  save();
  startPlaying();
}

function startPlaying() {
  lastSavedSeason = seasonIndex(state);
  screenDirty = true;
  hudDirty = true;
  wakeLoop();
  markDirty();

  // Ask once per session; browsers only grant it off the back of real use.
  requestPersistence().then((granted) => {
    if (granted !== state.settings.persisted) {
      state.settings.persisted = granted;
    }
  });
}

/** "Your kingdom is waking" — shown only when the wait would be noticeable. */
function catchUpCard() {
  const bar = el('div', {
    style: {
      width: '0%', height: '100%', background: 'var(--gold)', transition: 'width .2s linear',
    },
  });
  const detail = el('div.pi-note', { text: 'Working out what grew while you were gone.' });

  const node = el('div', {}, [
    el('h2.screen-title.serif', { text: 'Your kingdom is waking' }),
    el('div.card', {}, [
      el('div.card-title', { text: 'Catching up' }),
      el('div', {
        style: {
          height: '8px', borderRadius: '4px', overflow: 'hidden',
          background: 'var(--panel-3)', margin: '6px 0 8px',
        },
      }, [bar]),
      detail,
    ]),
  ]);

  const days = (ticks) => Math.floor(ticks / DAY.ticksPerDay).toLocaleString();

  return {
    node,
    update(ticksDone, ticksTotal) {
      bar.style.width = `${Math.round((ticksDone / ticksTotal) * 100)}%`;
      detail.textContent = `Day ${days(ticksDone)} of ${days(ticksTotal)}.`;
    },
  };
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    // Save FIRST. `lastSaveTime` is what the journey back measures from, and a
    // page that has just been hidden may never be given another moment to run.
    saveToStorage(state);
    stopLoop();
  } else if (!frozen) {
    resume();
  }
}

// --- the loop --------------------------------------------------------------

/**
 * Save, and say so if it did not work.
 *
 * `saveToStorage` has always returned false on a full or unavailable store, and
 * nothing has ever looked at it: a phone that hit its quota simply stopped
 * keeping the game, silently, which is the worst possible way for this to fail.
 * Once per session, because a full store stays full and nobody needs the same
 * bad news forty times.
 */
let warnedAboutStorage = false;

function save() {
  if (saveToStorage(state)) return true;
  if (!warnedAboutStorage) {
    warnedAboutStorage = true;
    toast({
      title: 'Could not save',
      rows: [
        ['', 'This browser refused to store the game — it may be full.', 'neg'],
        ['', 'Export a copy from Settings before you close this.'],
      ],
      kind: 'bad',
      ms: 20000,
      onTap: openSettings,
    });
  }
  return false;
}

let lastFrame = 0;
let tickAccumulator = 0;
let lastMapDraw = 0;
let lastHudRefresh = 0;
let mapDrawnAtTick = -1;
let lastSavedSeason = 0;
let rafId = 0;

/** Is anything actually moving? If not, the loop has no reason to run. */
function needsFrames() {
  return speed > 0 || mapView?.animating?.() === true;
}

/**
 * Restart a parked loop. Idempotent, and never while the page is hidden.
 *
 * Only for restarting. The running loop re-arms itself inline below, because
 * clearing `lastFrame` here is what makes a restart not bill the player for the
 * pause — and doing that on every frame instead meant every frame measured a
 * delta of zero, so the clock sat still at speed 1 while burning 60fps.
 */
function wakeLoop() {
  if (frozen || rafId !== 0 || document.visibilityState === 'hidden') return;
  lastFrame = 0;
  rafId = requestAnimationFrame(loop);
}

/**
 * Stop asking for frames.
 *
 * A paused game in the foreground, and any hidden page, should cost a phone
 * nothing at all: no timers, no canvas, no DOM. The accumulator is cleared
 * deliberately — the span we were not running for is not owed to the player
 * as loose ticks. It is an absence, and `resume()` pays it in full.
 */
function stopLoop() {
  if (rafId !== 0) cancelAnimationFrame(rafId);
  rafId = 0;
  lastFrame = 0;
  tickAccumulator = 0;
}

function loop(now) {
  rafId = 0;

  if (lastFrame === 0) lastFrame = now;
  const deltaSeconds = Math.min((now - lastFrame) / 1000, 5);
  lastFrame = now;

  if (speed > 0) {
    tickAccumulator += deltaSeconds * speed;
    const whole = Math.floor(tickAccumulator);
    if (whole > 0) {
      tickAccumulator -= whole;
      handleReport(advanceTicks(state, whole));
    }
  }

  // A flick keeps coasting even with the game paused, which is why the loop
  // asks the map whether it still needs frames rather than only asking `speed`.
  mapView?.step?.();

  paint(now);
  // Re-arm directly, keeping the frame delta continuous. Only while something
  // is actually moving: a paused game in the foreground asks for no frames.
  if (needsFrames() && document.visibilityState !== 'hidden') {
    rafId = requestAnimationFrame(loop);
  }
}

function handleReport(report) {
  for (const done of report.completed) {
    toast({
      title: 'Finished building',
      rows: [['', facilityDef(done.facilityId).name, 'pos']],
      kind: 'good',
      ms: 4000,
    });
    markDirty();
  }
  for (const up of report.upgraded) {
    toast({
      title: 'Upgrade finished',
      rows: [['', `${facilityDef(up.facilityId).name} is now level ${up.level}`, 'pos']],
      kind: 'good',
      ms: 5000,
    });
    markDirty();
  }

  for (const arrival of report.arrivals) {
    const profession = professionDef(arrival.professionId);
    toast({
      title: `${profession.icon} ${arrival.name} has arrived`,
      rows: [['', `${profession.name}, level ${arrival.level}`, 'pos']],
      kind: 'good',
      ms: 5000,
    });
    markDirty();
  }

  for (const levelUp of report.levelUps) {
    toast({
      title: `${professionDef(levelUp.professionId).icon} ${levelUp.name} is now level ${levelUp.level}`,
      rows: [['', 'Better at their trade, and room for another skill.', 'pos']],
      kind: 'good',
      ms: 6000,
      onTap: () => goToScreen('forge'),
    });
    markDirty();
  }

  for (const birth of report.births) {
    toast({
      title: `👶 ${birth.name} was born`,
      rows: [
        ['', `to ${birth.parents.join(' and ')}`, 'pos'],
        ['', `A child of the kingdom — ${Math.round((birth.heritage - 1) * 100)}% stronger than an incomer.`],
      ],
      kind: 'good',
      ms: 9000,
      onTap: () => goToScreen('people'),
    });
    markDirty();
  }

  for (const hatch of report.hatched) {
    toast({
      title: `${hatch.icon} A ${colourDef(hatch.colour).name} egg hatched`,
      rows: [
        ['', `${hatch.name} — ${creatureDef(hatch.creatureId).skill}`, 'pos'],
        ['', ROLES[hatch.role].name],
      ],
      kind: 'good',
      ms: 9000,
      onTap: () => goToScreen('watch'),
    });
    markDirty();
  }

  for (const study of report.research) {
    toast({
      title: `📜 ${study.name}`,
      rows: [
        ['The study is finished', grantedText(study.granted), 'pos'],
        ...(study.granted.unlocked.length > 0
          ? [['New in the build menu', study.granted.unlocked.map((id) => facilityDef(id).name).join(', '), 'pos']]
          : []),
      ],
      kind: 'good',
      ms: 9000,
    });
    markDirty();
  }

  for (const raid of report.raids) {
    toast({
      title: raid.won
        ? `${raid.fullMoon ? '🌕 ' : ''}Raid driven off`
        : `${raid.fullMoon ? '🌕 ' : ''}They got through`,
      rows: [
        ['', raid.band.map((monster) => monster.icon).join(' ')],
        ...(raid.wrecked.length > 0
          ? [['Damaged', raid.wrecked.map((wreck) => wreck.name).join(', '), 'neg']]
          : [['', 'Nothing was lost', 'pos']]),
        ['', 'Tap to see how it went'],
      ],
      kind: raid.won ? 'good' : 'bad',
      ms: 12000,
      onTap: () => openSheet(battleSheet(raid, closeSheet, { title: 'The raid' })),
    });
    markDirty();
  }

  if (report.fullMoons > 0) {
    toast({
      title: '🌕 A full moon rises',
      rows: [['', 'Monsters stir, and caves open in the dark']],
      kind: 'warn',
      ms: 6000,
    });
  }

  const season = seasonIndex(state);
  if (season !== lastSavedSeason) {
    lastSavedSeason = season;
    save();
  }
}

function paint(now) {
  // Never leave the player holding a facility they no longer have in stock —
  // possible after a reset, a save import, or placing the last one.
  if (mapMode.building && (state.stock[mapMode.building] ?? 0) <= 0) {
    mapMode.building = null;
    mapMode.hover = null;
    removePlaceBar();
  }

  if (hudDirty) {
    renderHud();
    hudDirty = false;
    lastHudRefresh = now;
  } else if (now - lastHudRefresh >= 1000) {
    // Once a second is as often as any of these numbers can change — one tick
    // is one second. Sixty times a second was sixty times the DOM writes for
    // the same five digits.
    refreshHudValues();
    lastHudRefresh = now;
  }

  if (screenDirty) {
    renderScreen();
    screenDirty = false;
    lastMapDraw = now;
    mapDrawnAtTick = state.time.totalTicks;
  } else if (mapView && !isSheetOpen()
      && state.time.totalTicks !== mapDrawnAtTick && now - lastMapDraw > 250) {
    // Cheap repaint so the map stays live without rebuilding the DOM — skipped
    // when nothing has ticked (a paused game draws nothing at all) and while a
    // sheet covers the map, since painting under the scrim is pure waste. Pans
    // and pinches repaint themselves and never wait for this.
    mapView.redraw();
    lastMapDraw = now;
    mapDrawnAtTick = state.time.totalTicks;
  }
}

// --- HUD -------------------------------------------------------------------

/** The five the player watches most. The rest live on the Realm screen. */
const HUD_RESOURCES = ['copper', 'wood', 'grass', 'food', 'ore'];

/**
 * Live nodes for the five resource tiles, so their numbers can be written in
 * place instead of rebuilt.
 *
 * The HUD is the only part of the page that changes on every single tick, and
 * it had the opposite problem in both directions: `refreshClock` wrote to the
 * DOM sixty times a second for a clock that moves once a second, while the
 * resource counters — the numbers a player actually watches — were only
 * rebuilt when something ELSE happened to mark the screen dirty, so at speed 1
 * they sat frozen for minutes at a time.
 */
const hudCells = new Map();
const lastWritten = new WeakMap();

/** Write only if it actually changed. The cheapest update is the one skipped. */
function setText(node, value) {
  if (!node || lastWritten.get(node) === value) return;
  lastWritten.set(node, value);
  node.textContent = value;
}

function setWidth(node, value) {
  if (!node || lastWritten.get(node) === value) return;
  lastWritten.set(node, value);
  node.style.width = value;
}

function renderHud() {
  hudCells.clear();

  mount(
    document.getElementById('hud-resources'),
    ...HUD_RESOURCES.map((id) => {
      const value = el('div.res-value');
      const cap = el('div.res-cap');
      const fill = el('div', { style: { background: 'var(--gold)' } });
      const wrap = el('div.res', {}, [
        el('div.res-icon', { text: RESOURCES[id].icon }),
        value,
        cap,
        el('div.res-bar', {}, [fill]),
      ]);
      hudCells.set(id, { wrap, value, cap, fill });
      return wrap;
    })
  );

  refreshHudValues();

  mount(
    document.getElementById('speeds'),
    ...SPEEDS.map((value) =>
      el('button.speed-btn', {
        class: value === speed ? 'active' : '',
        text: value === 0 ? '❚❚' : `${value}×`,
        'aria-label': value === 0 ? 'Pause' : `Speed ${value}x`,
        on: { click: () => setSpeed(value) },
      })
    )
  );
}

/** Everything in the HUD that moves as time passes. Runs at 1Hz. */
function refreshHudValues() {
  const caps = storageCapacity(state);
  const rates = productionRates(state);

  for (const id of HUD_RESOURCES) {
    const cell = hudCells.get(id);
    if (!cell) continue;
    const value = state.resources[id];
    const full = value >= caps[id] - 0.5;

    setText(cell.value, short(value));
    setText(cell.cap, full ? 'FULL' : `+${(rates[id] * TICKS_PER_SEASON).toFixed(0)}/s`);
    setWidth(cell.fill, `${Math.min(100, (value / caps[id]) * 100).toFixed(1)}%`);
    cell.wrap.classList.toggle('full', full);
  }

  refreshClock();
}

function refreshClock() {
  setText(document.getElementById('clock-season'), seasonName(state));
  setText(document.getElementById('clock-year'), `Year ${yearOf(state)}`);
  setText(
    document.getElementById('clock-period'),
    `${isFullMoon(state) ? '🌕' : ''} ${dayPeriod(state).name}`
  );
  setWidth(
    document.getElementById('season-bar'),
    `${((ticksIntoSeason(state) / TICKS_PER_SEASON) * 100).toFixed(1)}%`
  );
}

function setSpeed(value) {
  speed = value;
  state.settings.defaultSpeed = value;
  hudDirty = true;
  // Coming off pause has to restart the clock: the loop parked itself.
  wakeLoop();
}

// --- screens ---------------------------------------------------------------

function renderScreen() {
  const host = document.getElementById('screen');
  mapView = null;

  if (view.screen === 'people') {
    mount(host, renderPeople(state, peopleHandlers));
  } else if (view.screen === 'study') {
    mount(host, renderStudy(state, studyHandlers));
  } else if (view.screen === 'forge') {
    mount(host, renderForge(state, forgeHandlers));
  } else if (view.screen === 'watch') {
    mount(host, renderWatch(state, { ...watchHandlers, ...eggHandlers }));
  } else if (view.screen === 'realm') {
    mount(host, renderRealmSummary());
  } else {
    mount(host, renderWorld());
    // Draw immediately rather than waiting for an animation frame. A
    // backgrounded tab never gets one, and the map would stay blank.
    // Reading clientWidth here forces layout, so the canvas already knows
    // how big it is.
    mapView?.redraw();
  }

  updateTabs();
  refreshPlaceBar();
}

function renderWorld() {
  const peace = peaceLevel(state);
  const gate = nextGate(state);

  mapView = createMapView(state, {
    onTapTile: (x, y) => openSheet(tileSheet(state, x, y, closeSheet, onTileAction)),
    onStage: stageAt,
  });

  const wrapper = el('div', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('div', { style: { flex: '1' } }, [
        el('h2.screen-title.serif', { text: 'The World' }),
      ]),
      mapMode.building
        ? el('button.btn.btn-danger', {
            text: 'Cancel',
            style: { flex: 'none', padding: '0 14px' },
            on: { click: stopBuilding },
          })
        : el('button.btn.btn-primary', {
            text: '🔨 Build',
            style: { flex: 'none', padding: '0 14px' },
            on: { click: openBuildSheet },
          }),
    ]),
    el('p.screen-sub', {
      text: `${short(state.stats.tilesCleared)} tiles explored · ring ${unlockedRing(state)} open`,
    }),
    mapView,
    el('div.map-legend', {},
      ['grass', 'soil', 'swamp', 'desert', 'rock', 'snow', 'lava', 'sea'].map((id) =>
        el('span', { html: `<i style="background:${biomeColour(id)}"></i>${id}` })
      )
    ),
    el('div.card', { style: { marginTop: '10px' } }, [
      el('div.card-title', { text: 'Peace' }),
      el('div.kv', {}, [
        el('span', { text: 'Peace Level' }),
        el('b', { class: 'pos', text: `${peace.toFixed(1)}%` }),
      ]),
      el('div.peace-bar', {}, [el('div', { style: { width: `${peace}%` } })]),
      gate
        ? el('div.gate-note', {
            text: `${gate.label} opens at ${gate.peace}% peace with ${gate.townHalls} town halls.`,
          })
        : el('div.gate-note', { text: 'The whole world is open to you.' }),
    ]),
  ]);

  return wrapper;
}

const peopleHandlers = {
  onInspect(residentId) {
    const resident = state.residents.find((person) => person.id === residentId);
    if (resident) openSheet(residentSheet(state, resident, closeSheet));
  },
  onMarry(aId, bId) {
    const result = marry(state, aId, bId);
    if (!result.ok) {
      toast({ title: 'Not yet', rows: [['', result.reason]], kind: 'warn', ms: 5000 });
      return;
    }
    toast({
      title: `💍 ${result.a.name} and ${result.b.name}`,
      rows: [
        ['', 'Married. They are happier for it, and it shows in their trade.', 'pos'],
        ['', childrenNote(state)],
      ],
      kind: 'good',
      ms: 8000,
    });
    save();
    markDirty();
  },

  onRehouse() {
    const moved = rehouse(state);
    toast({
      title: moved > 0 ? `${moved} found a home` : 'No spare beds',
      rows: [['', moved > 0 ? 'They can trade again.' : 'Build another plot first.']],
      kind: moved > 0 ? 'good' : 'warn',
      ms: 4000,
    });
    markDirty();
  },
};

const studyHandlers = {
  onStartResearch(id) {
    const result = startResearch(state, id);
    if (!result.ok) {
      toast({ title: 'Cannot study that', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    toast({
      title: 'The study begins',
      rows: [['', 'It carries on while you are away.']],
      kind: 'good',
      ms: 4000,
    });
    save();
    markDirty();
  },

  onCancelResearch() {
    const result = cancelResearch(state);
    if (!result.ok) return;
    toast({
      title: 'Set aside',
      rows: [['Progress kept', `${Math.floor(result.kept)} points`, 'pos']],
      ms: 4000,
    });
    save();
    markDirty();
  },

  onPromote(index) {
    const result = promote(state, index);
    if (!result.ok) {
      toast({ title: 'Not yet', rows: [['', result.reason]], kind: 'warn', ms: 4000 });
      return;
    }
    toast({
      title: `🏛️ Town Hall raised to rank ${result.level}`,
      rows: [
        ['New studies', 'check the list below', 'pos'],
        ...(result.revealed > 0 ? [['Land revealed', `${result.revealed} tiles`, 'pos']] : []),
      ],
      kind: 'good',
      ms: 7000,
    });
    announceMapRewards(result.rewards);
    save();
    markDirty();
  },

  onSurvey() {
    const result = runSurvey(state);
    if (!result.ok) {
      toast({ title: 'Cannot survey', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    toast({
      title: `🗺️ ${result.find.name}`,
      rows: [
        ['', result.find.text],
        ['Brought back', grantedText(result.granted) || 'nothing but the map', 'pos'],
        ['Land revealed', `${result.revealed} tiles`, 'pos'],
      ],
      kind: 'good',
      ms: 8000,
    });
    announceMapRewards(result.rewards);
    save();
    markDirty();
  },
};

/** "+2 Path · +1 Sage's Tome" — what a grant actually handed over. */
function grantedText(granted) {
  const parts = [];
  for (const [facilityId, amount] of Object.entries(granted.stock ?? {})) {
    parts.push(`+${amount} ${facilityDef(facilityId).name}`);
  }
  for (const [resource, amount] of Object.entries(granted.resources ?? {})) {
    parts.push(`+${Math.round(amount)} ${RESOURCES[resource].name}`);
  }
  return parts.join(' · ');
}

function announceMapRewards(rewards = []) {
  for (const reward of rewards) {
    toast({
      title: `🧭 ${reward.name}`,
      rows: [['Mapped at last', grantedText(reward.granted), 'pos']],
      kind: 'good',
      ms: 7000,
    });
  }
}

const watchHandlers = {
  onClearNest(index) {
    const nest = nestSites(state).get(index);
    const result = clearNest(state, nest);
    if (!result.ok) {
      toast({ title: 'Cannot go', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    openSheet(battleSheet(result, closeSheet, { title: 'The nest' }));
    announceEgg(result.egg);
    save();
    markDirty();
  },

  onEnterCave() {
    const result = enterCave(state);
    if (!result.ok) {
      toast({ title: 'Cannot go in', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    openSheet(battleSheet(result, closeSheet, { title: 'The cave' }));
    announceEgg(result.egg);
    save();
    markDirty();
  },
};

/** One of them was shining. That is worth interrupting the player for. */
function announceEgg(egg) {
  if (!egg) return;
  const colour = colourDef(egg.colour);
  toast({
    title: `${colour.icon} A shining one left an egg`,
    rows: [
      ['', `${colour.name}, rank ${egg.rank}`, 'pos'],
      ['', 'Raise it in a stable or a room, and feed it carefully.'],
    ],
    kind: 'good',
    ms: 10000,
    onTap: () => goToScreen('watch'),
  });
}

const forgeHandlers = {
  onForge(defId) {
    const result = forge(state, defId);
    if (!result.ok) {
      toast({ title: 'Cannot forge that', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    toast({
      title: `🔨 ${equipmentDef(defId).name}`,
      rows: [['', 'On the rack. Give it to somebody and it starts learning.', 'pos']],
      kind: 'good',
      ms: 5000,
    });
    save();
    markDirty();
  },

  onRaise(itemId) {
    const item = state.equipment[itemId];
    const { levels, spent } = raiseAll(state, itemId);
    if (levels === 0) {
      toast({ title: 'Not yet', rows: [['', 'Not enough bronze, or not enough learned']], kind: 'warn', ms: 3500 });
      return;
    }
    toast({
      title: `${equipmentDef(item.defId).name} is now level ${item.level}`,
      rows: [
        ['Raised', `+${levels} level${levels === 1 ? '' : 's'}`, 'pos'],
        ['Bronze spent', String(spent)],
      ],
      kind: 'good',
      ms: 6000,
    });
    save();
    markDirty();
  },

  onAutoEquip(residentId) {
    const resident = state.residents.find((person) => person.id === residentId);
    if (!resident) return;
    const given = autoEquip(state, resident);
    toast({
      title: given.length > 0 ? `${resident.name} is kitted out` : 'Nothing suitable',
      rows: [[
        '',
        given.length > 0
          ? given.map((item) => equipmentDef(item.defId).name).join(', ')
          : 'Nothing on the rack they can use.',
        given.length > 0 ? 'pos' : '',
      ]],
      kind: given.length > 0 ? 'good' : 'warn',
      ms: 5000,
    });
    save();
    markDirty();
  },

  onAutoEquipAll() {
    let given = 0;
    for (const resident of state.residents) given += autoEquip(state, resident).length;
    toast({
      title: given > 0 ? `${given} pieces handed out` : 'Nothing to hand out',
      rows: [['', given > 0 ? 'Gear only learns while somebody is wearing it.' : 'Nobody can use what is left.']],
      kind: given > 0 ? 'good' : 'warn',
      ms: 5000,
    });
    save();
    markDirty();
  },

  onOpenSkills(residentId) {
    const resident = state.residents.find((person) => person.id === residentId);
    if (resident) openSheet(skillSheet(state, resident, forgeHandlers, closeSheet));
  },

  onLearn(residentId, skillId) {
    const resident = state.residents.find((person) => person.id === residentId);
    if (!resident) return;
    const result = learn(state, resident, skillId);
    if (!result.ok) {
      toast({ title: 'Cannot learn that', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    toast({
      title: `${resident.name} learned ${skillDef(skillId).name}`,
      rows: [['', skillDef(skillId).blurb, 'pos']],
      kind: 'good',
      ms: 5000,
    });
    save();
    // The sheet is still open and now out of date.
    openSheet(skillSheet(state, resident, forgeHandlers, closeSheet));
    markDirty();
  },
};

const eggHandlers = {
  onIncubate(eggId, role) {
    const result = incubate(state, eggId, role);
    if (!result.ok) {
      toast({ title: 'Not there', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    toast({
      title: `${ROLES[role].icon} Into the ${ROLES[role].name}`,
      rows: [['', 'Feed it while it grows — what you feed decides what comes out.', 'pos']],
      kind: 'good',
      ms: 6000,
    });
    save();
    markDirty();
  },

  onFeed(eggId, categoryId) {
    const result = feed(state, eggId, categoryId);
    if (!result.ok) {
      toast({ title: 'Cannot feed it', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    const willBe = creatureDef(result.willHatch);
    const over = result.band.id === 'over';
    toast({
      title: over ? 'Overfed' : `Fed ${categoryDef(categoryId).name}`,
      rows: over
        ? [['', 'It has had too much — the hatch has slipped back to Low.', 'neg'],
           ['Would hatch', `${willBe.icon} ${willBe.name}`]]
        : [['Band', result.band.name, 'pos'],
           ['Would hatch', `${willBe.icon} ${willBe.name}`]],
      kind: over ? 'warn' : 'good',
      ms: 6000,
    });
    save();
    markDirty();
  },
};

function childrenNote(state) {
  return state.townHalls.length >= 3
    ? 'A child will come in time.'
    : `Children come to a kingdom of three towns. You have ${state.townHalls.length}.`;
}

function openBuildSheet() {
  openSheet(buildSheet(state, palette(state), {
    onPick: (facilityId) => {
      mapMode.building = facilityId;
      mapMode.hover = null;
      closeSheet();
      toast({
        title: `Placing ${facilityDef(facilityId).name}`,
        rows: [['', 'Tap the map to position it. Green fits, red does not.']],
        ms: 4000,
      });
      markDirty();
    },
    onClose: closeSheet,
  }));
}

/**
 * Put the ghost somewhere, and update the bar that asks about it.
 *
 * Nothing is built here. On a phone the finger is on top of the footprint it is
 * meant to be judging, so tapping only ever POSITIONS — the confirm bar below
 * the map is what actually builds, and it can say why it will not.
 */
function stageAt(x, y) {
  mapMode.hover = { x, y };
  refreshPlaceBar();
}

function stopBuilding() {
  mapMode.building = null;
  mapMode.hover = null;
  removePlaceBar();
  markDirty();
}

let placeBar = null;

function removePlaceBar() {
  placeBar?.remove();
  placeBar = null;
}

/**
 * The bar that stands between choosing a spot and building on it.
 *
 * Lives outside the screen tree, above the tab bar, so it survives the screen
 * rebuilds that happen constantly while the clock runs.
 */
function refreshPlaceBar() {
  removePlaceBar();
  if (!mapMode.building || view.screen !== 'world') return;

  const def = facilityDef(mapMode.building);
  const spot = mapMode.hover;
  const check = spot ? canPlace(state, spot.x, spot.y, mapMode.building) : null;

  placeBar = el('div.place-bar', {}, [
    el('div.pb-text', {}, [
      el('div.pb-name', { text: `${def.icon} ${def.name}` }),
      el('div', {
        class: `pb-why${check && !check.ok ? ' neg' : ''}`,
        text: !spot
          ? 'Tap the map to choose a spot.'
          : check.ok
            ? `At ${spot.x}, ${spot.y}. Tap elsewhere to move it.`
            : check.reason,
      }),
    ]),
    el('button.btn.btn-danger', { text: 'Cancel', on: { click: stopBuilding } }),
    el('button.btn.btn-primary', {
      text: 'Build here',
      disabled: check?.ok ? undefined : 'disabled',
      on: { click: () => spot && placeHere(spot.x, spot.y) },
    }),
  ]);

  document.body.append(placeBar);
}

function placeHere(x, y) {
  const facilityId = mapMode.building;
  const result = place(state, x, y, facilityId);
  if (!result.ok) {
    toast({ title: 'Cannot build there', rows: [['', result.reason]], kind: 'bad', ms: 3000 });
    return;
  }
  state.stats.facilitiesBuilt += 1;

  // Founding a town hall claims — and reveals — new ground, which may be worth
  // a map reward.
  if (result.revealed > 0) {
    toast({
      title: 'New land claimed',
      rows: [['', `${result.revealed} tiles brought to light`, 'pos']],
      kind: 'good',
      ms: 5000,
    });
    announceMapRewards(checkMapRewards(state));
  }

  // A small confirmation you can feel, for the one action that changes the map.
  if (state.settings.vibrate !== false) globalThis.navigator?.vibrate?.(10);

  // Stay in build mode while stock lasts, so a row of paths is not ten trips
  // through the menu.
  if ((state.stock[facilityId] ?? 0) <= 0) {
    mapMode.building = null;
  }
  mapMode.hover = null;
  save();
  markDirty();
}

function onTileAction(action, x, y) {
  const result = action === 'upgrade' ? upgrade(state, x, y)
    : action === 'repair' ? repair(state, x, y)
    : remove(state, x, y);
  if (!result.ok) {
    toast({ title: 'Cannot do that', rows: [['', result.reason]], kind: 'bad', ms: 3000 });
    return;
  }
  closeSheet();
  save();
  markDirty();
}

function biomeColour(id) {
  return {
    grass: '#4a7c45', soil: '#6b5236', swamp: '#4d5f43', desert: '#c2a468',
    rock: '#7d7f8a', snow: '#cfdbe6', lava: '#8c3b2a', sea: '#2f5a7a',
  }[id];
}

function renderRealmSummary() {
  const hall = state.townHalls[0];
  const zone = zoneOf(hall.x, hall.y);

  return el('div', {}, [
    el('h2.screen-title.serif', { text: 'Your Realm' }),
    el('p.screen-sub', { text: `Monarch rank ${monarchRank(state)}` }),

    el('div.card', {}, [
      el('div.card-title', { text: 'Town Halls' }),
      ...state.townHalls.map((townHall) =>
        el('div.kv', {}, [
          el('span', { text: `${zoneLabel(zoneOf(townHall.x, townHall.y).zx, zoneOf(townHall.x, townHall.y).zy)} · level ${townHall.level}` }),
          el('b', { text: `reach ${hallRadius(townHall)} tiles` }),
        ])
      ),
      el('div.kv', {}, [
        el('span', { text: 'Territory' }),
        el('b', { class: 'pos', text: `${short(territoryTiles(state).size)} tiles` }),
      ]),
    ]),

    el('div.card', {}, [
      el('div.card-title', { text: 'The road ahead' }),
      ...ZONE_UNLOCKS.map((gate) => {
        const open = unlockedRing(state) >= gate.ring;
        return el('div.kv', {}, [
          el('span', { text: `${open ? '✓' : '○'} ${gate.label}` }),
          el('b', {
            class: open ? 'pos' : 'dim',
            text: open ? 'open' : `${gate.peace}% peace · ${gate.townHalls} halls`,
          }),
        ]);
      }),
    ]),

    el('div.card', {}, [
      el('div.card-title', { text: 'Your people' }),
      el('div.kv', {}, [
        el('span', { text: 'Residents' }),
        el('b', { class: 'pos', text: String(state.residents.length) }),
      ]),
      el('div.kv', {}, [
        el('span', { text: 'Beds' }),
        el('b', { text: `${freeBeds(state)} free of ${totalBeds(state)}` }),
      ]),
    ]),

    el('div.card', {}, [
      el('div.card-title', { text: 'Where you stand' }),
      el('div.pi-note', {
        text: `Your capital sits in ${zoneLabel(zone.zx, zone.zy)}, at rank ${townRank(state)}. `
          + `Raise its rank in the Study to open new research. Equipment, monsters and the `
          + `creatures you can raise all arrive in the milestones ahead.`,
      }),
    ]),
  ]);
}

// --- navigation ------------------------------------------------------------

const TABS = [
  { id: 'world', icon: '🗺️', label: 'World' },
  { id: 'people', icon: '👥', label: 'People' },
  { id: 'study', icon: '📜', label: 'Study' },
  { id: 'watch', icon: '⚔️', label: 'Watch' },
  { id: 'forge', icon: '🔨', label: 'Forge' },
  { id: 'realm', icon: '🏰', label: 'Realm' },
];

function buildTabs() {
  mount(
    document.getElementById('tabs'),
    ...TABS.map((tab) =>
      el('button.tab', {
        'data-tab': tab.id,
        on: { click: () => goToScreen(tab.id) },
      }, [
        el('div.tab-icon', { text: tab.icon }),
        el('div', { text: tab.label }),
      ])
    )
  );
}

function openSettings() {
  openSheet(settingsSheet(state, {
    parse: (text) => deserialize(text),
    onChanged: () => save(),
    onRefresh: () => openSettings(),
    onImport: (incoming) => {
      // The kingdom being replaced goes to the backup slot first, whatever its
      // age: an import is the one moment somebody is most likely to want the
      // previous one back five seconds later.
      try {
        globalThis.localStorage?.setItem(BACKUP_KEY, serialize(state));
      } catch { /* no room for it; the import still stands */ }

      state = incoming;
      mapMode.building = null;
      mapMode.hover = null;
      invalidateTerrain();
      centreOn(state.townHalls[0].x, state.townHalls[0].y);
      save();
      closeSheet();
      toast({
        title: 'Kingdom loaded',
        rows: [['', `${state.residents.length} people are yours now.`, 'pos']],
        kind: 'good',
        ms: 6000,
      });
      markDirty();
    },
    onReset: () => {
      mapMode.building = null;
      mapMode.hover = null;
      view.screen = 'world';
      state = newGame();
      state.stats.tilesCleared += clearTerritoryFog(state);
      invalidateTerrain();
      centreOn(state.townHalls[0].x, state.townHalls[0].y);
      save();
      markDirty();
      wakeLoop();
    },
  }, closeSheet));
}

/**
 * Two windows, one save.
 *
 * Installing the game makes this likely rather than exotic: the installed app
 * and a forgotten browser tab both hold a kingdom in memory, and whichever
 * saves last wins — silently overwriting the other. So a new window announces
 * itself, and any older one steps aside rather than fight over the file.
 */
function guardAgainstASecondWindow() {
  let channel;
  try {
    channel = new BroadcastChannel('kingdom-sim-v2');
  } catch {
    return;                       // no BroadcastChannel: nothing we can do
  }

  channel.addEventListener('message', (event) => {
    if (event.data !== 'hello' || frozen) return;
    frozen = true;
    speed = 0;
    stopLoop();
    saveToStorage(state);
    toast({
      title: 'Opened somewhere else',
      rows: [
        ['', 'This kingdom is now open in another window, so this one has stopped.', 'neg'],
        ['', 'Reload here to take it back.'],
      ],
      kind: 'warn',
      ms: 60000,
      onTap: () => globalThis.location.reload(),
    });
    markDirty();
  });

  channel.postMessage('hello');
}

/** Put a screen on. Called by ui/nav.js once the back stack agrees. */
function showScreen(id) {
  view.screen = id;
  markDirty();
}

function updateTabs() {
  for (const node of document.querySelectorAll('.tab')) {
    node.classList.toggle('active', node.dataset.tab === view.screen);
  }
}

boot();

// Exposed for debugging and verification.
globalThis.kingdom = {
  get state() { return state; },
  save: () => save(),
  advance: (ticks) => { handleReport(advanceTicks(state, ticks)); markDirty(); },
  reset: () => {
    // Map mode is module state and would otherwise survive into the new game,
    // leaving the player mid-placement of something they no longer own.
    mapMode.building = null;
    mapMode.hover = null;
    view.screen = 'world';
    state = newGame();
    state.stats.tilesCleared += clearTerritoryFog(state);
    save();
    centreOn(state.townHalls[0].x, state.townHalls[0].y);
    markDirty();
    wakeLoop();
  },
};
