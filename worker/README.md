# duels-meta-proxy

A Cloudflare Worker that proxies duels.ink's meta stats API (`/api/stats/meta`) for the event simulator.
duels.ink sends no CORS headers, so the site on GitHub Pages can't call the API directly.

What it does:
- forwards only `GET /api/stats/meta` with exactly `queue`, `period` and `era=current`, and refuses everything
  else with a 404
- adds the CORS headers
- keeps successful responses in its own cache (Cloudflare's Cache API) for an hour

The deployed Worker is at https://duels-meta-proxy.5uperdan.workers.dev/ (set up 2026-11-10).

**Deployed through the Cloudflare dashboard (clickops), not wrangler.** `worker.js` in this directory is the source
of truth; the running copy lives in the dashboard editor.

## First-time setup
1. Log in at https://dash.cloudflare.com.
2. Go to **Compute (Workers)**, then **Create** → **Create Worker** (start from "Hello World").
3. Name it `duels-meta-proxy` and click **Deploy**. This publishes the Hello World placeholder.
4. Click **Edit code**, replace the editor contents with `worker.js` from this directory, and click **Deploy**.
5. Note the Worker's URL: `https://duels-meta-proxy.<your-subdomain>.workers.dev`.

## Checking it works
Run this twice. Copy it exactly: anything after the closing quote, even a stray `~`, ends up in the URL and gets
a 404.

```bash
curl -s -D - -o /dev/null "https://duels-meta-proxy.5uperdan.workers.dev/api/stats/meta?queue=core-bo3&period=all_time&era=current"
```

Expect:
- `HTTP/2 200`
- `content-type: application/json`
- `access-control-allow-origin: *`
- `x-proxy-cache`: `MISS` the first time and `HIT` the second (within the hour, from the same place)

`x-proxy-cache` can also say `BYPASS`: an error from duels.ink, which is passed through but not cached.

If it isn't working:
- **`404` with the CORS headers:** the Worker refused the request, so check the URL. A `404` without them means the
  Worker isn't deployed at that address.
- **`403` or an HTML page:** Cloudflare's bot protection on duels.ink challenged the Worker. The fallback is a
  scheduled GitHub Action that fetches snapshots instead (PLAN.md, section 2).
- **`x-proxy-cache` always says `MISS`:** the Cache API isn't storing anything on the `workers.dev` domain. The
  proxy still works, but every request reaches duels.ink. A custom domain route would fix that.

The site reads the Worker's URL from `src/config.js`. Update it there if the Worker is renamed or moved to another
account.

## Updating
1. Open the `duels-meta-proxy` Worker in **Compute (Workers)** and click **Edit code**.
2. Replace the editor contents with `worker.js`.
3. Click **Deploy**.

## Limits (free plan)
- **Requests:** 100k a day.
- **CPU:** 10 ms per request. The Worker passes the body through without parsing it, so it stays well under.
- **Load on duels.ink:** with the hour-long cache, at most one request per queue and period per hour in each
  Cloudflare data centre. The cache is local to each data centre, not global.
- **Size:** a full-season response is about 3.4 MB of JSON, about 510 KB over the wire (brotli), and takes about
  0.2 s (measured 2026-11-10).
