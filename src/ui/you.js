// Section 4: your deck, one player copied from an archetype, always in the field.
import { archetypeById, yourLabel } from '../model.js';
import { h } from './dom.js';

export function initYou(store) {
    const section = document.getElementById('you');
    const body = h('div');
    section.append(
        h('p', { class: 'hint' },
            'Add one player of your own: a copy of an archetype whose matchups you can change. ',
            'It always takes one seat in the event, and its results are shown on their own.'),
        body);

    function baseSelect(selected) {
        return h('select', { 'aria-label': 'Archetype to copy' },
            store.state.data.archetypes.map(a => h('option', { value: a.id, selected: a.id === selected }, a.label)));
    }

    function render(state) {
        if (!state.data) return;
        section.hidden = false;
        if (!state.you) {
            const base = baseSelect(state.data.archetypes[0].id);
            const name = h('input', { type: 'text', placeholder: 'Your deck (copy of …)', 'aria-label': 'Name' });
            body.replaceChildren(h('div', { class: 'controls' },
                h('label', {}, 'Copy', base),
                h('label', {}, 'Name (optional)', name),
                h('button', {
                    type: 'button',
                    onclick: () => {
                        state.you = { base: base.value, name: name.value, overrides: {} };
                        store.emit('you');
                    },
                }, 'Add your deck')));
            return;
        }

        const base = baseSelect(state.you.base);
        const name = h('input', { type: 'text', value: state.you.name, placeholder: yourLabel(state), 'aria-label': 'Name' });
        base.addEventListener('change', () => {
            const changed = Object.keys(state.you.overrides).length;
            if (changed && !confirm(`Copying a different archetype resets your deck's ${changed} changed matchup${changed === 1 ? '' : 's'}. Continue?`)) {
                base.value = state.you.base;
                return;
            }
            state.you.base = base.value;
            state.you.overrides = {};
            store.emit('you');
        });
        name.addEventListener('change', () => {
            state.you.name = name.value;
            store.emit('you');
        });
        const changed = Object.keys(state.you.overrides).length;
        body.replaceChildren(
            h('div', { class: 'controls you-box' },
                h('label', {}, 'Copy of', base),
                h('label', {}, 'Name', name),
                h('button', {
                    type: 'button', class: 'secondary',
                    onclick: () => {
                        if (changed && !confirm('Remove your deck and its changed matchups?')) return;
                        state.you = null;
                        store.emit('you');
                    },
                }, 'Remove')),
            h('p', { class: 'hint' },
                `Its matchups are the first group in section 3. They follow ${archetypeById(state.data, state.you.base).label} `,
                `until you change one${changed ? ` (${changed} changed so far)` : ''}.`));
    }

    store.on('data', state => {
        // A new period may not have the archetype your deck copies.
        if (state.you && !archetypeById(state.data, state.you.base)) {
            state.you.base = state.data.archetypes[0].id;
            state.you.overrides = {};
            alert('The archetype your deck copied isn\'t in this data, so it now copies the most played one. Its changed matchups were reset.');
        }
        render(state);
        if (state.you) store.emit('you');
    });
    store.on('you', render);
    store.on('matchups', state => { if (state.you) render(state); });
}
