// The sprite compiler.
//
// Every graphic in this game is authored as an ASCII grid with a palette map,
// in plain data files under content/art/. A grid is diffable, reviewable in a
// pull request, and costs nothing to store — which is why the project can look
// hand-drawn while still shipping no binary artwork.
//
//   palette: { k: '#2b2b33', w: '#4a7fb5', _: null }   // '_' is transparent
//   frames:  [ ['..kk..', '.kwwk.', 'kwwwwk'] ]         // rows of equal length
//
// At boot each template is rasterised ONCE into an offscreen canvas and then
// only ever blitted. Nothing here runs per frame.
//
// TILE is the drawing resolution, not the display size: art is authored at 16
// pixels to a tile and the map scales it to whatever the camera zoom is, with
// `image-rendering: pixelated` doing the rest. Drawing at a fixed small size
// and scaling up is what makes it read as pixel art rather than as a blurry
// illustration.

export const TILE = 16;

/** id -> { canvas, frames: [canvas], width, height } */
const compiled = new Map();

/**
 * Check a template is actually drawable, and say precisely what is wrong.
 *
 * Art is data, and data written by hand goes wrong in boring ways: a row a
 * character short, a letter with no colour behind it. Both produce a silently
 * mangled sprite at runtime, so both are refused here with the row and column
 * to look at.
 */
export function validateTemplate(id, template) {
  const problems = [];

  if (!template || typeof template !== 'object') {
    return [`${id}: not a template object`];
  }
  if (!template.palette || typeof template.palette !== 'object') {
    problems.push(`${id}: no palette`);
  }
  if (!Array.isArray(template.frames) || template.frames.length === 0) {
    return [...problems, `${id}: no frames`];
  }

  const first = template.frames[0];
  const width = first?.[0]?.length ?? 0;
  const height = first?.length ?? 0;

  if (!width || !height) problems.push(`${id}: frame 0 is empty`);

  template.frames.forEach((frame, index) => {
    if (frame.length !== height) {
      problems.push(`${id} frame ${index}: ${frame.length} rows, expected ${height}`);
    }
    frame.forEach((row, y) => {
      if (row.length !== width) {
        problems.push(`${id} frame ${index} row ${y}: ${row.length} chars, expected ${width}`);
      }
      for (let x = 0; x < row.length; x++) {
        const char = row[x];
        if (!(char in (template.palette ?? {}))) {
          problems.push(`${id} frame ${index} at ${x},${y}: '${char}' is not in the palette`);
        }
      }
    });
  });

  return problems;
}

/** Rasterise one frame onto its own canvas. */
function rasterise(template, frame) {
  const width = frame[0].length;
  const height = frame.length;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // One ImageData beats thousands of 1x1 fillRects, and matters because this
  // runs for every sprite in the game during boot.
  const image = ctx.createImageData(width, height);
  const data = image.data;

  for (let y = 0; y < height; y++) {
    const row = frame[y];
    for (let x = 0; x < width; x++) {
      const colour = template.palette[row[x]];
      if (!colour) continue;                       // null / undefined = transparent
      const rgba = parseColour(colour);
      const at = (y * width + x) * 4;
      data[at] = rgba[0];
      data[at + 1] = rgba[1];
      data[at + 2] = rgba[2];
      data[at + 3] = rgba[3];
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

const colourCache = new Map();

/** '#rgb', '#rrggbb' and '#rrggbbaa' — enough for hand-authored art. */
export function parseColour(hex) {
  const cached = colourCache.get(hex);
  if (cached) return cached;

  let body = hex.replace('#', '');
  if (body.length === 3) body = [...body].map((c) => c + c).join('');
  if (body.length === 6) body += 'ff';

  const value = Number.parseInt(body, 16);
  const rgba = [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
  colourCache.set(hex, rgba);
  return rgba;
}

/**
 * Compile a whole table of templates.
 *
 * Called once per art file at boot. Throws on a bad template rather than
 * drawing something wrong: art that does not compile is a bug to fix, not a
 * thing to render approximately.
 */
export function register(table) {
  for (const [id, template] of Object.entries(table)) {
    const problems = validateTemplate(id, template);
    if (problems.length > 0) {
      throw new Error(`Bad sprite template:\n  ${problems.join('\n  ')}`);
    }

    const frames = template.frames.map((frame) => rasterise(template, frame));
    compiled.set(id, {
      frames,
      width: frames[0].width,
      height: frames[0].height,
    });
  }
}

export function hasSprite(id) {
  return compiled.has(id);
}

export function spriteIds() {
  return [...compiled.keys()];
}

export function spriteOf(id) {
  return compiled.get(id) ?? null;
}

/**
 * Draw a sprite into a destination rectangle.
 *
 * `frame` wraps, so a caller can pass a free-running counter without caring how
 * many frames a particular sprite happens to have — a two-frame torch and a
 * one-frame wall both take the same call.
 */
export function drawSprite(ctx, id, x, y, width, height, frame = 0) {
  const sprite = compiled.get(id);
  if (!sprite) return false;

  const canvas = sprite.frames[frame % sprite.frames.length];
  ctx.drawImage(canvas, x, y, width, height);
  return true;
}

/**
 * A sprite as a DOM element, for lists and buttons.
 *
 * The UI is full of emoji standing in for things the map now draws properly,
 * and several of them collide — an Ore Store and a Monster Stable are the same
 * glyph. A canvas of the actual sprite removes the ambiguity and makes the
 * screens look like the map.
 */
export function spriteEl(id, size = 24, frame = 0) {
  const sprite = compiled.get(id);
  if (!sprite) return null;

  const canvas = document.createElement('canvas');
  const scale = size / Math.max(sprite.width, sprite.height);
  canvas.width = Math.round(sprite.width * scale);
  canvas.height = Math.round(sprite.height * scale);
  canvas.className = 'sprite';

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite.frames[frame % sprite.frames.length], 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Recolour a template on the fly.
 *
 * Fifteen professions are not fifteen drawings: they are one body with
 * different clothes, and eight egg colours are one egg. This swaps palette
 * entries and returns a new template, so the variants stay data rather than
 * becoming copy-pasted grids that drift apart.
 */
export function recolour(template, swaps) {
  return {
    palette: { ...template.palette, ...swaps },
    frames: template.frames,
  };
}

/**
 * Lay one template over another, same size.
 *
 * How a profession gets its hat and tool without redrawing the body, and how a
 * building gets its "under construction" scaffold.
 */
export function layer(base, over, palettePrefix = 'o') {
  const width = base.frames[0][0].length;
  const height = base.frames[0].length;

  const palette = { ...base.palette };
  for (const [char, colour] of Object.entries(over.palette)) {
    if (colour !== null && colour !== undefined) palette[palettePrefix + char] = colour;
  }

  const frameCount = Math.max(base.frames.length, over.frames.length);
  const frames = [];

  for (let index = 0; index < frameCount; index++) {
    const under = base.frames[index % base.frames.length];
    const above = over.frames[index % over.frames.length];
    const rows = [];

    for (let y = 0; y < height; y++) {
      let row = '';
      for (let x = 0; x < width; x++) {
        const top = above[y]?.[x];
        const opaque = top !== undefined && over.palette[top] !== null
          && over.palette[top] !== undefined;
        row += opaque ? palettePrefix + top : under[y][x];
      }
      rows.push(row);
    }
    frames.push(rows);
  }

  // Multi-character palette keys need rows built from tokens, not characters,
  // so the overlay is flattened back to single characters here.
  return flatten({ palette, frames }, width, height);
}

/**
 * Turn a token-per-cell grid back into one character per cell.
 *
 * `layer` builds rows out of variable-length tokens; everything downstream
 * assumes one character is one pixel, so the tokens are re-keyed to single
 * characters before the template escapes.
 */
function flatten(template, width, height) {
  const used = new Map();
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    + '!@#$%^&*()[]{}<>+=~;:,?/|';
  let next = 0;
  const palette = { '.': null };

  const frames = template.frames.map((frame) => frame.map((row) => {
    // Rows are token streams: split them by walking known keys longest-first.
    const keys = Object.keys(template.palette).sort((a, b) => b.length - a.length);
    let out = '';
    let at = 0;
    while (at < row.length) {
      const key = keys.find((candidate) => row.startsWith(candidate, at));
      if (key === undefined) { at += 1; out += '.'; continue; }
      at += key.length;

      const colour = template.palette[key];
      if (colour === null || colour === undefined) { out += '.'; continue; }

      let char = used.get(colour);
      if (!char) {
        char = alphabet[next++];
        used.set(colour, char);
        palette[char] = colour;
      }
      out += char;
    }
    return out;
  }));

  return { palette, frames };
}
