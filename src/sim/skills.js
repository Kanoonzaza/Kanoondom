// Skills: what a resident learns, and what it changes.
//
// Bought once, with copper, for one person, and never lost. That permanence is
// the point — the balance run before this milestone ended with every store
// pinned full and nothing worth buying, and a kingdom whose earnings have
// stopped meaning anything is a kingdom nobody comes back to.
//
// A skill does two kinds of thing: it adds to the twelve stats, and it sets
// named multipliers the simulation reads directly (gathering, shop income,
// study, combat). Both are pure functions of the resident, so nothing here can
// drift out of step with a save.

import {
  SKILLS, SKILL_IDS, skillDef, EFFECT_IDS, skillSlotsFor,
} from '../content/skills.js';
import { STAT_IDS, emptyStats } from '../content/stats.js';

export function skillsOf(resident) {
  return resident.skills ?? (resident.skills = []);
}

export function knows(resident, skillId) {
  return skillsOf(resident).includes(skillId);
}

export function slotsUsed(resident) {
  return skillsOf(resident).length;
}

export function slotsFor(resident) {
  return skillSlotsFor(resident.level);
}

/** What this resident's skills add to their twelve. */
export function skillStatsOf(resident) {
  const stats = emptyStats();
  const learned = resident.skills;
  if (!learned || learned.length === 0) return stats;

  for (const id of learned) {
    const def = SKILLS[id];
    if (!def?.stats) continue;
    for (const stat of STAT_IDS) {
      if (def.stats[stat]) stats[stat] += def.stats[stat];
    }
  }
  return stats;
}

/**
 * One stat from a resident's skills, without building an object. Same reason
 * as the equipment version: this is on the clock's hot path.
 */
export function skillStat(resident, statId) {
  const learned = resident.skills;
  if (!learned || learned.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < learned.length; i++) {
    const def = SKILLS[learned[i]];
    const value = def?.stats?.[statId];
    if (value) sum += value;
  }
  return sum;
}

/** One named effect from a resident's skills, without building an object. */
export function effectValue(resident, effectId) {
  const learned = resident?.skills;
  if (!learned || learned.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < learned.length; i++) {
    const def = SKILLS[learned[i]];
    const value = def?.effects?.[effectId];
    if (value) sum += value;
  }
  return sum;
}

/**
 * The named multipliers this resident's skills grant.
 *
 * Returns a plain object of sums, so a caller writes `1 + effects.gatherMultiplier`
 * and does not have to know whether the resident has any skills at all.
 */
export function effectsOf(resident) {
  const effects = {};
  for (const id of EFFECT_IDS) effects[id] = 0;

  const learned = resident?.skills;
  if (!learned || learned.length === 0) return effects;

  for (const id of learned) {
    const def = SKILLS[id];
    if (!def?.effects) continue;
    for (const [effect, value] of Object.entries(def.effects)) {
      effects[effect] = (effects[effect] ?? 0) + value;
    }
  }
  return effects;
}

/** The best value of one effect anywhere in the kingdom. */
export function bestEffect(state, effect) {
  let best = 0;
  for (const resident of state.residents) {
    const value = effectValue(resident, effect);
    if (value > best) best = value;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

/**
 * Why this resident can or cannot take this skill.
 * @returns {'known'|'ready'|'poor'|'level'|'wrongTrade'|'full'}
 */
export function skillStatus(state, resident, skillId) {
  const def = skillDef(skillId);
  if (knows(resident, skillId)) return 'known';
  if (def.forWhom && !def.forWhom.includes(resident.professionId)) return 'wrongTrade';
  if (resident.level < def.needs) return 'level';
  if (slotsUsed(resident) >= slotsFor(resident)) return 'full';
  if (state.resources.copper < def.cost) return 'poor';
  return 'ready';
}

/** Every skill, with where this resident stands on it. */
export function skillList(state, resident) {
  return SKILL_IDS.map((id) => ({
    def: SKILLS[id],
    status: skillStatus(state, resident, id),
  }));
}

export function canLearn(state, resident, skillId) {
  const status = skillStatus(state, resident, skillId);
  const def = skillDef(skillId);

  const reasons = {
    known: 'They know this already',
    wrongTrade: 'Not for their trade',
    level: `They must reach level ${def.needs}`,
    full: `They have no room for another (${slotsFor(resident)} at level ${resident.level})`,
    poor: `Needs ${def.cost} copper`,
  };
  if (status !== 'ready') return { ok: false, reason: reasons[status], status };
  return { ok: true, reason: null, status };
}

export function learn(state, resident, skillId) {
  const check = canLearn(state, resident, skillId);
  if (!check.ok) return check;

  state.resources.copper -= skillDef(skillId).cost;
  skillsOf(resident).push(skillId);
  return { ok: true, reason: null, skillId };
}

/**
 * Forget a skill, at no refund.
 *
 * Here so a resident whose slots filled up early is never permanently spoiled
 * — the coin is gone, but the person is not written off.
 */
export function forget(state, resident, skillId) {
  const learned = skillsOf(resident);
  const index = learned.indexOf(skillId);
  if (index < 0) return { ok: false, reason: 'They never learned it' };
  learned.splice(index, 1);
  return { ok: true, reason: null };
}

export { SKILLS, SKILL_IDS, skillDef, skillSlotsFor };
