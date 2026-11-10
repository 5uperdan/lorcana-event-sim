// Summaries of a win-count histogram: counts[w] players finished with w match wins.

export function summarise(counts) {
    let n = 0;
    let total = 0;
    counts.forEach((c, w) => { n += c; total += c * w; });
    if (n === 0) return { n: 0, mean: null, median: null, sd: null, dist: counts.map(() => 0) };
    const mean = total / n;
    let squares = 0;
    counts.forEach((c, w) => { squares += c * (w - mean) ** 2; });
    // The value at position k (0-based) of the sorted sample.
    const at = k => {
        let seen = 0;
        for (let w = 0; w < counts.length; w++) {
            seen += counts[w];
            if (seen > k) return w;
        }
        return counts.length - 1;
    };
    return {
        n,
        mean,
        median: (at(Math.floor((n - 1) / 2)) + at(Math.ceil((n - 1) / 2))) / 2,
        sd: n > 1 ? Math.sqrt(squares / (n - 1)) : 0,
        dist: counts.map(c => c / n),
    };
}
