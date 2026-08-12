# Equipment

Source: [Equipment (Kingdom Adventurers)](https://kairosoft.wiki.gg/wiki/Equipment_(Kingdom_Adventurers)),
[Tips](https://kairosoft.fandom.com/wiki/Tips_(Kingdom_Adventurers)).

## Slots and ranks

Five slots: **Weapon, Head, Armor, Shield, Accessory**.

Eight rarity ranks, **F → E → D → C → B → A → S** (F basic, S legendary).

Each piece grants bonuses across the same twelve stats residents use, and each
has a **Level Bonus** — how much it gains per level.

## The rule that governs everything

The wiki is emphatic about this, and it is the most important design fact in the
system:

> An item with a higher Level Bonus will always be better than an item with
> higher base stats at level 99.

So **growth rate beats starting numbers**. A humble item with a good Level Bonus
out-scales a flashy one. That inverts the usual "rarity = power" reflex and makes
investment decisions interesting.

## Representative data

| Item | Rank | HP | Vigor | ATK | SPD | Level Bonus |
|---|---|---|---|---|---|---|
| Bronze Sword | F | 1 | — | 9 | 4 | +2 |
| Copper Sword | E | — | 3 | 15 | 9 | +2 |
| Ice Scalpel | A | — | 12 | 53 | 37 | +4 |
| Blizzard Sword | S | 15 | — | 63 | 45 | +5 |

## Levelling — the Master Smithy

Equipment is levelled at the **Master Smithy**, spending Kairo currency (and
diamonds in the real game's monetised layer, which we drop).

Cost to level, by rank:

| Rank | Cost per level |
|---|---|
| F | 3 |
| E | 20 |
| D | 80 |
| C | 190 |
| B / A / S | 0 — special unlock requirements instead |

At a level cap, an item can be **Unlocked** to raise the cap, using specific
Kairo-type items obtained through the **Equipment Exchange**.

A strong community tip: early on, level **only the 3-cost items** (Novel, Wooden
Stick, Wooden Sandal). C-rank and above eat resources disproportionately. This is
the "cheap thing with good growth beats expensive thing" principle in practice.

## Job compatibility

Each profession has a compatibility grade with each weapon and armor type,
ranging from **optimal ("O")** through **weak ("w")** to **incompatible (∅)**.
So gear choice is per-job, not universal.

## Passive equipment experience

Equipment gains experience **when residents shop in the kingdom's stores** — the
wiki notes residents buying an item in a store raises the equipment's EXP. Gear
therefore improves as a side effect of a healthy town economy, not only through
deliberate spending.

## What this means for our build

- Equipment is entirely new to us — v1 had only a flat Smithy bonus.
- The Level-Bonus-beats-base-stats rule is a genuinely good mechanic and worth
  reproducing faithfully; it rewards understanding over hoarding.
- Passive EXP from shop visits ties the equipment system to the town economy,
  which fits our "economy is the engine" pillar.
- We drop the diamond/IAP half of the levelling cost entirely.

## Open questions

- Full stat spread per item (tables list twelve columns; we sampled a few).
- Exact level caps per rank and the Unlock requirements.
- The full job × equipment-type compatibility matrix.
- Rate of passive EXP per shop visit.
