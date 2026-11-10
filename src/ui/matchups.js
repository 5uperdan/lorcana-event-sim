// Section 3: every matchup once, collapsed by default. Each pair {A, B} sits in A's
// group (A comes first in the archetype order), with A's game win rate on the play
// and on the draw; B's side follows from them. A group's rows are built only when
// it's opened, which keeps the page quick with ~1,200 sliders.
import {
    effectiveMatchup, setOverride, clearOverride, hasOverride, fallbackRates, formatTenths,
    archetypeById, yourLabel, YOU,
} from '../model.js';
import { bo3MatchProb } from '../match.js';
import { h, inkChips, fmtInt, percentInput } from './dom.js';

const pct1 = p => `${(p * 100).toFixed(1)}%`;

// The rows of one group: for archetype i, itself (the mirror) and every later one.
// Your deck, when there is one, gets a group of its own on top: it against everyone.
export function initMatchups(store) {
    const section = document.getElementById('matchups');
    const summary = h('summary');
    const search = h('input', { type: 'search', placeholder: 'Find an archetype…', 'aria-label': 'Find an archetype' });
    const onlyOverridden = h('input', { type: 'checkbox' });
    const threshold = h('input', { type: 'number', min: 0, step: 10, value: store.state.threshold, class: 'narrow' });
    const resetAll = h('button', { type: 'button', class: 'secondary' }, 'Reset all matchups');
    const groupsEl = h('div', { class: 'mu-groups' });
    const panel = h('details', { class: 'mu-panel' },
        summary,
        h('p', { class: 'hint' },
            'Game win rates for the first archetype of each pair; the second\'s follow from them. ',
            'Pairs with too few games use a neutral estimate: the queue\'s own play/draw split.'),
        h('div', { class: 'controls mu-toolbar' },
            h('label', {}, 'Find', search),
            h('label', { class: 'check' }, onlyOverridden, ' Changed only'),
            h('label', {}, 'Estimate below (games)', threshold),
            resetAll),
        groupsEl);
    section.append(panel);

    let groups = [];   // { id, label, colors, pairs: [[x, y]], el, body, rendered, count }

    const labelOf = id => (id === YOU ? yourLabel(store.state) : archetypeById(store.state.data, id)?.label ?? id);
    const colorsOf = id => archetypeById(store.state.data, id === YOU ? store.state.you.base : id)?.colors ?? [];

    function matchupRow(x, y) {
        const state = store.state;
        const mirror = x === y;
        const title = h('div', { class: 'mu-title' });
        const derived = h('div', { class: 'mu-derived' });
        const el = h('div', { class: 'mu-row' });
        let current = effectiveMatchup(state, x, y);

        const change = side => t => {
            const next = { onPlay: current.onPlay, onDraw: current.onDraw, [side]: t };
            setOverride(state, x, y, next);
            refresh();
            store.emit('matchups');
        };
        const onPlay = percentInput({ value: current.onPlay, label: `${labelOf(x)} on the play vs ${labelOf(y)}`, onChange: change('onPlay') });
        const onDraw = mirror ? null
            : percentInput({ value: current.onDraw, label: `${labelOf(x)} on the draw vs ${labelOf(y)}`, onChange: change('onDraw') });

        function refresh() {
            current = effectiveMatchup(store.state, x, y);
            onPlay.set(current.onPlay);
            onDraw?.set(current.onDraw);
            const fb = fallbackRates(store.state.data);
            const badge = {
                override: h('span', { class: 'badge changed' }, 'changed'),
                estimated: h('span', {
                    class: 'badge est',
                    title: `Fewer than ${store.state.threshold} games, so a neutral estimate: ${formatTenths(fb.onPlay)}% on the play, ${formatTenths(fb.onDraw)}% on the draw`,
                }, 'estimated'),
                data: null,
            }[current.source];
            title.replaceChildren(...[
                h('span', { class: 'vs' }, inkChips(colorsOf(x)), labelOf(x)),
                mirror ? h('span', { class: 'muted' }, ' mirror') : h('span', { class: 'vs' }, h('span', { class: 'muted' }, ' vs '), inkChips(colorsOf(y)), labelOf(y)),
                h('span', { class: 'games' }, current.games ? `${fmtInt(current.games)} games` : 'no games'),
                badge,
                current.source === 'override' && h('button', {
                    type: 'button', class: 'link',
                    onclick: () => { clearOverride(store.state, x, y); refresh(); store.emit('matchups'); },
                }, 'reset'),
            ].filter(Boolean));
            if (mirror) {
                derived.textContent = `The match is 50% either way; this only decides who wins when on the play.`;
            } else {
                const a = current.onPlay / 1000;
                const b = current.onDraw / 1000;
                derived.textContent = `${labelOf(y)}: ${formatTenths(1000 - current.onDraw)}% on the play, ` +
                    `${formatTenths(1000 - current.onPlay)}% on the draw · best of 3: ${labelOf(x)} ${pct1(bo3MatchProb(a, b))}`;
            }
            el.classList.toggle('overridden', current.source === 'override');
        }

        el.append(title,
            h('div', { class: 'mu-inputs' },
                h('label', {}, h('span', {}, mirror ? 'First player wins' : 'On the play'), onPlay.el),
                onDraw && h('label', {}, h('span', {}, 'On the draw'), onDraw.el)),
            derived);
        refresh();
        return { el, refresh, x, y };
    }

    function matches(pair, text) {
        if (!text) return true;
        return pair.some(id => labelOf(id).toLowerCase().includes(text));
    }

    function visiblePairs(group) {
        const text = search.value.trim().toLowerCase();
        return group.pairs.filter(([x, y]) =>
            matches([x, y], text) && (!onlyOverridden.checked || hasOverride(store.state, x, y)));
    }

    function renderGroup(group) {
        group.rows = visiblePairs(group).map(([x, y]) => matchupRow(x, y));
        group.body.replaceChildren(...group.rows.map(r => r.el));
        group.rendered = true;
    }

    function groupCounts(group) {
        const changed = group.pairs.filter(([x, y]) => hasOverride(store.state, x, y)).length;
        return `${group.pairs.length} matchups${changed ? ` · ${changed} changed` : ''}`;
    }

    function buildGroups() {
        const state = store.state;
        const ids = state.data.archetypes.map(a => a.id);
        const list = state.you ? [{ id: YOU, you: true, pairs: ids.map(y => [YOU, y]) }] : [];
        ids.forEach((id, i) => list.push({ id, pairs: ids.slice(i).map(y => [id, y]) }));
        groups = list.map(g => {
            const count = h('span', { class: 'muted' });
            const body = h('div', { class: 'mu-rows' });
            const el = h('details', { class: `mu-group${g.you ? ' you' : ''}` },
                h('summary', {}, inkChips(colorsOf(g.id)), labelOf(g.id), ' ', count),
                body);
            const group = { ...g, el, body, count, rendered: false, rows: [] };
            el.addEventListener('toggle', () => { if (el.open && !group.rendered) renderGroup(group); });
            return group;
        });
        groupsEl.replaceChildren(...groups.map(g => g.el));
        applyFilters();
    }

    // Searching or "changed only" opens the groups with matches and shows only those rows.
    function applyFilters() {
        const filtering = search.value.trim() !== '' || onlyOverridden.checked;
        for (const g of groups) {
            const n = visiblePairs(g).length;
            g.el.hidden = n === 0;
            g.count.textContent = groupCounts(g);
            if (filtering && n > 0) g.el.open = true;
            if (g.el.open) renderGroup(g);
            else g.rendered = false;
        }
        updateSummary();
    }

    function updateSummary() {
        const state = store.state;
        let pairs = 0, changed = 0, estimated = 0;
        for (const g of groups) {
            for (const [x, y] of g.pairs) {
                pairs++;
                const m = effectiveMatchup(state, x, y);
                if (m.source === 'override') changed++;
                else if (m.source === 'estimated') estimated++;
            }
        }
        summary.replaceChildren(
            h('strong', {}, 'Matchups'),
            ` · ${fmtInt(pairs)} pairs · ${estimated} estimated · ${changed} changed`);
        resetAll.disabled = changed === 0;
    }

    search.addEventListener('input', applyFilters);
    onlyOverridden.addEventListener('change', applyFilters);
    threshold.addEventListener('change', () => {
        const v = Math.max(0, Math.round(Number(threshold.value) || 0));
        threshold.value = v;
        store.state.threshold = v;
        groups.forEach(g => g.rows.forEach(r => r.refresh()));
        store.emit('matchups');
    });
    resetAll.addEventListener('click', () => {
        if (!confirm('Reset every matchup to the duels.ink data?')) return;
        store.state.overrides = {};
        if (store.state.you) store.state.you.overrides = {};
        groups.forEach(g => g.rows.forEach(r => r.refresh()));
        store.emit('matchups');
    });

    store.on('data', state => {
        section.hidden = false;
        threshold.value = state.threshold;
        buildGroups();
    });
    store.on('you', () => { if (store.state.data) buildGroups(); });
    store.on('matchups', () => {
        for (const g of groups) g.count.textContent = groupCounts(g);
        updateSummary();
    });

    return { rebuild: buildGroups };
}
