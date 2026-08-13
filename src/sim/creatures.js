// Eggs, incubation and ally monsters (research: creature-collection.md).
//
// The shape of this system, and why it is safe for offline play:
//
//   An egg DROPS from combat, which only ever happens with the player present,
//   so the one random decision here — what colour turned up — is made in live
//   play and never during catch-up.
//
//   An egg INCUBATES on a timer, which ticks whether or not anybody is
//   watching. Coming back to a hatched creature is one of the better things
//   this game can do with an absence.
//
//   What it HATCHES INTO is a pure function of the egg: its colour, what you
//   fed it, and which band that lands in. No dice at the end — the decision was
//   the feeding, and it was yours.
//
//   A hatched ally fights, and nothing else. It changes no production rate, so
//   hatching needs no segment boundary of its own; it is reported at one, the
//   way a finished building is.
//
// The overfeed trap is the point of the whole thing. See content/creatures.js.

import {
  EGG_COLOURS, colourDef, CREATURES, creatureDef, EGG_CATEGORIES, CATEGORY_IDS,
  categoryDef, BANDS, FEED_PER_RANK, FEED_COST, HATCHING, ROLES, ALLY,
} from '../content/creatures.js';
import { facilityDef } from '../content/facilities.js';
import { takeId } from '../state.js';
import { isActive } from './facilities.js';

// ---------------------------------------------------------------------------
// Eggs
// ---------------------------------------------------------------------------

export function makeEgg(state, colourId) {
  const colour = colourDef(colourId);
  const egg = {
    id: takeId(state),
    colour: colourId,
    rank: colour.rank,
    /** Feeds given, per category. */
    fed: Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])),
    /** null until placed in a stable or a room. */
    role: null,
    ticksRemaining: 0,
  };
  state.eggs.push(egg);
  return egg;
}

export function eggById(state, eggId) {
  return state.eggs.find((egg) => egg.id === eggId) ?? null;
}

/** Weighted pick of a colour. Called only from live combat. */
export function rollColour(rng) {
  const entries = Object.values(EGG_COLOURS);
  const total = entries.reduce((sum, colour) => sum + colour.weight, 0);
  let roll = rng.next() * total;
  for (const colour of entries) {
    roll -= colour.weight;
    if (roll <= 0) return colour.id;
  }
  return entries[entries.length - 1].id;
}

/** How likely a shining monster was among what you just beat. */
export function eggChance(tier) {
  return Math.min(
    HATCHING.maxEggChance,
    HATCHING.eggChanceBase + HATCHING.eggChancePerTier * Math.max(0, tier - 1)
  );
}

/**
 * Did a shining monster turn up, and did it leave an egg?
 *
 * Draws from the shared stream, which is safe because every caller is a player
 * action: clearing a nest, entering a cave, or driving off a raid the player
 * was present for.
 */
export function maybeDropEgg(state, rng, tier) {
  if (rng.next() > eggChance(tier)) return null;
  return makeEgg(state, rollColour(rng));
}

// ---------------------------------------------------------------------------
// Feeding — the part with the trap in it
// ---------------------------------------------------------------------------

/** Total feeds an egg has had, across every category. */
export function totalFed(egg) {
  return CATEGORY_IDS.reduce((sum, id) => sum + (egg.fed[id] ?? 0), 0);
}

/** The category it has had most of. Ties go to the earlier category. */
export function dominantCategory(egg) {
  let best = CATEGORY_IDS[0];
  for (const id of CATEGORY_IDS) {
    if ((egg.fed[id] ?? 0) > (egg.fed[best] ?? 0)) best = id;
  }
  return (egg.fed[best] ?? 0) > 0 ? best : 'balanced';
}

/** Where a count of feeds falls, for an egg of this rank. */
export function bandFor(rank, feeds) {
  const scale = Math.max(1, rank * FEED_PER_RANK);
  let band = BANDS[0];
  for (const candidate of BANDS) {
    if (feeds >= candidate.from * scale) band = candidate;
  }
  return band;
}

/**
 * The band this egg is currently in.
 *
 * `over` is not a fourth tier — it is the penalty, and it hatches whatever Low
 * would have. That is what makes feeding a judgement rather than a slider you
 * push to the end.
 */
export function bandOf(egg) {
  return bandFor(egg.rank, egg.fed[dominantCategory(egg)] ?? 0);
}

/** Feeds of the dominant category until the band changes, and to what. */
export function nextBandAt(egg) {
  const scale = Math.max(1, egg.rank * FEED_PER_RANK);
  const current = egg.fed[dominantCategory(egg)] ?? 0;
  for (const band of BANDS) {
    const at = band.from * scale;
    if (at > current) return { band, at, feedsAway: at - current };
  }
  return null;
}

export function feedCost(egg, categoryId) {
  const category = categoryDef(categoryId);
  return { [category.feed]: FEED_COST[categoryId] * egg.rank };
}

export function canFeed(state, eggId, categoryId) {
  const egg = eggById(state, eggId);
  if (!egg) return { ok: false, reason: 'No such egg', cost: null };
  if (egg.role === null) return { ok: false, reason: 'Put it somewhere to incubate first', cost: null };

  const cost = feedCost(egg, categoryId);
  for (const [resource, amount] of Object.entries(cost)) {
    if (state.resources[resource] < amount) {
      return { ok: false, reason: 'Not enough to feed it', cost };
    }
  }
  return { ok: true, reason: null, cost };
}

export function feed(state, eggId, categoryId) {
  const check = canFeed(state, eggId, categoryId);
  if (!check.ok) return check;

  const egg = eggById(state, eggId);
  for (const [resource, amount] of Object.entries(check.cost)) {
    state.resources[resource] -= amount;
  }
  egg.fed[categoryId] = (egg.fed[categoryId] ?? 0) + 1;

  return {
    ok: true, reason: null,
    band: bandOf(egg),
    category: dominantCategory(egg),
    willHatch: creatureFor(egg),
  };
}

// ---------------------------------------------------------------------------
// What comes out
// ---------------------------------------------------------------------------

/**
 * The creature this egg would hatch right now. PURE — no dice.
 *
 * Falls back down the bands rather than failing: a colour without a Medium
 * entry hatches its Low one, and so does an egg that was fed past Over. The
 * player is never left with nothing, only with less than they were aiming at.
 */
export function creatureFor(egg) {
  const category = dominantCategory(egg);
  const band = bandOf(egg);

  const fromColour = Object.values(CREATURES).filter((c) => c.colour === egg.colour);
  if (fromColour.length === 0) return CREATURES.pipling.id;

  const exact = fromColour.find((c) => c.category === category && c.band === band.id);
  if (exact) return exact.id;

  // Right band, any category — the band is the achievement, the category is
  // the flavour.
  const sameBand = fromColour.find((c) => c.band === band.id);
  if (sameBand) return sameBand.id;

  // Otherwise the humblest thing this colour makes.
  const order = { low: 0, medium: 1, high: 2, over: 0 };
  return fromColour.sort((a, b) => order[a.band] - order[b.band])[0].id;
}

// ---------------------------------------------------------------------------
// Incubators
// ---------------------------------------------------------------------------

/** The best standing incubator of this kind, or null. */
export function incubatorFor(state, role) {
  let best = null;
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    if (def.incubates !== role || !isActive(facility)) continue;
    if (!best || facility.level > best.level) best = { ...facility, origin: Number(origin) };
  }
  return best;
}

/** How many eggs an incubator of this kind can hold at once. */
export function incubatorCapacity(state, role) {
  const incubator = incubatorFor(state, role);
  if (!incubator) return 0;
  return facilityDef(incubator.id).incubatorSlots * incubator.level;
}

export function incubating(state, role = null) {
  return state.eggs.filter((egg) => egg.role !== null && (role === null || egg.role === role));
}

export function waitingEggs(state) {
  return state.eggs.filter((egg) => egg.role === null);
}

export function canIncubate(state, eggId, role) {
  const egg = eggById(state, eggId);
  if (!egg) return { ok: false, reason: 'No such egg' };
  if (egg.role !== null) return { ok: false, reason: 'It is already incubating' };
  if (!ROLES[role]) return { ok: false, reason: 'No such place' };
  if (!incubatorFor(state, role)) return { ok: false, reason: `You have no ${ROLES[role].name}` };
  if (incubating(state, role).length >= incubatorCapacity(state, role)) {
    return { ok: false, reason: `Your ${ROLES[role].name} is full` };
  }
  return { ok: true, reason: null };
}

/**
 * Put an egg in to incubate.
 *
 * The choice of stable or room is the fork the research describes: the same
 * egg becomes a defender of the town or a companion in the field.
 */
export function incubate(state, eggId, role) {
  const check = canIncubate(state, eggId, role);
  if (!check.ok) return check;

  const egg = eggById(state, eggId);
  egg.role = role;
  egg.ticksRemaining = HATCHING.ticksPerRank * egg.rank;
  return { ok: true, reason: null, ticks: egg.ticksRemaining };
}

/** Ticks until the next egg is due out, or Infinity. */
export function ticksToNextHatch(state) {
  let soonest = Infinity;
  for (const egg of state.eggs) {
    if (egg.role === null || egg.ticksRemaining <= 0) continue;
    if (egg.ticksRemaining < soonest) soonest = egg.ticksRemaining;
  }
  return soonest;
}

/**
 * Run the incubators for a span.
 *
 * Hatching changes no production rate — an ally fights and does nothing else —
 * so this needs no segment of its own, and eggs may come out several at a time
 * after a long absence.
 */
export function advanceIncubation(state, ticks) {
  for (const egg of state.eggs) {
    if (egg.role === null || egg.ticksRemaining <= 0) continue;
    egg.ticksRemaining -= ticks;
  }
}

/** Turn out whatever is ready. Called at segment boundaries. */
export function resolveHatching(state, report) {
  const hatched = [];
  for (const egg of state.eggs) {
    if (egg.role === null || egg.ticksRemaining > 0) continue;

    const creatureId = creatureFor(egg);
    const def = creatureDef(creatureId);
    const ally = {
      id: takeId(state),
      creatureId,
      role: egg.role,
      colour: egg.colour,
      hatchedOnTick: state.time.totalTicks,
    };
    state.allies.push(ally);
    hatched.push({
      allyId: ally.id, creatureId, name: def.name, icon: def.icon,
      role: egg.role, colour: egg.colour, band: bandOf(egg).id,
    });
  }

  if (hatched.length === 0) return;
  state.eggs = state.eggs.filter((egg) => egg.role === null || egg.ticksRemaining > 0);
  for (const entry of hatched) report.hatched.push(entry);
}

// ---------------------------------------------------------------------------
// Allies in a fight
// ---------------------------------------------------------------------------

export function alliesOf(state, role) {
  return state.allies.filter((ally) => ally.role === role);
}

/**
 * Ally monsters as combat entries, shaped exactly like the resident ones so
 * `musterStrength` needs no special case for them.
 *
 * The research is explicit that allies join automatically — they are
 * participants, not decoration — and a stabled one defends the town whether or
 * not the player is watching.
 */
export function allyEntries(state, role) {
  return alliesOf(state, role).map((ally) => {
    const def = creatureDef(ally.creatureId);
    const hits = def.hits ?? 1;
    const attack = def.power * ALLY.statScale * (1 + (hits - 1) * ALLY.hitBonus);

    return {
      ally,
      def,
      // Magic creatures count as casters, so their power ignores armour the
      // same way a mage's does.
      profession: { id: def.magic ? 'mage' : 'ally', name: def.name },
      stats: {
        atk: def.magic ? 0 : attack,
        int: def.magic ? attack : 0,
        def: def.guard * ALLY.statScale,
        spd: def.speed * ALLY.statScale,
        luck: 0,
      },
      commitment: ALLY.commitment,
      distance: 0,
    };
  });
}

export { ROLES, CREATURES, creatureDef, EGG_COLOURS, EGG_CATEGORIES, BANDS };
