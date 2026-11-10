# Lorcana Event Simulator

A static site (for GitHub Pages) that simulates Swiss Disney Lorcana events from duels.ink archetype data.

The steps:
1. Load archetype meta shares and matchups for a duels.ink queue (BO3 queues by default) and a range of weeks.
   Matchups are split into on the play and on the draw.
2. Adjust the meta shares and any matchup, and optionally add one player of your own (a copy of an archetype with
   its own matchups).
3. Run the event as many times as you like. Every match is a best of 3, played out game by game.
4. See each archetype's mean, median and standard deviation of match wins, in tables and charts.

**Status:** in development. The design is in [PLAN.md](PLAN.md).

## Pieces
- **`worker/`:** a Cloudflare Worker that proxies duels.ink's stats API with CORS headers and an hour-long cache
  (duels.ink sends no CORS headers). Deployed at https://duels-meta-proxy.5uperdan.workers.dev/; see
  [worker/README.md](worker/README.md).
- **`src/`:** the site's modules (in progress).
- **`tests/`:** `npm test` (Node 20+, no dependencies).

Data from [duels.ink](https://duels.ink/stats), used with the owner's permission.
