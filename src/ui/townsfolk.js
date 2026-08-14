// Where the people are standing, right now.
//
// This is a VIEW concern and nothing else. The simulation has never had a
// position for a resident and does not need one: a person belongs to a house,
// and where they happen to be pottering about outside it changes nothing about
// what they produce. Putting wander state into the save would mean storing it,
// migrating it, and keeping it consistent across a catch-up that walks a month
// in three hundred milliseconds — all for something nobody can see.
//
// So a position is a PURE FUNCTION of who somebody is and what the clock says.
// Nothing is stored, nothing is saved, and a catch-up cannot desynchronise it
// because there is nothing to synchronise. Close the tab mid-stroll and the
// same person is in the same place when you come back.

import { DAY } from '../content/config.js';

/** Seconds a resident spends walking from one spot to the next. */
const STROLL_SECONDS = 5;

/** How far from home they will wander, in tiles. */
const RANGE = 2.2;

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Smooth start and stop, so nobody sets off or arrives at full speed. */
function ease(t) {
  return t * t * (3 - 2 * t);
}

/** Where resident `id` is headed during `leg`, relative to home. */
function waypoint(id, leg) {
  const h = hash(id * 2654435761, leg);
  const angle = ((h % 1024) / 1024) * Math.PI * 2;
  const reach = 0.35 + ((h >>> 10) % 256) / 256 * 0.65;
  return {
    x: Math.cos(angle) * RANGE * reach,
    y: Math.sin(angle) * RANGE * reach * 0.7,   // squashed: rooms are wider than deep
  };
}

/**
 * Is it night? Then everybody is indoors.
 *
 * Read from the simulation clock rather than the wall clock, so a town at
 * three times speed goes to bed three times as often — the map and the game
 * agree about what time it is.
 */
export function isNight(state) {
  const fraction = (state.time.totalTicks % DAY.ticksPerDay) / DAY.ticksPerDay;
  const night = DAY.periods.find((period) => period.id === 'night');
  return fraction >= night.from;
}

/**
 * Everybody who is outside, and where.
 *
 * @returns {Array<{ x, y, professionId, facing, id }>} tile coordinates, with
 *   fractional parts, so people stand between tiles rather than snapping to a
 *   grid like the buildings do.
 */
export function townsfolkAt(state, nowMs, bounds) {
  const out = [];
  if (isNight(state)) return out;

  const leg = Math.floor(nowMs / (STROLL_SECONDS * 1000));
  const through = ease((nowMs % (STROLL_SECONDS * 1000)) / (STROLL_SECONDS * 1000));

  for (const resident of state.residents) {
    if (resident.home === null || resident.home === undefined) continue;

    const homeX = resident.home % 96;
    const homeY = Math.floor(resident.home / 96);

    // Cheap rejection first: a house well off screen has nobody worth drawing.
    if (homeX < bounds.firstX - 3 || homeX > bounds.lastX + 3) continue;
    if (homeY < bounds.firstY - 3 || homeY > bounds.lastY + 3) continue;

    const from = waypoint(resident.id, leg);
    const to = waypoint(resident.id, leg + 1);

    const x = homeX + 0.5 + from.x + (to.x - from.x) * through;
    const y = homeY + 1.2 + from.y + (to.y - from.y) * through;

    out.push({
      id: resident.id,
      professionId: resident.professionId,
      x,
      y,
      // Facing follows the direction of travel, so nobody moonwalks.
      facing: to.x < from.x ? 'flip' : '',
    });
  }

  return out;
}

/** Houses with somebody asleep in them, for the night. */
export function sleepingHouses(state, bounds) {
  if (!isNight(state)) return [];

  const homes = new Set();
  for (const resident of state.residents) {
    if (resident.home === null || resident.home === undefined) continue;
    homes.add(resident.home);
  }

  const out = [];
  for (const origin of homes) {
    const x = origin % 96;
    const y = Math.floor(origin / 96);
    if (x < bounds.firstX - 3 || x > bounds.lastX + 3) continue;
    if (y < bounds.firstY - 3 || y > bounds.lastY + 3) continue;
    out.push({ x, y });
  }
  return out;
}
