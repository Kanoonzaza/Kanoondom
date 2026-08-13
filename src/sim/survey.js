// Surveys — our replacement for the real game's gacha (research: research-system.md).
//
// The real game obtains facilities three ways: research, map rewards, and a
// paid random pull. We keep the first two as-is and replace the third with a
// Surveyor's Office that spends MATERIALS you produced. Same role — a
// randomised source of new facilities and rare goods — with nothing to buy.
//
// A survey always does two things: it reveals land, and it brings back a find.
// The land is the part that matters. Fog is the only thing standing between a
// new kingdom and its second town hall, and Peace Level — which gates the whole
// map — is made of cleared ground.
//
// Surveys are a PLAYER ACTION, never a clock event, so they may draw from the
// shared RNG stream without threatening offline parity: catch-up runs no
// surveys, so it consumes none of the stream.

import { SURVEY, SURVEY_FINDS } from '../content/research.js';
import { effectScale, facilityDef } from '../content/facilities.js';
import { WORLD_TILES_X, WORLD_TILES_Y } from '../content/config.js';
import { createRng } from './rng.js';
import { isActive } from './facilities.js';
import { tileIndex, zoneOf, zoneRing, unlockedRing, markCleared } from './world.js';
import { applyGrants, checkMapRewards } from './research.js';

/** The best Surveyor's Office you have standing, or null. */
export function surveyOffice(state) {
  let best = null;
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    if (!def.surveys || !isActive(facility)) continue;
    if (!best || facility.level > best.level) best = { ...facility, origin: Number(origin) };
  }
  return best;
}

/** What the next survey costs. Each one asks a little more than the last. */
export function surveyCost(state) {
  const multiplier = 1 + (state.surveys?.done ?? 0) * SURVEY.costGrowth;
  const cost = {};
  for (const [resource, amount] of Object.entries(SURVEY.cost)) {
    cost[resource] = Math.round(amount * multiplier);
  }
  return cost;
}

/** How much ground the next survey covers. A better office reaches further. */
export function surveyReach(state) {
  const office = surveyOffice(state);
  if (!office) return 0;
  return Math.round(SURVEY.tilesRevealed * effectScale(office.level));
}

export function canSurvey(state) {
  const office = surveyOffice(state);
  if (!office) return { ok: false, reason: 'You have no Surveyor’s Office', cost: null };

  const cost = surveyCost(state);
  for (const [resource, amount] of Object.entries(cost)) {
    if (state.resources[resource] < amount) {
      return { ok: false, reason: 'Not enough to send them out', cost };
    }
  }
  return { ok: true, reason: null, cost };
}

/**
 * Reveal the nearest unexplored ground to any town hall.
 *
 * Nearest-first is what makes a survey feel like an expedition setting out from
 * home rather than a coin landing somewhere on the map, and it keeps the
 * kingdom's explored area a single connected shape instead of a rash of
 * unreachable islands.
 *
 * Only unlocked zones count: revealing the far country before it is open to you
 * would hand out Peace Level for land you cannot set foot on.
 */
export function revealFrontier(state, budget) {
  if (budget <= 0) return 0;

  // The ring is resolved ONCE. `isZoneUnlocked` recomputes Peace Level, which
  // walks every cleared tile — asking it per tile turned a button press into a
  // third of a second of frozen page.
  const ring = unlockedRing(state);
  const halls = state.townHalls;
  const candidates = [];

  for (let y = 0; y < WORLD_TILES_Y; y++) {
    for (let x = 0; x < WORLD_TILES_X; x++) {
      const index = tileIndex(x, y);
      if (state.world.cleared[index] === 1) continue;

      const zone = zoneOf(x, y);
      if (zoneRing(zone.zx, zone.zy) > ring) continue;

      let nearest = Infinity;
      for (const hall of halls) {
        const distance = Math.hypot(x - hall.x, y - hall.y);
        if (distance < nearest) nearest = distance;
      }
      candidates.push({ index, distance: nearest });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);

  const taking = Math.min(budget, candidates.length);
  for (let i = 0; i < taking; i++) markCleared(state, candidates[i].index);
  return taking;
}

/** Weighted pick from the find table. */
export function rollFind(rng) {
  const total = SURVEY_FINDS.reduce((sum, find) => sum + find.weight, 0);
  let roll = rng.next() * total;
  for (const find of SURVEY_FINDS) {
    roll -= find.weight;
    if (roll <= 0) return find;
  }
  return SURVEY_FINDS[SURVEY_FINDS.length - 1];
}

/**
 * Send the surveyors out.
 *
 * @returns {{ok: boolean, reason: string|null, revealed?: number,
 *            find?: object, granted?: object, rewards?: object[]}}
 */
export function runSurvey(state) {
  const check = canSurvey(state);
  if (!check.ok) return check;

  for (const [resource, amount] of Object.entries(check.cost)) {
    state.resources[resource] -= amount;
  }

  const rng = createRng(state.rngState);
  const find = rollFind(rng);

  const grants = { resources: find.resources };
  if (find.stockPool) {
    grants.stock = { [rng.pick(find.stockPool)]: find.stockAmount };
  }
  const granted = applyGrants(state, grants);

  const revealed = revealFrontier(state, surveyReach(state));
  state.stats.tilesCleared += revealed;

  state.rngState = rng.getState();
  state.surveys.done += 1;
  state.surveys.lastFindId = find.id;

  // Fog just moved, so a map reward may now be owed.
  const rewards = checkMapRewards(state);

  return { ok: true, reason: null, revealed, find, granted, rewards };
}

