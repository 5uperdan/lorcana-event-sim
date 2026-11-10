// Cloudflare Worker: CORS proxy for duels.ink's meta stats API, used by the event
// simulator. duels.ink sends no CORS headers, so a page on GitHub Pages can't call
// the API directly. This forwards GET /api/stats/meta with an allowlist of query
// parameters and re-serves the response with permissive CORS headers. Only that one
// path and those parameters get through, which keeps this from being an open proxy.
//
// Successful responses are kept in the Worker's own cache (the Cache API) for an
// hour, so duels.ink sees at most one request per queue and period per hour per
// Cloudflare data centre. X-Proxy-Cache says HIT, MISS or BYPASS (errors aren't
// cached). The body is streamed through untouched: parsing the ~3.4 MB JSON here
// could exceed the free plan's 10 ms CPU limit, so the browser does that.
//
// DEPLOYMENT IS CLICKOPS: this file is the source of truth, but it runs from a copy
// pasted into the Cloudflare dashboard editor (see README.md). If you edit this
// file, the change does nothing until it's re-pasted and deployed.

const UPSTREAM = 'https://duels.ink/api/stats/meta';
const CACHE_SECONDS = 3600;

// Exactly these parameters, all required, each checked against its pattern.
// period: all_time, week:YYYY-MM-DD, or weeks:YYYY-MM-DD,YYYY-MM-DD,... (up to 53 weeks).
const DATE = '\\d{4}-\\d{2}-\\d{2}';
const PARAMS = {
    queue: /^[a-z0-9-]{1,40}$/,
    period: new RegExp(`^(all_time|week:${DATE}|weeks:${DATE}(,${DATE}){0,52})$`),
    era: /^current$/,
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    // Lets the site read the cache status across origins.
    'Access-Control-Expose-Headers': 'X-Proxy-Cache',
};

// The allowed parameters, rebuilt in a fixed order so equivalent requests share
// one cache entry, or null if the request isn't allowed.
function canonicalQuery(requestUrl) {
    const url = new URL(requestUrl);
    if (url.pathname !== '/api/stats/meta') return null;

    const keys = [...url.searchParams.keys()];
    if (keys.length !== Object.keys(PARAMS).length) return null;
    const out = new URLSearchParams();
    for (const [name, pattern] of Object.entries(PARAMS)) {
        const values = url.searchParams.getAll(name);
        if (values.length !== 1 || !pattern.test(values[0])) return null;
        out.set(name, values[0]);
    }
    return out.toString();
}

// Returns the upstream URL for an allowed request, or null.
export function upstreamUrl(requestUrl) {
    const query = canonicalQuery(requestUrl);
    return query === null ? null : `${UPSTREAM}?${query}`;
}

function withProxyHeaders(response, cacheStatus) {
    return new Response(response.body, {
        status: response.status,
        headers: {
            'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
            'Cache-Control': 'public, max-age=300',
            'X-Proxy-Cache': cacheStatus,
            ...CORS_HEADERS,
        },
    });
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }
        const query = request.method === 'GET' ? canonicalQuery(request.url) : null;
        if (query === null) {
            return new Response('Not found', { status: 404, headers: CORS_HEADERS });
        }

        // Keyed on this Worker's own URL with the canonical query.
        const cache = globalThis.caches?.default;
        const cacheKey = new Request(`${new URL(request.url).origin}/api/stats/meta?${query}`);
        const cached = cache && await cache.match(cacheKey);
        if (cached) return withProxyHeaders(cached, 'HIT');

        const upstream = await fetch(`${UPSTREAM}?${query}`, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'lorcana-event-sim CORS proxy (github.com/5uperdan)',
            },
        });
        if (!upstream.ok || !cache) return withProxyHeaders(upstream, 'BYPASS');

        // Store a copy with our own lifetime; duels.ink marks its responses private.
        const fresh = new Response(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
                'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
            },
        });
        const stored = cache.put(cacheKey, fresh.clone());
        if (ctx?.waitUntil) ctx.waitUntil(stored);
        else await stored;
        return withProxyHeaders(fresh, 'MISS');
    },
};
