// The page's state and a tiny publish/subscribe, so each section redraws only when
// something it shows changes. Topics: data, shares, matchups, you, event, results.

export function createStore(state) {
    const subscribers = new Map();
    return {
        state,
        on(topic, fn) {
            if (!subscribers.has(topic)) subscribers.set(topic, new Set());
            subscribers.get(topic).add(fn);
        },
        emit(...topics) {
            for (const topic of topics) {
                for (const fn of subscribers.get(topic) ?? []) fn(state);
            }
        },
    };
}
