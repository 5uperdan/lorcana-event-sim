import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMeta } from '../src/duels.js';
import {
    TOTAL, largestRemainder, initialShares, normaliseShares, shareTotal, seatCounts, parseTenths, formatTenths,
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
