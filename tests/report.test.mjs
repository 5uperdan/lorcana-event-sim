import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultRows, resultsCsv } from '../src/report.js';
import { YOU } from '../src/model.js';

// A tiny finished run: two archetypes and your deck, 2 rounds, 10 events.
const results = {
    ids: ['a', 'b', YOU],
    labels: ['Amber/Steel "Rockstar" Aggro', 'Emerald/Steel Midrange', 'Your deck'],
    colors: [['amber', 'steel'], ['emerald', 'steel'], ['amber', 'steel']],
    shares: [600, 400, null],
    seats: [2, 1, 1],
    expected: [0.5, 0.48, 0.52],
    rounds: 2,
    sims: 10,
    // per participant: players finishing on 0, 1, 2 wins
    hist: Float64Array.from([5, 10, 5, 4, 4, 2, 1, 6, 3]),
};

test('rows summarise each participant\'s histogram', () => {
    const [a, b, you] = resultRows(results);
    assert.equal(a.n, 20);
    assert.equal(a.mean, 1);
    assert.equal(a.median, 1);
    assert.equal(b.n, 10);
    assert.equal(b.mean, 0.8);
    assert.equal(you.you, true);
    assert.equal(you.mean, 1.2);
    assert.deepEqual(you.dist, [0.1, 0.6, 0.3]);
});

test('the CSV has a header, quoting, and one row per participant', () => {
    const lines = resultsCsv(results, resultRows(results)).trim().split('\n');
    assert.equal(lines[0], 'Archetype,Meta share %,Players,Simulated players,Mean wins,Median wins,SD,Round 1 match win %,0 wins %,1 wins %,2 wins %');
    assert.equal(lines[1], '"Amber/Steel ""Rockstar"" Aggro",60.0,2,20,1.0000,1,0.7255,50.00,25.000,50.000,25.000');
    assert.ok(lines[3].startsWith('Your deck,,1,10,1.2000,1,'));
    assert.equal(lines.length, 4);
});
