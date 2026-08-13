// The welcome-back panel.
//
// This is the single most important screen in the game, because it is the one
// that has to make an absence feel like it was WORTH something. Everything
// else is built to make the promise true; this is where the player is told it
// was kept.
//
// Three jobs, in order:
//
//   1. Say what you gained, plainly.
//   2. Say what SPILLED, and when it started spilling — "your granaries filled
//      four hours ago" is the only thing that ever teaches a player to build
//      more storage. A number they cannot act on is decoration.
//   3. Say, out loud, that nothing was taken. Not as flavour: the fear that an
//      idle game punishes you for closing it is the thing this design exists
//      to answer, and answering it in words costs one line.

import { el, short, duration } from './dom.js';
import { itemsAwaitingForge } from '../sim/equipment.js';
import { graceRemaining } from '../sim/raids.js';
import { storageCapacity } from '../sim/economy.js';
import { professionDef } from '../content/professions.js';
import { equipmentDef } from '../content/equipment.js';
import { facilityDef } from '../content/facilities.js';
import { RESOURCES, RESOURCE_IDS } from '../content/resources.js';

/** Is any of this worth putting a panel in front of somebody? */
export function worthShowing(welcome) {
  if (!welcome) return false;
  return RESOURCE_IDS.some((id) => (welcome.gained[id] ?? 0) >= 1)
    || welcome.research.length > 0
    || welcome.levelUps.length > 0
    || welcome.arrivals.length > 0;
}

export function welcomeSheet(state, welcome, handlers, onClose) {
  const caps = storageCapacity(state);
  const gained = RESOURCE_IDS.filter((id) => (welcome.gained[id] ?? 0) >= 1);
  const spilled = RESOURCE_IDS.filter((id) => (welcome.wasted[id] ?? 0) >= 1);
  const waiting = itemsAwaitingForge(state);
  const newcomers = new Set(welcome.arrivals.map((arrival) => arrival.id));
  const grown = welcome.levelUps.filter((entry) => !newcomers.has(entry.id));

  return el('div', {}, [
    el('h3.sheet-title', { text: 'While you were away' }),
    el('p.sheet-sub', {
      text: welcome.capped
        ? `${duration(welcome.awaySeconds)} — the first ${duration(welcome.simulatedSeconds)} of it counted`
        : duration(welcome.awaySeconds),
    }),

    // --- what came in ------------------------------------------------------
    el('div.card', {}, [
      el('div.card-title', { text: 'Your stores' }),
      ...gained.map((id) => {
        const full = state.resources[id] >= caps[id] - 0.5;
        return el('div.kv', {}, [
          el('span', { text: `${RESOURCES[id].icon} ${RESOURCES[id].name}` }),
          el('b', {
            class: full ? 'neg' : 'pos',
            text: `+${short(welcome.gained[id])}${full ? ' · FULL' : ''}`,
          }),
        ]);
      }),
      gained.length === 0
        ? el('div.pi-note', { text: 'The realm ticked over quietly.' })
        : null,
    ]),

    // --- what was lost to a full store -------------------------------------
    // The teaching moment. Not a scolding: an absence that overflowed still
    // gained everything up to the cap, and the fix is a building.
    spilled.length > 0
      ? el('div.card', { style: { borderColor: 'var(--frontier)' } }, [
          el('div.card-title', {
            style: { color: 'var(--frontier)' },
            text: 'Ran out of room',
          }),
          ...spilled.map((id) => {
            const ago = welcome.filledSecondsAgo[id];
            return el('div.kv', {}, [
              el('span', { text: `${RESOURCES[id].icon} ${RESOURCES[id].name}` }),
              el('b', {
                class: 'neg',
                text: ago === null || ago === undefined
                  ? `${short(welcome.wasted[id])} wasted`
                  : `filled ${duration(ago)} ago`,
              }),
            ]);
          }),
          el('div.pi-note', {
            text: 'Storage is the only thing capping what an absence is worth. '
              + 'Build more of it and the same night away is worth more.',
          }),
        ])
      : null,

    // --- what finished on its own ------------------------------------------
    welcome.research.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: '📜 Studies finished' }),
          ...welcome.research.map((study) =>
            el('div.kv', {}, [
              el('span', { text: study.name }),
              el('b', { class: 'pos', text: 'done' }),
            ])
          ),
        ])
      : null,

    // Somebody who arrived AND levelled during the same absence is listed once,
    // under New faces — "here is a stranger" and "the stranger got better" in
    // two separate cards reads as two people.
    grown.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'Your people grew' }),
          ...grown.slice(0, 10).map((entry) =>
            el('div.kv', {}, [
              el('span', {
                text: `${professionDef(entry.professionId).icon} ${entry.name}`,
              }),
              el('b', { class: 'pos', text: `now level ${entry.level}` }),
            ])
          ),
          el('div.pi-note', {
            text: 'A higher level means room for another skill.',
          }),
        ])
      : null,

    welcome.arrivals.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'New faces' }),
          ...welcome.arrivals.map((arrival) =>
            el('div.kv', {}, [
              el('span', {
                text: `${professionDef(arrival.professionId).icon} ${arrival.name}`,
              }),
              el('b', { text: professionDef(arrival.professionId).name }),
            ])
          ),
        ])
      : null,

    waiting.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: '🔨 Waiting at the forge' }),
          ...waiting.slice(0, 5).map((entry) =>
            el('div.kv', {}, [
              el('span', { text: equipmentDef(entry.item.defId).name }),
              el('b', { class: 'pos', text: `+${entry.levels} level${entry.levels === 1 ? '' : 's'}` }),
            ])
          ),
          el('div.pi-note', { text: 'Gear learned from your town while you were gone. Bronze turns it into levels.' }),
          el('button.btn', {
            text: 'Go to the Forge',
            style: { width: '100%', marginTop: '8px' },
            on: { click: () => { onClose(); handlers.onGoTo('forge'); } },
          }),
        ])
      : null,

    // --- the promise, in words ---------------------------------------------
    el('div.card', {}, [
      el('div.card-title', { text: 'Nothing was taken' }),
      el('div.kv', {}, [
        el('span', { text: 'Attacks while you were gone' }),
        el('b', { class: 'pos', text: welcome.raids.length === 0 ? 'none' : String(welcome.raids.length) }),
      ]),
      welcome.threatGained > 0
        ? el('div.kv', {}, [
            el('span', { text: 'They did gather, though' }),
            el('b', { text: `threat ${Math.round(welcome.threat)}` }),
          ])
        : null,
      graceRemaining(state) > 0
        ? el('div.kv', {}, [
            el('span', { text: 'Quiet for' }),
            el('b', { class: 'pos', text: duration(graceRemaining(state)) }),
          ])
        : null,
      el('div.kv', {}, [
        el('span', { text: 'The calendar' }),
        el('b', { text: 'did not move' }),
      ]),
      el('div.pi-note', {
        text: 'Nothing drains here. Time away fills your stores; it never empties them, '
          + 'and it never ages your kingdom.',
      }),
    ]),

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', { text: 'Good', on: { click: onClose } }),
    ]),
  ]);
}
