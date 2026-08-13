// Eggs and allies, shown on the Watch screen because that is where fighting
// lives and fighting is the only thing an ally does.
//
// The screen has one job the simulation cannot do for the player: make the
// FEEDING WINDOW visible. An egg's band is decided by how much of one thing it
// has been fed, and going one feed too far throws it back to Low. A player who
// cannot see where the edge is will hit it, and will read that as the game
// cheating rather than as a decision they got wrong.

import { el, short, duration } from './dom.js';
import {
  waitingEggs, incubating, incubatorFor, incubatorCapacity, bandOf, nextBandAt,
  dominantCategory, creatureFor, feedCost, canFeed, canIncubate, alliesOf, totalFed,
} from '../sim/creatures.js';
import {
  EGG_COLOURS, colourDef, EGG_CATEGORIES, categoryDef, BANDS, ROLES,
  creatureDef, CREATURES,
} from '../content/creatures.js';
import { RESOURCES } from '../content/resources.js';

/** How much of the whole ladder this band is, for the bar. */
function bandProgress(egg) {
  const fed = egg.fed[dominantCategory(egg)] ?? 0;
  const over = BANDS[BANDS.length - 1].from * Math.max(1, egg.rank);
  return Math.min(100, (fed / over) * 100);
}

export function eggsCard(state, handlers) {
  const waiting = waitingEggs(state);
  const inside = incubating(state);
  const stabled = alliesOf(state, 'stable');
  const roomed = alliesOf(state, 'room');

  if (waiting.length === 0 && inside.length === 0
      && stabled.length === 0 && roomed.length === 0) {
    return incubatorFor(state, 'stable') || incubatorFor(state, 'room')
      ? el('div.card', {}, [
          el('div.card-title', { text: '🥚 No eggs yet' }),
          el('div.pi-note', {
            text: 'Some of what lives out there is shining, and shining ones leave eggs. '
              + 'Clear nests and go into caves — the harder the thing, the likelier the egg.',
          }),
        ])
      : null;
  }

  return el('div', {}, [
    ...(stabled.length > 0 || roomed.length > 0 ? [alliesCard(state)] : []),
    ...waiting.map((egg) => waitingEggCard(state, egg, handlers)),
    ...inside.map((egg) => incubatingEggCard(state, egg, handlers)),
  ]);
}

// ---------------------------------------------------------------------------
// An egg with nowhere to go yet
// ---------------------------------------------------------------------------

function waitingEggCard(state, egg, handlers) {
  const colour = colourDef(egg.colour);

  return el('div.card', { style: { borderColor: colour.tint } }, [
    el('div.card-title', {
      style: { color: colour.tint },
      text: `${colour.icon} ${colour.name} Egg · rank ${egg.rank}`,
    }),
    el('div.pi-note', {
      text: 'Where you raise it decides what it becomes to you. It cannot be fed '
        + 'until it is somewhere warm.',
    }),
    ...Object.values(ROLES).map((role) => {
      const check = canIncubate(state, egg.id, role.id);
      return el('button.palette-item', {
        style: { background: 'transparent' },
        disabled: check.ok ? undefined : 'disabled',
        on: { click: () => handlers.onIncubate(egg.id, role.id) },
      }, [
        el('div.pi-icon', { text: role.icon }),
        el('div.pi-body', {}, [
          el('div.pi-name', { text: role.name }),
          el('div.pi-note', { text: role.blurb }),
          !check.ok ? el('div.pi-note', { class: 'neg', text: check.reason }) : null,
        ]),
        el('div.pi-cost', {
          class: 'muted',
          text: incubatorFor(state, role.id)
            ? `${incubating(state, role.id).length}/${incubatorCapacity(state, role.id)}`
            : '—',
        }),
      ]);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// An egg being raised — the window has to be visible here
// ---------------------------------------------------------------------------

function incubatingEggCard(state, egg, handlers) {
  const colour = colourDef(egg.colour);
  const band = bandOf(egg);
  const next = nextBandAt(egg);
  const willBe = creatureDef(creatureFor(egg));
  const overNext = next?.band.id === 'over';

  return el('div.card', { style: { borderColor: colour.tint } }, [
    el('div.card-title', {
      style: { color: colour.tint },
      text: `${colour.icon} ${colour.name} Egg · ${ROLES[egg.role].name}`,
    }),

    el('div.kv', {}, [
      el('span', { text: 'Hatches in' }),
      el('b', { text: duration(Math.max(0, egg.ticksRemaining)) }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Band' }),
      el('b', {
        class: band.id === 'over' ? 'neg' : band.id === 'high' ? 'pos' : '',
        text: band.id === 'over' ? 'Over — back to Low' : band.name,
      }),
    ]),
    el('div.peace-bar', {}, [
      el('div', {
        style: {
          width: `${bandProgress(egg)}%`,
          background: band.id === 'over' ? 'var(--bad, #c14b3a)' : colour.tint,
        },
      }),
    ]),

    // The warning has to arrive BEFORE the mistake, not after it.
    overNext
      ? el('div.pi-note', {
          class: 'neg',
          text: `${next.feedsAway} more of ${categoryDef(dominantCategory(egg)).name} `
            + 'and it tips into Over, which throws the hatch back to Low.',
        })
      : next
        ? el('div.pi-note', {
            text: `${next.feedsAway} more of ${categoryDef(dominantCategory(egg)).name} `
              + `reaches ${next.band.name}.`,
          })
        : null,

    el('div.kv', {}, [
      el('span', { text: 'Would hatch' }),
      el('b', { text: `${willBe.icon} ${willBe.name}` }),
    ]),
    el('div.pi-note', { text: willBe.skill ? `${willBe.skill} — ${willBe.skillBlurb}` : '' }),

    el('div.card-title', { text: 'Feed it', style: { marginTop: '8px' } }),
    ...EGG_CATEGORIES.map((category) => {
      const check = canFeed(state, egg.id, category.id);
      const cost = feedCost(egg, category.id);
      const given = egg.fed[category.id] ?? 0;

      return el('button.palette-item', {
        style: { background: 'transparent' },
        disabled: check.ok ? undefined : 'disabled',
        on: { click: () => handlers.onFeed(egg.id, category.id) },
      }, [
        el('div.pi-icon', { text: category.icon }),
        el('div.pi-body', {}, [
          el('div.pi-name', { text: `${category.name}  ·  fed ${given}` }),
          el('div.pi-note', {
            text: `Raises the ${category.name} line.`,
          }),
        ]),
        el('div.pi-cost', {
          class: check.ok ? '' : 'muted',
          text: Object.entries(cost)
            .map(([resource, amount]) => `${RESOURCES[resource].icon} ${short(amount)}`)
            .join(' '),
        }),
      ]);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// What has already hatched
// ---------------------------------------------------------------------------

function alliesCard(state) {
  const rows = [];
  for (const role of Object.values(ROLES)) {
    const mine = alliesOf(state, role.id);
    if (mine.length === 0) continue;

    rows.push(el('div.kv', {}, [
      el('span', { text: `${role.icon} ${role.name}` }),
      el('b', { class: 'pos', text: `${mine.length}` }),
    ]));
    for (const ally of mine) {
      const def = creatureDef(ally.creatureId);
      rows.push(el('div.kv', {}, [
        el('span', { text: `   ${def.icon} ${def.name}` }),
        el('b', { text: def.skill }),
      ]));
    }
  }

  return el('div.card', {}, [
    el('div.card-title', { text: 'Your monsters' }),
    ...rows,
    el('div.pi-note', {
      text: 'They join in on their own — stabled ones hold the town even while you '
        + 'are away, and the ones in the Monster Room go out with your people.',
    }),
  ]);
}
