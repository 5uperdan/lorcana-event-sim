import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMeta } from '../src/duels.js';
import {
    TOTAL, largestRemainder, initialShares, normaliseShares, shareTotal, seatCounts, parseTenths, formatTenths,
    effectiveMatchup, setOverride, clearOverride, findMatchup, pairKey,
} from '../src/model.js';

const season = parseMeta(JSON.parse(readFileSync(new URL('fixtures/core-bo3-season.json', import.meta.url))));

test('largest remainder totals exactly, with ties to the larger weight then the earlier entry', () => {
    assert.deepEqual(largestRemainder([1, 1, 1], 10), [4, 3, 3]);
    // Remainders 0.5, 0, 0.5 with equal weights: the earlier entry wins the tie.
    assert.deepEqual(largestRemainder([1, 2, 1], 2), [1, 1, 0]);
    // Remainders 0.5, 0.5, 0: the larger weight wins the tie.
    assert.deepEqual(largestRemainder([1, 3, 4], 4), [0, 2, 2]);
    assert.deepEqual(largestRemainder([0, 0], 5), [0, 0]);
    assert.deepEqual(largestRemainder([5, 0], 3), [3, 0]);
    for (let total = 0; total < 200; total += 7) {
        const out = largestRemainder([3, 17, 1, 9, 9, 0, 41], total);
        assert.equal(out.reduce((s, v) => s + v, 0), total);
    }
});

test('initial shares total 100.0% and follow duels.ink\'s match counts', () => {
    const shares = initialShares(season.archetypes);
    assert.equal(shareTotal(shares), TOTAL);
    const covered = season.archetypes.reduce((s, a) => s + a.matches, 0);
    season.archetypes.forEach((a, i) => {
        assert.ok(Math.abs(shares[i] - (1000 * a.matches) / covered) < 1, a.label);
    });
    // Most played first: Emerald/Steel Midrange is 47,029 of 281,244 archetype matches.
    assert.equal(covered, 281244);
    assert.equal(formatTenths(shares[0]), '16.7');
});

test('normalising scales to 100.0% and leaves all-zero alone', () => {
    assert.deepEqual(normaliseShares([500, 300, 196]), [502, 301, 197]);
    assert.equal(shareTotal(normaliseShares([1, 2, 3, 4])), TOTAL);
    assert.deepEqual(normaliseShares([0, 0]), [0, 0]);
});

test('seat counts always fill the field', () => {
    const shares = initialShares(season.archetypes);
    for (const seats of [2, 7, 31, 63, 64, 128, 1000]) {
        const counts = seatCounts(shares, seats);
        assert.equal(counts.reduce((s, v) => s + v, 0), seats, `${seats} seats`);
    }
    // 64 players: the smallest archetypes get none.
    const counts = seatCounts(shares, 64);
    assert.equal(counts[0], 11);
    assert.equal(counts.at(-1), 0);
});

test('typed percentages become tenths', () => {
    assert.equal(parseTenths('12.3'), 123);
    assert.equal(parseTenths('12,34'), 123);
    assert.equal(parseTenths('150'), 1000);
    assert.equal(parseTenths('-2'), 0);
    assert.equal(parseTenths('abc'), null);
});

// ---- Matchups ----

const stateFor = data => ({ data, overrides: {}, threshold: 50 });

test('both sides of every matchup agree exactly', () => {
    const state = stateFor(season);
    const ids = season.archetypes.map(a => a.id);
    for (const x of ids) {
        for (const y of ids) {
            if (x === y) continue;
            const a = effectiveMatchup(state, x, y);
            const b = effectiveMatchup(state, y, x);
            assert.equal(a.onPlay + b.onDraw, 1000, `${x} ${y}`);
            assert.equal(a.onDraw + b.onPlay, 1000, `${x} ${y}`);
            assert.equal(a.source, b.source);
        }
    }
});

test('duels.ink rates are used from 50 games; fewer get the neutral estimate', () => {
    const state = stateFor(season);
    const ids = season.archetypes.map(a => a.id);
    let estimated = 0;
    for (const m of season.matchups) {
        const e = effectiveMatchup(state, m.a, m.b);
        if (m.games < 50) {
            estimated++;
            assert.equal(e.source, 'estimated');
            // The queue's own split this season: 53.71% / 46.29% a game.
            assert.equal(e.onPlay, 537);
            if (m.a !== m.b) assert.equal(e.onDraw, 463);
        }
    }
    assert.ok(estimated > 0);
    // A pair duels.ink has no games for at all.
    const missing = ids.flatMap(x => ids.map(y => [x, y])).find(([x, y]) => !findMatchup(season, x, y));
    assert.equal(effectiveMatchup(state, ...missing).source, 'estimated');
    assert.equal(effectiveMatchup(state, ...missing).games, 0);

    state.threshold = 0;
    const thin = season.matchups.find(m => m.games > 0 && m.games < 50 && m.a !== m.b && m.aFirstGames > 0 && m.aFirstGames < m.games);
    assert.equal(effectiveMatchup(state, thin.a, thin.b).source, 'data');
});

test('an override set from one side reads back flipped from the other', () => {
    const state = stateFor(season);
    const [x, y] = [season.archetypes[3].id, season.archetypes[0].id];
    setOverride(state, x, y, { onPlay: 601, onDraw: 455 });
    assert.deepEqual(effectiveMatchup(state, x, y), { onPlay: 601, onDraw: 455, games: findMatchup(season, x, y).games, source: 'override' });
    const back = effectiveMatchup(state, y, x);
    assert.equal(back.onPlay, 545);
    assert.equal(back.onDraw, 399);
    assert.ok(state.overrides[pairKey(x, y)]);

    clearOverride(state, y, x);
    assert.equal(effectiveMatchup(state, x, y).source, 'data');
});

test('a mirror has one number: the first player\'s win rate', () => {
    const state = stateFor(season);
    const id = season.archetypes[0].id;
    const m = effectiveMatchup(state, id, id);
    assert.equal(m.onDraw, null);
    assert.equal(m.source, 'data');
    setOverride(state, id, id, { onPlay: 560, onDraw: 123 });
    assert.deepEqual(effectiveMatchup(state, id, id), { onPlay: 560, onDraw: null, games: m.games, source: 'override' });
});
