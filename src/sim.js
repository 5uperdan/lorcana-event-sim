// The event simulation. Pure: no DOM, so the Web Worker and the tests share it.
//
// Input: seats per participant (archetypes, plus your deck with one seat), and
// onPlay[i * N + j], participant i's game win rate in tenths when on the play
// against j. j's rate on the play against i is onPlay[j * N + i], so i's rate on
// the draw is 1000 minus that.
//
// One event: the field is fixed (the same players every time); round 1 is paired at
// random, later rounds Swiss (players on the same record meet, and a player left
// over floats down to the next record). Every player is tracked individually, with
// their opponents so far, and no one meets the same opponent twice unless the round
// can't be paired any other way (e.g. more rounds than players to meet). With an odd
// number of players the lowest-placed player without a bye gets one, counted as a
// match win. Every match is a best of 3: a coin flip for who goes first in game 1,
// then the loser of each game goes first in the next. Each game is a roll of 1–1000:
// the player on the play wins if it's at most their rate.

// How long a search for a rematch-free pairing may run before falling back.
const STEP_LIMIT = 200000;

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
        pool: new Int32Array(P),
        pPos: new Int32Array((P >> 1) + 1),
        qPos: new Int32Array((P >> 1) + 1),
        pairA: new Int32Array((P >> 1) + 1),
        pairB: new Int32Array((P >> 1) + 1),
        rematch: new Uint8Array((P >> 1) + 1),
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

// Pairs pool[0..n) (n even, in standings order) with at most `budget` rematches:
// each player, highest first, meets the next player below them they haven't played
// (or, while the budget lasts, one they have). If the rest of the pool then can't be
// paired, it backtracks and tries that player's next candidate, so it finds such a
// pairing whenever one exists (within STEP_LIMIT steps). The pairs go to
// ev.pairA / ev.pairB; returns false if there's none.
function pairWithin(ev, pool, n, round, budget) {
    const { paired, pPos, qPos, rematch, pairA, pairB } = ev;
    for (let k = 0; k < n; k++) paired[pool[k]] = 0;
    const pairs = n >> 1;
    let level = 0;
    let from = -1;          // where to look for the current player's opponent; -1 = new level
    let used = 0;           // rematches in the pairs made so far
    let steps = 0;
    while (level < pairs) {
        if (++steps > STEP_LIMIT) return false;
        if (from === -1) {
            // The highest unpaired player: everyone above the last one paired is taken.
            let i = level === 0 ? 0 : pPos[level - 1] + 1;
            while (paired[pool[i]]) i++;
            pPos[level] = i;
            from = i + 1;
        }
        const p = pool[pPos[level]];
        let j = from;
        let again = false;
        for (; j < n; j++) {
            if (paired[pool[j]]) continue;
            again = havePlayed(ev, p, pool[j], round);
            if (!again || used < budget) break;
        }
        if (j < n) {
            paired[p] = paired[pool[j]] = 1;
            rematch[level] = again ? 1 : 0;
            used += rematch[level];
            qPos[level++] = j;
            from = -1;
        } else {
            // No opponent left for p: undo the previous pair and try its next candidate.
            if (level === 0) return false;
            level--;
            paired[pool[pPos[level]]] = paired[pool[qPos[level]]] = 0;
            used -= rematch[level];
            from = qPos[level] + 1;
        }
    }
    for (let k = 0; k < pairs; k++) {
        pairA[k] = pool[pPos[k]];
        pairB[k] = pool[qPos[k]];
    }
    ev.rematches += used;
    return true;
}

// Everyone in standings order except the player with the bye.
function poolWithout(ev, list, bye) {
    let n = 0;
    for (let k = 0; k < ev.P; k++) if (list[k] !== bye) ev.pool[n++] = list[k];
    return n;
}

// Pairs one round with as few rematches as possible (none, unless the round can't
// be paired otherwise); returns the player with the bye, or -1. With an odd count
// the bye goes to the lowest-placed player whose bye allows that: players without a
// bye first, then those who've had one.
function pairRound(ev, list, round) {
    const { P, hadBye, pool } = ev;
    for (let budget = 0; budget <= P >> 1; budget++) {
        if (P % 2 === 0) {
            if (pairWithin(ev, list, P, round, budget)) return -1;
            continue;
        }
        for (const repeatBye of [false, true]) {
            for (let k = P - 1; k >= 0; k--) {
                const b = list[k];
                if (Boolean(hadBye[b]) !== repeatBye) continue;
                if (pairWithin(ev, pool, poolWithout(ev, list, b), round, budget)) return b;
            }
        }
    }
    throw new Error('unreachable: with every pair allowed to be a rematch, any pairing will do');
}

// Plays one whole event; afterwards ev.wins holds each player's match wins.
// log(round, pairs, bye), if given, sees each round's pairings (for tests).
export function playEvent(ev, rng, log) {
    const { P, R, wins, hadBye, opponents, pairA, pairB } = ev;
    wins.fill(0);
    hadBye.fill(0);
    opponents.fill(-1);

    for (let round = 0; round < R; round++) {
        const list = standings(ev, rng);
        const bye = pairRound(ev, list, round);
        if (bye !== -1) {
            hadBye[bye] = 1;
            wins[bye]++;
        }
        const pairs = log ? [] : null;
        for (let m = 0; m < P >> 1; m++) {
            const p = pairA[m];
            const q = pairB[m];
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
