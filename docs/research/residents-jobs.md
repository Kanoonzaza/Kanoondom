# Residents, Jobs and Skills

Source: [Skills](https://kairosoft.wiki.gg/wiki/Skills_(Kingdom_Adventurers)),
[Houses](https://kairosoft.wiki.gg/wiki/Houses_(Kingdom_Adventurers)),
[Manual transcript](https://kairosoft.wiki.gg/wiki/Transcript:Manual_(Kingdom_Adventurers)),
[Tips](https://kairosoft.fandom.com/wiki/Tips_(Kingdom_Adventurers)).

## The twelve stats

Every resident, every equipment piece and every facility aura speaks the same
vocabulary:

| Stat | Role |
|---|---|
| HP | Survivability |
| MP | Casting resource |
| Vigor | Productivity / stamina for work |
| ATK | Physical damage |
| DEF | Damage reduction — **ignored by magic** |
| SPD | **Turn order** in combat |
| Luck | Critical hit rate — **crits ignore DEF** |
| INT | Magic damage scaling |
| DEX | Accuracy / craft |
| Gather | Gathering yield |
| Move | Movement speed |
| Heart | Social / relationships |

## Arrival and life

- Residents arrive **as tourists or adventurers, by sea**. Clearing fog and
  restoring land attracts them; a higher-level **Port** attracts stronger ones.
- They are given land, and open a shop by profession (see
  [facilities.md](facilities.md)).
- Daily rhythm: **indoors in the morning, outdoors during the day, home to sleep
  at night**.
- They **marry** (double bed adjacency, Church for the ceremony) and, once the
  kingdom has at least three towns, **have children** — a stronger second
  generation.
- **Lifespan**: losing all HP costs a lifespan point; at zero the resident is
  gone permanently. *(We deviate — no permadeath. See design.)*
- Vigor governs how productive they are.

## Professions

Documented occupations include: Agriculturist, Miner, Researcher, Craftsperson,
Culinarian, Blacksmith, Artisan, Cook, Merchant, Monk, Archer, Knight, Mage,
Doctor, Champion, Beast Tamer.

Jobs are acquired through map exploration, the **Job Center** (unlocks around map
level 35; rank A units available), gacha, or inheritance through marriage. Some
skills are innate to a resident's original job.

A community tip: breeding a **Doctor or Champion** unlocks the **Beast Tamer**,
described as a powerful job with the full combat kit.

## Skills

Roughly **150 skills**. Acquisition routes:

- **Purchase** from a Skill Shop (run by a Mage), priced in copper coins
- **Produced** by a high-level workbench — e.g. "Workbench Lv. 38, Brain"
- **Ranking Board** achievements at Low / B / S ranks
- **Relationships** between residents

Categories:

| Category | Examples |
|---|---|
| Combat | Multi-hit attacks (2 to 7 hits), area attacks, elemental magic (Fire, Ice, Lightning — **five tiers each**), resistances |
| Support | Heals (Heal Maddy 15%, Heal M 35%), recovery, dodge (Perfect Dodge) |
| Utility | Crafting bonuses, research speed, gathering, construction speed |
| Tiered lines | Craftsmanship I–V and similar ladders |

Cost range: **25 to 1800 copper coins**. Cited points: Auto Recovery MP at 325,
Experience UP III at 1800, Lightning IV at 1000 — described as the most expensive
magic and the highest damage.

Combat notes worth carrying: **SPD sets turn order** (decisive at high level),
**magic ignores DEF and scales on INT**, **Luck-driven crits ignore DEF**, and
Armor Breaker skills cut enemy DEF by set percentages (10%, 25%).

## What this means for our build

- v1's four abstract classes become in-town people with twelve stats, a
  profession that opens a shop, a house, skills and equipment.
- The shop-opening rule is the heart of the economy: population growth is
  literally business growth.
- The stat vocabulary is shared across residents, equipment and facility auras —
  one schema, three consumers.
- We keep v1's principle of **showing the arithmetic** in combat, now over these
  richer stats.

## Open questions

- Full job list and how each is unlocked.
- Stat growth curves on level-up, per job.
- How skills are equipped/limited (slot count?).
- What Heart actually drives beyond marriage.
- Exact damage formula.
