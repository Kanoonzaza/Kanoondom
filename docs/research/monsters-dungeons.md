# Monsters, Combat, Dungeons

Source: [Monsters](https://kairosoft.wiki.gg/wiki/Monsters_(Kingdom_Adventurers)) (**marked a stub**),
[Manual transcript](https://kairosoft.wiki.gg/wiki/Transcript:Manual_(Kingdom_Adventurers)),
[Tips](https://kairosoft.fandom.com/wiki/Tips_(Kingdom_Adventurers)).

The dedicated Monsters page is a stub — it is essentially a location table. Most
of the actual mechanics below come from the manual and community tips.

## Species and where they live

**200+ monsters**, listed A–W (Aloha Kairobot, Alpacavalier, Assault Bee,
Cactitus, Drago, Flame Dragon, Ghost, …).

Spawns are keyed to **biome**: Grass, Desert, Rock, Snow, Swamp, Lava. Two
special cases:

- Monsters marked **(\*)** appear when **digging Soil**, not from a biome or
  wasteland.
- Monsters marked **(Sea)** appear from **digging or bridging seas**.

Each species appears at **several level tiers**. Example given: Assault Bee
appears at levels 15, 18, 21, 24, 33, 50, 62, 74 and 777 across different biomes.
So the same creature scales across the game rather than being replaced.

A community tip adds a hard rule: **the maximum level of cave monsters matches
your highest conquered map level** — difficulty tracks your progress, it is not
fixed per location.

## Nests and caves

- **Nests/caves spawn monsters continuously until cleared.** They are a
  persistent source, not a one-off encounter.
- **Caves appear on the night of a full moon.**
- Entering a cave **costs Energy**.
- Caves hold treasure and monsters useful for levelling warriors — described as
  well worth checking out.
- The **Legendary Cave** is the endgame version, and community advice pairs it
  with strong friends to obtain rare materials like Pretty Cloth.

Soil spawn control: a tip suggests laying **footpaths over wasteland** to
suppress unwanted soil monster spawns — spawning is terrain-driven and therefore
manipulable by building.

## Night and the full moon

| When | Behaviour |
|---|---|
| Night | Monsters are **more active** |
| Full moon | Monsters **attack the kingdom**, and caves appear |

Attacks target **the facilities nearest the town centres**. So defensive layout
matters: what you put near your Town Hall is what gets hit.

## Combat

Combat is **automatic**. The manual states that any adventurers, friends, or
ally monsters present **join a Conquest automatically** — the player does not
directly control a battle.

Boss fights ("Conquests") additionally require **the monarch's participation**.

What we know about the maths:

- **SPD determines turn order** — a tip calls this critical at high level in the
  arena.
- **Magic ignores DEF** and scales with **INT**.
- **Luck** drives critical hits, and **crits ignore DEF**.
- **Armor Breaker** skills reduce enemy DEF by fixed percentages (10%, 25%).
- Skills include multi-hit attacks from 2 up to 7 hits.

The full damage formula is **not published**.

## Consequences of losing

A resident reduced to zero HP loses a lifespan point (and at zero lifespan is
permanently lost — *we deviate here*). A tip notes the lifespan loss happens "if
no one's in town", implying town presence mitigates it.

## What this means for our build

- Nests that **spawn continuously until cleared** are a better pressure model
  than v1's abstract accumulating "raid pressure" — the threat has a visible
  source you can go and remove.
- Full-moon raids give the pressure a **rhythm** instead of a hidden timer, which
  is far more readable, and they pair naturally with our rule that raids never
  fire while the player is away.
- Automatic combat suits our offline design: battles that resolve without input
  are exactly what can happen while you are gone.
- We keep v1's best combat idea — **showing every term of the arithmetic** —
  since the real game's formula is unpublished anyway and we must design one.
- "Attacks hit what's nearest the centre" turns defensive layout into a real
  decision.

## Open questions

- **The damage formula.** We design our own.
- Spawn rates and how many monsters a nest emits over time.
- Boss/Conquest structure and rewards.
- How Energy costs scale with cave depth.
- What determines whether a monster is "shining" (the egg-dropping variant).
