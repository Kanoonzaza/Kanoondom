// The people screen: who lives here, where, and what they are worth.

import { el, short } from './dom.js';
import {
  homes, freeBeds, totalBeds, statsOf, shopIncomeOf, activityOf, rehouse,
} from '../sim/residents.js';
import { professionDef } from '../content/professions.js';
import { facilityDef } from '../content/facilities.js';
import { auraSources } from '../sim/aura.js';
import { equippedItems } from '../sim/equipment.js';
import { compatibilityOf } from '../content/equipment.js';
import { SKILLS } from '../content/skills.js';
import { tileX, tileY, zoneLabel, zoneOf } from '../sim/world.js';
import { STATS, STAT_IDS } from '../content/stats.js';
import { dayPeriod } from '../state.js';
import { TICKS_PER_SEASON } from '../content/config.js';

/** The stats worth showing at a glance. The full twelve live in the detail sheet. */
const HEADLINE_STATS = ['hp', 'atk', 'def', 'int', 'gather', 'heart'];

export function renderPeople(state, handlers) {
  const houses = homes(state);
  const homeless = state.residents.filter((resident) => resident.home === null);
  const period = dayPeriod(state);

  return el('div', {}, [
    el('h2.screen-title.serif', { text: 'Your People' }),
    el('p.screen-sub', {
      text: `${state.residents.length} living here · ${freeBeds(state)} of ${totalBeds(state)} beds free`,
    }),

    totalBeds(state) === 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'Nobody lives here yet' }),
          el('div.pi-note', {
            text: 'Build a plot and people will come across the sea to fill it. '
              + 'The more land you have brought to light, the more of them arrive.',
          }),
        ])
      : null,

    homeless.length > 0
      ? el('div.card', { style: { borderColor: 'var(--frontier)' } }, [
          el('div.card-title', {
            style: { color: 'var(--frontier)' },
            text: `${homeless.length} without a roof`,
          }),
          el('div.pi-note', {
            text: 'They are still here and still yours — they simply cannot trade until they have somewhere to live.',
          }),
          el('button.btn', {
            text: 'Find them beds',
            style: { width: '100%', marginTop: '8px' },
            on: { click: handlers.onRehouse },
          }),
        ])
      : null,

    ...houses.map((home) => homeCard(state, home, period, handlers)),
  ]);
}

function homeCard(state, home, period, handlers) {
  const zone = zoneOf(home.x, home.y);

  return el('div.card', {}, [
    el('div.card-title', {
      text: `${home.def.icon} ${home.def.name} · ${zoneLabel(zone.zx, zone.zy)}`,
    }),
    el('div.kv', {}, [
      el('span', { text: 'Beds' }),
      el('b', { text: `${home.occupants.length} of ${home.beds} taken` }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Shelves' }),
      el('b', { class: 'pos', text: String(home.shelves) }),
    ]),

    ...home.occupants.map((resident) => residentRow(state, resident, period, handlers)),

    home.occupants.length === 0
      ? el('div.pi-note', { text: 'Empty. Somebody will come.' })
      : null,
  ]);
}

function residentRow(state, resident, period, handlers) {
  const profession = professionDef(resident.professionId);
  const income = shopIncomeOf(state, resident) * TICKS_PER_SEASON;

  return el('button.palette-item', {
    style: { background: 'transparent' },
    on: { click: () => handlers.onInspect(resident.id) },
  }, [
    el('div.pi-icon', { text: profession.icon }),
    el('div.pi-body', {}, [
      el('div.pi-name', { text: `${resident.name} · ${profession.name} ${resident.level}` }),
      el('div.pi-note', { text: activityOf(state, resident, period) }),
    ]),
    el('div.pi-cost', {
      class: income > 0 ? 'pi-gain' : 'muted',
      text: income > 0 ? `+${income.toFixed(1)}/s` : profession.fighter ? 'fighter' : '—',
    }),
  ]);
}

/** The full picture of one resident, including where their strength comes from. */
export function residentSheet(state, resident, onClose) {
  const profession = professionDef(resident.professionId);
  const stats = statsOf(state, resident);
  const income = shopIncomeOf(state, resident) * TICKS_PER_SEASON;

  const worn = equippedItems(state, resident);
  const home = resident.home === null ? null : state.world.facilities[resident.home];
  const reaching = resident.home === null
    ? []
    : auraSources(state, tileX(resident.home), tileY(resident.home));

  return el('div', {}, [
    el('h3.sheet-title', { text: `${profession.icon} ${resident.name}` }),
    el('p.sheet-sub', { text: `${profession.name} · level ${resident.level}` }),

    el('div.card', {}, [
      el('div.card-title', { text: 'Trade' }),
      el('div.pi-note', { text: profession.blurb }),
      profession.shop
        ? el('div.kv', {}, [
            el('span', { text: `${profession.shop.icon} ${profession.shop.name}` }),
            el('b', { class: 'pos', text: `+${income.toFixed(1)} copper/season` }),
          ])
        : el('div.kv', {}, [
            el('span', { text: 'Shop' }),
            el('b', { class: 'muted', text: 'opens none' }),
          ]),
      home
        ? el('div.kv', {}, [
            el('span', { text: 'Home' }),
            el('b', { text: `${facilityDef(home.id).name}, ${facilityDef(home.id).housing.shelves} shelves` }),
          ])
        : el('div.kv', {}, [
            el('span', { class: 'neg', text: 'Home' }),
            el('b', { class: 'neg', text: 'none — cannot trade' }),
          ]),
    ]),

    el('div.card', {}, [
      el('div.card-title', { text: 'Stats' }),
      ...STAT_IDS.map((id) =>
        el('div.kv', {}, [
          el('span', { text: `${STATS[id].icon} ${STATS[id].name}` }),
          el('b', {
            class: stats[id] > resident.baseStats[id] ? 'pos' : '',
            text: stats[id] > resident.baseStats[id]
              ? `${Math.round(stats[id])}  (${Math.round(resident.baseStats[id])} + ${Math.round(stats[id] - resident.baseStats[id])})`
              : String(Math.round(stats[id])),
          }),
        ])
      ),
    ]),

    // What they carry and what they know. Both travel with them, unlike the
    // aura below, so they are worth showing separately.
    worn.length > 0 || resident.skills?.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'What they carry' }),
          ...worn.map((entry) => {
            const compat = compatibilityOf(resident.professionId, entry.def.kind);
            return el('div.kv', {}, [
              el('span', { text: `${entry.def.icon} ${entry.def.name} · L${entry.item.level}` }),
              el('b', {
                class: compat.factor >= 1 ? 'pos' : compat.factor <= 0.4 ? 'neg' : '',
                text: compat.label,
              }),
            ]);
          }),
          ...(resident.skills ?? []).map((id) =>
            el('div.kv', {}, [
              el('span', { text: `${SKILLS[id].icon} ${SKILLS[id].name}` }),
              el('b', { class: 'pos', text: 'learned' }),
            ])
          ),
          worn.length === 0
            ? el('div.pi-note', { text: 'Carrying nothing. The Forge can change that.' })
            : null,
        ])
      : null,

    // The point of the whole aura system: a resident is largely a product of
    // where they live, and this is where the player can see that.
    reaching.length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'What their home stands near' }),
          ...reaching.map((source) =>
            el('div.kv', {}, [
              el('span', { text: `${source.icon} ${source.name}` }),
              el('b', {
                class: 'pos',
                text: Object.entries(source.stats)
                  .map(([stat, value]) => `${stat} +${Math.round(value)}`)
                  .join(', '),
              }),
            ])
          ),
          el('div.pi-note', {
            text: 'Build near your people and they grow stronger for it.',
          }),
        ])
      : null,

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', { text: 'Close', on: { click: onClose } }),
    ]),
  ]);
}
