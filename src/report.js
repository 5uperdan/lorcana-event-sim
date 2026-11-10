// Turning a finished run into per-participant rows (and CSV). Pure, so it's tested
// in Node; the page draws its table and charts from the same rows.
import { summarise } from './stats.js';
import { formatTenths, YOU } from './model.js';

// One row per participant (archetypes in load order, then your deck), with its
// meta share, seats, the exact round-1 odds and the summary of its win histogram.
export function resultRows(results) {
    const W = results.rounds + 1;
    return results.ids.map((id, i) => {
        const counts = Array.from(results.hist.subarray(i * W, (i + 1) * W));
        return {
            id,
            you: id === YOU,
            label: results.labels[i],
            colors: results.colors[i],
            share: results.shares[i],
            seats: results.seats[i],
            expected: results.expected[i],
            ...summarise(counts),
        };
    });
}

// The results as CSV: one row per participant, in the order given.
export function resultsCsv(results, rows) {
    const R = results.rounds;
    const quote = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = ['Archetype', 'Meta share %', 'Players', 'Simulated players', 'Mean wins', 'Median wins', 'SD',
        'Round 1 match win %', ...Array.from({ length: R + 1 }, (_, w) => `${w} wins %`)];
    const lines = rows.map(r => [
        r.label, r.you ? '' : formatTenths(r.share), r.seats, r.n, r.mean.toFixed(4), r.median, r.sd.toFixed(4),
        (100 * r.expected).toFixed(2), ...r.dist.map(p => (100 * p).toFixed(3)),
    ].map(v => quote(String(v))).join(','));
    return [head.map(quote).join(','), ...lines].join('\n') + '\n';
}
