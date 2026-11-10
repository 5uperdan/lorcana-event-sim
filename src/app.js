// Wires the page's sections to one shared state, and keeps the settings between visits.
import { createStore } from './store.js';
import { DEFAULT_SOURCE } from './config.js';
import { initialShares } from './model.js';
import { readSettings, writeSettings, settingsToSave, sharesFromMap, sourceKey, rangeOf } from './storage.js';
import { initData } from './ui/data.js';
import { initShares } from './ui/shares.js';
import { initMatchups } from './ui/matchups.js';
import { initYou } from './ui/you.js';
import { initEvent } from './ui/event.js';
import { initResults } from './ui/results.js';
import { initScenario } from './ui/scenario.js';

const EVENT_DEFAULTS = { players: 64, rounds: 6, roundsAuto: true, sims: 10000, seed: '' };

let storage = null;
try { storage = window.localStorage; } catch { /* blocked: nothing is kept */ }
const saved = readSettings(storage, EVENT_DEFAULTS);

const store = createStore({
    data: null,                       // parseMeta() output for the loaded queue and period
    source: {
        ...DEFAULT_SOURCE,
        ...(saved?.source && { queue: saved.source.queue, bo3Only: saved.source.bo3Only }),
        imported: null,
        cache: null,
    },
    shares: [],                       // tenths of a percent, in data.archetypes order
    dataShares: [],                   // duels.ink's own shares, for hints and reset
    overrides: saved?.overrides ?? {},        // matchup overrides (section 3)
    threshold: saved?.threshold ?? 50,        // fewer games than this: neutral estimate
    you: saved?.you ?? null,                  // your deck (section 4)
    event: saved?.event ?? { ...EVENT_DEFAULTS },
    results: null,
});

let lastSaved = saved;

function setData(data, source) {
    const s = store.state;
    s.data = data;
    Object.assign(s.source, source);
    s.dataShares = initialShares(data.archetypes);
    // Your own meta shares for this queue and range, if you changed them before.
    const mine = !s.source.imported && lastSaved?.shares[sourceKey(s.source.queue, rangeOf(s.source.period))];
    s.shares = mine ? sharesFromMap(data.archetypes, mine) : [...s.dataShares];
    s.results = null;
    store.emit('data', 'shares', 'matchups', 'results');
}

const data = initData(store, { setData });
initShares(store);
initMatchups(store);
initYou(store);
initEvent(store);
initResults(store);
initScenario(store, { data, eventDefaults: EVENT_DEFAULTS });

// Save shortly after each change.
let saveTimer = null;
const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        lastSaved = settingsToSave(store.state, lastSaved);
        writeSettings(storage, lastSaved);
    }, 300);
};
for (const topic of ['data', 'shares', 'matchups', 'you', 'event']) store.on(topic, save);

data.loadRange(store.state.source.queue, saved?.source?.range ?? DEFAULT_SOURCE.period);

// For poking at the state from the browser console.
window.eventSim = store;
