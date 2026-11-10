// The simulator's numbers, independent of the page. Percentages are held as integer
// tenths of a percent (601 = 60.1%) so totals check exactly and a game can be
// decided by a 1–1000 roll with no rounding.
import { ratesFor } from './duels.js';

export const TOTAL = 1000;   // 100.0%

// Shares `total` out in proportion to integer `weights`: each gets the floor of its
// exact share, and what's left goes to the largest remainders, ties going to the
// larger weight and then to the earlier entry. Integer arithmetic, so it's exact.
export function largestRemainder(weights, total) {
    const sum = weights.reduce((s, w) => s + w, 0);
    if (sum <= 0 || total <= 0) return weights.map(() => 0);
    const out = weights.map(w => Math.floor((w * total) / sum));
    const rem = weights.map((w, i) => w * total - out[i] * sum);
    const left = total - out.reduce((s, v) => s + v, 0);
    const order = weights.map((_, i) => i)
        .sort((i, j) => rem[j] - rem[i] || weights[j] - weights[i] || i - j);
    for (let k = 0; k < left; k++) out[order[k]]++;
    return out;
}

// duels.ink's meta shares: each archetype's matches over all listed archetypes'.
export function initialShares(archetypes) {
    return largestRemainder(archetypes.map(a => a.matches), TOTAL);
}

// The current shares scaled to total exactly 100.0%. All zero stays all zero.
export function normaliseShares(shares) {
    return shares.some(s => s > 0) ? largestRemainder(shares, TOTAL) : [...shares];
}

export function shareTotal(shares) {
    return shares.reduce((s, v) => s + v, 0);
}

// Player seats per archetype for a field of `seats` players (fixed counts).
export function seatCounts(shares, seats) {
    return largestRemainder(shares, Math.max(0, seats));
}

// "12.3" -> 123; clamps to 0–100%. Returns null for anything that isn't a number.
export function parseTenths(text) {
    const v = Number.parseFloat(String(text).replace(',', '.'));
    if (!Number.isFinite(v)) return null;
    return Math.min(TOTAL, Math.max(0, Math.round(v * 10)));
}

export function formatTenths(t) {
    return (t / 10).toFixed(1);
}

// ---- Matchups ---------------------------------------------------------------
// A matchup's two numbers are game win rates for one side, on the play and on the
// draw, in tenths. The other side's are 1000 minus them, crossed over: B on the play
// is 1000 − A on the draw. Values are worked out from the side whose id sorts first
// and flipped for the other, so the two sides always agree exactly.
// Overrides are kept under pairKey(), from that same first side, so they survive a
// change of period (which can reorder archetypes) and a data refresh.

export function pairKey(x, y) {
    return x < y ? `${x}|${y}` : `${y}|${x}`;
}

const indexes = new WeakMap();
function matchupIndex(data) {
    if (!indexes.has(data)) indexes.set(data, new Map(data.matchups.map(m => [pairKey(m.a, m.b), m])));
    return indexes.get(data);
}

export function findMatchup(data, x, y) {
    return matchupIndex(data).get(pairKey(x, y)) ?? null;
}

// The neutral estimate: the queue's own first/second game win rates.
export function fallbackRates(data) {
    return { onPlay: Math.round(data.playDraw.first * 1000), onDraw: Math.round(data.playDraw.second * 1000) };
}

function flip({ onPlay, onDraw }) {
    return { onPlay: 1000 - onDraw, onDraw: 1000 - onPlay };
}

// From the first side: the override, else duels.ink's rates (sides with no games
// fall back), else the neutral estimate when there are fewer than `threshold` games.
function canonicalRates(state, first, second) {
    const m = findMatchup(state.data, first, second);
    const games = m?.games ?? 0;
    const fb = fallbackRates(state.data);
    const override = state.overrides[pairKey(first, second)];
    if (override) return { ...override, games, source: 'override' };
    if (games === 0 || games < state.threshold) return { ...fb, games, source: 'estimated' };
    const r = ratesFor(m, first);
    const partial = r.onPlay === null || (first !== second && r.onDraw === null);
    return {
        onPlay: r.onPlay === null ? fb.onPlay : Math.round(r.onPlay * 1000),
        onDraw: r.onDraw === null ? fb.onDraw : Math.round(r.onDraw * 1000),
        games,
        source: partial ? 'estimated' : 'data',
    };
}

// ---- Your deck --------------------------------------------------------------
// One extra player, id YOU, copying an archetype (state.you.base). Its matchups follow
// that archetype's current values until you change one; your changes live in
// state.you.overrides, keyed by opponent id, from your side. Against the archetype
// it copies it starts from the mirror: the first player's rate on the play, and
// 100% minus that on the draw. Changing it never touches the archetype itself.

export const YOU = 'you';

function yourRates(state, y) {
    const { base, overrides } = state.you;
    const own = overrides[y];
    const copied = y === base
        ? (m => ({ onPlay: m.onPlay, onDraw: 1000 - m.onPlay, games: m.games, source: m.source }))(effectiveMatchup(state, base, base))
        : effectiveMatchup(state, base, y);
    // "changed" only ever means your own change; an edited archetype is just copied.
    const source = copied.source === 'override' ? 'data' : copied.source;
    return own ? { ...own, games: copied.games, source: 'override' } : { ...copied, source };
}

// x's game win rates against y, in tenths, and where they came from
// ('data', 'estimated' or 'override'). A mirror has onPlay only (the first player's).
export function effectiveMatchup(state, x, y) {
    if (x === YOU || y === YOU) {
        const r = yourRates(state, x === YOU ? y : x);
        const rates = x === YOU ? r : flip(r);
        return { onPlay: rates.onPlay, onDraw: rates.onDraw, games: r.games, source: r.source };
    }
    if (x === y) {
        const r = canonicalRates(state, x, x);
        return { onPlay: r.onPlay, onDraw: null, games: r.games, source: r.source };
    }
    const first = x < y ? x : y;
    const r = canonicalRates(state, first, first === x ? y : x);
    const rates = first === x ? r : flip(r);
    return { onPlay: rates.onPlay, onDraw: rates.onDraw, games: r.games, source: r.source };
}

// Sets x's rates against y (tenths). For a mirror only onPlay is used.
export function setOverride(state, x, y, { onPlay, onDraw }) {
    if (x === YOU) state.you.overrides[y] = { onPlay, onDraw };
    else if (y === YOU) state.you.overrides[x] = flip({ onPlay, onDraw });
    else if (x === y) state.overrides[pairKey(x, x)] = { onPlay };
    else state.overrides[pairKey(x, y)] = x < y ? { onPlay, onDraw } : flip({ onPlay, onDraw });
}

export function clearOverride(state, x, y) {
    if (x === YOU) delete state.you.overrides[y];
    else if (y === YOU) delete state.you.overrides[x];
    else delete state.overrides[pairKey(x, y)];
}

export function hasOverride(state, x, y) {
    if (x === YOU) return Boolean(state.you?.overrides[y]);
    if (y === YOU) return Boolean(state.you?.overrides[x]);
    return Boolean(state.overrides[pairKey(x, y)]);
}

export function archetypeById(data, id) {
    return data.archetypes.find(a => a.id === id) ?? null;
}

// Your deck's name, or "Your deck (copy of …)" until you give it one.
export function yourLabel(state) {
    const base = archetypeById(state.data, state.you.base);
    return state.you.name.trim() || `Your deck (copy of ${base ? base.label : 'an archetype'})`;
}
