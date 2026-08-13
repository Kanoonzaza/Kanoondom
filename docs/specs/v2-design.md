# Kingdom Sim v2 — Design Specification

**Date:** 2026-08-12
**Status:** Approved for build
**Supersedes:** the v1 spec in `Claude work\kingdom-sim\docs\specs\`

Grounded in [docs/research/](../research/INDEX.md), which records what the real
Kingdom Adventurers actually does. This document records what **we** will do,
and — explicitly — where and why we differ.

---

## 1. What this is

A browser kingdom-builder that follows the real Kingdom Adventurers' mechanics
closely: one tile world with territory radiating from Town Halls, residents who
arrive by sea and open shops matching their professions, facilities that project
stat auras, materials-and-samples research gated by Town Hall rank, equipment
that grows by level bonus, monsters that spawn from nests and raid on the full
moon, and eggs you steer into creatures by what you feed them.

With one thing the real game does not have, and the reason this project exists:
**it keeps growing while you are away.**

### Design pillars

Unchanged from v1. When two conflict, the higher wins.

1. **Growth continues while you are away.** Closing the app must never feel like
   a loss.
2. **Conquest is a decision, not a queue.**
3. **The economy is the engine.**
4. **No rush, no failure.** No deadline, no game over, nothing permanently lost.
5. **Layout has texture.** Now much more so: auras, adjacency, wasteland
   rotation, and what sits nearest your Town Hall when the moon is full.

---

## 2. Deliberate deviations from the real game

Everything else follows the research. These four are ours, on purpose.

### 2.1 Offline growth — the founding deviation

The real game **pauses when closed**. Ours does not. Carried over from v1
unchanged, because it is the whole point:

- Production continues at full rate while away.
- **Storage capacity is the only limit** — per resource type, which the real
  game's nine separate storage buildings suit perfectly.
- **Raids never fire while away.** Pressure builds, capped; a region already at
  threshold gets a season of grace on return.
- **Two clocks**: a simulation clock that always runs, and a **calendar clock
  that only advances during active play**, so a week away does not age the
  kingdom five centuries.
- Nothing can be lost in an absence.

*Note we diverge from the real game's storage rule specifically: there,
levelling a storage building raises its damage resilience, not its capacity. For
us capacity **is** the lever that extends how long you can be away, and it is the
most satisfying thing to upgrade. Ours wins.*

### 2.2 No permadeath

The real game deletes a resident whose lifespan reaches zero. Pillar 4 forbids
that. Instead, lifespan reaching zero **retires the resident to Elder** — they
stop adventuring, keep their house, and project a small town-wide aura as a
lasting benefit. Losing all HP still costs a lifespan point, so combat has
stakes; it just never costs you a person you have invested in.

Consequence: the real game's **Eternal Candle** (infinite lifespan) is
meaningless here and is dropped.

### 2.3 No gacha, diamonds, or purchases

The real game obtains some facilities and jobs through gacha, funded partly by
premium currency. We replace that source with a **Surveyor's Office**: a facility
that spends materials to commission a randomised survey returning new facility
types and job offers. Same role in the economy — a chance-based source of
variety — with no monetisation and no premium currency anywhere.

### 2.4 No server features

Friend IDs, Friend Post Office, Friends Agency, online Ranking Board and Weekly
Conquest all require a backend we deliberately do not have. Cut. Where they fed
another system (e.g. friends joining Conquests), ally monsters and residents fill
the gap.

**Also deferred, not cut:** Underground Arena, Trophy Room, Collector, Kairo
Room, endgame/New Game+ replay content.

---

## 3. The world

Following [world-and-map.md](../research/world-and-map.md).

- A grid of **zones**, each a **16×16 tile area**. Launch with a 6×6 zone world
  (36 zones); the schema supports the real game's ~100.
- **Biomes**: grass, desert, rock, snow, swamp, lava, plus soil and sea. Mixed
  within a zone, never uniform.
- **Territory is a radius around each Town Hall** — base **14 tiles**, **+2 per
  10 Town Hall levels**, up to **5 Town Halls**. Overlapping them wastes space,
  so placement is a real decision.
- **Fog** covers unexplored land. Clearing it attracts arrivals by sea.
- **Peace Level** gates world expansion at percentage thresholds combined with
  conditions (Town Hall count, rank). A growth gate, never a clock — which is
  exactly our pillar 4.
- **Wasteland**: gathering the same area too long degrades it; it can be
  restored. Gathering becomes a rotation decision.

## 4. Resources

Three coins and five materials, each separately stored:

| | |
|---|---|
| **Coins** | Bronze (equipment), Copper (residents spend; skills), Silver (special) |
| **Materials** | Wood, Grass, Food, Ore, Mystic Ore |
| **Other stored** | Items, Treasure, Eggs, Energy |

Nine storage types, each with a capacity that **is** the offline ceiling for that
resource, raised by High-Grade variants and by our level system.

**Energy** limits cave attempts per sitting.

## 5. Facilities

Following [facilities.md](../research/facilities.md). Four categories:
**Environment**, **Materials**, **Amenity**, **Indoor**.

The defining mechanic is the **aura**: every facility projects bonuses across the
twelve stats to residents nearby, plus percentage effects. Residents do not
reliably gain everything — using a facility may raise one or two stats, or yield
an item instead.

**Combos are ours.** The real game confirms adjacency compatibility exists but
does not publish the pairs, so we design a combo table in its spirit and mark it
as our invention.

Launch content: **~60 facilities** (schema supports 100+).

## 6. Residents

Following [residents-jobs.md](../research/residents-jobs.md).

- **Twelve stats**: HP, MP, Vigor, ATK, DEF, SPD, Luck, INT, DEX, Gather, Move,
  Heart. One vocabulary shared by residents, equipment and auras.
- Arrive **by sea** as fog clears; **Port level** raises arrival quality.
- **Profession opens a shop** — blacksmith → weapon shop, cook → restaurant
  (consumes food), merchant → inn, monk → church. Combat jobs open none. Shop
  stock quality tracks the occupant's level. *Population growth is business
  growth.*
- **Houses S–XL** decide occupancy and how much indoor furniture fits (a weapon
  shop has 3 shelves in a Small house, 9 in an XL).
- Daily rhythm: indoors morning, outdoors day, home at night.
- **Marriage** via adjacent double beds; **children** once the kingdom has three
  towns, with stronger second-generation stats.
- **Skills** bought with copper (25–1800), from workbenches, or via rank.
  ~40 at launch of the real game's ~150.

## 7. Equipment

Following [equipment.md](../research/equipment.md).

Five slots — weapon, head, armor, shield, accessory. Eight ranks **F→S**. Twelve
stat bonuses plus a **Level Bonus**.

**We keep the real game's best rule verbatim**: an item with a higher Level Bonus
beats one with higher base stats at max level. Growth rate over starting
numbers — it rewards understanding rather than hoarding.

Levelled at the **Master Smithy** (cost scales by rank; the diamond half of the
real cost is dropped). Job × equipment-type compatibility from optimal to
incompatible. Equipment gains **passive experience when residents shop in town**,
tying gear progress to a healthy economy.

Launch content: ~50 pieces.

## 8. Research

Following [research-system.md](../research/research-system.md).

**No research currency.** Research spends **materials and samples**, and
availability is gated by **Town Hall rank** — two independent axes: what is
offered, and whether you can afford it.

**Samples** are a distinct ingredient class gating the studies that need a
thing to copy. The real game splits them by equipment slot
(weapon/helmet/shield/armor/accessory); we ship one generic Sample and split it
when equipment lands in V6.

Town Hall rank is the master track: research availability, territory radius,
monarch rank (D→C→B→A→S every 15 levels).

**What raises rank (ours; the wiki never says).** A *promotion*, claimed by the
player, needing both **development** and a **fee**. Development counts
residents, standing facilities and explored tiles — the things we want the
player doing anyway, so getting promoted is never a separate errand from
playing.

**Study rate.** Studies finish on accumulated *study points*, not on a timer:
a base floor of 1/tick, plus researchers (scaled by their INT, which is mostly
a product of what stands near their house), plus Libraries. Because it is
accumulation rather than a countdown, a study left running finishes while the
player is away — the founding pillar applied to progression. Finishing a study
changes no production rate, so it needs no segment boundary of its own.

**Surveys** replace the real game's paid random pull. A Surveyor's Office
spends materials to reveal the nearest unexplored ground and bring back a find.
The land is the point: fog is the only thing between a new kingdom and its
second town hall.

**Map rewards** pay stock for exploring, at fixed tile thresholds.

### The floor rule

No resource may reach a value the kingdom cannot climb back from. The Town Hall
produces a trickle of every basic material regardless of what is built — a
floor, not an economy, since one Field out-produces the grass trickle five
times over.

Related and stricter: **no material's producers may all require that material.**
The V4 balance run found ore failing this. Every source of ore cost ore — the
mine (20), the Surveyor's Office (25), the promotion fee (80), and the study
that grants a mine sat behind that fee — so a player who spent their opening
ore on housing was finished, with nothing on screen to say so. Wood had the
same shape and survived only on generous starting stock. Both now have a
producer that costs none of themselves, and `economy.test.js` asserts the rule
for every material.

### Pacing

Exploration is the spine of progression, so it is paced by TIME, not money: a
survey puts the surveyors out of action for a season. Cost alone never bit — a
kingdom with full stores mapped all 9,216 tiles in two hours of play. The wait
runs on the simulation clock, so it passes while the player is away.

### The ceiling rule

Fog only lifts inside unlocked zones, so while ring *n* is the frontier the
highest reachable Peace Level is ring *n*'s share of the world. Any gate — or
map reward — set above that ceiling is not a gate but a locked door with no
key. Both shipped that bug once: ring 1 wanted 15% peace against an 11.1%
ceiling, and the first map reward wanted 1,200 tiles against 1,024.
`ringCeiling` plus tests in `research.test.js` now make it unshippable.

## 9. Monsters and combat

Following [monsters-dungeons.md](../research/monsters-dungeons.md).

- Species keyed to **biome and level tier**; the same creature reappears at
  higher tiers rather than being replaced. Soil and sea have their own sets.
- **Nests spawn monsters continuously until cleared** — a visible source you can
  go and remove, rather than v1's abstract accumulating pressure.
- **Night** makes monsters more active. **Full moon** brings a raid on the town,
  hitting **facilities nearest the centre**, and **caves appear**.
- **Caves cost Energy**, hold treasure, and their monster level tracks your
  highest conquered area.
- **Combat is automatic**: nearby adventurers and ally monsters join. Boss
  Conquests include the monarch.
- Known maths we honour: **SPD sets turn order**; **magic ignores DEF and scales
  on INT**; **Luck crits ignore DEF**.

**The damage formula is ours** — the real one is unpublished. We keep v1's best
idea: **every term of a battle is shown as a named line item**, so an automatic
battle is still something the player can learn to predict.

Launch content: ~60 monsters.

### V5 as built

**Nests are derived from the seed**, exactly like terrain; the save records only
which ones are cleared. A nest is a visible source of trouble you can go and
remove, which is the whole reason to model them rather than count up a hidden
timer.

**Peace no longer counts nests.** An earlier draft had them subtract, and it
cannot work: peace gates which rings are unlocked, so counting nests per
unlocked ring makes `peaceLevel` call `unlockedRing`, which calls `peaceLevel`
— straight recursion. Counting them world-wide instead pins peace near zero on
a fresh map and locks it there. Nests drive **Threat**; peace stays
exploration. Two numbers, each moving only the way the player pushes it.

**The offline promise, made concrete.** Threat accrues every segment; raids
resolve only when `offline` is false. That single asymmetry is the whole thing,
and it is one branch in `stepThreat`. Threat away is held under a lower ceiling
than live play allows, and returning grants a grace period so nobody is ever
ambushed by opening the page.

**Wards cap at 75%.** They multiply, so fifteen cheap torches took the leak to
99.9%: the balance run found a late kingdom at 100% wards, zero threat and one
raid in five hours. A defence you can max out with the cheapest building is an
off switch, not a defence.

**Difficulty follows the player.** Raid bands scale to the highest tier cleared,
per the research's explicit rule. Without it the nests near home stay tier 1 and
a kingdom with three knights can never lose a raid again — measured at 0 losses
in 20 across every seed.

**Losing costs buildings, never people**, and damaged buildings are repaired for
a fraction of their cost. A raid should cost an errand, not a rebuild — and
damage never evicts anyone, which is what made `freeBeds` go negative the first
time a raid hit a house.

## 10. Eggs

Following [creature-collection.md](../research/creature-collection.md).

**Shining monsters** drop eggs, collected automatically. Hatch in a **Monster
Stable** (town defence) or a **Monster Room** (expedition companion) — one egg,
two futures.

Hatching is **steered by feeding**: each egg wants a stat category (Attack,
Defense, Balanced, Special) across four bands — Low, Medium, High, and **Over,
which resets you to Low**. Overfeeding is punished, so you aim for a window. You
lose items, never a creature — the failure mode costs resources only, which keeps
pillar 4 intact.

Eight colour lines. Launch content: ~20 hatchable creatures.

**Monster Fusion Lab** is undocumented in every source; if built, the design is
entirely ours. Deferred past launch.

### How eggs stay safe for offline play (V8)

The system splits cleanly along the offline seam, and that split is the design:

| Step | When | Random? |
|---|---|---|
| An egg **drops** | live combat only | yes — but the player is present |
| An egg **incubates** | on the clock, online or off | no |
| An egg **hatches into** something | at a segment boundary | **no — pure function of the egg** |

So the only dice are rolled while somebody is watching, and what a creature
turns out to be is decided by the feeding, which was the player's decision.
Coming back to a hatched monster is a gift; coming back to a *random* monster
would be a slot machine.

A hatched ally fights and does nothing else — it changes no production rate —
so hatching needs no segment boundary of its own, only a report at one. That is
the same reasoning that lets equipment experience bank offline, and the opposite
of resident levels, which do change rates and so do get a boundary.

**The overfeed trap** is reproduced exactly as the research describes: bands are
Low / Medium / High / **Over**, and Over throws the hatch back to Low. It is the
whole mechanic — it makes feeding a window to hit rather than a slider to max —
and the UI shows the edge *before* the player crosses it, because a punishment
you could not see coming reads as the game cheating.

## 11. Time

- **Tick** = 1 real second. **Season** = 300 ticks (5 minutes). Four seasons a
  year.
- Speeds: pause, 1×, 2×, 3×.
- **Day/night** within a season drives resident behaviour and monster activity.
- **Full moon** on a fixed cycle drives raids and cave spawning.
- **Two clocks** as in §2.1 — the calendar advances only during active play.

## 12. Architecture

Carried over from v1 unchanged, because it worked:

    src/content/   tuning tables — every cost, rate, aura and bonus
    src/sim/       the rules. Pure, DOM-free, runs under Node
    src/ui/        rendering. Never mutates state
    tests/         node --test, exercising sim/ only

Plain ES modules. No framework, no build step, no dependencies, no runtime
network access. Seeded RNG everywhere; `Math.random()` banned in `sim/`.

`advanceTicks` walks time in **segments** that break at every event, so
`advanceTicks(state, N)` is identical to N single-tick calls **by construction** —
there is no separate offline code path to drift out of sync.

### Hard test gates, from V2 onward

1. **Offline parity** — catch-up over N seconds equals N ticks of play.
2. **No raids offline** — any absence fires zero raids.
3. **Never poorer** — no absence from 8 hours to two weeks leaves the player
   worse off.
4. **Calendar split** — time away does not age the kingdom.

## 13. Launch content volumes

| | Launch | Real game |
|---|---|---|
| Facilities | ~60 | 100+ |
| Professions | ~15 | ~16 documented |
| Equipment | ~50 | hundreds |
| Skills | ~40 | ~150 |
| Monsters | ~60 | 200+ |
| Hatchables | ~20 | dozens |
| World | 36 zones | ~100 |

Schemas support the real counts; tables grow after launch.

## 14. Deferred

Underground Arena · Monster Fusion Lab · Trophy Room · Collector · Kairo Room ·
endgame/New Game+ · anything requiring a server.
