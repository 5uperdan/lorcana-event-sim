// Section 6: each archetype's (and your deck's) mean, median and standard deviation
// of match wins across all simulated events, as a table, two charts and a CSV.
import { formatTenths } from '../model.js';
import { resultRows, resultsCsv } from '../report.js';
import { h, inkChips, fmtInt, fmtDateTime } from './dom.js';
import { meanChart, recordTable } from './charts.js';

const COLUMNS = [
    { key: 'label', label: 'Archetype', text: true },
    { key: 'share', label: 'Meta share', fmt: r => (r.you ? '–' : `${formatTenths(r.share)}%`) },
    { key: 'seats', label: 'Players', fmt: r => fmtInt(r.seats) },
    { key: 'n', label: 'Simulated players', fmt: r => fmtInt(r.n) },
    { key: 'mean', label: 'Mean wins', fmt: r => r.mean.toFixed(2) },
    { key: 'median', label: 'Median', fmt: r => String(r.median) },
    { key: 'sd', label: 'SD', fmt: r => r.sd.toFixed(2) },
    { key: 'expected', label: 'Round 1 match win', fmt: r => `${(100 * r.expected).toFixed(1)}%`, title: 'Exact chance of winning a round-1 match against an opponent drawn at random from the rest of the field' },
];

export function initResults(store) {
    const section = document.getElementById('results');
    const body = h('div');
    section.append(body);
    let sort = { key: 'mean', desc: true };

    function render(state) {
        const results = state.results;
        if (!results) {
            section.hidden = true;
            body.replaceChildren();
            return;
        }
        section.hidden = false;
        const all = resultRows(results);
        const rows = all.filter(r => r.n > 0);
        const absent = all.filter(r => r.n === 0);
        const byMean = [...rows].sort((a, b) => b.mean - a.mean);
        const totalWins = rows.reduce((s, r) => s + r.mean * r.n, 0);
        const fieldAverage = totalWins / rows.reduce((s, r) => s + r.n, 0);

        const sorted = [...rows].sort((a, b) => {
            const col = COLUMNS.find(c => c.key === sort.key);
            const d = col.text ? a.label.localeCompare(b.label) : (a[sort.key] ?? -1) - (b[sort.key] ?? -1);
            return sort.desc ? -d : d;
        });

        const table = h('table', { class: 'stats' },
            h('thead', {}, h('tr', {}, COLUMNS.map(c => h('th', {
                scope: 'col', title: c.title,
                'aria-sort': sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none',
            }, h('button', {
                type: 'button', class: 'sort',
                onclick: () => {
                    sort = sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: !c.text };
                    render(store.state);
                },
            }, c.label, sort.key === c.key ? (sort.desc ? ' ▾' : ' ▴') : ''))))),
            h('tbody', {}, sorted.map(r => h('tr', { class: r.you ? 'you' : '' },
                COLUMNS.map(c => (c.text
                    ? h('th', { scope: 'row' }, inkChips(r.colors), r.label)
                    : h('td', {}, c.fmt(r))))))));

        const download = h('button', {
            type: 'button', class: 'secondary',
            onclick: () => {
                const blob = new Blob([resultsCsv(results, byMean)], { type: 'text/csv' });
                const a = h('a', { href: URL.createObjectURL(blob), download: `lorcana-event-sim-${results.seed}.csv` });
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            },
        }, 'Download CSV');

        const rematchShare = results.rematches / (results.sims * results.rounds * Math.floor(results.players / 2));
        body.replaceChildren(...[
            results.stale && h('p', { class: 'stale' }, 'Settings have changed since this run. Run it again to update these results.'),
            h('p', { class: 'hint' },
                `${fmtInt(results.sims)} events · ${fmtInt(results.players)} players · ${results.rounds} rounds · ` +
                `${results.source.queue}, duels.ink data of ${fmtDateTime(results.source.updatedAt)} · seed ${results.seed} · ` +
                `${(results.elapsed / 1000).toFixed(1)} s` +
                (results.rematches ? ` · ${fmtInt(results.rematches)} rematches (${(100 * rematchShare).toFixed(2)}% of matches)` : '')),
            h('div', { class: 'table-wrap' }, table),
            absent.length > 0 && h('p', { class: 'hint' },
                `Not in the field at ${fmtInt(results.players)} players (their share rounds to no seats): `,
                absent.map(r => r.label).join(', '), '.'),
            h('div', { class: 'controls' }, download),
            meanChart(byMean, results.rounds, fieldAverage),
            recordTable(byMean, results.rounds),
        ].filter(Boolean));
    }

    store.on('results', render);
}
