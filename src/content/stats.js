// The twelve resident stats (research: facilities.md, equipment.md).
//
// Every facility aura, every piece of equipment, and every training item in the
// real game speaks in these twelve columns. Getting the vocabulary right now
// means residents (V3) and equipment (V6) drop straight in.

export const STATS = {
  hp: { id: 'hp', name: 'HP', icon: '❤️', blurb: 'How much punishment a resident can take.' },
  mp: { id: 'mp', name: 'MP', icon: '🔵', blurb: 'Fuel for skills and magic.' },
  vigor: { id: 'vigor', name: 'Vigor', icon: '💪', blurb: 'Stamina for work; low vigor means idling.' },
  atk: { id: 'atk', name: 'ATK', icon: '⚔️', blurb: 'Physical damage dealt.' },
  def: { id: 'def', name: 'DEF', icon: '🛡️', blurb: 'Physical damage resisted. Magic ignores it.' },
  spd: { id: 'spd', name: 'SPD', icon: '💨', blurb: 'Decides who strikes first.' },
  luck: { id: 'luck', name: 'Luck', icon: '🍀', blurb: 'Critical hits, which ignore defence.' },
  int: { id: 'int', name: 'INT', icon: '🔮', blurb: 'Magic damage, and research speed.' },
  dex: { id: 'dex', name: 'DEX', icon: '🎯', blurb: 'Accuracy and craftsmanship.' },
  gather: { id: 'gather', name: 'Gather', icon: '🧺', blurb: 'How much a resident brings home.' },
  move: { id: 'move', name: 'Move', icon: '👟', blurb: 'How quickly they cross the map.' },
  heart: { id: 'heart', name: 'Heart', icon: '💗', blurb: 'Friendship, marriage, and morale.' },
};

export const STAT_IDS = Object.keys(STATS);

export function emptyStats() {
  return Object.fromEntries(STAT_IDS.map((id) => [id, 0]));
}

/** Add `b` into `a` in place. The hot path of the aura engine. */
export function addStats(a, b) {
  for (const id of STAT_IDS) {
    if (b[id]) a[id] = (a[id] ?? 0) + b[id];
  }
  return a;
}

export function scaleStats(stats, factor) {
  const out = {};
  for (const id of STAT_IDS) if (stats[id]) out[id] = stats[id] * factor;
  return out;
}

export function statDef(id) {
  const stat = STATS[id];
  if (!stat) throw new Error(`Unknown stat: ${id}`);
  return stat;
}
