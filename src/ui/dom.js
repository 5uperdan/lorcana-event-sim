// Small DOM helpers shared by the page's sections.

// h('div', { class: 'row', onclick: fn }, child, 'text', ...)
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
        else if (key === 'class') el.className = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key in el && typeof value !== 'string') el[key] = value;
        else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

const INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel'];

// Two small ink-coloured dots for an archetype's pair.
export function inkChips(colors) {
    return h('span', { class: 'inks', 'aria-hidden': 'true' },
        colors.filter(c => INKS.includes(c)).map(c => h('span', { class: `ink ink-${c}`, title: c })));
}

export const fmtInt = n => n.toLocaleString('en-GB');

export function fmtDay(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function fmtDateTime(iso) {
    return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

// A slider and a number box kept in step, both in tenths of a percent.
// onChange(tenths) fires on every change; set(tenths) updates both without firing.
export function percentInput({ value, label, onChange }) {
    let current = value;
    const range = h('input', { type: 'range', min: 0, max: 1000, step: 1, value, 'aria-label': label });
    const box = h('input', {
        type: 'number', min: 0, max: 100, step: 0.1, value: (value / 10).toFixed(1),
        inputmode: 'decimal', 'aria-label': `${label} (%)`,
    });
    const set = t => {
        current = t;
        range.value = t;
        if (document.activeElement !== box) box.value = (t / 10).toFixed(1);
    };
    range.addEventListener('input', () => {
        current = Number(range.value);
        box.value = (current / 10).toFixed(1);
        onChange(current);
    });
    box.addEventListener('input', () => {
        const v = Number.parseFloat(box.value);
        if (!Number.isFinite(v)) return;
        current = Math.min(1000, Math.max(0, Math.round(v * 10)));
        range.value = current;
        onChange(current);
    });
    // Tidy what was typed (e.g. "12.34" or "120") once the box loses focus.
    box.addEventListener('change', () => { box.value = (current / 10).toFixed(1); });
    const el = h('span', { class: 'pct-input' }, range, box, h('span', { class: 'unit' }, '%'));
    return { el, set };
}
