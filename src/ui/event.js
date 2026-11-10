// Section 5: the event's size, how many times to simulate it, and running it in a
// Web Worker with progress and cancel.
import { simInput, shareTotal, TOTAL, archetypeById, yourLabel, YOU } from '../model.js';
import { fieldMatchWin } from '../match.js';
import { randomSeed } from '../rng.js';
import { h, fmtInt } from './dom.js';

const LIMITS = { players: [2, 4096], rounds: [1, 20], sims: [1, 1000000] };

export const swissRounds = players => Math.max(1, Math.ceil(Math.log2(Math.max(2, players))));

function numberField(label, key, value, hint) {
    const [min, max] = LIMITS[key];
    const input = h('input', { type: 'number', min, max, step: 1, value, class: 'narrow', inputmode: 'numeric' });
    return { input, el: h('label', {}, label, input, hint ?? null) };
}

export function initEvent(store) {
    const section = document.getElementById('event');
    const state = store.state;
    const players = numberField('Players', 'players', state.event.players);
    const roundsHint = h('span', { class: 'field-hint' });
    const rounds = numberField('Rounds', 'rounds', state.event.rounds, roundsHint);
    const sims = numberField('Simulations', 'sims', state.event.sims);
    const seed = h('input', { type: 'text', value: state.event.seed, placeholder: 'random', class: 'seed', 'aria-label': 'Seed' });
    const run = h('button', { type: 'button' }, 'Run simulation');
    const cancel = h('button', { type: 'button', class: 'secondary', hidden: true }, 'Cancel');
    const progress = h('progress', { max: 1, value: 0, hidden: true });
    const progressText = h('span', { class: 'muted' });
    const sizeNote = h('p', { class: 'hint' });
    const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });

    section.append(
        h('p', { class: 'hint' },
            'Each simulation is a whole event: round 1 paired at random, then Swiss, every match a best of 3. ',
            'The field is the same each time; only the pairings and the games vary.'),
        h('div', { class: 'controls' },
            players.el, rounds.el, sims.el,
            h('label', {}, 'Seed (optional)', seed),
            run, cancel),
        sizeNote,
        h('div', { class: 'progress-row' }, progress, progressText),
        status);

    let worker = null;

    const clamp = (key, v) => Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], Math.round(v)));

    function readInputs() {
        const ev = state.event;
        const p = Number(players.input.value);
        if (Number.isFinite(p) && p > 0) ev.players = clamp('players', p);
        if (ev.roundsAuto) ev.rounds = swissRounds(ev.players);
        const r = Number(rounds.input.value);
        if (!ev.roundsAuto && Number.isFinite(r) && r > 0) ev.rounds = clamp('rounds', r);
        const s = Number(sims.input.value);
        if (Number.isFinite(s) && s > 0) ev.sims = clamp('sims', s);
        ev.seed = seed.value.trim();
    }

    function blocker() {
        if (!state.data) return 'Waiting for data.';
        const total = shareTotal(state.shares);
        if (total !== TOTAL) return 'The meta shares must total 100.0% (section 2).';
        if (state.event.players < 2) return 'An event needs at least 2 players.';
        return null;
    }

    function render() {
        const ev = state.event;
        if (document.activeElement !== rounds.input) rounds.input.value = ev.rounds;
        const swiss = swissRounds(ev.players);
        roundsHint.replaceChildren(ev.roundsAuto ? `Swiss for ${ev.players}`
            : h('button', {
                type: 'button', class: 'link',
                onclick: () => { ev.roundsAuto = true; ev.rounds = swiss; render(); store.emit('event'); },
            }, `use ${swiss}`));
        const matches = ev.sims * ev.rounds * Math.floor(ev.players / 2);
        sizeNote.textContent = `${fmtInt(ev.sims)} events × ${ev.rounds} rounds × ${fmtInt(Math.floor(ev.players / 2))} matches = ` +
            `${fmtInt(matches)} matches${matches > 5e8 ? ' (this will take a while)' : ''}.`;
        const why = blocker();
        run.disabled = Boolean(why) || Boolean(worker);
        if (!worker) status.textContent = why ?? '';
        status.classList.toggle('error', false);
    }

    function finish() {
        worker?.terminate();
        worker = null;
        cancel.hidden = true;
        progress.hidden = true;
        progressText.textContent = '';
        for (const el of [players.input, rounds.input, sims.input, seed]) el.disabled = false;
        render();
    }

    run.addEventListener('click', () => {
        readInputs();
        if (blocker()) return render();
        const ev = state.event;
        const input = simInput(state);
        const usedSeed = ev.seed || randomSeed();
        const job = { ...input, sims: ev.sims, seed: usedSeed };
        const started = performance.now();

        worker = new Worker(new URL('../sim.worker.js', import.meta.url), { type: 'module' });
        for (const el of [players.input, rounds.input, sims.input, seed]) el.disabled = true;
        run.disabled = true;
        cancel.hidden = false;
        progress.hidden = false;
        progress.value = 0;
        progressText.textContent = 'Starting…';
        status.textContent = '';

        worker.onmessage = ({ data: msg }) => {
            if (msg.type === 'progress') {
                const frac = msg.done / ev.sims;
                progress.value = frac;
                const elapsed = (performance.now() - started) / 1000;
                const left = elapsed / frac - elapsed;
                progressText.textContent = `${fmtInt(msg.done)} of ${fmtInt(ev.sims)} events` +
                    (elapsed > 1 ? ` · about ${left < 60 ? `${Math.ceil(left)} s` : `${Math.ceil(left / 60)} min`} left` : '');
                return;
            }
            state.results = {
                ids: input.ids,
                labels: input.ids.map(id => (id === YOU ? yourLabel(state) : archetypeById(state.data, id).label)),
                colors: input.ids.map(id => archetypeById(state.data, id === YOU ? state.you.base : id).colors),
                shares: input.ids.map((id, i) => (id === YOU ? null : state.shares[i])),
                seats: input.seats,
                expected: input.ids.map((_, i) => fieldMatchWin(i, input.seats, input.onPlay)),
                rounds: input.rounds,
                sims: ev.sims,
                players: msg.players,
                seed: usedSeed,
                hist: msg.hist,
                rematches: msg.rematches,
                elapsed: msg.elapsed,
                source: { queue: state.data.queue.name, period: state.source.period, updatedAt: state.data.updatedAt },
                stale: false,
            };
            finish();
            status.textContent = `Done: ${fmtInt(ev.sims)} events in ${(msg.elapsed / 1000).toFixed(1)} s (seed ${usedSeed}).`;
            store.emit('results');
        };
        worker.onerror = e => {
            finish();
            status.textContent = `The simulation failed: ${e.message || 'unknown error'}.`;
            status.classList.add('error');
        };
        worker.postMessage(job);
    });

    cancel.addEventListener('click', () => {
        finish();
        status.textContent = 'Cancelled.';
    });

    players.input.addEventListener('input', () => { readInputs(); render(); store.emit('event'); });
    rounds.input.addEventListener('input', () => {
        if (rounds.input.value === '') return;
        state.event.roundsAuto = false;
        readInputs();
        render();
        store.emit('event');
    });
    sims.input.addEventListener('input', () => { readInputs(); render(); store.emit('event'); });
    seed.addEventListener('change', () => { readInputs(); store.emit('event'); });
    for (const input of [players.input, rounds.input, sims.input]) {
        input.addEventListener('change', () => {
            players.input.value = state.event.players;
            rounds.input.value = state.event.rounds;
            sims.input.value = state.event.sims;
        });
    }

    store.on('data', () => { section.hidden = false; render(); });
    store.on('shares', render);

    // Anything that changes the inputs makes an earlier result out of date.
    const markStale = () => {
        if (state.results && !state.results.stale) {
            state.results.stale = true;
            store.emit('results');
        }
    };
    for (const topic of ['shares', 'matchups', 'you', 'event']) store.on(topic, markStale);

    return { render };
}
