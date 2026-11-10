// A seeded random number generator (xoshiro128**), so a run can be repeated exactly
// from its seed. The seed string is hashed into the generator's state with cyrb128.

function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
        const k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const TWO_32 = 2 ** 32;

export function createRng(seed) {
    let [a, b, c, d] = cyrb128(String(seed));
    if ((a | b | c | d) === 0) a = 1;

    function next() {
        const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
        const t = b << 9;
        c ^= a;
        d ^= b;
        b ^= c;
        a ^= d;
        c ^= t;
        d = rotl(d, 11);
        return result;
    }

    // A uniform integer in [0, n), with no modulo bias.
    function int(n) {
        const limit = TWO_32 - (TWO_32 % n);
        let x;
        do x = next(); while (x >= limit);
        return x % n;
    }

    return {
        next,
        int,
        roll1000: () => 1 + int(1000),
        coin: () => next() >>> 31,
    };
}

function rotl(x, k) {
    return (x << k) | (x >>> (32 - k));
}

// A short random seed for a run that wasn't given one.
export function randomSeed() {
    const words = new Uint32Array(2);
    crypto.getRandomValues(words);
    return [...words].map(w => w.toString(36)).join('').slice(0, 10);
}
