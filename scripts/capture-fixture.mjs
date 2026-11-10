// Saves a duels.ink /api/stats/meta response, fetched through the Worker, as a test
// fixture. Keeps only the fields src/duels.js reads, which takes a full-season
// response from ~3.4 MB to a few hundred KB.
//
// Usage: node scripts/capture-fixture.mjs <queue> <period> <out.json>
//   e.g. node scripts/capture-fixture.mjs core-bo3 all_time tests/fixtures/core-bo3-season.json
import { writeFileSync } from 'node:fs';

const WORKER = 'https://duels-meta-proxy.5uperdan.workers.dev';
const [queue, period, out] = process.argv.slice(2);
if (!out) {
    console.error('usage: node scripts/capture-fixture.mjs <queue> <period> <out.json>');
    process.exit(1);
}

const url = `${WORKER}/api/stats/meta?${new URLSearchParams({ queue, period, era: 'current' })}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${res.status} from ${url}`);
const raw = await res.json();

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
const { meta, activity } = raw;
const trimmed = {
    meta: {
        ...pick(meta, ['queueId', 'period', 'availableWeeks', 'currentWeek', 'appliedWeeks', 'queueOverrides']),
        queue: pick(meta.queue, ['id', 'name', 'gameMode']),
        queues: { active: meta.queues.active.map(q => pick(q, ['id', 'name', 'gameMode', 'statsEnabled'])) },
    },
    activity: pick(activity, ['totalGames', 'totalMatches', 'playDrawStats', 'matchPlayDrawStats']),
    profiles: raw.profiles.map(p => pick(p, [
        'id', 'name', 'colors', 'sampleCount', 'gamesPlayed', 'wins',
        'archetypeId', 'archetypeName', 'archetypeSlug',
    ])),
    archetypeMatchups: raw.archetypeMatchups,
    updatedAt: raw.updatedAt,
};

writeFileSync(out, JSON.stringify(trimmed) + '\n');
console.log(`${out}: ${raw.profiles.length} profiles, ${raw.archetypeMatchups.length} matchup rows, ` +
    `duels.ink updated ${raw.updatedAt}, proxy cache ${res.headers.get('x-proxy-cache')}`);
