import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../src/rng.js';
import { createEvent, playEvent, simulate } from '../src/sim.js';
import { summarise } from '../src/stats.js';
import { fieldMatchWin } from '../src/match.js';
import { parseMeta } from '../src/duels.js';
import { initialShares, simInput, setOverride, YOU } from '../src/model.js';

const twoWeeks = parseMeta(JSON.parse(readFileSync(new URL('fixtures/core-bo3-2w.json', import.meta.url))));

// Two archetypes: 0 always beats 1, mirrors are 50/50 on the play.
const dominant = { onPlay: Uint16Array.from([500, 1000, 0, 500]) };

test('the generator repeats from a seed and rolls 1–1000 evenly', () => {
    const a = createRng('seed-1'), b = createRng('seed-1'), c = createRng('seed-2');
    const xs = Array.from({ length: 5 }, () => a.next());
    assert.deepEqual(Array.from({ length: 5 }, () => b.next()), xs);
    assert.notDeepEqual(Array.from({ length: 5 }, () => c.next()), xs);

    const rng = createRng('rolls');
    const tens = new Array(10).fill(0);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 200000; i++) {
        const r = rng.roll1000();
        min = Math.min(min, r);
        max = Math.max(max, r);
        tens[Math.floor((r - 1) / 100)]++;
    }
    assert.equal(min, 1);
    assert.equal(max, 1000);
    for (const t of tens) assert.ok(Math.abs(t - 20000) < 600, `bucket ${t}`);
});

test('every round, everyone plays once or has the bye', () => {
    for (const [players, rounds] of [[8, 3], [7, 3], [33, 5], [64, 6], [5, 6]]) {
        const ev = createEvent({ seats: [Math.ceil(players / 2), Math.floor(players / 2)], ...dominant, rounds });
        const rng = createRng(`rounds-${players}`);
        for (let e = 0; e < 50; e++) {
            const byes = new Map();
            playEvent(ev, rng, (round, pairs, bye) => {
                const seen = pairs.flat();
                if (bye !== -1) seen.push(bye);
                assert.equal(seen.length, players);
                assert.equal(new Set(seen).size, players, 'nobody twice in a round');
                assert.equal(bye !== -1, players % 2 === 1, 'a bye exactly when the count is odd');
                if (bye !== -1) byes.set(bye, (byes.get(bye) ?? 0) + 1);
            });
            // No second bye while someone hasn't had one.
            if (rounds <= players) for (const n of byes.values()) assert.equal(n, 1);
            const total = ev.wins.reduce((s, w) => s + w, 0);
            assert.equal(total, rounds * Math.ceil(players / 2), 'one win per match and per bye');
        }
    }
});

test('Swiss pairs by record, so two unbeatable decks always end up meeting', () => {
    // 2 unbeatable players among 8, 3 rounds. If they hadn't met by round 3, they'd be
    // the only 2-0s and must meet then; so between them they win exactly 5 every time.
    // (Random pairings would often keep them apart: 6.)
    const ev = createEvent({ seats: [2, 6], ...dominant, rounds: 3 });
    const rng = createRng('swiss');
    for (let e = 0; e < 500; e++) {
        playEvent(ev, rng);
        assert.equal(ev.wins[0] + ev.wins[1], 5);
        assert.equal(Math.max(ev.wins[0], ev.wins[1]), 3);
    }
});

test('rematches are rare and only forced', () => {
    const shares = initialShares(twoWeeks.archetypes);
    const state = { data: twoWeeks, shares, overrides: {}, threshold: 50, you: null, event: { players: 64, rounds: 6 } };
    const input = simInput(state);
    const { rematches } = simulate({ ...input, sims: 2000 }, createRng('rematch'));
    assert.ok(rematches / (2000 * 6 * 32) < 0.001, `${rematches} rematches`);
    // 4 players, 4 rounds: round 4 has to be a rematch.
    const ev = createEvent({ seats: [2, 2], ...dominant, rounds: 4 });
    playEvent(ev, createRng('forced'));
    assert.equal(ev.rematches, 2);
});

test('round 1 results match the exact BO3 odds against the field', () => {
    const state = {
        data: twoWeeks, shares: initialShares(twoWeeks.archetypes), overrides: {}, threshold: 50,
        you: { base: twoWeeks.archetypes[3].id, name: '', overrides: {} }, event: { players: 64, rounds: 1 },
    };
    setOverride(state, YOU, twoWeeks.archetypes[0].id, { onPlay: 700, onDraw: 600 });
    const input = simInput(state);
    const sims = 40000;
    const { hist } = simulate({ ...input, sims }, createRng('round-1'));
    input.ids.forEach((id, i) => {
        if (input.seats[i] === 0) return;
        const n = hist[i * 2] + hist[i * 2 + 1];
        assert.equal(n, sims * input.seats[i]);
        const simulated = hist[i * 2 + 1] / n;
        const expected = fieldMatchWin(i, input.seats, input.onPlay);
        const se = Math.sqrt(expected * (1 - expected) / n);
        assert.ok(Math.abs(simulated - expected) < 4 * se + 1e-9,
            `${id}: simulated ${simulated.toFixed(4)}, expected ${expected.toFixed(4)}`);
    });
    // 63 field seats plus your deck.
    assert.equal(input.seats.reduce((s, v) => s + v, 0), 64);
    assert.equal(input.seats.at(-1), 1);
});

test('the same seed gives the same results', () => {
    const state = { data: twoWeeks, shares: initialShares(twoWeeks.archetypes), overrides: {}, threshold: 50, you: null, event: { players: 33, rounds: 5 } };
    const input = simInput(state);
    const a = simulate({ ...input, sims: 300 }, createRng('same'));
    const b = simulate({ ...input, sims: 300 }, createRng('same'));
    const c = simulate({ ...input, sims: 300 }, createRng('different'));
    assert.deepEqual(a.hist, b.hist);
    assert.notDeepEqual(a.hist, c.hist);
});

test('mean, median and SD from a histogram match the raw values', () => {
    const values = [0, 1, 1, 2, 2, 2, 3, 5, 5, 6];
    const counts = new Array(7).fill(0);
    for (const v of values) counts[v]++;
    const s = summarise(counts);
    const mean = values.reduce((a, v) => a + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1));
    assert.equal(s.n, 10);
    assert.ok(Math.abs(s.mean - mean) < 1e-12);
    assert.ok(Math.abs(s.sd - sd) < 1e-12);
    assert.equal(s.median, 2);                         // 5th and 6th values are both 2
    assert.equal(summarise([1, 0, 1]).median, 1);      // between 0 and 2
    assert.equal(summarise([0, 3, 0]).median, 1);
    assert.equal(summarise([0, 0]).mean, null);
    assert.ok(Math.abs(s.dist.reduce((a, v) => a + v, 0) - 1) < 1e-12);
});
