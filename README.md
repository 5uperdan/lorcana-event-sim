# Lorcana Event Simulator

A static site that simulates Swiss Disney Lorcana events from duels.ink archetype data, many times over, and
reports how many matches each archetype wins.

1. **Data:** pick a duels.ink queue (BO3 queues by default) and a time range: the full season, or the last N
   weeks. Archetype meta shares and matchups (on the play and on the draw) load live through a small proxy.
2. **Meta share:** adjust each archetype's share in 0.1% steps. The page warns until the total is exactly 100.0%,
   and shows how many players each archetype gets in the field.
3. **Matchups:** collapsed by default. Each pair is shown once, with the first archetype's game win rate on the
   play and on the draw, which you can override; the other side follows. Pairs with too few games use a neutral
   estimate.
4. **Your deck (optional):** one player copying an archetype. You can change its matchups without touching the
   original. It always takes one seat, and its results are reported on their own.
5. **Event:** players, rounds (Swiss default), number of simulated events, and an optional seed.
6. **Results:** for every archetype and your deck, the mean, median and standard deviation of match wins, plus
   two charts (mean wins with ±1 SD, and the share of players finishing on each record). There's a CSV export.

Settings are kept in your browser between visits, and a whole setup can be saved to a file and loaded back.

## How the simulation works
- **The field** is fixed: the meta shares are turned into whole players by largest remainder, the same in every
  simulated event.
- **Pairings:** round 1 is random. Later rounds are Swiss: players on the same record meet, and a player left
  over floats down. Every player's opponents are tracked, and the pairing backtracks so nobody meets the same
  opponent twice unless the round can't be paired any other way. That only happens in tiny events with nearly as
  many rounds as opponents, and then with as few rematches as possible. With an odd count, the lowest-placed
  player without a bye gets one, which counts as a win.
- **Every match is a best of 3, played out game by game.**
  - A coin flip decides who goes first in game 1, and the loser of each game goes first in the next.
  - Each game is a roll of 1–1000: the player on the play wins if the roll is at most their win rate in tenths of
    a percent.
  - duels.ink's archetype matchups are per game, even in BO3 queues, so the games are played out rather than
    treating game rates as match rates.
- **Mirrors:** the rate is the first player's win rate over every mirror game. duels.ink's matrix shows a figure
  based on only half of them (PLAN.md, section 1).

## Repository
| Path | What |
|---|---|
| `index.html`, `css/`, `src/ui/` | the page |
| `src/duels.js` | duels.ink response → archetypes, matchups, play/draw rates, time ranges |
| `src/model.js` | shares and seats in tenths of a percent, effective matchups and overrides, your deck, simulation input |
| `src/match.js` | exact BO3 odds |
| `src/sim.js`, `src/sim.worker.js`, `src/rng.js` | the event simulation (seeded), run in a Web Worker |
| `src/stats.js`, `src/report.js` | summaries and CSV |
| `src/storage.js` | saved settings and scenario files |
| `worker/` | the Cloudflare Worker proxy (duels.ink sends no CORS headers); see [worker/README.md](worker/README.md) |
| `scripts/capture-fixture.mjs` | saves a trimmed duels.ink response as a test fixture |
| `tests/` | `npm test` (Node 20+, no dependencies); it also runs on every push |
| `PLAN.md` | the design, and what duels.ink's data turned out to contain |

## Running it locally
It's plain HTML and ES modules with no build step. Any static server will do:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. For GitHub Pages, serve the repository root from `main`.

Data from [duels.ink](https://duels.ink/stats), used with the owner's permission. The proxy runs at
https://duels-meta-proxy.5uperdan.workers.dev/.
