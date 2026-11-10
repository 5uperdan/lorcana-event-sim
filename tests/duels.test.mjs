// Parser tests against real duels.ink responses (Core Set 14 BO3, captured 2026-11-10
// with scripts/capture-fixture.mjs). Expected figures are the ones duels.ink's own
// stats page showed for the same data update.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMeta, ratesFor, periodOptions, metaUrl } from '../src/duels.js';
import { upstreamUrl } from '../worker/worker.js';

const load = name => JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
const seasonRaw = load('core-bo3-season.json');
const season = parseMeta(seasonRaw);
const twoWeeks = parseMeta(load('core-bo3-2w.json'));

const bySlugHint = (data, pair, hint) => data.archetypes.find(a => a.pair === pair && a.hint === hint);
const matchup = (data, x, y) =>
    data.matchups.find(m => (m.a === x.id && m.b === y.id) || (m.a === y.id && m.b === x.id));
const pct = r => Math.round(r * 1000) / 10;   // 0.4541… -> 45.4

test('profiles are grouped into archetypes as duels.ink lists them', () => {
    assert.equal(seasonRaw.profiles.length, 79);
    assert.equal(season.archetypes.length, 34);

    const circle = bySlugHint(season, 'Amber/Emerald', 'Sulley');
    assert.equal(circle.label, 'Amber/Emerald Circle of Life');
    assert.equal(circle.profileIds.length, 3);
    assert.equal(circle.decks, 6078);
    assert.equal(circle.matches, 40373);

    const detectives = bySlugHint(season, 'Amber/Sapphire', 'Judy Darkwing');
    assert.equal(detectives.decks, 4462);
    assert.equal(detectives.matches, 29050);
    assert.equal(pct(detectives.matchWins / detectives.matches), 55.6);

    // Most played first.
    assert.equal(season.archetypes[0].label, 'Emerald/Steel Midrange (He Hurled)');
    assert.equal(season.archetypes[0].matches, 47029);
});

test('labels are unique, with a hint for repeated and missing names', () => {
    const labels = season.archetypes.map(a => a.label);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(labels.includes('Amber/Sapphire Control (Moana)'));
    assert.ok(labels.includes('Amber/Sapphire Control (Cinderella Hades)'));
    assert.ok(labels.includes('Sapphire/Steel (Robin)'));
    assert.ok(labels.includes('Amber/Emerald Princess Aggro'), 'unique names get no hint');
    // Named after the most-played profile: this archetype's profiles are Ruby R.E.D. and Action Retro.
    assert.equal(bySlugHint(season, 'Emerald/Ruby', 'Retro').label, 'Emerald/Ruby Ruby R.E.D.');
});

test('every game in the matchup rows is kept, in one row per archetype pair', () => {
    const rawGames = seasonRaw.archetypeMatchups.reduce((s, r) => s + r.games, 0);
    assert.equal(season.matchups.reduce((s, m) => s + m.games, 0), rawGames);

    const order = new Map(season.archetypes.map((a, i) => [a.id, i]));
    const keys = new Set();
    for (const m of season.matchups) {
        assert.ok(order.get(m.a) <= order.get(m.b), 'a comes first in archetype order');
        keys.add(`${m.a}|${m.b}`);
        assert.ok(m.aFirstGames >= 0 && m.aFirstGames <= m.games);
        assert.ok(m.aFirstWins >= 0 && m.aFirstWins <= m.aFirstGames);
        assert.ok(m.aWins - m.aFirstWins >= 0 && m.aWins - m.aFirstWins <= m.games - m.aFirstGames);
    }
    assert.equal(keys.size, season.matchups.length);
});

test('on-the-play and on-the-draw rates match duels.ink, from either side', () => {
    const rockstar = bySlugHint(twoWeeks, 'Amber/Steel', 'Lilo Mr Manchas');
    const midrange = bySlugHint(twoWeeks, 'Emerald/Steel', 'He Hurled');
    const m = matchup(twoWeeks, rockstar, midrange);

    // duels.ink's tooltip: "Rockstar Aggro vs Midrange · On play: 45.4% · On draw: 28.8%", 799 games.
    const r = ratesFor(m, rockstar.id);
    assert.equal(r.games, 799);
    assert.equal(pct(r.onPlay), 45.4);
    assert.equal(pct(r.onDraw), 28.8);

    const back = ratesFor(m, midrange.id);
    assert.equal(pct(back.onPlay), 71.2);
    assert.equal(pct(back.onDraw), 54.6);
});

test('overall matchup and mirror figures match duels.ink\'s matrix', () => {
    const detectives = bySlugHint(twoWeeks, 'Amber/Sapphire', 'Judy Darkwing');
    const midrange = bySlugHint(twoWeeks, 'Emerald/Steel', 'He Hurled');
    const circle = bySlugHint(twoWeeks, 'Amber/Emerald', 'Sulley');

    // Matrix cell: Detectives 46% vs Midrange over 4318 games.
    const m = matchup(twoWeeks, detectives, midrange);
    const detectivesWins = m.a === detectives.id ? m.aWins : m.games - m.aWins;
    assert.equal(m.games, 4318);
    assert.equal(Math.round(100 * detectivesWins / m.games), 46);

    // Diagonal cells show the starting player's win rate in the mirror, but only over the
    // games where duels.ink's "A" slot went first (its raw firstPlayerWinRate). That slot
    // isn't neutral (it wins 52.3% of Detectives mirrors), so we count the first player
    // in every mirror game instead: twice the data, and no slot bias.
    const raw2w = load('core-bo3-2w.json');
    for (const [arch, games, matrixPct, ourPct] of [
        [detectives, 1848, 54, 51.7], [midrange, 2642, 57, 57.0], [circle, 2021, 50, 49.8],
    ]) {
        const mirror = matchup(twoWeeks, arch, arch);
        const r = ratesFor(mirror, arch.id);
        assert.equal(r.games, games, arch.label);
        assert.equal(pct(r.onPlay), ourPct, arch.label);
        assert.equal(r.onDraw, null);

        const [pid] = arch.profileIds;
        const row = raw2w.archetypeMatchups.find(x => x.archetypeIdA === pid && x.archetypeIdB === pid);
        assert.equal(Math.round(row.firstPlayerWinRate), matrixPct, `${arch.label}: duels.ink's figure`);
    }
});

test('queues, weeks and time ranges', () => {
    assert.deepEqual(season.queues.filter(q => q.bo3).map(q => q.id), ['core-bo3', 'infinity-bo3']);
    assert.equal(season.queues.find(q => q.id === 'core-bo3').label, 'Core BO3 - Set 14');
    assert.equal(season.currentWeekStart, '2026-11-08');
    assert.deepEqual(season.playDraw, { first: 0.5371, second: 0.4629 });

    const options = periodOptions(season.weeks, season.currentWeekStart);
    assert.equal(options.length, 7);
    assert.deepEqual(options[0], { period: 'all_time', label: 'Full season', weeks: 6, matches: season.totals.matches });
    assert.equal(options[1].period, 'week:2026-11-08');
    assert.deepEqual(options[2], {
        period: 'weeks:2026-11-01,2026-11-08', label: 'Last 2 weeks', weeks: 2,
        start: '2026-11-01', end: '2026-11-14', inProgress: true, matches: 53496,
    });
    assert.equal(options[6].start, '2026-10-04');
});

test('every URL the site builds is one the Worker allows', () => {
    const base = 'https://duels-meta-proxy.5uperdan.workers.dev';
    for (const { period } of periodOptions(season.weeks, season.currentWeekStart)) {
        assert.ok(upstreamUrl(metaUrl(base, 'core-bo3', period)), period);
    }
});
