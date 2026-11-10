// Turns a duels.ink /api/stats/meta response into archetype-level data for the
// simulator. Runs unchanged in the browser and in Node (tests, fixture capture).
//
// duels.ink clusters decks into profiles, several of which can share one archetype,
// and keys its matchup rows on profile ids (archetypeIdA/B are profile ids despite
// the names), so everything is regrouped by archetypeId here. The archetype id is
// the stable identity: names vary by profile and period ("Touch Paradise" is a
// whole archetype over two weeks but a profile inside Midrange over the season).
//
// Units: archetype matchups are counted per game, even in BO3 queues. Archetype
// totals (gamesPlayed, wins, here `matches` and `matchWins`) are per match in BO3
// queues. firstPlayerGames counts the games where A went first, and
// firstPlayerWins A's wins in them.

export function isBo3(queue) {
    return queue.gameMode === 'bo3' || /BO3/i.test(queue.name ?? '');
}

// The URL for one queue and period, through the proxy at `base`.
export function metaUrl(base, queue, period) {
    return `${base}/api/stats/meta?${new URLSearchParams({ queue, period, era: 'current' })}`;
}

// "amber-sapphire-cinderella-hades" with pair amber/sapphire -> "Cinderella Hades".
function slugHint(slug, colors) {
    if (!slug) return null;
    const prefix = colors.join('-') + '-';
    const rest = slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
    return rest.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || null;
}

function buildArchetypes(profiles) {
    const groups = new Map();
    for (const p of profiles) {
        const id = p.archetypeId ?? `profile:${p.id}`;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(p);
    }

    const archetypes = [...groups].map(([id, ps]) => {
        // Named after its most-played profile, as duels.ink's own list is.
        const main = ps.reduce((best, p) => (p.gamesPlayed > best.gamesPlayed ? p : best));
        const colors = [...main.colors];
        return {
            id,
            pair: main.name,
            colors,
            name: main.archetypeName || null,
            hint: slugHint(main.archetypeSlug, colors),
            decks: ps.reduce((s, p) => s + p.sampleCount, 0),
            matches: ps.reduce((s, p) => s + p.gamesPlayed, 0),
            matchWins: ps.reduce((s, p) => s + p.wins, 0),
            profileIds: ps.map(p => p.id),
        };
    });
    archetypes.sort((a, b) => b.matches - a.matches || (a.id < b.id ? -1 : 1));

    // Labels must be unique: unnamed archetypes and repeated names get the slug hint.
    const bases = archetypes.map(a => (a.name ? `${a.pair} ${a.name}` : a.pair));
    const counts = new Map();
    for (const b of bases) counts.set(b, (counts.get(b) ?? 0) + 1);
    archetypes.forEach((a, i) => {
        const needsHint = !a.name || counts.get(bases[i]) > 1;
        a.label = needsHint ? `${bases[i]} (${a.hint ?? `#${i + 1}`})` : bases[i];
    });
    return archetypes;
}

// Matchup rows regrouped by archetype pair, oriented so `a` comes before `b` in the
// archetype order. For a mirror (a === b) "A" is whoever went first, so
// aFirstGames = games and aWins = aFirstWins = the first player's wins.
function buildMatchups(rows, archetypes) {
    const archOfProfile = new Map();
    const order = new Map();
    archetypes.forEach((a, i) => {
        order.set(a.id, i);
        for (const pid of a.profileIds) archOfProfile.set(pid, a.id);
    });

    const pairs = new Map();
    const add = (a, b, games, aWins, aFirstGames, aFirstWins) => {
        const key = `${a}|${b}`;
        const m = pairs.get(key) ?? { a, b, games: 0, aWins: 0, aFirstGames: 0, aFirstWins: 0 };
        m.games += games;
        m.aWins += aWins;
        m.aFirstGames += aFirstGames;
        m.aFirstWins += aFirstWins;
        pairs.set(key, m);
    };

    for (const r of rows) {
        const x = archOfProfile.get(r.archetypeIdA);
        const y = archOfProfile.get(r.archetypeIdB);
        if (x === undefined || y === undefined) continue;   // a profile not in this response
        const { games, winsA, firstPlayerGames: fg, firstPlayerWins: fw } = r;
        // Games where B went first, and B's wins in them.
        const bFirstGames = games - fg;
        const bFirstWins = bFirstGames - (winsA - fw);

        if (x === y) {
            const firstWins = fw + bFirstWins;
            add(x, x, games, firstWins, games, firstWins);
        } else if (order.get(x) < order.get(y)) {
            add(x, y, games, winsA, fg, fw);
        } else {
            add(y, x, games, games - winsA, bFirstGames, bFirstWins);
        }
    }
    return [...pairs.values()].sort((m, n) =>
        order.get(m.a) - order.get(n.a) || order.get(m.b) - order.get(n.b));
}

// A matchup's results from one archetype's side: its win rate (0–1) on the play and
// on the draw, or null where there are no games. For a mirror only onPlay applies.
export function ratesFor(matchup, archetypeId) {
    const { a, b, games, aWins, aFirstGames, aFirstWins } = matchup;
    const ratio = (n, d) => (d > 0 ? n / d : null);
    if (a === b) return { games, onPlay: ratio(aFirstWins, games), onDraw: null };
    const aRates = {
        games,
        onPlay: ratio(aFirstWins, aFirstGames),
        onDraw: ratio(aWins - aFirstWins, games - aFirstGames),
    };
    if (archetypeId === a) return aRates;
    if (archetypeId !== b) throw new Error(`${archetypeId} isn't in this matchup`);
    // B on the play is A on the draw, and the other way round.
    return {
        games,
        onPlay: aRates.onDraw === null ? null : 1 - aRates.onDraw,
        onDraw: aRates.onPlay === null ? null : 1 - aRates.onPlay,
    };
}

// The time ranges the site offers for a queue: the full season, then the last N
// weeks for N = 1…W, each ending with the latest (possibly in-progress) week.
export function periodOptions(weeks, currentWeekStart) {
    const sorted = [...weeks].sort((w, v) => (w.start < v.start ? -1 : 1));
    const options = [{
        period: 'all_time',
        label: 'Full season',
        weeks: sorted.length,
        matches: sorted.reduce((s, w) => s + w.matches, 0),
    }];
    for (let n = 1; n <= sorted.length; n++) {
        const span = sorted.slice(-n);
        options.push({
            period: n === 1 ? `week:${span[0].start}` : `weeks:${span.map(w => w.start).join(',')}`,
            label: n === 1 ? 'Last week' : `Last ${n} weeks`,
            weeks: n,
            start: span[0].start,
            end: span[span.length - 1].end,
            inProgress: span[span.length - 1].start === currentWeekStart,
            matches: span.reduce((s, w) => s + w.matches, 0),
        });
    }
    return options;
}

export function parseMeta(raw) {
    const { meta, activity } = raw;
    const overrides = meta.queueOverrides ?? {};
    const archetypes = buildArchetypes(raw.profiles);
    return {
        queue: { id: meta.queue.id, name: meta.queue.name, gameMode: meta.queue.gameMode },
        period: meta.period,
        updatedAt: raw.updatedAt,
        queues: meta.queues.active
            .filter(q => q.statsEnabled !== false)
            .map(q => ({
                id: q.id,
                name: q.name,
                label: overrides[q.id]?.name ?? q.name,
                gameMode: q.gameMode,
                bo3: isBo3(q),
            })),
        weeks: (meta.availableWeeks ?? []).map(w => ({
            start: w.startDate, end: w.endDate, label: w.label, games: w.totalGames, matches: w.totalMatches,
        })),
        currentWeekStart: meta.currentWeek?.startDate ?? null,
        totals: { games: activity.totalGames, matches: activity.totalMatches },
        // Per game, as fractions: the queue-wide win rate going first and second.
        playDraw: { first: activity.playDrawStats.first / 100, second: activity.playDrawStats.second / 100 },
        archetypes,
        matchups: buildMatchups(raw.archetypeMatchups, archetypes),
    };
}
