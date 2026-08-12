# World and Map

Source: [Map (Kingdom Adventurers)](https://kairosoft.wiki.gg/wiki/Map_(Kingdom_Adventurers)),
[Tips](https://kairosoft.fandom.com/wiki/Tips_(Kingdom_Adventurers)),
[Manual transcript](https://kairosoft.wiki.gg/wiki/Transcript:Manual_(Kingdom_Adventurers)).

## Shape of the world

The world is one continuous place, not a set of separate levels. It is laid out
as a grid of **zones** labelled by column A–J and row 1–10 — roughly a hundred
zones — and **each zone is a 16×16 tile area**. The player starts in a zone near
the middle (the wiki marks the starting area as 9).

Zones are numbered as areas (the wiki references area numbers up to the
thousands as reward identifiers). Areas award occupations, equipment, items,
tickets, facilities, and treasure when explored.

## Biomes

Documented terrain types:

| Biome | Notes |
|---|---|
| Grass | Baseline; grass and food gathering |
| Desert | Ore-bearing |
| Rock | Ore-bearing |
| Snow | Mystic ore, rare cloth |
| Swamp | — |
| Lava | Late-game |
| Soil | Diggable; **spawns its own monster set**, distinct from biome monsters |
| Sea | Crossed by bridging; has its own monsters |

Important caveat the wiki states directly: a zone's colour label does not mean
the whole zone is that biome. Biomes are **mixed within a zone**, so a "snow"
zone contains other terrain too.

## Territory

Territory is not "regions you own". It is a **radius around each Town Hall**.

| Rule | Value |
|---|---|
| Base Town Hall radius | 14 tiles |
| Radius growth | +2 tiles per 10 Town Hall levels |
| Example | TH level 10 → 16, level 20 → 18 |
| Town Halls allowed | Up to 5 (map rewards at areas 20, 41, 52, 75) |

Tip from the community: place Town Halls **far apart**, because overlapping
radii waste buildable area.

Monarch rank advances every 15 Town Hall levels: D→C at 15, B at 30, A at 45,
S at 60.

## Unlocking the world — Peace Level

New parts of the world open at **Peace Level** percentage thresholds, combined
with other conditions. Documented gates:

| Peace Level | Additional requirement | Unlocks |
|---|---|---|
| 59% | — | Columns B3–B10 |
| 69% | — | Row B2–J2 |
| 77% | 3 Town Halls | Column A2–A10 |
| 89% | 5 Town Halls, Rank 50, 1 child | Row F1–J1 |
| 94% | 5 Town Halls, Rank 80, 7 collected items | Row A1–E1 |

This is the real game's answer to "what stops me expanding immediately", and it
is a **growth gate, not a clock** — which matches our no-deadline pillar exactly.

## Fog, wasteland and immigration

- Land starts fogged. Clearing fog and restoring land **attracts visitors from
  across the sea**; a higher-level Port attracts stronger arrivals.
- Deploying residents to gather in an area for too long **degrades it to
  wasteland**, which can be restored. So gathering has a spatial cost, not just
  a time cost.
- Residents can build **bridges** to cross rivers and reach new ground.

## What this means for our build

- Replace v1's 14-region node graph with a real tile world and Town-Hall-radius
  territory.
- Peace Level is a clean fit for our "gates come from growth, never a clock".
- Wasteland gives gathering a genuine placement decision, which suits the
  "layout has texture" pillar better than v1's adjacency-only rule.

## Open questions

- Exact tile-level biome generation rules within a zone.
- What contributes to Peace Level, and at what rate.
- Whether zone unlocking is purely gated or also costs resources.
- The full area-reward table (areas 1–99 have rewards; only fragments cited).
