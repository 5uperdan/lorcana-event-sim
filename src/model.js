// The simulator's numbers, independent of the page. Percentages are held as integer
// tenths of a percent (601 = 60.1%) so totals check exactly and a game can be
// decided by a 1–1000 roll with no rounding.

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
