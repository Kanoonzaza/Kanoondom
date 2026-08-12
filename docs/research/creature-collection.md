# Eggs and Creature Collection

Source: [Eggs (Kingdom Adventurers)](https://kairosoft.wiki.gg/wiki/Eggs_(Kingdom_Adventurers)),
[Kingdom Adventurers main page](https://kairosoft.wiki.gg/wiki/Kingdom_Adventurers).

## Getting eggs

Eggs drop from **shining monsters** — a special variant that sometimes appears
outside the town. You deploy strong residents to kill them; residents then
**collect and store the eggs automatically** in Egg Storage.

## Two incubators, two roles

| Facility | Produces |
|---|---|
| **Monster Stable** | Monsters that **defend the town** |
| **Monster Room** | Monsters that **accompany their owner** on quests, against bosses and into caves |

So the same egg can become a home-defence unit or a field companion depending on
where you hatch it. That is a genuine decision at the moment of incubation.

## Hatching is steered, not random

This is the clever part. While an egg incubates, you **feed it training items**
to raise specific stats, and **which stats you raise determines what hatches**.

Each egg wants a particular stat category:

- **Attack**
- **Defense**
- **Balanced**
- **Special**

And there are four thresholds:

| Tier | Meaning |
|---|---|
| Low | The starting band |
| Medium | Intermediate |
| High | Better outcomes |
| **Over** | **Exceeding this resets your chances back to Low** |

That "Over" band is the trap and the skill of the system: overfeeding is
punished, so you aim for a window rather than maximising. Cost scales with rank —
the wiki notes roughly **10 items used per rank of egg**.

## Egg colours

Eight colours, each mapping to different creature lines with distinct starting
skills and an unlockable second skill:

`White · Yellow · Black · Blue · Green · Purple · Red · Rainbow`

Rainbow is the legendary tier — the wiki cites Kairo Kommander as an example.

Named examples with their skills: **Alpacavalier** (2-Hit Attack), **Flame
Dragon** (4 Consecutive Attacks).

## Ally monsters in combat

Per the manual, **ally monsters join Conquests automatically** alongside
adventurers — they are combat participants, not decorative pets.

## Monster Fusion Lab

Listed among the special buildings on the main page, but **its mechanics are not
documented** on any page we could reach. If we build it, the design is ours.

## What this means for our build

- The stat-steering-with-an-overfeed-penalty mechanic is the best idea in this
  system and worth reproducing precisely. It turns hatching into a judgement
  call with a real failure mode that costs resources but nothing permanent —
  which fits our no-punishment pillar (you lose items, never a creature).
- Stable-versus-Room is a clean fork: defence or expedition.
- Ally monsters joining automatically fits our offline model — they can defend
  the town without the player present.
- Eight colour lines gives us a natural content ladder to grow over time; we can
  launch with fewer and extend.

## Open questions

- **Monster Fusion Lab mechanics** — entirely undocumented.
- Exact stat thresholds per egg colour and rank.
- Incubation duration.
- How ally monster levels and skills progress after hatching.
- What makes a monster "shining", and how often they appear.
