// Section 1: choosing the queue and time range, loading from duels.ink through the
// Worker, or importing a saved /api/stats/meta response.
import { WORKER_BASE } from '../config.js';
import { parseMeta, periodOptions, metaUrl } from '../duels.js';
import { h, fmtInt, fmtDay, fmtDateTime } from './dom.js';

function periodLabel(o) {
    if (o.period === 'all_time') return `${o.label} · ${fmtInt(o.matches)} matches`;
    const dates = `${fmtDay(o.start)} – ${fmtDay(o.end)}${o.inProgress ? ' (in progress)' : ''}`;
    return `${o.label} · ${dates} · ${fmtInt(o.matches)} matches`;
}

export function initData(store, { setData }) {
    const queueSel = document.getElementById('queue');
    const bo3Only = document.getElementById('bo3-only');
    const periodSel = document.getElementById('period');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const status = document.getElementById('data-status');
    let controller = null;

    const setStatus = (text, error = false) => {
        status.textContent = text;
        status.classList.toggle('error', error);
    };

    async function load(queue, period) {
        controller?.abort();
        controller = new AbortController();
        setStatus('Loading from duels.ink…');
        queueSel.disabled = periodSel.disabled = true;
        try {
            const res = await fetch(metaUrl(WORKER_BASE, queue, period), { signal: controller.signal });
            if (!res.ok) throw new Error(`the proxy answered ${res.status}`);
            const data = parseMeta(await res.json());
            setData(data, { queue, period, imported: null, cache: res.headers.get('X-Proxy-Cache') });
        } catch (e) {
            if (e.name === 'AbortError') return;
            setStatus(`Couldn't load the data: ${e.message}. Try again, or import a saved response.`, true);
        } finally {
            queueSel.disabled = periodSel.disabled = false;
        }
    }

    function renderControls(state) {
        const { data, source } = state;
        const queues = data.queues.filter(q => !source.bo3Only || q.bo3 || q.id === source.queue);
        queueSel.replaceChildren(...queues.map(q => h('option', { value: q.id }, q.label)));
        queueSel.value = source.queue;

        const options = periodOptions(data.weeks, data.currentWeekStart).map(o =>
            h('option', { value: o.period }, periodLabel(o)));
        if (source.imported) options.unshift(h('option', { value: '' }, `Imported: ${source.imported}`));
        periodSel.replaceChildren(...options);
        periodSel.value = source.imported ? '' : source.period;
    }

    function renderStatus(state) {
        const { data, source } = state;
        const perSide = data.queue.gameMode === 'bo3' ? data.totals.matches : data.totals.games;
        const covered = data.archetypes.reduce((s, a) => s + a.matches, 0);
        const parts = [
            data.queue.name,
            `${data.archetypes.length} archetypes, covering ${Math.round(100 * covered / (2 * perSide))}% of decks`,
            `duels.ink updated ${fmtDateTime(data.updatedAt)}`,
        ];
        if (source.cache === 'HIT') parts.push('served from the proxy cache');
        if (source.imported) parts.push(`imported from ${source.imported}`);
        setStatus(parts.join(' · '));
    }

    store.on('data', state => {
        renderControls(state);
        renderStatus(state);
    });

    queueSel.addEventListener('change', () => load(queueSel.value, 'all_time'));
    periodSel.addEventListener('change', () => {
        if (periodSel.value) load(store.state.source.queue, periodSel.value);
    });
    bo3Only.addEventListener('change', () => {
        store.state.source.bo3Only = bo3Only.checked;
        if (store.state.data) renderControls(store.state);
    });

    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async () => {
        const file = importFile.files[0];
        importFile.value = '';
        if (!file) return;
        try {
            const data = parseMeta(JSON.parse(await file.text()));
            setData(data, { queue: data.queue.id, period: data.period, imported: file.name, cache: null });
        } catch (e) {
            setStatus(`Couldn't read ${file.name} as a duels.ink /api/stats/meta response (${e.message}).`, true);
        }
    });

    return {
        load,
        setBo3Only(on) { bo3Only.checked = on; },
    };
}
