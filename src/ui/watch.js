// The Watch screen: what is out there, how close it is, and what to do about it.

import { el, short, duration } from './dom.js';
import {
  knownNests, pressingNests, activeNests, threatRate, threatFraction, threatLabel,
  wardStrength, distanceToKingdom,
} from '../sim/monsters.js';
import {
  graceRemaining, expeditionForecast, canRaidNest, openCave, canEnterCave,
} from '../sim/raids.js';
import { eggsCard } from './eggs.js';
import { monsterDef } from '../content/monsters.js';
import { THREAT, CAVE, NESTS } from '../content/monsters.js';
import { RESOURCES } from '../content/resources.js';
import { zoneLabel, zoneOf } from '../sim/world.js';
import { isFullMoon, moonPhase } from '../state.js';
import { TICKS_PER_SEASON } from '../content/config.js';

export function renderWatch(state, handlers) {
  return el('div', {}, [
    el('h2.screen-title.serif', { text: 'The Watch' }),
    el('p.screen-sub', {
      text: `${activeNests(state).length} nests in open country · `
        + `${state.stats.nestsCleared} cleared`,
    }),

    threatCard(state),
    caveCard(state, handlers),
    eggsCard(state, handlers),
    ...knownNests(state)
      .sort((a, b) => distanceToKingdom(state, a) - distanceToKingdom(state, b))
      .map((nest) => nestCard(state, nest, handlers)),
    knownNests(state).length === 0 ? undiscoveredCard(state) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Threat
// ---------------------------------------------------------------------------

function threatCard(state) {
  const fraction = threatFraction(state);
  const perSeason = threatRate(state) * TICKS_PER_SEASON;
  const ward = wardStrength(state);
  const grace = graceRemaining(state);
  const pressing = pressingNests(state);

  return el('div.card', { style: { borderColor: fraction >= 1 ? 'var(--frontier)' : '' } }, [
    el('div.card-title', {
      style: fraction >= 1 ? { color: 'var(--frontier)' } : {},
      text: `⚔️ ${threatLabel(state)}`,
    }),
    el('div.peace-bar', {}, [
      el('div', {
        style: {
          width: `${Math.min(100, fraction * 100)}%`,
          background: fraction >= 1 ? 'var(--frontier)' : 'var(--gold)',
        },
      }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Threat' }),
      el('b', { text: `${Math.round(state.threat ?? 0)} of ${THREAT.raidThreshold}` }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Gathering' }),
      el('b', {
        class: perSeason > 0 ? 'neg' : 'pos',
        text: perSeason > 0 ? `+${perSeason.toFixed(1)} per season` : 'nothing is coming',
      }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Held off by torches and towers' }),
      el('b', { class: ward > 0 ? 'pos' : 'muted', text: `${Math.round(ward * 100)}%` }),
    ]),

    grace > 0
      ? el('div.pi-note', {
          class: 'pos',
          text: `Quiet for another ${duration(grace)} — nothing attacks straight after you return.`,
        })
      : null,

    el('div.pi-note', {
      text: pressing.length > 0
        ? `${pressing.length} nest${pressing.length === 1 ? '' : 's'} within reach of your halls. `
          + 'Clear one and the pressure drops with it.'
        : 'Nothing is close enough to trouble you.',
    }),

    // The promise, stated where the player can see it rather than only in a
    // design document.
    el('div.pi-note', {
      class: 'pos',
      text: 'Nothing ever attacks while you are away. Threat gathers; raids wait for you.',
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Nests
// ---------------------------------------------------------------------------

function nestCard(state, nest, handlers) {
  const species = monsterDef(nest.speciesId);
  const zone = zoneOf(nest.x, nest.y);
  const distance = distanceToKingdom(state, nest);
  const forecast = expeditionForecast(state, nest);
  const check = canRaidNest(state, nest);

  const odds = forecast.theirs.attack + forecast.theirs.magic;
  const ourPower = forecast.ours.attack + forecast.ours.magic;
  const favoured = ourPower >= odds;

  return el('div.card', {}, [
    el('div.card-title', {
      text: `${species.icon} ${species.name} nest · ${zoneLabel(zone.zx, zone.zy)}`,
    }),
    el('div.pi-note', { text: species.blurb }),
    el('div.kv', {}, [
      el('span', { text: 'Distance' }),
      el('b', {
        class: distance <= NESTS.threatReach ? 'neg' : '',
        text: distance <= NESTS.threatReach
          ? `${Math.round(distance)} tiles — pressing on you`
          : `${Math.round(distance)} tiles away`,
      }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Strength' }),
      el('b', { text: `tier ${nest.tier} · ${forecast.band.length} of them` }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Who would go' }),
      el('b', { text: `${forecast.defenders.length} of your people` }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Our strength against theirs' }),
      el('b', {
        class: favoured ? 'pos' : 'neg',
        text: `${Math.round(ourPower)} vs ${Math.round(odds)}`,
      }),
    ]),
    el('button.btn', {
      class: favoured ? 'btn-primary' : '',
      text: favoured ? 'Send everyone' : 'Send everyone anyway',
      disabled: check.ok ? undefined : 'disabled',
      style: { width: '100%', marginTop: '8px' },
      on: { click: () => handlers.onClearNest(nest.index) },
    }),
    !check.ok ? el('div.pi-note', { class: 'neg', text: check.reason }) : null,
    !favoured && check.ok
      ? el('div.pi-note', {
          text: 'You would be outmatched. House a knight nearer, or build a training yard.',
        })
      : null,
  ]);
}

function undiscoveredCard(state) {
  return el('div.card', {}, [
    el('div.card-title', { text: 'Nothing found yet' }),
    el('div.pi-note', {
      text: activeNests(state).length > 0
        ? 'There are nests in open country, but you have not laid eyes on them. '
          + 'Send the surveyors out and they will turn up.'
        : 'No nests stand in the country open to you.',
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Caves
// ---------------------------------------------------------------------------

function caveCard(state, handlers) {
  const cave = openCave(state);
  const check = canEnterCave(state);
  const phase = moonPhase(state);

  return el('div.card', {}, [
    el('div.card-title', { text: `${isFullMoon(state) ? '🌕' : '🌘'} Caves` }),

    cave
      ? el('div', {}, [
          el('div.kv', {}, [
            el('span', { text: 'A cave stands open' }),
            el('b', { class: 'pos', text: `tier ${cave.tier}` }),
          ]),
          el('div.kv', {}, [
            el('span', { text: 'It closes in' }),
            el('b', { text: `${cave.closesInDays} day${cave.closesInDays === 1 ? '' : 's'}` }),
          ]),
          el('div.kv', {}, [
            el('span', { text: 'Costs' }),
            el('b', {
              class: state.resources.energy >= CAVE.energyCost ? '' : 'neg',
              text: `${RESOURCES.energy.icon} ${CAVE.energyCost} energy`
                + ` (you have ${Math.floor(state.resources.energy)})`,
            }),
          ]),
          el('button.btn.btn-primary', {
            text: 'Go in',
            disabled: check.ok ? undefined : 'disabled',
            style: { width: '100%', marginTop: '8px' },
            on: { click: handlers.onEnterCave },
          }),
          !check.ok ? el('div.pi-note', { class: 'neg', text: check.reason }) : null,
        ])
      : el('div.pi-note', {
          text: `No cave stands open. The next full moon is ${Math.max(1, Math.round((1 - phase) * 10))} `
            + 'days off, and one opens with it.',
        }),

    el('div.pi-note', {
      text: 'Energy returns on its own, and nothing else spends it. '
        + 'A cave is the one thing worth coming back on a particular night for.',
    }),
  ]);
}

// ---------------------------------------------------------------------------
// The battle sheet — the arithmetic, in full
// ---------------------------------------------------------------------------

/**
 * Every term that decided a fight.
 *
 * The point of showing all of it: somebody who loses should close this knowing
 * which number was too small, and therefore what to build or who to move.
 */
export function battleSheet(result, onClose, { title = 'The battle' } = {}) {
  return el('div', {}, [
    el('h3.sheet-title', { text: result.won ? `${title} — we held` : `${title} — we were driven back` }),
    el('p.sheet-sub', {
      text: result.band
        ? result.band.map((monster) => `${monster.icon} ${monster.name}`).join('  ')
        : '',
    }),

    el('div.card', {}, [
      el('div.card-title', { text: 'How it went' }),
      ...result.lines.map((line) =>
        el('div.kv', {}, [
          el('span', { text: line.label }),
          el('b', { class: line.kind, text: String(line.value) }),
        ])
      ),
    ]),

    result.wrecked?.length > 0
      ? el('div.card', { style: { borderColor: 'var(--frontier)' } }, [
          el('div.card-title', { style: { color: 'var(--frontier)' }, text: 'They got through' }),
          ...result.wrecked.map((wreck) =>
            el('div.kv', {}, [
              el('span', { text: wreck.name }),
              el('b', { class: 'neg', text: 'damaged' }),
            ])
          ),
          el('div.pi-note', {
            text: 'Damaged buildings stop working until repaired. Nobody was lost — '
              + 'people are hurt, never taken.',
          }),
        ])
      : null,

    result.reward && Object.keys(result.reward).length > 0
      ? el('div.card', {}, [
          el('div.card-title', { text: 'Brought back' }),
          ...Object.entries(result.reward).map(([id, amount]) =>
            el('div.kv', {}, [
              el('span', { text: `${RESOURCES[id].icon} ${RESOURCES[id].name}` }),
              el('b', { class: 'pos', text: `+${short(amount)}` }),
            ])
          ),
        ])
      : null,

    el('div.btn-row', {}, [
      el('button.btn.btn-primary', { text: 'Close', on: { click: onClose } }),
    ]),
  ]);
}
