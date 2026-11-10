// Best-of-3 odds from per-game rates. A coin flip decides who goes first in game 1,
// and the loser of each game goes first in the next.

// P(A wins the match), where a is A's game win rate on the play and b on the draw.
export function bo3MatchProb(a, b) {
    // If A won game 1, B goes first in game 2: A wins it (2-0) or loses, then goes first in game 3.
    const afterWin = b + (1 - b) * a;
    // If A lost game 1, A goes first in game 2: A wins it, then is on the draw in game 3.
    const afterLoss = a * b;
    const aFirst = a * afterWin + (1 - a) * afterLoss;
    const aSecond = b * afterWin + (1 - b) * afterLoss;
    return (aFirst + aSecond) / 2;
}

// Participant i's chance of winning a round-1 match, when its opponent is drawn at
// random from everyone else in the field. Uses simInput()'s seats and onPlay table.
export function fieldMatchWin(i, seats, onPlay) {
    const N = seats.length;
    let weight = 0;
    let total = 0;
    for (let j = 0; j < N; j++) {
        const w = seats[j] - (j === i ? 1 : 0);
        if (w <= 0) continue;
        const p = i === j ? 0.5 : bo3MatchProb(onPlay[i * N + j] / 1000, 1 - onPlay[j * N + i] / 1000);
        weight += w;
        total += w * p;
    }
    return weight > 0 ? total / weight : null;
}
