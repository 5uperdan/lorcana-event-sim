import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMeta } from '../src/duels.js';
import { initialShares } from '../src/model.js';
import {
    rangeOf, settingsToSave, readSettings, writeSettings, clearSettings, sharesFromMap, sourceKey,
    scenarioFile, parseScenario,
} from '../src/storage.js';

const twoWeeks = parseMeta(JSON.parse(readFileSync(new URL('fixtures/core-bo3-2w.json', import.meta.url))));
const DEFAULTS = { players: 64, rounds: 6, roundsAuto: true, sims: 10000, seed: '' };

function memoryStorage() {
    const m = new Map();
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

function stateFor(period = 'weeks:2026-11-01,2026-11-08') {
    const shares = initialShares(twoWeeks.archetypes);
    return {
        data: twoWeeks,
        source: { queue: 'core-bo3', period, bo3Only: true, imported: null },
        shares: [...shares],
        dataShares: shares,
        overrides: {},
        threshold: 50,
        you: null,
        event: { ...DEFAULTS },
    };
}

test('time ranges are kept as full season or a number of weeks', () => {
    assert.equal(rangeOf('all_time'), 'all_time');
    assert.equal(rangeOf('season:01a11da9'), 'all_time');
    assert.equal(rangeOf('week:2026-11-08'), 1);
    assert.equal(rangeOf('weeks:2026-10-25,2026-11-01,2026-11-08'), 3);
});

test('meta shares are saved only once you change them', () => {
    const state = stateFor();
    const key = sourceKey('core-bo3', 2);
    let saved = settingsToSave(state, null);
    assert.deepEqual(saved.source, { queue: 'core-bo3', range: 2, bo3Only: true });
    assert.equal(saved.shares[key], undefined);

    state.shares[0] += 5;
    state.shares[1] -= 5;
    saved = settingsToSave(state, saved);
    assert.equal(saved.shares[key][twoWeeks.archetypes[0].id], state.dataShares[0] + 5);
    assert.deepEqual(sharesFromMap(twoWeeks.archetypes, saved.shares[key]), state.shares);

    // Back to duels.ink's values: forgotten again. Other queues' shares are kept.
    saved.shares['infinity-bo3|all_time'] = { x: 1 };
    state.shares = [...state.dataShares];
    saved = settingsToSave(state, saved);
    assert.equal(saved.shares[key], undefined);
    assert.deepEqual(saved.shares['infinity-bo3|all_time'], { x: 1 });
});

test('settings survive a round trip, and bad values are cleaned', () => {
    const storage = memoryStorage();
    const state = stateFor('all_time');
    state.overrides = { 'a|b': { onPlay: 612, onDraw: 480 }, 'c|c': { onPlay: 530 } };
    state.you = { base: twoWeeks.archetypes[2].id, name: 'Mine', overrides: { z: { onPlay: 700, onDraw: 600 } } };
    state.event = { players: 33, rounds: 5, roundsAuto: false, sims: 2500, seed: 'abc' };
    writeSettings(storage, settingsToSave(state, null));
    const back = readSettings(storage, DEFAULTS);
    assert.deepEqual(back.source, { queue: 'core-bo3', range: 'all_time', bo3Only: true });
    assert.deepEqual(back.overrides, state.overrides);
    assert.deepEqual(back.you, state.you);
    assert.deepEqual(back.event, state.event);

    storage.setItem('lorcana-event-sim:v1', JSON.stringify({
        version: 1,
        source: { queue: 'core-bo3', range: -3 },
        overrides: { good: { onPlay: 1200, onDraw: -4 }, bad: { onPlay: 'x' }, worse: null },
        you: { name: 'no base' },
        event: { players: 99999, rounds: 0, sims: 'lots' },
    }));
    const cleaned = readSettings(storage, DEFAULTS);
    assert.equal(cleaned.source.range, 'all_time');
    assert.deepEqual(cleaned.overrides, { good: { onPlay: 1000, onDraw: 0 } });
    assert.equal(cleaned.you, null);
    assert.deepEqual(cleaned.event, { players: 4096, rounds: 1, roundsAuto: true, sims: 10000, seed: '' });

    storage.setItem('lorcana-event-sim:v1', '{not json');
    assert.equal(readSettings(storage, DEFAULTS), null);
    clearSettings(storage);
    assert.equal(readSettings(storage, DEFAULTS), null);
    assert.equal(readSettings(null, DEFAULTS), null);
});

test('a saved scenario loads back the same setup', () => {
    const state = stateFor();
    state.shares[0] = 0;
    state.overrides = { 'a|b': { onPlay: 612, onDraw: 480 } };
    state.you = { base: twoWeeks.archetypes[1].id, name: '', overrides: {} };
    const text = JSON.stringify(scenarioFile(state));
    const back = parseScenario(text, DEFAULTS);
    assert.deepEqual(back.source, { queue: 'core-bo3', queueName: 'Core Set 14 BO3', range: 2 });
    assert.deepEqual(sharesFromMap(twoWeeks.archetypes, back.shares), state.shares);
    assert.deepEqual(back.overrides, state.overrides);
    assert.deepEqual(back.you, state.you);

    assert.throws(() => parseScenario('{"app":"something else"}', DEFAULTS), /not a scenario/);
    assert.throws(() => parseScenario('{"app":"lorcana-event-sim","version":2}', DEFAULTS), /version 2/);
    assert.throws(() => parseScenario('nope', DEFAULTS));
});
