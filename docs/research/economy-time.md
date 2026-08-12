# Economy, Resources and Time

Source: [Manual transcript](https://kairosoft.wiki.gg/wiki/Transcript:Manual_(Kingdom_Adventurers)),
[Tips](https://kairosoft.fandom.com/wiki/Tips_(Kingdom_Adventurers)),
[Facilities](https://kairosoft.wiki.gg/wiki/Facilities_(Kingdom_Adventurers)).

## Three separate currencies

Unusually, money is not one number:

| Coin | Used for |
|---|---|
| **Bronze** | Equipment purchases |
| **Copper** | What residents spend; skill purchases |
| **Silver** | Special facilities (museums, zoos) |

Copper is the one the player optimises hardest. Community tip: visitors arriving
at ports pay copper at shops, and **signboards steer them** from the port through
your commercial district. A described "copper town" setup runs 8–9 skill shops
with cash registers plus restaurant shelves stocked with high-value scrolls.

## Five materials

| Material | Where it comes from |
|---|---|
| **Wood** | Trees and wood stacks, via deployment |
| **Grass** | Grass biomes, or Field buildings |
| **Food** | Grass biomes, fruit trees, or Rancher + Monster Feed |
| **Ore** | Rocky and desert biomes, or Ore Mines |
| **Mystic Ore** | Snow areas, red crystals, or Mystic Ore Mines |

Plus **Items**, **Treasure**, **Eggs** and **Energy**, each with its own storage
building — nine storage types in total.

## Storage

Storage is **per resource type**, with High-Grade variants holding more. A tip
notes the first High-Grade Storage can be had for 0 Silver Coins with a B+ rank
Survey resident.

The wiki also notes that levelling a storage facility raises its **resilience to
damage rather than its capacity** — capacity comes from High-Grade variants and
from building more of them.

*(Design note: v1 made storage level = capacity, and it worked well as the lever
that extends how long you can be away. We keep our version — see the deviations
list in the spec.)*

## Energy

Spent to attempt caves and dungeons. It is a limiter on how much dungeon-diving
you can do in a sitting, and it has its own storage building.

## Gathering has a spatial cost

Residents are deployed to areas to gather. Deploying to one place for too long
**degrades it into wasteland**, which then needs restoring. Gathering is
therefore a rotation problem, not just a throughput problem.

A tip describes placing a **Wasteland Guide + Expedition Hut next to Gates** for
a renewable loop of biome resources and a steady monster supply.

Deployment cost scales with **distance travelled and the ally's job rank**.

## Time

Three periods of day, each changing behaviour:

| Period | Residents | Monsters |
|---|---|---|
| Morning | Mostly indoors | — |
| Day | Outdoors, working | — |
| Night | Home, asleep | **More active** |

And on top of that a **moon cycle**: on the **full moon**, monsters get rowdy and
attack the kingdom, and **caves appear**.

## Real-time pacing — the gap

No source states how long an in-game day or month takes in real seconds. The only
hard real-time figure found anywhere in the wikis is incidental: an Hourglass
item takes 1 minute 40 seconds to empty.

This does not matter much for us, because the real game **pauses when closed** and
ours does not. Our clock is already a deliberate deviation: a five-minute season,
a simulation clock that always runs, and a calendar clock that only advances
during active play.

## What this means for our build

- v1's three resources become **three coins + five materials + Energy**, each
  separately stored — which gives the offline overflow panel much more to say.
- The full-moon cycle is a real pacing beat we should keep; it gives the night a
  point and gives raids a rhythm rather than a random timer.
- Wasteland makes gathering a placement decision, adding the texture v1 got only
  from adjacency.
- Signboards steering visitors from port to shops is a lovely, cheap layout
  mechanic worth reproducing.

## Open questions

- Rates: how much copper a visitor spends, how fast materials accrue.
- How Energy regenerates.
- Wasteland degradation and restoration rates.
- Exact full-moon period in in-game days.
