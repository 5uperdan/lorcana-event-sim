// The event simulation. Pure: no DOM, so the Web Worker and the tests share it.
//
// Input: seats per participant (archetypes, plus your deck with one seat), and
// onPlay[i * N + j], participant i's game win rate in tenths when on the play
// against j. j's rate on the play against i is onPlay[j * N + i], so i's rate on
// the draw is 1000 minus that.
//
// One event: the field is fixed (the same players every time); round 1 is paired at
// random, later rounds Swiss (players on the same record meet, and a player left
// over floats down to the next record), avoiding rematches where it can. With an
// odd number of players the lowest-placed player without a bye gets one, counted as
// a match win. Every match is a best of 3: a coin flip for who goes first in game 1,
// then the loser of each game goes first in the next. Each game is a roll of 1–1000:
// the player on the play wins if it's at most their rate.

export function createEvent({ seats, onPlay, rounds }) {
    const N = seats.length;
    const P = seats.reduce((s, v) => s + v, 0);
    const arch = new Int32Array(P);
    for (let i = 0, p = 0; i < N; i++) for (let k = 0; k < seats[i]; k++) arch[p++] = i;
    return {
        N, P, R: rounds, arch, onPlay,
        wins: new Int32Array(P),
        hadBye: new Uint8Array(P),
        opponents: new Int32Array(P * rounds),   // -1 for a bye
        order: new Int32Array(P),
        sorted: new Int32Array(P),
        paired: new Uint8Array(P),
        groupStart: new Int32Array(rounds + 2),
        rematches: 0,
    };
}

function shuffle(a, n, rng) {
    for (let i = n - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
}

// Players in order of wins, most first, in random order within each record.
function standings(ev, rng) {
    const { P, R, order, sorted, wins, groupStart } = ev;
    for (let p = 0; p < P; p++) order[p] = p;
    shuffle(order, P, rng);
    // Stable counting sort by wins, descending: R + 1 possible records.
    groupStart.fill(0);
    for (let p = 0; p < P; p++) groupStart[R - wins[p] + 1]++;
    for (let g = 1; g <= R + 1; g++) groupStart[g] += groupStart[g - 1];
    for (let k = 0; k < P; k++) {
        const p = order[k];
        sorted[groupStart[R - wins[p]]++] = p;
    }
    return sorted;
}

function havePlayed(ev, p, q, round) {
    const base = p * ev.R;
    for (let r = 0; r < round; r++) if (ev.opponents[base + r] === q) return true;
    return false;
}

// One best of 3. Returns the winner.
function playMatch(ev, p, q, rng) {
    const { arch, onPlay, N } = ev;
    let first = rng.coin() ? p : q;
    let second = first === p ? q : p;
    let pWins = 0;
    let qWins = 0;
    while (pWins < 2 && qWins < 2) {
        const firstWins = rng.roll1000() <= onPlay[arch[first] * N + arch[second]];
        if ((firstWins ? first : second) === p) pWins++;
        else qWins++;
        // The loser goes first in the next game.
        if (firstWins) { const t = first; first = second; second = t; }
    }
    return pWins === 2 ? p : q;
}

// Plays one whole event; afterwards ev.wins holds each player's match wins.
// log(round, pairs, bye), if given, sees each round's pairings (for tests).
export function playEvent(ev, rng, log) {
    const { P, R, wins, hadBye, opponents, paired } = ev;
    wins.fill(0);
    hadBye.fill(0);
    opponents.fill(-1);

    for (let round = 0; round < R; round++) {
        const list = standings(ev, rng);
        paired.fill(0);
        let bye = -1;
        if (P % 2 === 1) {
            // The lowest-placed player who hasn't had a bye (anyone, if all have).
            for (let k = P - 1; k >= 0; k--) {
                if (!hadBye[list[k]]) { bye = list[k]; break; }
            }
            if (bye === -1) bye = list[P - 1];
            paired[bye] = 1;
            hadBye[bye] = 1;
            wins[bye]++;
        }

        const pairs = log ? [] : null;
        for (let i = 0; i < P; i++) {
            const p = list[i];
            if (paired[p]) continue;
            // The next unpaired player they haven't met; failing that, the next unpaired.
            let q = -1;
            let fallback = -1;
            for (let j = i + 1; j < P; j++) {
                const c = list[j];
                if (paired[c]) continue;
                if (fallback === -1) fallback = c;
                if (!havePlayed(ev, p, c, round)) { q = c; break; }
            }
            if (q === -1) { q = fallback; ev.rematches++; }
            paired[p] = paired[q] = 1;
            opponents[p * R + round] = q;
            opponents[q * R + round] = p;
            wins[playMatch(ev, p, q, rng)]++;
            pairs?.push([p, q]);
        }
        log?.(round, pairs, bye);
    }
}

// Runs `sims` events. hist[i * (R + 1) + w] counts participant i's players who
// finished with w match wins. onProgress(done) is called every 64 events.
export function simulate({ seats, onPlay, rounds, sims }, rng, onProgress) {
    const ev = createEvent({ seats, onPlay, rounds });
    const W = rounds + 1;
    const hist = new Float64Array(seats.length * W);
    for (let s = 0; s < sims; s++) {
        playEvent(ev, rng);
        for (let p = 0; p < ev.P; p++) hist[ev.arch[p] * W + ev.wins[p]]++;
        if (onProgress && (s & 63) === 63) onProgress(s + 1);
    }
    return { hist, rematches: ev.rematches, players: ev.P };
}
