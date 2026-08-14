# Kingdom Sim

A kingdom-builder in the shape of Kairosoft's *Kingdom Adventurers*, with one
deliberate difference that is the reason it exists:

> **Your kingdom keeps growing while you are away.**

Not at a penalty. Not for a capped window. At full rate, until your storage
fills — and storage is the only thing that ever caps it. Nothing drains, nothing
attacks while nobody is watching, and the calendar does not advance without you.
Come back after a night and your fields have been working, your scholars have
finished a study, your gear has learned from the town's trade, and somebody may
have been born.

Plain HTML, CSS and ES modules. No framework, no build step, nothing fetched at
runtime. It installs to a phone's home screen and opens with no signal at all.

## Playing it

**[kanoonzaza.github.io/Kanoondom](https://kanoonzaza.github.io/Kanoondom/)** — open it on a phone
and add it to the home screen:

- **iPhone:** Share, then *Add to Home Screen*. This also stops Safari clearing
  the save after a week away, which is the one thing that can lose a kingdom.
- **Android:** the browser will offer to install it, or use *Add to Home screen*
  from the menu. There is a button for it in Settings too.

Once installed it opens with no signal at all, and with no browser furniture.

Or run it yourself:

```bash
play.bat
```

or

```bash
node server.js 8778
```

then open <http://localhost:8778>. The server exists only because ES modules
will not load over `file://`; it serves static files and nothing else. It prints
a LAN address too, so a phone on the same wifi can open it.

Phone-first, and meant it: bottom navigation, 44px targets, sheets you can swipe
away, a map you pan and pinch, and the device back gesture wired to close what
is in front of you rather than leave the game.

### On a phone, properly

Served over HTTPS the game is installable. Add it to the home screen and it runs
without browser furniture, launches offline, and — the part that matters on
iOS — stops being subject to Safari clearing the storage of sites you have not
opened in a week. Settings has an export button for everything else.

## The promise, precisely

Four rules, and there is a test file whose whole job is to prove each of them
(`tests/offline.test.js`):

1. **An absence never leaves you poorer.** Not in any resource, not a resident,
   not a level, not a study, not a building. There is no upkeep anywhere in the
   game, so there is nothing that can drain.
2. **An absence never ages your kingdom.** Two clocks: the simulation clock
   always runs, the *calendar* only moves while you are playing. Time away fills
   your stores; it does not spend your years.
3. **Nothing attacks while you are gone.** Monsters gather pressure offline —
   they do not wait politely — but nothing ever resolves, and you get a period
   of grace when you return.
4. **Storage is the only cap.** Which makes storage buildings the most valuable
   thing you can invest in, and the welcome-back panel tells you exactly *when*
   each store filled, so you know what more of it would have been worth.

## How it works

The heart of it is a **segmented clock** (`src/sim/tick.js`). Time is walked in
segments, and a segment runs from now until the next moment anything can change:
a season boundary, an arrival, a level-up, a birth, a building finishing. Inside
a segment every rate is constant, so the whole span resolves in closed form.

Because segments break exactly where behaviour changes, `advanceTicks(state, N)`
visits the same boundaries in the same order as N calls of `advanceTicks(state, 1)`.
There is no separate "offline path" that could drift out of sync with the live
one — catch-up runs the *same function* the live loop does. That is what makes
the promise testable rather than hopeful, and several test files check it at
every chunk size.

Two consequences worth knowing, because they shape everything:

- **Anything that changes a rate needs a boundary.** Arrivals, resident levels
  and births do, so the clock computes exactly when the next one lands.
- **Anything that does not, must not have one.** Equipment experience and study
  points accumulate as plain numbers; breaking a segment for them would cost
  everything and buy nothing. Equipment levels are therefore *claimed at the
  forge* rather than granted automatically — see the note atop
  `src/sim/equipment.js`.

Terrain is never stored. `biomeAt(state, x, y)` is a pure function of the seed,
so a 96×96 world costs nothing in the save; only what the player changed is
written down.

## What is in it

| | |
|---|---|
| **World** | 6×6 zones of 16×16 tiles, fog, territory as a radius around each Town Hall, Peace Level gating expansion |
| **Economy** | 3 coins, 5 materials, tomes and samples, energy — each stored separately |
| **Facilities** | 33 across four categories, levels 1–5, twelve-stat auras that reach the houses near them |
| **Residents** | 15 professions, houses that decide both beds and shopfront, levelling by living there |
| **Research** | 32 studies. No research currency: materials and tomes, gated by Town Hall rank |
| **Surveys** | Spend materials to reveal land and bring back a find — our replacement for the real game's paid pull |
| **Monsters** | 13 species, nests by biome and tier, threat, full-moon raids, caves that cost Energy |
| **Equipment** | 35 pieces, 5 slots, ranks F–S, and the rule that growth beats base stats |
| **Skills** | 24, bought with copper, permanent, per person |
| **Creatures** | 8 egg colours, 22 creatures, stat-steered hatching with an overfeed trap |
| **Family** | Marriage, and children who are permanently stronger than anyone who arrives by sea |

## Deliberate differences from the real game

- **Offline growth**, as above. The real game pauses when closed.
- **No permadeath.** Nobody dies. Nothing is ever taken.
- **No gacha, no currency purchases.** The randomised source of new facilities is
  a Surveyor's Office that spends materials you produced.
- **No server features.**

Everything else follows the research in `docs/research/`, which cites its
sources and keeps an open-questions section per system.

## Working on it

```bash
npm test          # run serially: wall-clock assertions flake in parallel
npm run balance   # headless play: hours of it, checked end to end
npm run icons     # redraw the home-screen icons
npm run precache  # regenerate the service worker's asset list
```

`sw-precache.js` is generated and committed, and `tests/pwa.test.js` walks the
tree again and fails if it has drifted. Forgetting to regenerate it would break
nothing locally and everything for an installed player with no signal, which is
the worst possible place to find out.

The service worker does not register on localhost unless you ask for it with
`?sw=1`. A cache-first worker and an afternoon of editing source files fight
each other, and the worker wins.

The balance run is not a test suite. It plays the game — thirty sessions of ten
minutes with eight hours away between them — and asserts that the promise holds
and that a kingdom played *sensibly* actually gets somewhere. It has caught
things no unit test could: an economy that bankrupted a two-day absence, raids
every eight minutes, a map that was mathematically impossible to unlock, and a
population that grew without bound.

**Read [docs/lessons.md](docs/lessons.md) before starting anything.** It is a
list of the mistakes this project has actually made — most of them twice — and
the rules that came out of them. The recurring one is per-entity work on the
clock's hot path; it has cost an order of magnitude three separate times.

- `docs/specs/v2-design.md` — the design, and why each deviation exists
- `docs/research/` — what the real game does, with sources
- `docs/lessons.md` — what went wrong here, and the rule that followed
