// Saving the whole setup (meta shares, matchup changes, your deck, event) to a file,
// loading one back, and starting over.
import { scenarioFile, parseScenario, sharesFromMap, rangeOf, clearSettings } from '../storage.js';
import { archetypeById } from '../model.js';
import { h } from './dom.js';

const rangeLabel = r => (r === 'all_time' ? 'the full season' : r === 1 ? 'the last week' : `the last ${r} weeks`);

export function initScenario(store, { data, eventDefaults }) {
    const section = document.getElementById('data');
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    const save = h('button', { type: 'button', class: 'secondary', disabled: true }, 'Save scenario…');
    const load = h('button', { type: 'button', class: 'secondary', disabled: true }, 'Load scenario…');
    const reset = h('button', { type: 'button', class: 'secondary' }, 'Start over');
    const status = h('span', { class: 'muted', role: 'status' });
    section.append(h('div', { class: 'controls scenario' },
        h('span', { class: 'muted' }, 'Scenario:'), save, load, reset, file, status));

    save.addEventListener('click', () => {
        const state = store.state;
        const blob = new Blob([JSON.stringify(scenarioFile(state), null, 2)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `lorcana-event-scenario-${state.source.queue}.json` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    load.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
        const chosen = file.files[0];
        file.value = '';
        if (!chosen) return;
        let scenario;
        try {
            scenario = parseScenario(await chosen.text(), eventDefaults);
        } catch (e) {
            status.textContent = `Couldn't load ${chosen.name}: ${e.message}.`;
            return;
        }
        const state = store.state;
        const src = scenario.source;
        if (src?.queue && (src.queue !== state.source.queue || src.range !== rangeOf(state.source.period))) {
            const ok = confirm(`This scenario was saved with ${src.queueName} over ${rangeLabel(src.range)}. ` +
                'Load that data now? (Cancel keeps the current data and applies the scenario to it.)');
            if (ok && !(await data.loadRange(src.queue, src.range))) return;
        }
        state.shares = sharesFromMap(state.data.archetypes, scenario.shares);
        state.overrides = scenario.overrides;
        state.threshold = scenario.threshold;
        state.event = scenario.event;
        state.you = scenario.you && archetypeById(state.data, scenario.you.base) ? scenario.you : null;
        state.results = null;
        const missing = scenario.you && !state.you ? ' Its deck copies an archetype this data doesn\'t have, so it was left out.' : '';
        status.textContent = `Loaded ${chosen.name}.${missing}`;
        store.emit('data', 'shares', 'matchups', 'you', 'event', 'results');
    });

    reset.addEventListener('click', () => {
        if (!confirm('Forget your meta shares, matchup changes, your deck and event settings, and reload duels.ink\'s data?')) return;
        clearSettings(window.localStorage);
        location.reload();
    });

    store.on('data', () => { save.disabled = load.disabled = false; });
}
