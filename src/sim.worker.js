// Runs the simulation off the page's main thread, reporting progress as it goes.
// The page cancels a run by terminating the worker.
import { simulate } from './sim.js';
import { createRng } from './rng.js';

self.onmessage = ({ data }) => {
    const { seats, onPlay, rounds, sims, seed } = data;
    const started = performance.now();
    let lastReport = 0;
    const result = simulate({ seats, onPlay, rounds, sims }, createRng(seed), done => {
        const now = performance.now();
        if (now - lastReport > 100) {
            lastReport = now;
            self.postMessage({ type: 'progress', done });
        }
    });
    self.postMessage({ type: 'done', ...result, elapsed: performance.now() - started }, [result.hist.buffer]);
};
