// Section 2: a slider per archetype for its meta share, the running total, and the
// fixed number of players each archetype gets in the simulated field.
import { TOTAL, shareTotal, normaliseShares, seatCounts, formatTenths } from '../model.js';
import { h, inkChips, percentInput } from './dom.js';

// Seats shared out by meta share: one fewer when your deck takes a seat.
export function fieldSeats(state) {
    return Math.max(0, state.event.players - (state.you ? 1 : 0));
}

export function initShares(store) {
    const list = document.getElementById('shares-list');
    const total = document.getElementById('shares-total');
    let rows = [];

    function renderList(state) {
        const { data, shares, dataShares } = state;
        // Sorted by duels.ink's share, which is the archetypes' order.
        rows = data.archetypes.map((a, i) => {
            const meta = h('span', { class: 'meta' });
            const seats = h('span', { class: 'seats' });
            const input = percentInput({
                value: shares[i],
                label: `${a.label} meta share`,
                onChange: t => {
                    state.shares[i] = t;
                    updateRow(i);
                    store.emit('shares');
                },
            });
            const el = h('div', { class: 'share-row' },
                h('span', { class: 'name' }, inkChips(a.colors), a.label),
                input.el, meta, seats);
            return { el, meta, seats, input, duels: dataShares[i] };
        });
        list.replaceChildren(...rows.map(r => r.el));
        rows.forEach((_, i) => updateRow(i));
    }

    function updateRow(i) {
        const r = rows[i];
        const t = store.state.shares[i];
        r.el.classList.toggle('zero', t === 0);
        r.meta.replaceChildren(
            t === r.duels ? `duels.ink ${formatTenths(r.duels)}%`
                : h('span', { class: 'changed', title: 'Changed from the duels.ink value' }, `duels.ink ${formatTenths(r.duels)}%`));
    }

    function renderSeats(state) {
        const counts = seatCounts(state.shares, fieldSeats(state));
        rows.forEach((r, i) => {
            r.seats.textContent = counts[i] === 1 ? '1 player' : `${counts[i]} players`;
        });
    }

    function renderTotal(state) {
        const sum = shareTotal(state.shares);
        const off = sum !== TOTAL;
        const diff = Math.abs(TOTAL - sum);
        total.classList.toggle('off', off);
        total.replaceChildren(...[
            h('span', {}, 'Total ', h('strong', {}, `${formatTenths(sum)}%`)),
            off && h('span', {}, `${formatTenths(diff)}% ${sum < TOTAL ? 'short' : 'over'}: it must be 100.0% to run.`),
            h('span', { class: 'spacer' }),
            h('button', {
                type: 'button', class: 'secondary', disabled: !off || sum === 0,
                onclick: () => {
                    state.shares = normaliseShares(state.shares);
                    rows.forEach((r, i) => { r.input.set(state.shares[i]); updateRow(i); });
                    store.emit('shares');
                },
            }, 'Normalise to 100%'),
            h('button', {
                type: 'button', class: 'secondary',
                disabled: state.shares.every((t, i) => t === state.dataShares[i]),
                onclick: () => {
                    state.shares = [...state.dataShares];
                    rows.forEach((r, i) => { r.input.set(state.shares[i]); updateRow(i); });
                    store.emit('shares');
                },
            }, 'Reset to duels.ink'),
        ].filter(Boolean));
    }

    store.on('data', state => {
        renderList(state);
        renderSeats(state);
        renderTotal(state);
    });
    store.on('shares', state => {
        renderSeats(state);
        renderTotal(state);
    });
    store.on('event', renderSeats);
    store.on('you', renderSeats);
}
