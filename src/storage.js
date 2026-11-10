// Settings kept between visits (in the browser's localStorage) and scenario files.
// Pure apart from the storage object passed in, so it's tested in Node.
//
// The time range is kept as "full season" or "last N weeks", not as dates, so it
// rolls forward as weeks pass. Meta shares are kept per queue and range, and only
// once you've changed them: until then each visit shows duels.ink's latest.

const KEY = 'lorcana-event-sim:v1';
const VERSION = 1;

// 'all_time', or the number of weeks in a duels.ink period string.
export function rangeOf(period) {
    if (period?.startsWith('week:')) return 1;
    if (period?.startsWith('weeks:')) return period.slice('weeks:'.length).split(',').length;
    return 'all_time';
}

export const sourceKey = (queue, range) => `${queue}|${range}`;

export function sharesMap(state) {
    return Object.fromEntries(state.data.archetypes.map((a, i) => [a.id, state.shares[i]]));
}

// Shares for these archetypes from a saved map; archetypes it doesn't have get 0.
export function sharesFromMap(archetypes, map) {
    return archetypes.map(a => clampTenths(map[a.id] ?? 0));
}

const clampTenths = v => (Number.isFinite(v) ? Math.min(1000, Math.max(0, Math.round(v))) : 0);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function cleanOverrides(raw) {
    const out = {};
    if (!isObject(raw)) return out;
    for (const [key, v] of Object.entries(raw)) {
        if (!isObject(v) || !Number.isFinite(v.onPlay)) continue;
        out[key] = Number.isFinite(v.onDraw)
            ? { onPlay: clampTenths(v.onPlay), onDraw: clampTenths(v.onDraw) }
            : { onPlay: clampTenths(v.onPlay) };
    }
    return out;
}

function cleanYou(raw) {
    if (!isObject(raw) || typeof raw.base !== 'string') return null;
    return { base: raw.base, name: typeof raw.name === 'string' ? raw.name : '', overrides: cleanOverrides(raw.overrides) };
}

function cleanEvent(raw, fallback) {
    const num = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
    if (!isObject(raw)) return { ...fallback };
    return {
        players: num(raw.players, 2, 4096, fallback.players),
        rounds: num(raw.rounds, 1, 20, fallback.rounds),
        roundsAuto: typeof raw.roundsAuto === 'boolean' ? raw.roundsAuto : fallback.roundsAuto,
        sims: num(raw.sims, 1, 1000000, fallback.sims),
        seed: typeof raw.seed === 'string' ? raw.seed.slice(0, 64) : '',
    };
}

// Everything worth keeping, merged into what was saved before (shares for other
// queues and ranges are kept).
export function settingsToSave(state, previous) {
    const shares = { ...(previous?.shares ?? {}) };
    let source = previous?.source ?? null;
    if (state.data && !state.source.imported) {
        const range = rangeOf(state.source.period);
        source = { queue: state.source.queue, range, bo3Only: state.source.bo3Only };
        const key = sourceKey(state.source.queue, range);
        const edited = state.shares.some((t, i) => t !== state.dataShares[i]);
        if (edited) shares[key] = sharesMap(state);
        else delete shares[key];
    }
    return {
        version: VERSION,
        source,
        shares,
        overrides: state.overrides,
        threshold: state.threshold,
        you: state.you,
        event: state.event,
    };
}

// The saved settings, cleaned, or null if there are none (or they're unreadable).
export function readSettings(storage, eventDefaults) {
    let raw;
    try {
        raw = JSON.parse(storage?.getItem(KEY) ?? 'null');
    } catch {
        return null;
    }
    if (!isObject(raw) || raw.version !== VERSION) return null;
    const source = isObject(raw.source) && typeof raw.source.queue === 'string'
        ? {
            queue: raw.source.queue,
            range: raw.source.range === 'all_time' || !Number.isInteger(raw.source.range) || raw.source.range < 1
                ? 'all_time' : raw.source.range,
            bo3Only: raw.source.bo3Only !== false,
        }
        : null;
    const shares = {};
    if (isObject(raw.shares)) {
        for (const [key, map] of Object.entries(raw.shares)) if (isObject(map)) shares[key] = map;
    }
    return {
        source,
        shares,
        overrides: cleanOverrides(raw.overrides),
        threshold: Number.isFinite(raw.threshold) ? Math.max(0, Math.round(raw.threshold)) : 50,
        you: cleanYou(raw.you),
        event: cleanEvent(raw.event, eventDefaults),
    };
}

export function writeSettings(storage, settings) {
    try {
        storage?.setItem(KEY, JSON.stringify(settings));
        return true;
    } catch {
        return false;   // private browsing, storage full or blocked: the page still works
    }
}

export function clearSettings(storage) {
    try { storage?.removeItem(KEY); } catch { /* nothing to clear */ }
}

// ---- Scenario files ----

export function scenarioFile(state) {
    return {
        app: 'lorcana-event-sim',
        version: VERSION,
        exportedAt: new Date().toISOString(),
        source: {
            queue: state.source.queue,
            queueName: state.data.queue.name,
            range: rangeOf(state.source.period),
            period: state.source.period,
            duelsUpdatedAt: state.data.updatedAt,
        },
        shares: sharesMap(state),
        overrides: state.overrides,
        threshold: state.threshold,
        you: state.you,
        event: state.event,
    };
}

export function parseScenario(text, eventDefaults) {
    const raw = JSON.parse(text);
    if (!isObject(raw) || raw.app !== 'lorcana-event-sim') throw new Error('not a scenario saved by this page');
    if (raw.version !== VERSION) throw new Error(`scenario version ${raw.version} isn't supported`);
    if (!isObject(raw.shares)) throw new Error('it has no meta shares');
    return {
        source: isObject(raw.source) ? {
            queue: String(raw.source.queue ?? ''),
            queueName: String(raw.source.queueName ?? raw.source.queue ?? ''),
            range: rangeOf(raw.source.period),
        } : null,
        shares: raw.shares,
        overrides: cleanOverrides(raw.overrides),
        threshold: Number.isFinite(raw.threshold) ? Math.max(0, Math.round(raw.threshold)) : 50,
        you: cleanYou(raw.you),
        event: cleanEvent(raw.event, eventDefaults),
    };
}
