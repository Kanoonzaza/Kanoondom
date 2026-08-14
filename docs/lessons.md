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

## 9. Hard-coded lists that must be appended to, and are not

Four times now, in two places:

- The build palette iterated `['environment','materials']`, so the entire
  Housing category vanished from the menu the moment it was added.
- The balance bot's "build the thing research just gave you" list named
  `surveyor_office`, then needed `master_smithy` (V6), then both incubators
  (V8). Each time it was forgotten, the run reported the new feature as dead —
  a Surveyor's Office, a forge, and then two stables, all sitting unbuilt in
  the bot's pocket while the numbers said the system did nothing.

The failure is silent every time, and it always looks like a broken feature
rather than a stale list.

**Rule.** Derive the list from the content. UI iterates the content module's own
export (`FACILITY_CATEGORIES`, `RESEARCH_SECTIONS`, `SKILL_FAMILIES`); the bot
builds *anything* `locked` it holds stock of and has not placed, whatever that
turns out to be. Tests assert every locked facility is reachable through some
study, every item through some pattern, and every colour hatches something.

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

## 12. A finding can be real and still be the wrong question

The treasury ended every balance run pinned at its cap, and it was carried as an
open note from V6 to V10. Each milestone the diagnosis improved and the symptom
did not:

| | diagnosis at the time | what it was worth |
|---|---|---|
| V6 | skills are slot-limited and nothing grants residents experience | true — lifetime spend was ~2,100 copper |
| V7 | levelling opened the slots | true — spend tripled, 32 skills to 89 |
| V10 | income simply outruns every sink | true — 579,000/day against ~20,000 of lifetime sinks |

So V10 gave facility upgrades a copper cost: ~13,600 per building, hundreds of
thousands across a town. The bot spent all of it — 367 upgrades in one run — and
the treasury was **still** full at the end.

The mistake was in the assertion, not the economy. `copper < cap` is not what
"healthy" means. A tycoon treasury sitting full between spending sprees is
fine; what would be broken is a full treasury with **nothing left to buy**. The
check now asserts that — 136 upgrades and 9 skills still on offer — and passes
honestly.

**Rule.** Before chasing a metric, ask what the metric is standing in for. Three
milestones went into moving a number that was measuring the wrong thing. The
symptom was real every time; the question was wrong from the start.

---

## 13. A test suite cannot see a game loop

M1 rewrote the clock's plumbing: the loop parks itself when the page is hidden
or the game is paused, and re-arms only while something is moving. All 314 tests
passed. The balance run passed. The game did not run at all.

`wakeLoop()` cleared `lastFrame` so that a restart would not bill the player for
the pause — correct — and the running loop called `wakeLoop()` to ask for its
next frame. So every frame cleared `lastFrame`, every frame therefore measured a
delta of zero, and the clock stood perfectly still while burning sixty frames a
second. Nothing in `tests/` could have caught it: not one test calls
`requestAnimationFrame`, because the simulation deliberately knows nothing about
frames. It took four seconds in a real browser — five ticks expected, zero
observed.

The same session found a second one of exactly this shape. Making map repaints
conditional was a large win (a fully zoomed-out redraw went from up to 9,216
`fillRect`s to a single blit), but the unconditional 250ms repaint it replaced
had been quietly papering over a sizing bug: the canvas took its height from its
own backing store while its backing store was computed from its height. The
first draw landed on a 360px fallback and, with repaints now conditional,
nothing ever corrected it. The fix was to state the height in CSS and let a
`ResizeObserver` handle the rest — which is also what makes rotation work.

**Rule.** Anything driven by frames, layout, visibility or input has to be
watched in a browser before it is called done. Two of the three checks in this
project — `npm test` and `npm run balance` — run headless by design, and a
headless run cannot tell a working loop from a stopped one.

**Corollary, learned the hard way.** When the preview pane is not displayed it
does not composite, so `requestAnimationFrame` never fires and
`document.visibilityState` reports `hidden` forever. A game that correctly
refuses to burn frames while hidden is then indistinguishable from a broken one.
`verify.html` (gitignored) is a copy of `index.html` that stubs both before the
module boots; it is how every number in this entry was measured.

---

## 14. Delete by parsed block, never by span

The mobile pass removed ~110 lines of CSS that nothing referenced. The first
attempt cut from one section comment to the next, which looked tidy and took the
overlay, sheet, toast, button and palette rules with it — 268 deletions instead
of 110. The page still loaded. Nothing threw. The sheets simply had no styling,
the tap targets collapsed to 21px, and the toast z-index fix silently stopped
applying.

It was caught in the browser, by a computed style that read `auto` where it
should have read `50`, one step after the edit.

The second attempt removed one rule at a time: find the selector, brace-match to
its end, and refuse the whole edit if any rule on a must-keep list has gone or
the braces no longer balance. It refused on the first run — correctly, because
my guard counted substrings and `.tab .badge` contains `.tab` — which is the
right way round for a guard to be wrong.

**Rule.** A destructive edit needs a machine-checked postcondition, not a
careful eye. "Everything on this list must still exist, and the braces must
still balance" costs four lines and catches the whole class.

---

## 15. The recurring one, finally made structural

Entry 6 is about hard-coded lists going stale — the build palette, then the
balance bot's build list, three separate times. The service worker needed one
more: every file the app loads, or an installed player with no signal gets a
blank screen.

So this list is generated (`tools/build-precache.mjs`) and committed, and a test
walks the tree again and fails if the committed copy has drifted. It earned
itself within the hour: normalising some line endings changed the asset bytes,
the content hash moved, and the test caught the stale list before it shipped.

**Rule.** When a list must mirror something on disk, do not maintain it and do
not trust yourself to regenerate it. Generate it, commit it, and let a test
compare the two. The failure mode this replaces is invisible locally and only
appears in the one environment you cannot easily reach.

---

## The one that governs all of them

**Measure before claiming, and measure again after fixing.** Every number in
this file came from a benchmark or a balance run, not an estimate. The one time
I gave the user arithmetic from my head — season lengths — I was out by a factor
of three (Year 30 vs Year 91).
