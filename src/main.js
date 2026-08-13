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
import { el, mount, short, duration } from './ui/dom.js';
import { createMapView, tileSheet, buildSheet, centreOn, mapMode } from './ui/map.js';
import { openSheet, closeSheet, toast } from './ui/panels.js';
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
import { clearNest, enterCave, graceRemaining } from './sim/raids.js';
import { nestSites, threatLabel } from './sim/monsters.js';
import { rehouse, freeBeds, totalBeds } from './sim/residents.js';
import { professionDef } from './content/professions.js';
import { TICKS_PER_SEASON, SPEEDS, ZONE_UNLOCKS } from './content/config.js';
import { catchUp } from './sim/offline.js';
import { place, remove, upgrade, repair, palette, allFacilities } from './sim/facilities.js';
import { productionRates, storageCapacity, fullStores } from './sim/economy.js';
import { RESOURCES, RESOURCE_IDS } from './content/resources.js';
import { facilityDef } from './content/facilities.js';

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

  // Bring the kingdom up to the present before anything is drawn.
  let welcome = null;
  try {
    welcome = catchUp(state);
  } catch (err) {
    console.error('Offline catch-up failed:', err);
  }
  // The welcome-back panel replaces the old stack of toasts. Four toasts
  // fighting for the same corner is not a summary — and the one thing that
  // actually teaches (which store filled, and when) was the easiest to miss.
  if (worthShowing(welcome)) {
    openSheet(welcomeSheet(state, welcome, {
      onGoTo: (screen) => { view.screen = screen; markDirty(); },
    }, closeSheet));
  }

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
      onTap: () => { view.screen = 'forge'; markDirty(); },
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
  // Never leave the player holding a facility they no longer have in stock —
  // possible after a reset, a save import, or placing the last one.
  if (mapMode.building && (state.stock[mapMode.building] ?? 0) <= 0) {
    mapMode.building = null;
    mapMode.hover = null;
  }

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

/** The five the player watches most. The rest live on the Realm screen. */
const HUD_RESOURCES = ['copper', 'wood', 'grass', 'food', 'ore'];

function renderHud() {
  const caps = storageCapacity(state);
  const rates = productionRates(state);

  mount(
    document.getElementById('hud-resources'),
    ...HUD_RESOURCES.map((id) => {
      const value = state.resources[id];
      const full = value >= caps[id] - 0.5;
      const perSeason = rates[id] * TICKS_PER_SEASON;
      return el('div.res', { class: full ? 'full' : '' }, [
        el('div.res-icon', { text: RESOURCES[id].icon }),
        el('div.res-value', { text: short(value) }),
        el('div.res-cap', { text: full ? 'FULL' : `+${perSeason.toFixed(0)}/s` }),
        el('div.res-bar', {}, [
          el('div', {
            style: { width: `${Math.min(100, (value / caps[id]) * 100)}%`, background: 'var(--gold)' },
          }),
        ]),
      ]);
    })
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

  if (view.screen === 'people') {
    mount(host, renderPeople(state, peopleHandlers));
  } else if (view.screen === 'study') {
    mount(host, renderStudy(state, studyHandlers));
  } else if (view.screen === 'forge') {
    mount(host, renderForge(state, forgeHandlers));
  } else if (view.screen === 'watch') {
    mount(host, renderWatch(state, watchHandlers));
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
}

function renderWorld() {
  const peace = peaceLevel(state);
  const gate = nextGate(state);

  mapView = createMapView(state, {
    onTapTile: (x, y) => openSheet(tileSheet(state, x, y, closeSheet, onTileAction)),
    onPlaceAt: placeHere,
  });

  const wrapper = el('div', {}, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('div', { style: { flex: '1' } }, [
        el('h2.screen-title.serif', { text: 'The World' }),
      ]),
      mapMode.building
        ? el('button.btn.btn-danger', {
            text: 'Cancel',
            style: { flex: 'none', padding: '0 14px', minHeight: '38px' },
            on: { click: () => { mapMode.building = null; mapMode.hover = null; markDirty(); } },
          })
        : el('button.btn.btn-primary', {
            text: '🔨 Build',
            style: { flex: 'none', padding: '0 14px', minHeight: '38px' },
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
    saveToStorage(state);
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
    saveToStorage(state);
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
    saveToStorage(state);
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
    saveToStorage(state);
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
    saveToStorage(state);
    markDirty();
  },

  onEnterCave() {
    const result = enterCave(state);
    if (!result.ok) {
      toast({ title: 'Cannot go in', rows: [['', result.reason]], kind: 'bad', ms: 3500 });
      return;
    }
    openSheet(battleSheet(result, closeSheet, { title: 'The cave' }));
    saveToStorage(state);
    markDirty();
  },
};

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
    saveToStorage(state);
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
    saveToStorage(state);
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
    saveToStorage(state);
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
    saveToStorage(state);
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
    saveToStorage(state);
    // The sheet is still open and now out of date.
    openSheet(skillSheet(state, resident, forgeHandlers, closeSheet));
    markDirty();
  },
};

function openBuildSheet() {
  openSheet(buildSheet(state, palette(state), {
    onPick: (facilityId) => {
      mapMode.building = facilityId;
      mapMode.hover = null;
      closeSheet();
      toast({
        title: `Placing ${facilityDef(facilityId).name}`,
        rows: [['', 'Tap the map. Green fits, red does not.']],
        ms: 4000,
      });
      markDirty();
    },
    onClose: closeSheet,
  }));
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

  // Stay in build mode while stock lasts, so a row of paths is not ten trips
  // through the menu.
  if ((state.stock[facilityId] ?? 0) <= 0) {
    mapMode.building = null;
    mapMode.hover = null;
  }
  saveToStorage(state);
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
  saveToStorage(state);
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
    // Map mode is module state and would otherwise survive into the new game,
    // leaving the player mid-placement of something they no longer own.
    mapMode.building = null;
    mapMode.hover = null;
    view.screen = 'world';
    state = newGame();
    state.stats.tilesCleared += clearTerritoryFog(state);
    saveToStorage(state);
    centreOn(state.townHalls[0].x, state.townHalls[0].y);
    markDirty();
  },
};
