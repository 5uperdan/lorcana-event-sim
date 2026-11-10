// The results charts, built from plain HTML so labels wrap and the layout follows
// the page. Marks follow the dataviz rules: thin bars with a rounded data end, one
// hue for archetypes and one for your deck, hairline gridlines, a hover/focus
// tooltip on every mark, and the numbers also in the results table.
import { h, inkChips, fmtInt } from './dom.js';

let tip = null;

function tooltip() {
    if (!tip) {
        tip = h('div', { class: 'tooltip', role: 'tooltip', hidden: true });
        document.body.append(tip);
    }
    return tip;
}

// Shows `lines` ([[value, label], ...]) by the pointer or the focused element.
function attachTooltip(el, title, lines) {
    const show = (x, y) => {
        const t = tooltip();
        t.replaceChildren(
            h('div', { class: 'tip-title' }, title),
            ...lines.map(([value, label]) => h('div', { class: 'tip-row' }, h('strong', {}, value), ` ${label}`)));
        t.hidden = false;
        const { width, height } = t.getBoundingClientRect();
        const left = Math.min(window.innerWidth - width - 8, x + 14);
        const top = y + 14 + height > window.innerHeight ? y - height - 10 : y + 14;
        t.style.left = `${Math.max(8, left)}px`;
        t.style.top = `${Math.max(8, top)}px`;
    };
    const hide = () => { tooltip().hidden = true; };
    el.addEventListener('pointermove', e => show(e.clientX, e.clientY));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focusin', e => {
        const r = e.target.getBoundingClientRect();
        show(r.left + r.width / 2, r.top + r.height / 2);
    });
    el.addEventListener('focusout', hide);
}

const pctOf = (v, max) => `${(100 * Math.min(Math.max(v, 0), max)) / max}%`;

// Mean wins per participant, ±1 SD whiskers, and a hairline at the field average.
export function meanChart(rows, rounds, fieldAverage) {
    const step = rounds > 10 ? 2 : 1;
    const ticks = [];
    for (let w = 0; w <= rounds; w += step) ticks.push(w);
    const grid = `calc(100% / ${rounds / step}) 100%`;

    const rowEls = rows.map(r => {
        const bar = h('div', { class: `bar${r.you ? ' you' : ''}`, style: `width:${pctOf(r.mean, rounds)}` });
        const whisker = h('div', {
            class: 'whisker',
            style: `left:${pctOf(r.mean - r.sd, rounds)};right:calc(100% - ${pctOf(r.mean + r.sd, rounds)})`,
        });
        const avg = h('div', { class: 'avg-line', style: `left:${pctOf(fieldAverage, rounds)}` });
        const track = h('div', {
            class: 'track', style: `background-size:${grid}`, tabindex: 0,
            'aria-label': `${r.label}: mean ${r.mean.toFixed(2)} wins, median ${r.median}, SD ${r.sd.toFixed(2)}`,
        }, avg, bar, whisker);
        const row = h('div', { class: `chart-row${r.you ? ' you' : ''}` },
            h('span', { class: 'chart-label' }, inkChips(r.colors), r.label),
            track,
            h('span', { class: 'chart-value' }, `${r.mean.toFixed(2)} ± ${r.sd.toFixed(2)}`));
        attachTooltip(row, r.label, [
            [r.mean.toFixed(2), 'mean wins'],
            [String(r.median), 'median'],
            [r.sd.toFixed(2), 'standard deviation'],
            [fmtInt(r.n), 'players simulated'],
        ]);
        return row;
    });

    const axis = h('div', { class: 'chart-row axis-row', 'aria-hidden': 'true' },
        h('span'),
        h('div', { class: 'axis' },
            ticks.map(w => h('span', { class: 'tick', style: `left:${pctOf(w, rounds)}` }, String(w))),
            h('span', { class: 'avg-label', style: `left:${pctOf(fieldAverage, rounds)}` }, `field average ${fieldAverage.toFixed(2)}`)),
        h('span'));

    const hasYou = rows.some(r => r.you);
    return h('figure', { class: 'chart' },
        h('figcaption', {},
            h('strong', {}, 'Mean match wins'),
            h('span', { class: 'muted' }, ` over ${rounds} rounds, with ±1 standard deviation`)),
        hasYou && h('div', { class: 'legend' },
            h('span', {}, h('span', { class: 'swatch' }), 'Archetypes'),
            h('span', {}, h('span', { class: 'swatch you' }), 'Your deck')),
        h('div', { class: 'mean-chart' }, rowEls, axis),
        h('p', { class: 'axis-title' }, 'Match wins'));
}

function fmtShare(p) {
    if (p === 0) return '–';
    if (p < 0.0005) return '<0.1%';
    return `${(100 * p).toFixed(1)}%`;
}

// Final records: the share of each participant's players finishing on 0…R wins,
// shaded on one hue (darker = more). The numbers are printed in every cell.
export function recordTable(rows, rounds) {
    const max = Math.max(...rows.flatMap(r => r.dist));
    const wins = Array.from({ length: rounds + 1 }, (_, w) => w);
    const body = rows.map(r => h('tr', { class: r.you ? 'you' : '' },
        h('th', { scope: 'row' }, inkChips(r.colors), r.label),
        wins.map(w => {
            const p = r.dist[w];
            const strength = max > 0 ? Math.round((100 * p) / max) : 0;
            return h('td', {
                class: strength >= 55 ? 'on-dark' : '',
                style: `background:color-mix(in srgb, var(--series-1) ${strength}%, var(--surface))`,
                title: `${r.label}: ${fmtShare(p)} of players finish with ${w} win${w === 1 ? '' : 's'}`,
            }, fmtShare(p));
        })));
    return h('figure', { class: 'chart' },
        h('figcaption', {},
            h('strong', {}, 'Final records'),
            h('span', { class: 'muted' }, ' · share of each archetype\'s players finishing on each number of wins; darker is more')),
        h('div', { class: 'table-wrap' },
            h('table', { class: 'records' },
                h('thead', {}, h('tr', {},
                    h('th', { scope: 'col' }, 'Archetype'),
                    wins.map(w => h('th', { scope: 'col' }, `${w}–${rounds - w}`)))),
                h('tbody', {}, body))));
}
