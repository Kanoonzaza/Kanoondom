# Mistakes made building this, and the rules that came out of them

Written after V6. Every entry here actually happened in this repo (or in v1),
and most of them happened *twice* before the rule was written down — which is
the reason for the file. Read it before starting a milestone.

---

## 1. The clock's hot path punishes per-entity work

**What happened, three times.**

| Milestone | What was allocated or recomputed | Cost |
|---|---|---|
| V3 | each resident's stats worked out separately, each walking every facility | 8374ms → 827ms |
| V4 | `peaceLevel` counted `Object.keys(cleared).length` on every call | 350ms → 17ms (survey), 682ms → 20ms (`canPlace`) |
| V6 | a twelve-key stats object per item, per resident, per segment | 6267ms → 1043ms |

Same shape every time: something O(small) per entity, multiplied by entities ×
items × segments, on a path the clock runs thousands of times per catch-up.

**Rules.**

- Anything called from `applySegment` or under `canPlace` is hot. Walk the
  residents **once** and pass the result down.
- On that path, read **one value at a time** (`gearStat`, `skillStat`,
  `effectValue`) — never build a whole stats object to take one number out of it.
- Maintain counts, don't recount (`world.clearedCount`, `world.occupied`).
- Memoise anything derived from static content (`statTotalOf`).
- Whole-object forms (`statsOf`, `gearStatsOf`, `effectsOf`) are for UI panels.
  Keep them; just don't call them from the clock.

---

## 2. Fix the cause, not the call site

In V4 I found `peaceLevel` was slow, and fixed it **inside `revealFrontier`
only**. The identical cause was still sitting under `canPlace`, which the map's
build ghost calls on every hover — 3.4ms a frame, growing with every tile the
player ever explored. It surfaced only because the user asked whether I'd
addressed everything.

**Rule.** When a fix is local, ask who *else* calls the thing underneath. If
the answer is "several places", fix it underneath. A patch at one call site is
a note saying "the bug is still here, somewhere else".

---

## 3. A failing test is evidence, not noise

In V3 a test failed once and I called it transient. It was a genuine 10×
regression, and dismissing it cost me finding it immediately instead of later.

**Rule.** No test failure is dismissed without a diagnosis. "Flaky" is a
conclusion you earn — in this repo the one real case was wall-clock assertions
under `node --test`'s parallel file execution, fixed with `--test-concurrency=1`,
not by ignoring it.

---

## 4. Sparse tests prove nothing about a populated game

The V3 perf test ran on an empty town and passed while a real one crawled. The
same gap let V6's allocation bug through until a hand-run benchmark caught it.

**Rule.** Perf tests build the state that hurts: residents housed, gear worn,
skills learned. Both `residents.test.js` and `equipment.test.js` now do, and
both say in a comment why.

---

## 5. Gates set above their own ceiling

Twice, in one milestone:

- Ring 1 required **15%** Peace Level. Fog only lifts in unlocked zones, so with
  only ring 0 open the maximum reachable was **11.1%**. Not a hard gate — a
  locked door with no key.
- The first map reward wanted **1,200 tiles** against ring 0's **1,024**.

**Rule.** Any threshold is expressed as a fraction of what is *reachable at the
point the player meets it*, and a test asserts the relationship
(`ringCeiling`). Never write the number alone.

---

## 6. Economies that can dead-end

- **v1:** upkeep with no income floor → a bankrupt kingdom switched off its own
  farms and starved with no way back.
- **V4:** tomes were needed to research Surveying, and surveys were a source of
  tomes. No tomes and no scholar meant no route to either.

**Rule.** Every currency needs a source that cannot reach zero
(`CAPITAL_INCOME`), and no unlock may be its own only prerequisite. Ask of any
new resource: *from a standing start with none of it, how do I get some?*

---

## 7. Currencies with no sink are just as bad

Bronze existed for four milestones with no source and no sink. Copper ends the
V6 balance run pinned at its cap — measured: the whole town can only ever spend
~2,100 copper on skills, because slots are gated by resident level and nothing
grants residents experience yet.

**Rule.** A resource needs both ends wired before it ships. The balance run
prints income against sink and says so.

---

## 8. Don't paper over a finding to get a green run

The copper ceiling above is recorded as a `note()` with the real numbers and
the real reason, not converted into a passing `check()` and not silently
dropped. A build that is expected to be red teaches you to ignore it; a build
that lies is worse.

**Rule.** `check()` fails the run. `note()` is for something known, measured,
and deliberately deferred — always with the reason and the milestone that fixes
it. Neither is for hiding.

---

## 9. Content lists that a category can silently fall out of

The build palette iterated a hard-coded `['environment','materials']`, so the
entire Housing category vanished from the menu the moment it was added.

**Rule.** UI iterates the content module's own list (`FACILITY_CATEGORIES`,
`RESEARCH_SECTIONS`, `SKILL_FAMILIES`), never a copy. Tests assert every locked
facility is reachable through some study, and every item through some pattern.

---

## 10. Tests that pin an unrelated literal

A monsters test asserted `schemaVersion === 3`. The V6 schema bump broke it,
and the failure pointed at monsters rather than at the migration.

**Rule.** Assert against the constant (`SCHEMA_VERSION`), and assert the thing
the test is actually about.

---

## 11. Tooling: destructive writes and blind retries

- A Python edit opened a file `'w'` (truncating it) and *then* threw on an
  encoding error. `resources.js` was left empty; recovered with `git checkout`.
- Shell heredocs failed repeatedly on large content and I retried the same
  transport instead of switching tools.
- I wrote a quick unused-import scanner, it reported *everything* as unused, and
  I nearly acted on it.

**Rules.** Build the whole string, then write — never truncate before the
content is known good, and keep CRLF (`newline='\r\n'`). After two transport
failures, switch to `Write`/`Edit`. A tool whose output is obviously wrong gets
thrown away, not trusted selectively.

---

## The one that governs all of them

**Measure before claiming, and measure again after fixing.** Every number in
this file came from a benchmark or a balance run, not an estimate. The one time
I gave the user arithmetic from my head — season lengths — I was out by a factor
of three (Year 30 vs Year 91).
