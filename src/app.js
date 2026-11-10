// Wires the page's sections to one shared state.
import { createStore } from './store.js';
import { DEFAULT_SOURCE } from './config.js';
import { initialShares } from './model.js';
import { initData } from './ui/data.js';
import { initShares } from './ui/shares.js';
import { initMatchups } from './ui/matchups.js';

const store = createStore({
    data: null,                       // parseMeta() output for the loaded queue and period
    source: { ...DEFAULT_SOURCE, imported: null, cache: null },
    shares: [],                       // tenths of a percent, in data.archetypes order
    dataShares: [],                   // duels.ink's own shares, for hints and reset
    overrides: {},                    // matchup overrides (section 3)
    threshold: 50,                    // fewer games than this: neutral estimate
    you: null,                        // your deck (section 4)
    event: { players: 64, rounds: 6, roundsAuto: true, sims: 10000, seed: '' },
    results: null,
});

function setData(data, source) {
    const s = store.state;
    s.data = data;
    Object.assign(s.source, source);
    s.dataShares = initialShares(data.archetypes);
    s.shares = [...s.dataShares];
    s.results = null;
    store.emit('data', 'shares', 'matchups', 'results');
}

const data = initData(store, { setData });
initShares(store);
initMatchups(store);

data.load(store.state.source.queue, store.state.source.period);

// For poking at the state from the browser console.
window.eventSim = store;
