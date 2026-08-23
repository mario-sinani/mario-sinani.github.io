/* A canvas context that records the calls of a drawing, so a test can
   compare two versions of the code. */

const NUMBER = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

export function recordingContext(width = 1000, height = 560) {
  const calls = [];
  const gradient = { addColorStop(...a) { calls.push('grad.addColorStop ' + a.map(NUMBER).join(',')); } };
  const target = {
    canvas: { width, height },
    measureText: (text) => ({ width: String(text).length * 6 }),
    createLinearGradient: (...a) => { calls.push('createLinearGradient ' + a.map(NUMBER).join(',')); return gradient; },
    createRadialGradient: (...a) => { calls.push('createRadialGradient ' + a.map(NUMBER).join(',')); return gradient; },
    getLineDash: () => [],
  };
  const handler = {
    get(_t, key) {
      if (key in target) return target[key];
      if (typeof key !== 'string') return undefined;
      return (...args) => { calls.push(key + ' ' + args.map(NUMBER).join(',')); };
    },
    set(_t, key, value) {
      calls.push('set ' + String(key) + '=' + NUMBER(value));
      return true;
    },
  };
  return { ctx: new Proxy(target, handler), calls };
}

/* The palette of the light theme, as ink.js gives it. */
export const INK = {
  dark: false,
  ground: '#f3f5f6',
  line: 'rgba(15, 25, 38, 0.3)',
  accent: 'rgba(0, 0, 205, 0.7)',
  body: 'rgba(0, 0, 205, 0.55)',
  wash: 'rgba(84, 92, 190, 0.6)',
  faint: 'rgba(15, 25, 38, 0.14)',
};

/* A generator with a seed, in place of Math.random. A field that starts
   its tracers at random then draws the same picture in each run. */
export function seedRandom(seed = 12345) {
  let state = seed;
  Math.random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
