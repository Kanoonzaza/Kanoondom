# Facilities

Source: [Facilities (Kingdom Adventurers)](https://kairosoft.wiki.gg/wiki/Facilities_(Kingdom_Adventurers)),
[Houses](https://kairosoft.wiki.gg/wiki/Houses_(Kingdom_Adventurers)),
[Tips](https://kairosoft.fandom.com/wiki/Tips_(Kingdom_Adventurers)).

Over **100 facilities** in four categories. Facilities are **stocked, not
unlimited** — you hold a limited supply of each type, obtained through research,
surveys, and map rewards. They can be removed and relocated by paying the cost
again.

## The four categories

### Environment (~16 types)
Town Hall, land plots in sizes S/M/L/XL, paths, bridges, walls, gates, and
territory-extending structures (torches, watchtowers, turrets), plus decorative
pieces. Provide movement speed and defensive bonuses. Unlocked by research or
map rewards.

### Materials (~27 types)
Two jobs: **production** (plantation, field, ranch, mines) and **storage**.
Storage is per-resource — separate buildings for Items, Grass, Wood, Food, Ore,
Mystic Ore, Treasure, Eggs and Energy — with High-Grade variants holding more.

Note the wiki's remark that upgrading a storage facility's level raises its
**resilience to damage**, not its capacity. Capacity comes from High-Grade
variants and from building more. (We deviate here — see design notes.)

### Amenity (~32 types)
Recovery spots (bench, rejuvenation spring, temporary shelter), experience
granters (fountain, goddess statue, rest stop), functional structures
(expedition hut, fishing pond, monster stable, analysis lab), and defensive
tools (traps, monster repellents).

### Indoor (~45 types)
Furniture placed **inside houses**: beds, training equipment (magic training
ground, shooting range, training room), production items (cooking counter,
dining table, stove), bookshelves, storage, workshops. How many fit depends on
house size.

## The aura system — the defining mechanic

Every facility projects bonuses to residents near it, across **twelve stats**:

`HP · MP · Vigor · ATK · DEF · SPD · Luck · INT · DEX · Gather · Move · Heart`

On top of flat stat bonuses, facilities carry **area-of-effect percentage
effects** — for example wall types granting "+5% Vigor EXP" or "+5% SPD EXP",
monster repellents adding "+5–6% Max Durability", a windmill giving "+20% Max
Durability".

Crucially, the wiki notes residents do **not** reliably gain everything listed:
using a facility "maybe just 1 or 2 stats will go up, or maybe you will just get
an item from it." So auras are opportunity, not guaranteed yield.

## Representative facility data

Indoor facilities, level 1, from the wiki's tables:

| Facility | HP | ATK | DEF | INT | Move | Gold | Function |
|---|---|---|---|---|---|---|---|
| Study Desk | — | — | — | 25 | — | 65 | Grants EXP when used |
| Dining Table | 5 | — | — | 15 | 15 | 55 | Sometimes produces meals |
| Bookshelf | 5 | — | — | 15 | 10 | 130 | Grants EXP when used |
| Stove | — | — | 5 | — | 15 | 335 | Sometimes produces meals |
| Training Room | — | 10 | — | 5 | 5 | — | Training raises stats |
| Magic Training Ground | — | — | — | 12 | — | — | Training raises stats |
| Fountain | — | — | 20 | 10 | 10 | — | Grants EXP when used |
| Kairo King Statue | 10 | 10 | 10 | 15 | 15 | — | Decorative, broad aura |

Per-facility data fields: name, note, twelve stat bonuses at level 1, AoE
percentage effects, special function, unlock requirement (research / map reward /
gate / building dependency), and for indoor items a level increment cost and
gold cost.

## Houses and shops

Houses are where the indoor layer lives and where profession income comes from.

| Aspect | Detail |
|---|---|
| Entry house | Commoner's House, free |
| Upgrade | Mansion, costs 20 Metal Ore, larger capacity |
| Sizes | S / M / L / XL — decide occupancy and indoor capacity |
| Shelf example | Weapon Shop has 3 shelves in a Small house, **9 in an XL** |
| Monster House | Stacks 2–5 monster rooms depending on size |
| Marriage | Place a **Double Bed** adjacent |

**Profession opens a shop automatically.** When a resident gains a job — by map
exploration, Job Center, gacha, or marriage — they open the matching building:

| Profession | Opens | Cost / note |
|---|---|---|
| Blacksmith | Weapon Shop | 12 Ore; perk: Weapon level-up |
| Artisan | Furniture Shop | perk: Shield level-up |
| Cook | Restaurant | consumes Food |
| Merchant | Inn, Analysis Lab | — |
| Researcher | Research Lab | — |
| Monk | Church | enables marriages |
| Archer / Knight / Mage | *(no shop — combat roles)* | — |

Shops earn money by selling to tourists and adventurers, and **stock quality
tracks the occupant's level**.

## Combos / compatibility

The wiki states plainly that a facility's stats "may be different if close to
another facility that has compatibility/synergy" — so the system exists — but
**it does not list the pairs**. This is our single biggest content gap.

We will design our own combo table in the spirit of the system (see
`docs/specs/v2-design.md`) rather than guess at theirs.

## What this means for our build

- v1's 17 buildings with a `likes` list become ~60 facilities across four
  categories with real 12-stat auras.
- The indoor layer is a genuine second placement puzzle inside houses, and it is
  what makes house size matter.
- Per-resource storage buildings fit our storage-capped offline model naturally —
  each resource gets its own ceiling to raise.

## Open questions

- **Combo pairs and their magnitudes** (designing our own).
- **Aura radius in tiles.**
- Facility level mechanics beyond indoor items and storage durability.
- Exact stock limits per facility type.
