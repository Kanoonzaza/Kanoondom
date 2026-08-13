// Equipment: forging, wearing, and levelling (research: equipment.md).
//
// Two things a player does with gear, and they are deliberately separate:
//
//   FORGE a copy   at the Master Smithy, for materials
//   RAISE a level  at the Master Smithy, for bronze
//
// WHY LEVELS ARE CLAIMED RATHER THAN GRANTED
// ------------------------------------------
// Gear earns experience continuously, because residents shopping in the town's
// stores is what teaches it (the research is explicit about this). Experience
// is just a number going up, so it accumulates perfectly while the player is
// away — no rate anywhere in the simulation depends on it.
//
// A LEVEL is different: it changes the wearer's stats, which changes gather
// rates, shop income and study power. If levels applied themselves the moment
// the experience was there, the clock would have to break a segment at every
// level-up across every item — the exact shape of the bug that made a
// month-long catch-up take eight seconds in V3, and worse here because items
// outnumber people.
//
// So experience banks up offline and the player spends bronze to claim it.
// That keeps offline catch-up exact by construction, gives bronze the only job
// it has ever had in this game, and turns coming back after a night away into
// a visit to the forge with something to collect.

import {
  EQUIPMENT, equipmentDef, SLOTS, EQUIP, RANK_INFO, rankInfo,
  compatibilityOf, expForNextLevel, COMPAT, statTotalOf,
} from '../content/equipment.js';
import { STAT_IDS, emptyStats } from '../content/stats.js';
import { facilityDef, effectScale } from '../content/facilities.js';
import { takeId } from '../state.js';
import { isActive } from './facilities.js';
import { effectsOf } from './skills.js';

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function makeItem(state, defId) {
  equipmentDef(defId);   // throws on a bad id, before anything is written
  const item = {
    id: takeId(state),
    defId,
    level: 1,
    exp: 0,
    /** Resident id, or null while it sits in the armoury. */
    owner: null,
  };
  state.equipment[item.id] = item;
  return item;
}

export function itemById(state, itemId) {
  return state.equipment[itemId] ?? null;
}

export function allItems(state) {
  return Object.values(state.equipment);
}

/** Everything nobody is wearing. */
export function armoury(state) {
  return allItems(state).filter((item) => item.owner === null);
}

/**
 * What an item is worth at its current level.
 *
 * The level bonus is shared across the item's own stats in proportion to its
 * base spread, so a sword's growth goes into being a sword. This is where the
 * research's governing rule lives: at high level the bonus dwarfs the base, so
 * a humble item that grows well beats a grand one that does not.
 */
export function itemStats(item) {
  const def = equipmentDef(item.defId);
  const stats = emptyStats();

  let total = 0;
  for (const id of STAT_IDS) total += Math.abs(def.stats[id] ?? 0);
  if (total <= 0) return stats;

  const growth = def.levelBonus * (item.level - 1);
  for (const id of STAT_IDS) {
    const base = def.stats[id] ?? 0;
    if (base === 0) continue;
    stats[id] = base + growth * (base / total);
  }
  return stats;
}

/**
 * One stat from one item, without building an object.
 *
 * The whole-object form above is fine for a UI panel, but the clock asks for
 * three stats per resident per segment, and allocating a twelve-key object per
 * item to read one number out of it cost six seconds on a month-long catch-up.
 */
export function itemStatValue(item, statId) {
  const def = equipmentDef(item.defId);
  const base = def.stats[statId] ?? 0;
  if (base === 0) return 0;

  const total = statTotalOf(def);
  if (total <= 0) return 0;
  return base + def.levelBonus * (item.level - 1) * (base / total);
}

/**
 * One stat across everything a resident is wearing, after compatibility.
 * Allocation-free, for the same reason.
 */
export function gearStat(state, resident, statId) {
  const gear = resident.gear;
  if (!gear) return 0;

  let sum = 0;
  for (let i = 0; i < SLOTS.length; i++) {
    const itemId = gear[SLOTS[i]];
    if (itemId === null || itemId === undefined) continue;
    const item = state.equipment[itemId];
    if (!item) continue;

    const value = itemStatValue(item, statId);
    if (value === 0) continue;
    sum += value * compatibilityOf(resident.professionId, equipmentDef(item.defId).kind).factor;
  }
  return sum;
}

export function itemPower(item) {
  const stats = itemStats(item);
  let sum = 0;
  for (const id of STAT_IDS) sum += stats[id];
  return sum;
}

export function itemCap(item) {
  return rankInfo(equipmentDef(item.defId).rank).cap;
}

// ---------------------------------------------------------------------------
// Wearing it
// ---------------------------------------------------------------------------

export function gearOf(resident) {
  return resident.gear ?? (resident.gear = Object.fromEntries(SLOTS.map((s) => [s, null])));
}

export function equippedItems(state, resident) {
  const worn = [];
  for (const slot of SLOTS) {
    const itemId = gearOf(resident)[slot];
    const item = itemId === null ? null : itemById(state, itemId);
    if (item) worn.push({ slot, item, def: equipmentDef(item.defId) });
  }
  return worn;
}

/**
 * Whether this person can wear this thing, and how well it would serve them.
 *
 * A profession that simply cannot use a kind of gear is refused outright, not
 * quietly given a nil bonus — a mage carrying a tower shield they get nothing
 * from is a trap, and traps that look like choices are the worst kind.
 */
export function canEquip(state, resident, item) {
  if (!item) return { ok: false, reason: 'No such thing' };
  const def = equipmentDef(item.defId);
  const compat = compatibilityOf(resident.professionId, def.kind);

  if (compat === COMPAT.incompatible) {
    return { ok: false, reason: `A ${resident.professionId} cannot use that`, compat };
  }
  if (item.owner !== null && item.owner !== resident.id) {
    return { ok: false, reason: 'Somebody else is wearing it', compat };
  }
  return { ok: true, reason: null, compat };
}

export function equip(state, resident, itemId) {
  const item = itemById(state, itemId);
  const check = canEquip(state, resident, item);
  if (!check.ok) return check;

  const def = equipmentDef(item.defId);
  const gear = gearOf(resident);

  // Whatever was in that slot goes back to the armoury rather than vanishing.
  const displaced = gear[def.slot] === null ? null : itemById(state, gear[def.slot]);
  if (displaced) displaced.owner = null;

  gear[def.slot] = item.id;
  item.owner = resident.id;
  return { ok: true, reason: null, slot: def.slot, displaced, compat: check.compat };
}

export function unequip(state, resident, slot) {
  const gear = gearOf(resident);
  const itemId = gear[slot];
  if (itemId === null) return { ok: false, reason: 'Nothing in that slot' };

  const item = itemById(state, itemId);
  if (item) item.owner = null;
  gear[slot] = null;
  return { ok: true, reason: null, item };
}

/**
 * Hand out whatever is lying in the armoury, best first.
 *
 * The point is not optimal play — it is that a player who has just forged five
 * things should not have to make twenty-five separate decisions before any of
 * them do anything.
 */
export function autoEquip(state, resident) {
  const equipped = [];
  for (const slot of SLOTS) {
    if (gearOf(resident)[slot] !== null) continue;

    const candidates = armoury(state)
      .filter((item) => equipmentDef(item.defId).slot === slot)
      .filter((item) => canEquip(state, resident, item).ok)
      .map((item) => ({
        item,
        worth: itemPower(item)
          * compatibilityOf(resident.professionId, equipmentDef(item.defId).kind).factor,
      }))
      .sort((a, b) => b.worth - a.worth);

    if (candidates.length === 0 || candidates[0].worth <= 0) continue;
    const result = equip(state, resident, candidates[0].item.id);
    if (result.ok) equipped.push(candidates[0].item);
  }
  return equipped;
}

/**
 * What a resident's gear adds to them, after compatibility.
 *
 * Called on the hot path (once per resident per segment), so it walks at most
 * five small objects and allocates one result.
 */
export function gearStatsOf(state, resident) {
  const stats = emptyStats();
  const gear = resident.gear;
  if (!gear) return stats;

  for (const slot of SLOTS) {
    const itemId = gear[slot];
    if (itemId === null || itemId === undefined) continue;
    const item = state.equipment[itemId];
    if (!item) continue;

    const def = equipmentDef(item.defId);
    const factor = compatibilityOf(resident.professionId, def.kind).factor;
    if (factor <= 0) continue;

    const worth = itemStats(item);
    for (const id of STAT_IDS) {
      if (worth[id]) stats[id] += worth[id] * factor;
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// The Master Smithy
// ---------------------------------------------------------------------------

/** The best Master Smithy standing, or null. */
export function smithy(state) {
  let best = null;
  for (const [origin, facility] of Object.entries(state.world.facilities)) {
    const def = facilityDef(facility.id);
    if (!def.forges || !isActive(facility)) continue;
    if (!best || facility.level > best.level) best = { ...facility, origin: Number(origin) };
  }
  return best;
}

/** Which designs the Master Smithy is able to make, given what is researched. */
export function forgeable(state) {
  return Object.values(EQUIPMENT).filter((def) => state.equipmentKnown.includes(def.id));
}

export function canForge(state, defId) {
  if (!smithy(state)) return { ok: false, reason: 'You have no Master Smithy', cost: null };
  if (!state.equipmentKnown.includes(defId)) {
    return { ok: false, reason: 'Nobody here knows the pattern', cost: null };
  }

  const cost = equipmentDef(defId).craft;
  for (const [resource, amount] of Object.entries(cost)) {
    if (state.resources[resource] < amount) {
      return { ok: false, reason: 'Not enough materials', cost };
    }
  }
  return { ok: true, reason: null, cost };
}

export function forge(state, defId) {
  const check = canForge(state, defId);
  if (!check.ok) return check;

  for (const [resource, amount] of Object.entries(check.cost)) {
    state.resources[resource] -= amount;
  }
  const item = makeItem(state, defId);
  return { ok: true, reason: null, item };
}

/**
 * Bronze to take an item up one level.
 *
 * A smithy's own level and a smith's skill both take a bite out of it, which
 * is what makes upgrading the building and housing a Master Craftsman worth
 * doing rather than merely flavourful.
 */
export function levelCost(state, item) {
  const def = equipmentDef(item.defId);
  const base = rankInfo(def.rank).forgePerLevel * item.level;

  const shop = smithy(state);
  const fromSmithy = shop ? (effectScale(shop.level) - 1) * 0.08 : 0;
  const fromSkills = bestForgeDiscount(state);

  const discount = Math.min(EQUIP.maxForgeDiscount, fromSmithy + fromSkills);
  return Math.max(1, Math.round(base * (1 - discount)));
}

/** The best forge discount anyone in the kingdom offers. */
export function bestForgeDiscount(state) {
  let best = 0;
  for (const resident of state.residents) {
    const discount = effectsOf(resident).forgeDiscount ?? 0;
    if (discount > best) best = discount;
  }
  return best;
}

/** How many levels this item's banked experience has already paid for. */
export function pendingLevels(state, item) {
  let level = item.level;
  let exp = item.exp;
  let levels = 0;
  const cap = itemCap(item);

  while (level < cap) {
    const needed = expForNextLevel(level);
    if (exp < needed) break;
    exp -= needed;
    level++;
    levels++;
  }
  return levels;
}

export function canRaise(state, itemId) {
  const item = itemById(state, itemId);
  if (!item) return { ok: false, reason: 'No such thing', cost: null };
  if (!smithy(state)) return { ok: false, reason: 'You have no Master Smithy', cost: null };
  if (item.level >= itemCap(item)) {
    return { ok: false, reason: `A ${equipmentDef(item.defId).rank}-rank item stops at ${itemCap(item)}`, cost: null };
  }
  if (item.exp < expForNextLevel(item.level)) {
    return { ok: false, reason: 'It has not learned enough yet', cost: null };
  }

  const cost = levelCost(state, item);
  if (state.resources.bronze < cost) {
    return { ok: false, reason: `Needs ${cost} bronze`, cost };
  }
  return { ok: true, reason: null, cost };
}

/** Spend bronze and the banked experience to take an item up one level. */
export function raise(state, itemId) {
  const check = canRaise(state, itemId);
  if (!check.ok) return check;

  const item = itemById(state, itemId);
  state.resources.bronze -= check.cost;
  item.exp -= expForNextLevel(item.level);
  item.level += 1;

  return { ok: true, reason: null, level: item.level, cost: check.cost };
}

/** Take an item as far as its banked experience and your bronze allow. */
export function raiseAll(state, itemId) {
  let levels = 0;
  let spent = 0;
  for (;;) {
    const result = raise(state, itemId);
    if (!result.ok) break;
    levels++;
    spent += result.cost;
  }
  return { levels, spent };
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

/**
 * Experience per tick for one worn item.
 *
 * Driven by how much trade the town is doing, because that is what the
 * research says teaches gear: residents buying things in stores. A busy town
 * sharpens its own swords.
 *
 * Constant across a segment — it depends only on production rates, which by
 * construction do not change inside one — so this is exact however the time is
 * chunked, and it accrues at full rate while the player is away.
 */
export function equipExpRate(state, copperRate = null) {
  const trade = copperRate ?? 0;
  return EQUIP.expPerTick * (1 + trade * EQUIP.expPerCopperRate);
}

/**
 * Bank experience into everything somebody is wearing.
 *
 * Deliberately does NOT level anything — see the note at the top of the file.
 */
export function advanceEquipment(state, ticks, report, copperRate) {
  const gain = equipExpRate(state, copperRate) * ticks;
  if (!(gain > 0)) return;

  // `for...in` rather than Object.values: the clock runs this every segment,
  // and a throwaway array per segment is a throwaway array too many.
  for (const key in state.equipment) {
    const item = state.equipment[key];
    if (EQUIP.requiresOwner && item.owner === null) continue;
    if (item.level >= itemCap(item)) continue;
    item.exp += gain;
  }
}

/** Everything with levels waiting to be claimed — the reason to visit the forge. */
export function itemsAwaitingForge(state) {
  return allItems(state)
    .map((item) => ({ item, levels: pendingLevels(state, item) }))
    .filter((entry) => entry.levels > 0)
    .sort((a, b) => b.levels - a.levels);
}

export { SLOTS, EQUIPMENT, equipmentDef, RANK_INFO, compatibilityOf, expForNextLevel };
