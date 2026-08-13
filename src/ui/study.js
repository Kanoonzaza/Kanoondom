// The Study screen: rank, research, surveys and what exploring has earned.
//
// This is where the kingdom's two progression axes are visible side by side —
// what your Town Hall's rank OFFERS you, and what your stores can AFFORD.

import { el, short, duration } from './dom.js';
import {
  townRank, developmentPoints, promotionRequirement, canPromote,
  researchList, studyPower, isResearched,
} from '../sim/research.js';
import { canSurvey, surveyCost, surveyReach, surveyOffice } from '../sim/survey.js';
import { monarchRank, hallRadius, zoneLabel, zoneOf } from '../sim/world.js';
import { RESEARCH_SECTIONS, MAP_REWARDS, SURVEY_FINDS } from '../content/research.js';
import { facilityDef } from '../content/facilities.js';
import { RESOURCES } from '../content/resources.js';
import { TOWN_HALL } from '../content/config.js';

/** "🪵 40 · ⛏️ 20 · 📖 2" — a cost the player can read at a glance. */
function costLine(cost) {
  return Object.entries(cost)
    .map(([resource, amount]) => `${RESOURCES[resource].icon} ${short(amount)}`)
    .join('  ');
}

/** What a study, survey or map reward actually hands over. */
function grantsLine(grants = {}) {
  const parts = [];
  for (const facilityId of grants.unlock ?? []) {
    parts.push(`unlocks ${facilityDef(facilityId).name}`);
  }
  for (const [facilityId, amount] of Object.entries(grants.stock ?? {})) {
    if ((grants.unlock ?? []).includes(facilityId)) continue;
    parts.push(`+${amount} ${facilityDef(facilityId).name}`);
  }
  for (const [resource, amount] of Object.entries(grants.resources ?? {})) {
    parts.push(`+${short(amount)} ${RESOURCES[resource].name}`);
  }
  return parts.join(' · ');
}

export function renderStudy(state, handlers) {
  const rank = townRank(state);

  return el('div', {}, [
    el('h2.screen-title.serif', { text: 'The Study' }),
    el('p.screen-sub', {
      text: `Town Hall rank ${rank} · monarch ${monarchRank(state)} · `
        + `${state.research.completed.length} of ${researchList(state).length} studies done`,
    }),

    activeCard(state, handlers),
    surveyCard(state, handlers),
    ...state.townHalls.map((hall, index) => promotionCard(state, hall, index, handlers)),
    ...RESEARCH_SECTIONS.map((section) => sectionCard(state, section, handlers)),
    mapRewardsCard(state),
  ]);
}

// ---------------------------------------------------------------------------
// The study in progress
// ---------------------------------------------------------------------------

function activeCard(state, handlers) {
  const active = state.research.active;
  const power = studyPower(state);

  if (!active) {
    return el('div.card', {}, [
      el('div.card-title', { text: 'Nobody is studying anything' }),
      el('div.kv', {}, [
        el('span', { text: 'Study rate' }),
        el('b', { class: 'pos', text: `${power.toFixed(2)} / tick` }),
      ]),
      el('div.pi-note', {
        text: 'House a Researcher, or build a Library, and everything below finishes sooner. '
          + 'A study left running carries on while you are away.',
      }),
    ]);
  }

  const remaining = Math.max(0, active.total - active.progress);
  const percent = (active.progress / active.total) * 100;

  return el('div.card', { style: { borderColor: 'var(--gold)' } }, [
    el('div.card-title', { style: { color: 'var(--gold)' }, text: `Studying: ${active.id && researchName(state, active.id)}` }),
    el('div.peace-bar', {}, [el('div', { style: { width: `${percent}%` } })]),
    el('div.kv', {}, [
      el('span', { text: 'Progress' }),
      el('b', { text: `${Math.floor(active.progress)} of ${active.total}` }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Study rate' }),
      el('b', { class: 'pos', text: `${power.toFixed(2)} / tick` }),
    ]),
    el('div.kv', {}, [
      el('span', { text: 'Finishes in' }),
      el('b', { text: power > 0 ? duration(Math.ceil(remaining / power)) : 'never' }),
    ]),
    el('div.pi-note', { text: 'It carries on while you are away. Come back and it will be done.' }),
    el('button.btn', {
      text: 'Set aside (half the fee back, progress kept)',
      style: { width: '100%', marginTop: '8px' },
      on: { click: handlers.onCancelResearch },
    }),
  ]);
}

function researchName(state, id) {
  return researchList(state).find((entry) => entry.def.id === id)?.def.name ?? id;
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

function surveyCard(state, handlers) {
  const office = surveyOffice(state);
  const check = canSurvey(state);
  const cost = surveyCost(state);
  const lastFind = SURVEY_FINDS.find((find) => find.id === state.surveys.lastFindId);

  return el('div.card', {}, [
    el('div.card-title', { text: '🗺️ Surveys' }),

    !office
      ? el('div.pi-note', {
          text: 'Study Surveying, then build a Surveyor’s Office. Surveyors bring back '
            + 'land — which is what Peace Level is made of — and whatever they find out there.',
        })
      : el('div', {}, [
          el('div.kv', {}, [
            el('span', { text: 'Office' }),
            el('b', { text: `level ${office.level}` }),
          ]),
          el('div.kv', {}, [
            el('span', { text: 'Ground covered' }),
            el('b', { class: 'pos', text: `${surveyReach(state)} tiles` }),
          ]),
          el('div.kv', {}, [
            el('span', { text: 'Cost' }),
            el('b', { class: check.ok ? '' : 'neg', text: costLine(cost) }),
          ]),
          el('button.btn.btn-primary', {
            text: 'Send the surveyors out',
            disabled: check.ok ? undefined : 'disabled',
            style: { width: '100%', marginTop: '8px' },
            on: { click: handlers.onSurvey },
          }),
          !check.ok
            ? el('div.pi-note', { class: 'neg', text: check.reason })
            : null,
        ]),

    lastFind
      ? el('div.pi-note', { text: `Last time: ${lastFind.name}. ${lastFind.text}` })
      : null,
  ]);
}

// ---------------------------------------------------------------------------
// Town Hall rank
// ---------------------------------------------------------------------------

function promotionCard(state, hall, index, handlers) {
  const zone = zoneOf(hall.x, hall.y);
  const check = canPromote(state, index);
  const requirement = check.requirement ?? promotionRequirement(hall.level);
  const development = developmentPoints(state);
  const percent = Math.min(100, (development / requirement.development) * 100);
  const atMax = hall.level >= TOWN_HALL.maxLevel;

  return el('div.card', {}, [
    el('div.card-title', {
      text: `🏛️ Town Hall · ${zoneLabel(zone.zx, zone.zy)} · rank ${hall.level}`,
    }),
    el('div.kv', {}, [
      el('span', { text: 'Reach' }),
      el('b', { text: `${hallRadius(hall)} tiles` }),
    ]),

    atMax
      ? el('div.pi-note', { text: 'This hall can rise no further.' })
      : el('div', {}, [
          el('div.kv', {}, [
            el('span', { text: 'Development' }),
            el('b', {
              class: development >= requirement.development ? 'pos' : '',
              text: `${development} of ${requirement.development}`,
            }),
          ]),
          el('div.peace-bar', {}, [el('div', { style: { width: `${percent}%` } })]),
          el('div.kv', {}, [
            el('span', { text: 'Fee' }),
            el('b', { text: costLine(requirement.cost) }),
          ]),
          el('button.btn.btn-primary', {
            text: `Raise to rank ${hall.level + 1}`,
            disabled: check.ok ? undefined : 'disabled',
            style: { width: '100%', marginTop: '8px' },
            on: { click: () => handlers.onPromote(index) },
          }),
          !check.ok ? el('div.pi-note', { text: check.reason }) : null,
          el('div.pi-note', {
            text: 'Development counts your people, what you have built, and how much '
              + 'of the world you have brought to light. Rank decides what may be studied.',
          }),
        ]),
  ]);
}

// ---------------------------------------------------------------------------
// The research list
// ---------------------------------------------------------------------------

const STATUS_NOTE = {
  done: 'known',
  active: 'being studied',
  ready: null,
  poor: 'not enough in store',
  rank: null,
  requires: null,
};

function sectionCard(state, section, handlers) {
  const entries = researchList(state).filter((entry) => entry.def.section === section.id);
  if (entries.length === 0) return null;

  // Known studies sink to the bottom; what you can do now floats to the top.
  const order = { ready: 0, active: 1, poor: 2, requires: 3, rank: 4, done: 5 };
  entries.sort((a, b) => (order[a.status] - order[b.status]) || (a.def.rank - b.def.rank));

  return el('div.card', {}, [
    el('div.card-title', { text: section.name }),
    el('div.pi-note', { text: section.blurb }),
    ...entries.map((entry) => researchRow(state, entry, handlers)),
  ]);
}

function researchRow(state, entry, handlers) {
  const { def, status, missing } = entry;

  const note = status === 'rank'
    ? `needs a rank ${def.rank} town hall`
    : status === 'requires'
      ? `after ${missing.map((id) => researchName(state, id)).join(', ')}`
      : STATUS_NOTE[status];

  return el('button.palette-item', {
    style: { background: 'transparent', opacity: status === 'done' ? '0.55' : '1' },
    disabled: status === 'ready' ? undefined : 'disabled',
    on: { click: () => handlers.onStartResearch(def.id) },
  }, [
    el('div.pi-icon', { text: status === 'done' ? '✓' : status === 'active' ? '⏳' : '📜' }),
    el('div.pi-body', {}, [
      el('div.pi-name', { text: `${def.name}  ·  rank ${def.rank}` }),
      el('div.pi-note', { text: grantsLine(def.grants) }),
      note ? el('div.pi-note', { class: status === 'poor' ? 'neg' : '', text: note }) : null,
    ]),
    el('div.pi-cost', {
      class: status === 'ready' ? '' : 'muted',
      text: status === 'done' ? '' : costLine(def.cost),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Map rewards
// ---------------------------------------------------------------------------

function mapRewardsCard(state) {
  const cleared = state.stats.tilesCleared;
  const next = MAP_REWARDS.find((reward, index) => !state.research.mapRewards.includes(index));

  return el('div.card', {}, [
    el('div.card-title', { text: 'What the map has paid' }),
    ...MAP_REWARDS.map((reward, index) => {
      const claimed = state.research.mapRewards.includes(index);
      return el('div.kv', {}, [
        el('span', { text: `${claimed ? '✓' : '○'} ${reward.name}` }),
        el('b', {
          class: claimed ? 'pos' : 'dim',
          text: claimed
            ? grantsLine({ stock: reward.stock, resources: reward.resources })
            : `${short(reward.tiles)} tiles`,
        }),
      ]);
    }),
    next
      ? el('div.pi-note', {
          text: `${short(cleared)} tiles explored — ${short(next.tiles - cleared)} more for the next.`,
        })
      : el('div.pi-note', { text: 'The map has given up everything it had.' }),
  ]);
}

export { isResearched };
