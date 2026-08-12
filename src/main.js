// Wiring: the game loop, screen routing, input, autosave.
//
// The only module allowed to touch both the simulation and the DOM.

import {
  newGame, loadFromStorage, saveToStorage,
  seasonIndex, yearOf, seasonName, ticksIntoSeason,
  dayPeriod, dayNumber, isFullMoon,
} from './state.js';
import { advanceTicks } from './sim/tick.js';
import {
  peaceLevel, unlockedRing, nextGate, monarchRank, hallRadius,
  clearTerritoryFog, territoryTiles, zoneLabel, zoneOf,
} from './sim/world.js';
import { el, mount, short } from './ui/dom.js';
import { createMapView, tileSheet, centreOn } from './ui/map.js';
import { openSheet, closeSheet, toast } from './ui/panels.js';
import { TICKS_PER_SEASON, SPEEDS, ZONE_UNLOCKS } from './content/config.js';

let state = null;
let speed = 1;
let mapView = null;

const view = { screen: 'world' };

let screenDirty = true;
let hudDirty = true;
let rendering = false;

function markDirty() {
  screenDirty = true;
  hudDirty = true;
  if (!rendering && state) render(performance.now());
}

// --- boot ------------------------------------------------------------------

function boot() {
  try {
    state = loadFromStorage();
  } catch (err) {
    console.warn('Could not read the save:', err.message);
    state = null;
  }

  if (!state) {
    state = newGame();
    // You start knowing your own land.
    state.stats.tilesCleared += clearTerritoryFog(state);
    saveToStorage(state);
  }

  speed = state.settings.defaultSpeed ?? 1;

  buildTabs();
  markDirty();
  // Paint before the first animation frame: a backgrounded tab never gets one.
  render(performance.now());
  requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveToStorage(state);
  });
  window.addEventListener('pagehide', () => saveToStorage(state));
}

// --- the loop --------------------------------------------------------------

let lastFrame = 0;
let tickAccumulator = 0;
let lastMapDraw = 0;
let lastSavedSeason = 0;

function loop(now) {
  requestAnimationFrame(loop);

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

  render(now);
}

function handleReport(report) {
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
    saveToStorage(state);
  }
}

function render(now) {
  rendering = true;
  try {
    paint(now);
  } finally {
    rendering = false;
  }
}

function paint(now) {
  if (hudDirty) {
    renderHud();
    hudDirty = false;
  } else {
    refreshClock();
  }

  if (screenDirty) {
    renderScreen();
    screenDirty = false;
    lastMapDraw = now;
  } else if (mapView && now - lastMapDraw > 250) {
    // Cheap repaint so the map stays live without rebuilding the DOM.
    mapView.redraw();
    lastMapDraw = now;
  }
}

// --- HUD -------------------------------------------------------------------

function renderHud() {
  const peace = peaceLevel(state);
  const cells = [
    { icon: '🕊️', value: `${peace.toFixed(0)}%`, label: 'peace', cls: 'gold' },
    { icon: '🏰', value: String(state.townHalls.length), label: 'halls', cls: 'materials' },
    { icon: '👑', value: monarchRank(state), label: 'rank', cls: 'renown' },
    { icon: '🗺️', value: short(state.stats.tilesCleared), label: 'explored', cls: 'food' },
    { icon: '🌕', value: isFullMoon(state) ? 'full' : `${dayNumber(state) % 10}`, label: 'moon', cls: 'people' },
  ];

  mount(
    document.getElementById('hud-resources'),
    ...cells.map((cell) =>
      el(`div.res.${cell.cls}`, {}, [
        el('div.res-icon', { text: cell.icon }),
        el('div.res-value', { text: cell.value }),
        el('div.res-cap', { text: cell.label }),
      ])
    )
  );

  refreshClock();

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

function refreshClock() {
  document.getElementById('clock-season').textContent = seasonName(state);
  document.getElementById('clock-year').textContent = `Year ${yearOf(state)}`;
  document.getElementById('clock-period').textContent =
    `${isFullMoon(state) ? '🌕' : ''} ${dayPeriod(state).name}`;
  document.getElementById('season-bar').style.width =
    `${(ticksIntoSeason(state) / TICKS_PER_SEASON) * 100}%`;
}

function setSpeed(value) {
  speed = value;
  state.settings.defaultSpeed = value;
  hudDirty = true;
}

// --- screens ---------------------------------------------------------------

function renderScreen() {
  const host = document.getElementById('screen');
  mapView = null;

  if (view.screen === 'realm') {
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
}

function renderWorld() {
  const peace = peaceLevel(state);
  const gate = nextGate(state);

  mapView = createMapView(state, {
    onTapTile: (x, y) => openSheet(tileSheet(state, x, y, closeSheet)),
  });

  const wrapper = el('div', {}, [
    el('h2.screen-title.serif', { text: 'The World' }),
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
      el('div.card-title', { text: 'Where you stand' }),
      el('div.pi-note', {
        text: `Your capital sits in ${zoneLabel(zone.zx, zone.zy)}. Everything else — resources, `
          + `residents, research, monsters — arrives in the milestones ahead.`,
      }),
    ]),
  ]);
}

// --- navigation ------------------------------------------------------------

const TABS = [
  { id: 'world', icon: '🗺️', label: 'World' },
  { id: 'realm', icon: '🏰', label: 'Realm' },
];

function buildTabs() {
  mount(
    document.getElementById('tabs'),
    ...TABS.map((tab) =>
      el('button.tab', {
        'data-tab': tab.id,
        on: { click: () => { view.screen = tab.id; markDirty(); } },
      }, [
        el('div.tab-icon', { text: tab.icon }),
        el('div', { text: tab.label }),
      ])
    )
  );
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
  save: () => saveToStorage(state),
  advance: (ticks) => { handleReport(advanceTicks(state, ticks)); markDirty(); },
  reset: () => {
    state = newGame();
    state.stats.tilesCleared += clearTerritoryFog(state);
    saveToStorage(state);
    centreOn(state.townHalls[0].x, state.townHalls[0].y);
    markDirty();
  },
};
