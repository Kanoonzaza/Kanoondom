// Buildings, drawn as rooms you can see into.
//
// This is the thing that most separates the game this one is modelled on from
// everything else: it never shows you a house from the front. It shows you the
// INSIDE — the floor, the rug, the bed, the counter — with two low walls along
// the far edges and the near two left open, as though the roof and the front
// corner had been lifted off.
//
// That is why a Kairosoft town reads as a place you are managing rather than as
// a row of cottages. You can see what is in every building at a glance.
//
// Drawn with paths rather than stamped from a sprite sheet, because a room has
// to fit its footprint exactly and there are five different footprints; a
// picture would have to be redrawn for each. The furniture is placed in TILE
// coordinates inside the room and projected like everything else, so a bed in
// a 2x2 cottage and a bed in a 4x3 manor are the same description.

import { P } from '../content/art/palette.js';
import { facilityColours } from '../content/art/facilities-art.js';
import { FURNISHINGS } from '../content/art/rooms-art.js';

/**
 * How tall the low walls stand, as a fraction of a tile's screen height.
 *
 * Low. The first pass had them at 1.35 and every room read as a deep empty box
 * with a bit of furniture at the bottom — the walls dominated the thing they
 * were supposed to be framing. They are here to say "this is a room" and then
 * get out of the way of what is in it.
 */
const WALL = 0.8;

/**
 * Draw one room.
 *
 * `project` maps tile coordinates to screen pixels; everything below works in
 * tiles and lets the projection do the rest, so the same code draws a hut and a
 * manor.
 */
export function drawRoom(ctx, project, facility, def, ox, oy, zoom) {
  const w = def.size.w;
  const h = def.size.h;
  const colours = facilityColours(facility.id);
  const lift = zoom * WALL;

  const corner = {
    top: project(ox, oy),
    right: project(ox + w, oy),
    bottom: project(ox + w, oy + h),
    left: project(ox, oy + h),
  };
  const up = (point) => ({ x: point.x, y: point.y - lift });

  // --- the ground it stands on ---
  quad(ctx, corner.top, corner.right, corner.bottom, corner.left);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  // --- the floor ---
  quad(ctx, corner.top, corner.right, corner.bottom, corner.left);
  ctx.fillStyle = facility.built ? floorOf(colours) : 'rgba(120,116,110,0.55)';
  ctx.fill();

  // Floorboards, running with the grid so they read as boards rather than as
  // noise. Only worth drawing once a tile is big enough to see them.
  if (zoom >= 9 && facility.built) {
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < h; i++) {
      const a = project(ox, oy + i);
      const b = project(ox + w, oy + i);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  // --- the two far walls, standing up from the back edges ---
  // Left-back wall: from the top corner down to the left corner.
  quad(ctx, corner.left, corner.top, up(corner.top), up(corner.left));
  ctx.fillStyle = colours.roof;
  ctx.fill();
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right-back wall: from the top corner across to the right corner.
  quad(ctx, corner.top, corner.right, up(corner.right), up(corner.top));
  ctx.fillStyle = colours.roofShade;
  ctx.fill();
  ctx.stroke();

  // A capping line along the top of each wall, which is what gives them
  // thickness instead of looking like paper.
  ctx.strokeStyle = colours.roofLight;
  ctx.lineWidth = Math.max(1.5, zoom * 0.12);
  ctx.beginPath();
  ctx.moveTo(up(corner.left).x, up(corner.left).y);
  ctx.lineTo(up(corner.top).x, up(corner.top).y);
  ctx.lineTo(up(corner.right).x, up(corner.right).y);
  ctx.stroke();

  if (!facility.built) {
    buildingSite(ctx, corner, up, zoom, facility, def);
    return;
  }

  // --- what is in the room ---
  const pieces = FURNISHINGS[facility.id] ?? [];
  for (const piece of pieces) {
    // Furniture is described in a 1x1 unit square and scaled onto the room, so
    // one description fits every footprint the facility might have.
    const px = ox + piece.x * w;
    const py = oy + piece.y * h;
    const pw = Math.max(0.35, piece.w * w);
    const ph = Math.max(0.35, piece.h * h);
    box(ctx, project, px, py, pw, ph, zoom * (piece.tall ?? 0.5), piece.colour, piece.top);
  }

  if (facility.damaged) {
    quad(ctx, corner.top, corner.right, corner.bottom, corner.left);
    ctx.fillStyle = 'rgba(193,75,58,0.38)';
    ctx.fill();
  }

  // Level pips along the near edge, where nothing else is drawn.
  if (facility.level > 1 && zoom >= 6) {
    const pip = Math.max(2, zoom * 0.2);
    for (let i = 0; i < facility.level - 1; i++) {
      ctx.fillStyle = P.goldLight;
      ctx.fillRect(corner.left.x + 3 + i * (pip + 2), corner.left.y - pip, pip, pip);
    }
  }
}

/** Scaffolding and a progress bar, for something still going up. */
function buildingSite(ctx, corner, up, zoom, facility, def) {
  ctx.strokeStyle = P.woodLight;
  ctx.lineWidth = Math.max(1, zoom * 0.09);
  ctx.beginPath();
  for (const point of [corner.left, corner.top, corner.right, corner.bottom]) {
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(up(point).x, up(point).y);
  }
  ctx.stroke();

  const progress = 1 - facility.buildTicksRemaining / def.buildTicks;
  const width = Math.abs(corner.right.x - corner.left.x) * 0.6;
  const barX = corner.bottom.x - width / 2;
  const barY = corner.bottom.y - zoom * 0.4;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(barX, barY, width, 4);
  ctx.fillStyle = P.gold;
  ctx.fillRect(barX, barY, width * progress, 4);
}

/** A four-cornered path, ready to fill or stroke. */
function quad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

/**
 * A piece of furniture: a low box standing on the floor.
 *
 * Three faces — top, left, right — which is all an isometric solid needs and
 * all that is legible at this size. The top face is what a player reads, so it
 * takes the lighter colour.
 */
export function box(ctx, project, tx, ty, w, h, tall, colour, topColour) {
  const base = {
    top: project(tx, ty),
    right: project(tx + w, ty),
    bottom: project(tx + w, ty + h),
    left: project(tx, ty + h),
  };
  const up = (point) => ({ x: point.x, y: point.y - tall });

  quad(ctx, base.left, base.bottom, up(base.bottom), up(base.left));
  ctx.fillStyle = shade(colour, 0.78);
  ctx.fill();

  quad(ctx, base.bottom, base.right, up(base.right), up(base.bottom));
  ctx.fillStyle = shade(colour, 0.6);
  ctx.fill();

  quad(ctx, up(base.top), up(base.right), up(base.bottom), up(base.left));
  ctx.fillStyle = topColour ?? colour;
  ctx.fill();
}

const shadeCache = new Map();

/** Darken a hex colour by a factor, for the sides of a solid. */
function shade(hex, factor) {
  const key = `${hex}/${factor}`;
  const cached = shadeCache.get(key);
  if (cached) return cached;

  const value = Number.parseInt(hex.slice(1), 16);
  const out = '#' + [16, 8, 0]
    .map((shift) => Math.round(((value >> shift) & 255) * factor))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');

  shadeCache.set(key, out);
  return out;
}

/** The floor of a room, derived from its scheme so it never clashes. */
function floorOf(colours) {
  return shade(colours.wall, 0.94);
}
