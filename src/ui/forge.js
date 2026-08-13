// The Forge screen: what your people carry, and what it could become.
//
// Two jobs, matching the two things the Master Smithy does — forge a copy of a
// pattern you have studied, and raise something somebody already owns. The
// second is the one that matters: a Bronze Sword taken to level 30 outfights a
// Steel Sword left at level 1, and this screen has to make that legible rather
// than merely true.

import { el, short } from './dom.js';
import {
  smithy, forgeable, canForge, armoury, allItems, itemStats, itemPower, itemCap,
  levelCost, canRaise, pendingLevels, itemsAwaitingForge, equippedItems,
  equipExpRate,
} from '../sim/equipment.js';
import { skillList, slotsFor, slotsUsed, knows } from '../sim/skills.js';
import { statsOf } from '../sim/residents.js';
import {
  EQUIPMENT, equipmentDef, SLOT_INFO, SLOTS, RANK_INFO, compatibilityOf,
  expForNextLevel,
} from '../content/equipment.js';
import { SKILL_FAMILIES } from '../content/skills.js';
import { STATS, STAT_IDS } from '../content/stats.js';
import { RESOURCES } from '../content/resources.js';
import { professionDef } from '../content/professions.js';

function costLine(cost) {
  return Object.entries(cost)
    .map(([resource, amount]) => `${RESOURCES[resource].icon} ${short(amount)}`)
    .join('  ');
}

/** The stats an item actually carries, in a single line. */
function statLine(stats) {
  return STAT_IDS
    .filter((id) => Math.abs(stats[id] ?? 0) >= 0.5)
    .map((id) => `${STATS[id].icon} ${Math.round(stats[id])}`)
    .join('  ');
}

function rankChip(rank) {
  return el('span.rank-chip', {
    style: {
      background: RANK_INFO[rank].colour,
      color: '#12151a',
      borderRadius: '4px',
      padding: '1px 6px',
      fontWeight: '700',
      fontSize: '11px',
    },
    text: rank,
  });
}

export function renderForge(state, handlers) {
  const shop = smithy(state);
  const waiting = itemsAwaitingForge(state);

  return el('div', {}, [
    el('h2.screen-title.serif', { text: 'The Forge' }),
    el('p.screen-sub', {
      text: shop
        ? `Master Smithy level ${shop.level} · ${allItems(state).length} pieces in the kingdom`
        : 'No Master Smithy yet',
    }),

    !shop
      ? el('div.card', {}, [
          el('div.card-title', { text: 'Nothing to forge with' }),
          el('div.pi-note', {
            text: 'Study Smithing, then build a Master Smithy. Gear is forged there for '
              + 'materials and raised there for bronze — and bronze comes off the monsters.',
          }),
        ])
      : null,

    shop ? waitingCard(state, waiting, handlers) : null,
    shop ? forgeCard(state, handlers) : null,
    armouryCard(state, handlers),
    ...state.residents.map((resident) => residentGearCard(state, resident, handlers)),
  ]);
}

// ---------------------------------------------------------------------------
// What is ready to be raised
// ---------------------------------------------------------------------------

function waitingCard(state, waiting, handlers) {
  const rate = equipExpRate(state, 0);

  if (waiting.length === 0) {
    return el('div.card', {}, [
      el('div.card-title', { text: 'Nothing ready to raise' }),
      el('div.pi-note', {
        text: 'Gear learns from the trade your people do, so it improves whether or not '
          + 'you are watching. Come back after a night away and there will be work here.',
      }),
    ]);
  }

  return el('div.card', { style: { borderColor: 'var(--gold)' } }, [
    el('div.card-title', {
      style: { color: 'var(--gold)' },
      text: `${waiting.length} ready to be raised`,
    }),
    el('div.pi-note', {
      text: 'Experience banked while you were away. Bronze turns it into levels.',
    }),
    ...waiting.slice(0, 8).map((entry) => raiseRow(state, entry.item, entry.levels, handlers)),
  ]);
}

function raiseRow(state, item, levels, handlers) {
  const def = equipmentDef(item.defId);
  const check = canRaise(state, item.id);
  const owner = item.owner === null
    ? null
    : state.residents.find((resident) => resident.id === item.owner);

  return el('button.palette-item', {
    style: { background: 'transparent' },
    disabled: check.ok ? undefined : 'disabled',
    on: { click: () => handlers.onRaise(item.id) },
  }, [
    el('div.pi-icon', { text: def.icon }),
    el('div.pi-body', {}, [
      el('div.pi-name', { text: `${def.name}  ·  level ${item.level} of ${itemCap(item)}` }),
      el('div.pi-note', {
        text: owner ? `worn by ${owner.name}` : 'on the rack',
      }),
      el('div.pi-note', {
        class: 'pos',
        text: `+${levels} level${levels === 1 ? '' : 's'} waiting`,
      }),
      !check.ok ? el('div.pi-note', { class: 'neg', text: check.reason }) : null,
    ]),
    el('div.pi-cost', {
      class: check.ok ? '' : 'muted',
      text: `${RESOURCES.bronze.icon} ${short(levelCost(state, item))}`,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Forging new pieces
// ---------------------------------------------------------------------------

function forgeCard(state, handlers) {
  const patterns = forgeable(state);

  return el('div.card', {}, [
    el('div.card-title', { text: '🔨 Forge a piece' }),
    patterns.length === 0
      ? el('div.pi-note', {
          text: 'No patterns yet. The Equipment studies teach them — that is what Samples are for.',
        })
      : el('div.pi-note', {
          text: 'A cheap piece raised far beats a grand one left alone: an F-rank costs '
            + 'almost nothing per level, and its growth never stops.',
        }),
    ...patterns.map((def) => forgeRow(state, def, handlers)),
  ]);
}

function forgeRow(state, def, handlers) {
  const check = canForge(state, def.id);
  const sample = { defId: def.id, level: 1 };

  return el('button.palette-item', {
    style: { background: 'transparent' },
    disabled: check.ok ? undefined : 'disabled',
    on: { click: () => handlers.onForge(def.id) },
  }, [
    el('div.pi-icon', { text: def.icon }),
    el('div.pi-body', {}, [
      el('div.pi-name', {}, [
        `${def.name}  `,
        rankChip(def.rank),
        `  ${SLOT_INFO[def.slot].name}`,
      ]),
      el('div.pi-note', { text: statLine(itemStats(sample)) }),
      el('div.pi-note', {
        class: 'pos',
        text: `+${def.levelBonus} a level, to level ${RANK_INFO[def.rank].cap}`,
      }),
    ]),
    el('div.pi-cost', {
      class: check.ok ? '' : 'muted',
      text: costLine(def.craft),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// The rack
// ---------------------------------------------------------------------------

function armouryCard(state, handlers) {
  const spare = armoury(state);
  if (spare.length === 0) return null;

  return el('div.card', {}, [
    el('div.card-title', { text: `On the rack · ${spare.length}` }),
    el('div.pi-note', { text: 'Nobody is wearing these, so nobody is learning from them.' }),
    ...spare.slice(0, 12).map((item) => {
      const def = equipmentDef(item.defId);
      return el('div.kv', {}, [
        el('span', { text: `${def.icon} ${def.name} · level ${item.level}` }),
        el('b', { text: statLine(itemStats(item)) }),
      ]);
    }),
    el('button.btn', {
      text: 'Hand it all out',
      style: { width: '100%', marginTop: '8px' },
      on: { click: handlers.onAutoEquipAll },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// One person's kit
// ---------------------------------------------------------------------------

function residentGearCard(state, resident, handlers) {
  const profession = professionDef(resident.professionId);
  const worn = equippedItems(state, resident);

  return el('div.card', {}, [
    el('div.card-title', {
      text: `${profession.icon} ${resident.name} · ${profession.name} ${resident.level}`,
    }),

    ...SLOTS.map((slot) => {
      const entry = worn.find((w) => w.slot === slot);
      if (!entry) {
        return el('div.kv', {}, [
          el('span', { text: `${SLOT_INFO[slot].icon} ${SLOT_INFO[slot].name}` }),
          el('b', { class: 'muted', text: 'empty' }),
        ]);
      }
      const compat = compatibilityOf(resident.professionId, entry.def.kind);
      return el('div.kv', {}, [
        el('span', { text: `${entry.def.icon} ${entry.def.name} · L${entry.item.level}` }),
        el('b', {
          class: compat.factor >= 1 ? 'pos' : compat.factor <= 0.4 ? 'neg' : '',
          text: compat.label,
        }),
      ]);
    }),

    el('div.kv', {}, [
      el('span', { text: 'Skills' }),
      el('b', { text: `${slotsUsed(resident)} of ${slotsFor(resident)}` }),
    ]),
    resident.skills.length > 0
      ? el('div.pi-note', {
          text: resident.skills.map((id) => skillNameOf(state, resident, id)).join(' · '),
        })
      : null,

    el('div.btn-row', {}, [
      el('button.btn', {
        text: 'Kit them out',
        on: { click: () => handlers.onAutoEquip(resident.id) },
      }),
      el('button.btn', {
        text: 'Teach a skill',
        on: { click: () => handlers.onOpenSkills(resident.id) },
      }),
    ]),
  ]);
}

function skillNameOf(state, resident, id) {
  return skillList(state, resident).find((entry) => entry.def.id === id)?.def.name ?? id;
}

// ---------------------------------------------------------------------------
// The skill sheet
// ---------------------------------------------------------------------------

const SKILL_NOTE = {
  known: 'known',
  ready: null,
  poor: 'not enough copper',
  level: null,
  wrongTrade: 'not for their trade',
  full: 'no room for another',
};

export function skillSheet(state, resident, handlers, onClose) {
  const profession = professionDef(resident.professionId);
  const entries = skillList(state, resident);
  const order = { ready: 0, poor: 1, full: 2, level: 3, wrongTrade: 4, known: 5 };

  return el('div', {}, [
    el('h3.sheet-title', { text: `${profession.icon} ${resident.name}` }),
    el('p.sheet-sub', {
      text: `${slotsUsed(resident)} of ${slotsFor(resident)} skills · `
        + `${RESOURCES.copper.icon} ${short(state.resources.copper)} in the treasury`,
    }),

    ...SKILL_FAMILIES.map((family) => {
      const forFamily = entries
        .filter((entry) => entry.def.family === family.id)
        .sort((a, b) => (order[a.status] - order[b.status]) || (a.def.cost - b.def.cost));

      return el('div.card', {}, [
        el('div.card-title', { text: `${family.icon} ${family.name}` }),
        el('div.pi-note', { text: family.blurb }),
        ...forFamily.map((entry) => skillRow(state, resident, entry, handlers)),
      ]);
    }),

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', { text: 'Close', on: { click: onClose } }),
    ]),
  ]);
}

function skillRow(state, resident, entry, handlers) {
  const { def, status } = entry;
  const note = status === 'level' ? `needs level ${def.needs}` : SKILL_NOTE[status];

  return el('button.palette-item', {
    style: { background: 'transparent', opacity: status === 'known' ? '0.55' : '1' },
    disabled: status === 'ready' ? undefined : 'disabled',
    on: { click: () => handlers.onLearn(resident.id, def.id) },
  }, [
    el('div.pi-icon', { text: status === 'known' ? '✓' : def.icon }),
    el('div.pi-body', {}, [
      el('div.pi-name', { text: def.name }),
      el('div.pi-note', { text: def.blurb }),
      note ? el('div.pi-note', { class: status === 'poor' ? 'neg' : '', text: note }) : null,
    ]),
    el('div.pi-cost', {
      class: status === 'ready' ? '' : 'muted',
      text: status === 'known' ? '' : `${RESOURCES.copper.icon} ${short(def.cost)}`,
    }),
  ]);
}
