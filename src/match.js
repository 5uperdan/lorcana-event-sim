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
