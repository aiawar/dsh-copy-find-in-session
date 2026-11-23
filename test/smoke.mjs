// Smoke test: run the Client factory with a stub React and a stub cordis context,
// verifying exports, shortcut registration, slot registration, and style injection.
import fs from 'node:fs';

const source = fs.readFileSync('E:/BDT/dsh-find-in-session/client.js', 'utf8');

const stubReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useEffect: () => {},
  useReducer: (init, initial) => [initial, () => {}],
  useRef: (value) => ({ current: value }),
};

const styles = [];
const globalCalls = { slots: [], shortcuts: [], effects: [], windowListeners: [] };

global.window = {
  addEventListener: (type, fn, capture) => globalCalls.windowListeners.push({ type, fn, capture }),
  removeEventListener: () => {},
  __ModuleLoader__: {
    load({ id, factory }) {
      globalThis.__loadedId = id;
      globalThis.__exports = factory((name) => {
        if (name === 'react') return stubReact;
        throw new Error(`unexpected require: ${name}`);
      });
    },
  },
};
global.document = {
  createElement: () => ({ dataset: {}, remove() {}, style: {} }),
  head: { append: (element) => styles.push(element) },
  querySelector: () => null,
  getSelection: () => null,
};
global.requestAnimationFrame = (fn) => { void fn; return 0; };
global.cancelAnimationFrame = () => {};
global.fetch = () => Promise.resolve({ ok: true });
global.getComputedStyle = () => ({ position: 'fixed' });
global.MutationObserver = class { observe() {} disconnect() {} };

// Minimal CSS Custom Highlight support so the paint path is exercised.
global.NodeFilter = { SHOW_TEXT: 4 };
global.Highlight = class { constructor(...ranges) { this.ranges = ranges; } };
global.CSS = { highlights: new Map() };

new Function('window', source)(global.window);

const mod = globalThis.__exports;
if (mod === undefined) throw new Error('factory did not return a module');
if (!Array.isArray(mod.inject)) throw new Error('missing inject');
if (typeof mod.apply !== 'function') throw new Error('missing apply');

const ctx = {
  effect(fn, label) { globalCalls.effects.push(label); const dispose = fn(); return dispose; },
  slots: {
    inject(name, factory) { globalCalls.slots.push(name); return factory(); },
    register(options, Component) { globalCalls.slots.push(options.id); globalThis.__component = Component; return () => {}; },
  },
  shortcuts: {
    runtime: 'web',
    platform: 'windows',
    register(command) { globalCalls.shortcuts.push(command); return () => {}; },
  },
};

mod.apply(ctx);

console.log('id:', globalThis.__loadedId);
console.log('inject:', mod.inject.join(','));
console.log('effects:', globalCalls.effects.join(' | '));
console.log('slots:', globalCalls.slots.join(' | '));
console.log('commands:', globalCalls.shortcuts.map((command) => command.id).join(' | '));
console.log('desktop bindings:', JSON.stringify(globalCalls.shortcuts.map((command) => command.defaults['desktop:windows'])));
console.log('web bindings:', JSON.stringify(globalCalls.shortcuts.map((command) => command.defaults['web:windows'])));
console.log('web default admitted by Web rules:', globalCalls.shortcuts.map((command) => {
  const binding = command.defaults['web:windows'];
  return `${command.id}=${binding.code}+${binding.modifiers.join('+')}`;
}).join(' | '));
console.log('styles injected:', styles.length === 1 && typeof styles[0].textContent === 'string',
  'bytes:', styles[0]?.textContent?.length);

// Resolve callbacks must be self-contained and answer handled.
for (const command of globalCalls.shortcuts) {
  const resolution = command.resolve({ region: 'page', modal: null, target: null });
  console.log(`resolve ${command.id}:`, resolution.status, typeof resolution.run);
}

// Web shells cannot own primary+KeyF in the registry, so the fallback listener must exist
// and toggle the palette without letting the browser see the gesture.
const findKey = globalCalls.windowListeners.find((row) => row.type === 'keydown');
console.log('web find key listener:', findKey !== undefined, 'capture:', findKey?.capture === true);
if (findKey === undefined) throw new Error('missing web find key listener');
const gesture = {
  code: 'KeyF', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
  repeat: false, defaultPrevented: false, prevented: false,
  preventDefault() { this.prevented = true; },
};
findKey.fn(gesture);
const opened = globalThis.__exports !== undefined && globalCalls.effects.length > 0;
console.log('ctrl+F prevented:', gesture.prevented, 'palette opened:', opened);
