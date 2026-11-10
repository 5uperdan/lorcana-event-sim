// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { upstreamUrl } from '../worker/worker.js';

const BASE = 'https://duels-meta-proxy.example.workers.dev/api/stats/meta';
const UPSTREAM = 'https://duels.ink/api/stats/meta';

test('allowed periods pass, with parameters in a fixed order', () => {
    for (const period of ['all_time', 'week:2026-11-08', 'weeks:2026-11-01,2026-11-08']) {
        const q = new URLSearchParams({ era: 'current', period, queue: 'core-bo3' });
        const expected = new URLSearchParams({ queue: 'core-bo3', period, era: 'current' });
        assert.equal(upstreamUrl(`${BASE}?${q}`), `${UPSTREAM}?${expected}`);
    }
});

test('anything else is refused', () => {
    const bad = [
        'https://x.workers.dev/api/stats/other?queue=core-bo3&period=all_time&era=current',
        'https://x.workers.dev/api/match-history?queue=core-bo3&period=all_time&era=current',
        `${BASE}?queue=core-bo3&period=all_time`,                          // missing era
        `${BASE}?queue=core-bo3&period=all_time&era=current&rank=iconic`,  // extra parameter
        `${BASE}?queue=core-bo3&queue=core-bo1&period=all_time&era=current`, // repeated
        `${BASE}?queue=Core_BO3&period=all_time&era=current`,
        `${BASE}?queue=core-bo3&period=week:2026-11&era=current`,
        `${BASE}?queue=core-bo3&period=weeks:2026-11-01;2026-11-08&era=current`,
        `${BASE}?queue=core-bo3&period=all_time&era=past`,
    ];
    for (const url of bad) assert.equal(upstreamUrl(url), null, url);
});

test('OPTIONS gets the CORS headers', async () => {
    const res = await worker.fetch(new Request(BASE, { method: 'OPTIONS' }));
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('refused requests get a 404 and never reach duels.ink', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail('upstream was called');
    try {
        const post = await worker.fetch(new Request(`${BASE}?queue=core-bo3&period=all_time&era=current`, { method: 'POST' }));
        assert.equal(post.status, 404);
        const other = await worker.fetch(new Request('https://x.workers.dev/api/admin'));
        assert.equal(other.status, 404);
    } finally {
        globalThis.fetch = realFetch;
    }
});

// Stand-ins for Cloudflare's fetch and Cache API, restored after each test.
async function withFakes({ upstreamStatus = 200, cache = true }, body) {
    const real = { fetch: globalThis.fetch, caches: globalThis.caches };
    const calls = [];
    const store = new Map();
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return new Response('{"ok":true}', {
            status: upstreamStatus,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' },
        });
    };
    globalThis.caches = cache ? {
        default: {
            match: async req => store.get(req.url)?.clone(),
            put: async (req, res) => { store.set(req.url, res); },
        },
    } : undefined;
    try {
        await body({ calls, store });
    } finally {
        globalThis.fetch = real.fetch;
        globalThis.caches = real.caches;
    }
}

test('a first request is fetched and cached, a repeat is served from the cache', () =>
    withFakes({}, async ({ calls, store }) => {
        // Parameter order differs between the two requests; both share one cache entry.
        const first = await worker.fetch(new Request(`${BASE}?queue=core-bo3&period=all_time&era=current`));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, `${UPSTREAM}?queue=core-bo3&period=all_time&era=current`);
        assert.equal(first.status, 200);
        assert.equal(first.headers.get('Access-Control-Allow-Origin'), '*');
        assert.equal(first.headers.get('X-Proxy-Cache'), 'MISS');
        assert.equal(first.headers.get('Access-Control-Expose-Headers'), 'X-Proxy-Cache');
        assert.deepEqual(await first.json(), { ok: true });
        assert.equal([...store.values()][0].headers.get('Cache-Control'), 'public, max-age=3600');

        const repeat = await worker.fetch(new Request(`${BASE}?era=current&period=all_time&queue=core-bo3`));
        assert.equal(calls.length, 1, 'upstream not called again');
        assert.equal(repeat.headers.get('X-Proxy-Cache'), 'HIT');
        assert.equal(repeat.headers.get('Access-Control-Allow-Origin'), '*');
        assert.deepEqual(await repeat.json(), { ok: true });
    }));

test('upstream errors pass through and are never cached', () =>
    withFakes({ upstreamStatus: 403 }, async ({ calls, store }) => {
        const res = await worker.fetch(new Request(`${BASE}?queue=core-bo3&period=all_time&era=current`));
        assert.equal(res.status, 403);
        assert.equal(res.headers.get('X-Proxy-Cache'), 'BYPASS');
        assert.equal(store.size, 0);
        await worker.fetch(new Request(`${BASE}?queue=core-bo3&period=all_time&era=current`));
        assert.equal(calls.length, 2);
    }));

test('without a Cache API the proxy still works', () =>
    withFakes({ cache: false }, async () => {
        const res = await worker.fetch(new Request(`${BASE}?queue=core-bo3&period=all_time&era=current`));
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('X-Proxy-Cache'), 'BYPASS');
    }));
