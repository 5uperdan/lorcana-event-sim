import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bo3MatchProb } from '../src/match.js';

// Every way a BO3 can go: coin flip for game 1, loser of each game goes first next.
function enumerate(a, b) {
    const play = (aWins, bWins, aOnPlay) => {
        if (aWins === 2) return 1;
        if (bWins === 2) return 0;
        const p = aOnPlay ? a : b;
        return p * play(aWins + 1, bWins, false) + (1 - p) * play(aWins, bWins + 1, true);
    };
    return (play(0, 0, true) + play(0, 0, false)) / 2;
}

test('the BO3 formula matches every way the match can go', () => {
    for (let a = 0; a <= 1; a += 0.05) {
        for (let b = 0; b <= 1; b += 0.05) {
            assert.ok(Math.abs(bo3MatchProb(a, b) - enumerate(a, b)) < 1e-12, `a=${a} b=${b}`);
        }
    }
});

test('known values', () => {
    // Rockstar Aggro vs Emerald/Steel Midrange, last 2 weeks: 45.4% / 28.8% a game.
    assert.equal(bo3MatchProb(0.454, 0.288).toFixed(3), '0.309');
    // Equal rates either way: p²(3 − 2p).
    assert.equal(bo3MatchProb(0.55, 0.55).toFixed(4), '0.5748');
    // A pure play/draw split with no edge is a coin flip over the match.
    assert.equal(bo3MatchProb(0.6, 0.4), 0.5);
});
