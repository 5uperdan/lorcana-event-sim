# Lorcana Event Simulator: project plan

A standalone static site on GitHub Pages. It loads archetype data from duels.ink for one queue and a range of
weeks. You then adjust each archetype's meta share and, optionally, any matchup. You can also add one player of
your own, a copy of an archetype with matchups you can edit. Finally it simulates a Swiss event many times over
and reports how many matches each archetype (and your player) wins: mean, median and standard deviation, in
tables and charts.

Planned 2026-11-10, with your decisions the same day. The duels.ink facts below were checked against the live
site that day.

**Decided:**
- Every match is a BO3, played out game by game. The loser of each game goes first in the next.
- Pairings are Swiss.
- The field has fixed counts from the meta shares, the same in every simulated event.
- Simulation count is the number of whole tournaments.
- An optional "your deck" player is always in the field, exactly once.
- Data comes through a Cloudflare Worker proxy.

---

## 1. What duels.ink provides (verified)

### Endpoint
`GET https://duels.ink/api/stats/meta?queue=<id>&period=<period>&era=current`. This is the single request the
`/stats` page makes. The owner has confirmed that using it is fine (user, 2026-11-10).

| `period` value | duels.ink UI equivalent |
|---|---|
| `all_time` | "Full Season" |
| `week:2026-11-08` | one week |
| `weeks:2026-11-01,2026-11-08` | ticking several weeks ("Checkboxes combine weeks") |

Weeks run Sunday to Saturday and are named by their Sunday. The current week is still in progress
(Nov 8–14 had 2 days of data on Nov 10).

### Fields we use
- **`meta.queues.active[]`:** `id`, `name`, `gameMode` (`bo1` or `bo3`), `statsEnabled`. Today's BO3 queues are
  `core-bo3` ("Core Set 14 BO3") and `infinity-bo3` ("Infinity BO3"). Both have "BO3" in the name and
  `gameMode: "bo3"`, so we filter on `gameMode` and fall back to the name.
- **`meta.availableWeeks[]`:** `startDate`, `endDate`, `label`, `totalGames`, `totalMatches`. Core BO3 has 6 weeks
  so far, starting Oct 4.
- **`profiles[]`:** deck clusters. Several profiles can share one `archetypeId`: the full season has 79 profiles
  but 34 archetypes, so **we aggregate by `archetypeId`**. In BO3 queues `gamesPlayed` and `wins` count matches.
  Names repeat (there are five "Midrange"s), so we label each as "<ink pair> <name>" and key on `archetypeId`.
- **`archetypeMatchups[]`:** `archetypeIdA`, `archetypeIdB`, `games`, `winsA`, `firstPlayerGames`,
  `firstPlayerWins`.
  - ⚠ Despite the names, `archetypeIdA` and `archetypeIdB` are **profile ids**, not archetype ids.
  - Each unordered pair appears once; mirrors appear as (X, X).
  - `firstPlayerGames` counts the games where A went first, and `firstPlayerWins` counts A's wins in them. So A on
    the draw = (`winsA` − `firstPlayerWins`) / (`games` − `firstPlayerGames`).
  - Verified: Rockstar Aggro vs Emerald/Steel Midrange over the last 2 weeks gives 45.4% on the play and 28.8% on
    the draw over 799 games, exactly what duels.ink's tooltip shows.
- **`activity.playDrawStats`:** the queue-wide win rate for going first and second, per game (53.7% / 46.3% this
  season). Used as the fallback for thin matchups.
- **`updatedAt`:** when duels.ink last recomputed the data (daily, around 06:39 UTC).

### Three findings that shape the design
1. **Archetype matchups are per game, not per match, even in BO3 queues.** duels.ink's matrix says so ("archetype
   matchups are counted per individual game, not per match"), and the numbers agree:
   - Princess Aggro played 10,893 matches, but its matchups add up to 21,749 games. That's 2.47 games per match ×
     81% of opponents classified. A per-match count can't exceed the number of matches.
   - All archetype-matchup games add up to 279k, against 174k matches in the whole queue.

   Only the colour-pair data is per match. So the simulator plays out each best-of-3 game by game (section 4).
2. **The browser can't call the API from GitHub Pages.** A test fetch from `5uperdan.github.io` was blocked by
   CORS (no `Access-Control-Allow-Origin` header). Requests therefore go through a small Cloudflare Worker proxy
   (section 2).
3. **Matchup data is thin, and not everything is covered.**
   - Over 2 weeks, 129 of the 339 archetype pairs with data have fewer than 50 games, and 39 possible pairs have
     none.
   - About 19% of decks are unclassified, and archetypes under 50 games or 10 decks are hidden.
   - So shares are normalised over the listed archetypes, and thin matchups need a fallback (section 3).

A full response is 3.4 MB, 2.7 MB of it card-opening data (`archetypeOpening`) that we don't need.

---

## 2. Data pipeline

**A Cloudflare Worker proxy**, built like `worker/worker.js` in `playhub-upcoming-set-champs-web-ui`. The site
calls the Worker, the Worker calls duels.ink, and the response comes back with CORS headers.

- **Locked down, so it isn't an open proxy:**
  - only `GET /api/stats/meta`
  - only the parameters `queue` (`[a-z0-9-]+`), `period` (`all_time`, `week:<date>` or `weeks:<date>,…`) and
    `era=current`

  Anything else gets a 404.
- **Passed through, and cached.** The Worker streams the body through untouched and keeps successful responses in
  its own Cache API store for an hour. So duels.ink sees at most one request per queue and period per hour in each
  Cloudflare data centre, however many people use the site.
  - The Worker doesn't trim the response. Parsing 3.4 MB of JSON could exceed the free plan's 10 ms of CPU per
    request, so the browser parses it instead.
  - Compressed, the transfer is about 510 KB (brotli) and takes about 0.2 s (measured 2026-11-10).
  - The first attempt used `fetch`'s `cf` cache options. duels.ink's response came back `DYNAMIC` (not cached)
    every time, hence the Cache API.
- **Deployed** at https://duels-meta-proxy.5uperdan.workers.dev/ (2026-11-10).
- **Live data for any period.** "Full season" and "Last N weeks" (N = 1…W, ending with the current week, as
  duels.ink's own default does) each map to one live request, fresh as soon as duels.ink updates (around 06:39 UTC).
- **No separate queue-list request.** Every response carries `meta.queues.active` and that queue's
  `meta.availableWeeks`. So the first load, the full season of the first BO3 queue, also fills the queue dropdown
  and the week options.
  - The "BO3 only" checkbox (on by default) narrows the dropdown to queues with `gameMode === "bo3"` or "BO3" in the
    name.
  - Queues without `statsEnabled` are left out.
- **Deployed the way the playhub Worker is:**
  - `worker/worker.js` is the source of truth, pasted into the Cloudflare dashboard; `worker/README.md` gives the
    steps
  - the Worker's URL is one constant in `src/config.js`
  - the free plan allows 100k requests a day
- **Import duels.ink JSON** stays as a fallback: upload a raw `/api/stats/meta` response saved from your browser.
  The same parser (`src/duels.js`) handles it.
- **No GitHub Action is needed for data.** Pages serves the repository as it is; an Action only runs the tests.

**Risk, checked 2026-11-10:** duels.ink is itself behind Cloudflare, which could have challenged the Worker's
request. It didn't; the Worker gets a 200 with the JSON. If that ever changes, the fallback is a scheduled GitHub
Action that fetches snapshots server-side and deploys them with the site. That would mean fixed periods only,
refreshed daily.

---

## 3. The page, top to bottom

### 3.1 Data source
- **Queue** dropdown, with a **BO3 only** checkbox (on by default).
- **Time range:** "Full season" or "Last N weeks" (1…W). Each option shows its dates and match count, e.g.
  "Last 2 weeks · Nov 1–14 (in progress) · 53,496 matches".
- **Load.** It shows duels.ink's "data last updated" time and the number of archetypes loaded. There's also an
  **Import JSON** button.

### 3.2 Meta share
- One row per archetype, sorted by share:
  - ink-colour chips and the label
  - a slider plus a number box, 0–100% in steps of 0.1
  - duels.ink's value as a hint
  - the number of players it gets in the simulated field at the current player count (section 4.1), e.g.
    "11 players"
- Shares are stored as integers in tenths of a percent (0–1000), so the total is checked exactly.
- **Initial values:** each archetype's matches ÷ the total over listed archetypes, rounded to 0.1 by largest
  remainder so they sum to exactly 100.0%.
- **Sum indicator.** A warning shows whenever the total isn't 100.0%, e.g. "Total 99.6%: 0.4% short". **Run** is
  disabled until the total is right.
- **Buttons:** "Normalise to 100%" (scales the current values) and "Reset to duels.ink".
- A share of 0 removes that archetype from the field.

### 3.3 Matchups (collapsed by default)
- **The whole section is collapsed** until you open it, with a header such as "Matchups · 595 pairs ·
  3 overridden".
- **Each matchup appears once**, for an unordered pair {A, B}. A is the archetype that came first in the
  data-load order, so the order doesn't change when you move sliders.
- **Each row** shows:
  - "**A vs B** · 4,318 games"
  - two sliders with number boxes, 0.1% steps: *A's win % on the play* and *A's win % on the draw*
  - a read-only line with B's side, which follows automatically: B on the play = 100 − A on the draw, and B on the
    draw = 100 − A on the play. One edit updates both perspectives.
  - the resulting **BO3 match win %** (section 4.3), so the effect of an edit is visible
  - an "overridden" marker and a reset button once you've changed it
- **Mirrors** have one slider: the win % of whoever goes first.
- **Navigation:** pairs are grouped under their A archetype, and a group's rows are built only when you open it,
  which keeps the page fast with ~1,200 sliders. A search box matches either side. There are also "show overridden
  only" and "reset all overrides" controls.
- **Thin matchups:** pairs with fewer than *T* games (default 50, editable here) or no data use a neutral fallback,
  the queue's own play/draw split (e.g. 54.2% on the play, 45.8% on the draw). They're marked "estimated".
  Overrides always take precedence.

### 3.4 Your deck (optional)
- **Add your deck:** pick an archetype to copy, and optionally give it a name (default "Your deck (copy of
  Detectives)").
- **Its matchups start as a copy of that archetype's,** against every archetype, with on-the-play and on-the-draw
  values. They appear as their own group at the top of the matchup panel, with the same controls: sliders, number
  boxes, B's side shown read-only, BO3 match %, override markers and reset.
  - Against the archetype it was copied from, the starting values come from that archetype's mirror: on the play =
    the mirror's first-player rate, on the draw = 100 − that. After that, the two values can be edited separately
    like any other matchup.
  - Editing your deck's matchups never changes the original archetype's.
  - Your deck never meets itself, so there's no mirror row.
- **Always exactly one in the field.** It takes one of the event's player seats, has no meta-share slider, and the
  other seats are shared out from the meta shares.
- **Tracked like an archetype:** it gets its own row in the results table and its own entry in both charts,
  highlighted. Its sample is one player per simulated tournament.
- **Changing the copied archetype** resets your deck's matchups to the new archetype's, after a confirmation if any
  were edited. **Remove** takes it out of the field.

### 3.5 Event
| Input | Default | Notes |
|---|---|---|
| Players | 64 | 2–4096, including your deck if you've added one |
| Rounds | ⌈log₂ players⌉ | editable |
| Simulation count | 10,000 | **number of whole tournaments simulated** (each one: every round, from round 1) |
| Seed | blank = random | the seed used is shown after the run, so a run can be repeated exactly |

Every match is a best of 3, played out game by game (section 4.1).

**Run** and **Cancel** buttons, a progress bar, and an estimated time for large runs.

### 3.6 Results
- **Table:** archetype, meta share, players in the field, players simulated (n), **mean wins, median wins,
  standard deviation**, and expected round-1 match win % against the field (worked out exactly, section 4.3). It can
  be sorted, and there's a CSV export.
  - Your deck has its own highlighted row.
  - Archetypes with no seats at this player count are listed as "not in field".
- **Chart 1, mean wins:** horizontal bars sorted by mean, with ±1 SD whiskers and a dashed line at the field
  average.
- **Chart 2, final record distribution:** for each archetype, the share of its players finishing on 0, 1, … R wins,
  as 100% stacked bars.
- *(Optional)* **Chart 3, conversion:** share of the field vs share of players with R−1 or more wins.

Settings, shares and overrides are saved in `localStorage`, and a whole scenario can be exported and imported as
JSON. Overrides are keyed by archetype-id pair, so they survive a data refresh.

---

## 4. Simulation

### 4.1 One tournament (repeated *simulation count* times)
1. **Field (fixed counts, worked out once per run):**
   - If you've added your deck, it takes one seat. The other seats, S = players − 1 (or all of them without your
     deck), are shared out by meta share.
   - Each archetype gets ⌊share × S⌋ seats. The seats left over go to the largest remainders, ties going to the
     higher share and then to load order.
   - So the field is the same in every simulated tournament; only the pairings and the game rolls vary.
   - An archetype can get no seats at small player counts (for example 0.4% of 64). It then sits out, and the
     results say so.
2. **Round 1:** shuffle and pair consecutively.
3. **Rounds 2…R, Swiss:**
   - Group players by wins and shuffle within each group.
   - Pair from the top down, floating an odd player down to the next group.
   - Skip a rematch by taking the next candidate; if nothing else works, accept the rematch and count it.
4. **Byes:** with an odd number of players, the lowest-placed player who hasn't had a bye gets one, counted as a
   match win.
5. **Each match is a best of 3:** a coin flip decides who goes first in game 1. Games are played until someone has
   2 wins, and the loser of each game goes first in the next (confirmed, 2026-11-10).
6. **Each game:** roll an integer from 1 to 1000. The player on the play wins if the roll ≤ their on-the-play win
   rate in tenths of a percent (60.1% → 601). Rates are stored in tenths, so this is exact.
7. Record each player's final win total in a histogram per archetype (`counts[archetype][wins]`). Your deck has
   its own histogram.

Internally, your deck is one more entry in the archetype list, with its own matchup row and column, its seat count
fixed at 1, and no meta share. So the engine treats it like any other archetype.

### 4.2 Statistics
- The sample for an archetype is every player who played it, in every simulated tournament.
- For your deck, that's one player per tournament, so n = the simulation count.
- The mean, median and standard deviation of match wins all come from the histogram. Wins are whole numbers from
  0 to R, so this is exact and uses little memory.

### 4.3 Exact BO3 match odds (for the table, the matchup panel and tests)
Let *a* be A's win rate on the play and *b* A's win rate on the draw. With a coin flip for game 1 and the loser
going first afterwards:

P(A wins the match) = ½·[a·(b + (1−b)·a) + (1−a)·a·b] + ½·[b·(b + (1−b)·a) + (1−b)·a·b]

*Example (last 2 weeks):* Rockstar Aggro vs Emerald/Steel Midrange has a = 45.4% and b = 28.8%, which gives
**30.9%** to win the BO3. For comparison, a single game at the average of a and b would be 37.1%.

### 4.4 Performance
- The simulation runs in a Web Worker on typed arrays, with a seeded PRNG (xoshiro128**). It reports progress and
  can be cancelled.
- Cost is roughly tournaments × players × rounds ÷ 2 matches. The target is 10,000 tournaments of 128 players and
  7 rounds in a few seconds, to be measured once built.
- Very large inputs show an estimated time before running.

---

## 5. Tech and repository
- **No build step:** plain HTML, CSS and JavaScript ES modules, which GitHub Pages serves as is.
- **Charts:** Chart.js 4.4.x, pinned and kept in `vendor/`. The SD whiskers are a floating-bar dataset, so no
  plugin is needed.
- **Tests:** `node --test` (Node 20+), with no dependencies. The parser, the simulation and the Worker's allowlist
  are plain modules that Node can import.
- **Repo:** a new public GitHub repository, e.g. `5uperdan/lorcana-event-sim` (name to confirm), served at
  `https://5uperdan.github.io/<repo>/`. Pages serves the repository directly; there's no build.

```
index.html
css/style.css
worker/worker.js, worker/README.md   the CORS proxy and how to deploy it (dashboard, like playhub)
src/
  config.js       the Worker URL
  duels.js        raw API response → archetype-level data (aggregation, orientation flips, mirrors)
  model.js        shares in tenths, matchup table, symmetry, overrides, thin-data fallback
  match.js        game and BO3 resolution; exact match odds (4.3)
  rng.js          seeded PRNG, randInt(1,1000), coin flip
  swiss.js        pairings, byes, rematch avoidance
  sim.worker.js   tournament loop and histograms
  stats.js        mean, median, SD from histograms
  ui/*.js         data picker, share sliders, matchup panel, event form, results
  charts.js
tests/*.test.mjs, tests/fixtures/core-bo3-2w.json (a trimmed real response)
.github/workflows/test.yml    runs the tests on push
README.md
```

---

## 6. Testing
- **Worker:** allowed paths and parameters pass; any other path, parameter, method or malformed `period` gets a
  404; an `OPTIONS` request gets the CORS headers.
- **Parser:**
  - aggregating profiles into archetypes
  - flipping A/B when a pair is stored the other way round
  - mirror first-player rate
  - the Rockstar Aggro check (45.4% / 28.8%, 799 games) against the fixture
  - share rounding totals exactly 1000 tenths
- **Model:** an edit to A vs B changes B vs A to match; the fallback applies below *T* games; overrides take
  precedence.
- **Field:** seat counts always total the player count; largest remainders are allocated correctly; your deck
  always has exactly one seat.
- **Your deck:** its matchups start equal to the copied archetype's (with the mirror rule against the archetype
  itself); editing them leaves the original unchanged; it has its own results row.
- **Match odds:** the formula against brute-force enumeration, and against a Monte Carlo run of 1M matches.
- **Swiss:** everyone plays every round; at most one bye per round; no repeat byes; rematches only when forced.
- **End to end:** in round 1 (random pairing), each archetype's simulated match win rate matches the exact
  expectation within tolerance. That expectation is Σ over opponents of (their seats ÷ the other players) ×
  P(match). The total wins in a tournament equal the matches played plus
  byes. The same seed gives the same result.

---

## 7. Milestones
1. **Worker, first:** write `worker/worker.js` and its tests. You deploy it in the Cloudflare dashboard, and we
   check that duels.ink answers it and that a github.io page can call it. If Cloudflare challenges the request,
   switch to the GitHub Action fallback (section 2) before going further.
2. **Data layer and deployment:** `duels.js`, the fixture, parser tests, the test workflow, Pages switched on.
3. **Data picker and meta share sliders:** total warning, normalise, reset.
4. **Matchup panel:** collapsed, grouped, search, symmetry, overrides, thin-data fallback, BO3 % per row.
5. **Your deck:** copy an archetype, its own matchup group, one fixed seat.
6. **Simulation engine and its tests:** RNG, BO3 matches, fixed-count field, Swiss, the Web Worker, histograms.
7. **Results:** tables, charts, CSV export, with your deck included.
8. **Finishing:** saved settings, scenario export and import, phone layout, README.

---

## 8. Open questions (some for the duels.ink owner)
- **CORS (optional now):** if the owner added `Access-Control-Allow-Origin` for the Pages origin on
  `/api/stats/meta`, the Worker could go. Until then the Worker covers it.
- **Load:** the Worker's cache limits duels.ink to one request per queue and period per hour, each 3.4 MB. Is that
  fine? Is there a parameter that leaves out `archetypeOpening`? That would cut the size to a fifth.
- **Rank filter:** duels.ink filters by MMR band (`hasRankBreakdown`). That's out of scope for now, but could be a
  later option if the API takes a rank parameter.
