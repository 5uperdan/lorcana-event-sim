// The Cloudflare Worker that proxies duels.ink's stats API (worker/README.md).
export const WORKER_BASE = 'https://duels-meta-proxy.5uperdan.workers.dev';

// What the page loads first, before anything is saved.
export const DEFAULT_SOURCE = { queue: 'core-bo3', period: 'all_time', bo3Only: true };
