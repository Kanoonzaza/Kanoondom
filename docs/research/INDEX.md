# Kingdom Adventurers — Research Index

Reference notes on the real game, gathered so that Kingdom Sim v2 can follow its
mechanics closely. Everything here is **re-expressed in our own words** from the
community wikis; no wiki prose or Kairosoft assets are copied. Sources are cited
per section in each file.

Primary source: `kairosoft.wiki.gg` (Kingdom Adventurers pages).
Secondary: `kairosoft.fandom.com` mirrors, and the in-game manual transcript.

| File | System | Confidence |
|---|---|---|
| [world-and-map.md](world-and-map.md) | Zones, biomes, fog, territory, Peace Level | Good on structure, thin on tile rules |
| [facilities.md](facilities.md) | 100+ facilities, four categories, auras, indoor layer | Good on structure and stats, **combos undocumented** |
| [residents-jobs.md](residents-jobs.md) | Residents, 12 stats, professions, shops, houses, marriage, skills | Good |
| [equipment.md](equipment.md) | 5 slots, ranks F–S, level-bonus growth, Master Smithy | Good |
| [items-treasure.md](items-treasure.md) | Training items, pet items, research materials | Moderate |
| [research-system.md](research-system.md) | TH-rank-gated, materials + samples | Good on structure, partial cost tables |
| [monsters-dungeons.md](monsters-dungeons.md) | 200+ species, nests, night/full moon, combat, caves | **Wiki page is a stub** — combat detail from manual/tips |
| [creature-collection.md](creature-collection.md) | Eggs, hatching, stables, ally monsters | Good; **fusion undocumented** |
| [economy-time.md](economy-time.md) | Three coins, five materials, Energy, day/night | Good |

## One-paragraph summaries

**World.** One contiguous world of roughly a hundred zones on an A–J × 1–10 grid,
each zone a 16×16 tile area, spread across grass/desert/rock/snow/swamp/lava
biomes plus soil and sea. Territory is not "regions you own" but a **radius
around each Town Hall**. New parts of the world unlock at Peace Level
percentage thresholds combined with conditions like Town Hall count and rank.

**Facilities.** Over a hundred, in four categories — Environment, Materials,
Amenity, and Indoor (furniture inside houses). The defining mechanic is the
**aura**: a facility projects bonuses across the twelve resident stats to
people nearby, plus percentage effects. Facilities are stocked, not unlimited:
you obtain copies through research, surveys, and map rewards.

**Residents.** People with twelve stats who arrive by sea, take a house, and —
critically — **open a shop matching their profession**. A blacksmith opens a
weapon shop; a cook opens a restaurant that consumes food. House size decides
how much indoor furniture fits, which in turn feeds the aura system. They marry,
have children, learn skills, and wear equipment.

**Equipment.** Five slots, eight rarity ranks F→S, twelve-stat bonuses, and a
per-level growth figure that matters more than the base numbers. Levelled at the
Master Smithy. Residents shopping in town passively raise equipment experience.

**Economy.** Three separate coin types plus five materials, each with its own
storage building — which fits our storage-capped offline model well. Research
spends materials and samples rather than an abstract research currency, and is
gated by Town Hall rank.

**Monsters.** Species keyed to biome and level tier. Nests spawn monsters
continuously until cleared. Monsters are livelier at night and **attack the town
on the full moon**, targeting facilities nearest the centre. Combat is
**automatic** — whoever is nearby joins in. Caves appear on full-moon nights and
cost Energy to enter.

**Eggs.** Shining monsters drop eggs; you incubate them and feed training items
to steer which creature hatches via stat thresholds. Hatchlings either defend the
town or accompany parties.

## Biggest open questions

1. **Facility combo pairs.** The wiki confirms adjacency compatibility exists but
   does not list the pairs. We design our own, in the spirit of the system.
2. **Aura radius.** Facilities clearly affect residents "nearby"; the actual
   radius in tiles is not documented.
3. **Real-time pacing.** No source states how long an in-game day or month takes
   in real seconds. Moot for us — our clock is already our own (see
   [economy-time.md](economy-time.md)).
4. **Combat resolution detail.** Turn order is documented as SPD-driven and magic
   as ignoring DEF, but the full damage formula is not published.
5. **Spawn rates.** Which monster appears, how often, at what level, is tabulated
   by biome but not by rate.
6. **Monster Fusion Lab.** Named on the main page, mechanics undocumented.

Where a system is undocumented we design deliberately and mark it in
`docs/specs/v2-design.md` as ours rather than the real game's.
