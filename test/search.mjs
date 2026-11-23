// Search-path test: drive the Client factory against a micro DOM so the tree walk,
// proximity ranking, highlight painting, jump, session isolation, and the panel's
// anchor/size are exercised without a browser.
import fs from 'node:fs';

const source = fs.readFileSync('E:/BDT/dsh-find-in-session/client.js', 'utf8');

/* ---------------------------------------------------------------- micro DOM */
class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.childNodes.push(child);
    }
    return this;
  }
  matches(selector) {
    return selector.split(',').some((raw) => {
      const part = raw.trim();
      if (part.startsWith('[')) {
        const body = part.slice(1, -1);
        const [name, value] = body.split('=');
        const key = name.trim();
        if (value === undefined) return this.attributes.has(key);
        return this.attributes.get(key) === value.replace(/^"|"$/g, '');
      }
      if (part === '*') return true;
      if (part.startsWith('.')) return (this.attributes.get('class') ?? '').split(/\s+/).includes(part.slice(1));
      return this.tagName === part.toUpperCase();
    });
  }
  closest(selector) {
    for (let node = this; node !== null; node = node.parentElement) {
      if (node instanceof Element && node.matches(selector)) return node;
    }
    return null;
  }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof Element) {
          if (child.matches(selector)) out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }
  removeAttribute(name) { this.attributes.delete(name); }
  getBoundingClientRect() { return this.rect; }
  getClientRects() { return (this.rect.width === 0 && this.rect.height === 0) ? [] : [this.rect]; }
  scrollIntoView() { globalThis.__scrolled.push(this); }
}

class Text {
  constructor(data) { this.nodeType = 3; this.data = data; this.parentElement = null; }
  get rect() { return this.parentElement.rect; }
}

function textNodes(root) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child instanceof Text) out.push(child);
      else walk(child);
    }
  };
  walk(root);
  return out;
}

const root = new Element('div');
root.attributes.set('data-conversation-scroll', '');
root.attributes.set('data-conversation-session', 'session-a');
root.rect = { left: 0, top: 0, right: 1304, bottom: 826, width: 1304, height: 826 };
root.scrollTop = 0;
root.clientHeight = 826;
root.clientWidth = 1304;

// Two bodies that both hold the needle; the lower one sits nearer the viewport centre.
const far = new Element('div');
far.attributes.set('data-text-interaction-source', '');
far.rect = { left: 300, top: 60, right: 1100, bottom: 100, width: 800, height: 40 };
far.append(new Text('a needle far above the reader'));
const near = new Element('div');
near.attributes.set('data-text-interaction-source', '');
near.rect = { left: 300, top: 380, right: 1100, bottom: 420, width: 800, height: 40 };
near.append(new Text('a needle right here, and one more needle too'));
const skipped = new Element('button');
skipped.append(new Text('needle inside a button'));
const hiddenChrome = new Element('div');
hiddenChrome.attributes.set('aria-hidden', 'true');
hiddenChrome.append(new Text('needle inside chrome'));
root.append(far, near, skipped, hiddenChrome);

// Composer: a wide seat wrapping a rounded card; the panel aligns to the card.
const seat = new Element('div');
seat.attributes.set('data-composer-seat', '');
seat.rect = { left: 280, top: 697, right: 1296, bottom: 825, width: 1016, height: 128 };
const card = new Element('div');
card.attributes.set('class', 'QV5bUW_card');
card.attributes.set('data-composer-card', '');
card.rect = { left: 432, top: 697, right: 1144, bottom: 795, width: 712, height: 98 };
card.style = { borderTopLeftRadius: '28px' };
seat.append(card);
root.append(seat);

globalThis.__scrolled = [];
const bySelector = (selector) => {
  if (selector === '[data-conversation-session]') return root;
  if (selector === '[data-composer-seat]') return seat;
  if (selector === '[data-composer-card]') return card;
  if (selector === '[data-conversation-scroll]') return root;
  if (selector === '[data-chat-flow]') return null;
  return null;
};
const bySelectorAll = (selector) => {
  const single = bySelector(selector);
  return single === null ? [] : [single];
};

global.document = {
  createElement: (tag) => {
    const element = new Element(tag);
    element.dataset = {};
    element.style = {};
    element.remove = () => {};
    return element;
  },
  head: { append() {} },
  body: root,
  querySelector: bySelector,
  querySelectorAll: bySelectorAll,
  createTreeWalker(start) {
    const nodes = textNodes(start);
    let index = -1;
    return { nextNode: () => (index += 1, nodes[index] ?? null) };
  },
  createRange() {
    return {
      startContainer: null, startOffset: 0, endContainer: null, endOffset: 0,
      setStart(node, offset) { this.startContainer = node; this.startOffset = offset },
      setEnd(node, offset) { this.endContainer = node; this.endOffset = offset },
    };
  },
  getSelection() {
    return { removeAllRanges() {}, addRange() {}, rangeCount: 0, toString: () => '' };
  },
};

global.getComputedStyle = (element) => ({
  borderTopLeftRadius: element.style?.borderTopLeftRadius ?? '0px',
  userSelect: 'text',
});
global.NodeFilter = { SHOW_TEXT: 4 };
global.Node = { TEXT_NODE: 3 };
global.Highlight = class { constructor(...args) { this.ranges = args; } };
global.CSS = { highlights: new Map() };
global.MutationObserver = class {
  constructor(callback) { this.callback = callback; globalThis.__mutations.push(this); }
  observe() {}
  disconnect() {}
};
globalThis.__mutations = [];

/* -------------------------------------------------------------- stub React */
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  Fragment: 'Fragment',
  useEffect: () => {},
  useReducer: (_reducer, initial) => [initial, () => {}],
  useRef: (value) => ({ current: value }),
};

global.window = {
  innerWidth: 1304,
  innerHeight: 826,
  addEventListener: () => {},
  removeEventListener: () => {},
  __ModuleLoader__: {
    load({ factory }) {
      globalThis.__exports = factory((name) => {
        if (name === 'react') return stubReact;
        throw new Error(`unexpected require: ${name}`);
      });
    },
  },
};
globalThis.window.CSS = global.CSS;
globalThis.window.Highlight = global.Highlight;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
global.setInterval = () => 0;
global.clearInterval = () => {};
global.requestAnimationFrame = (fn) => { fn(); return 1; };
global.cancelAnimationFrame = () => {};

new Function('window', source)(global.window);

/* ------------------------------------------------------------------- drive */
function collectByType(tree, type, out = []) {
  if (tree === null || typeof tree !== 'object') return out;
  if (tree.type === type) out.push(tree);
  for (const child of tree.children ?? []) collectByType(child, type, out);
  return out;
}

const components = [];
const commands = [];
const ctx = {
  effect(fn) { const dispose = fn(); return dispose; },
  slots: {
    inject(_name, factory) { return factory(); },
    register(_options, Component) { components.push(Component); return () => {}; },
  },
  shortcuts: { register(command) { commands.push(command); return () => {}; } },
};
globalThis.__exports.apply(ctx);
const Palette = components[0];

console.log('closed render:', Palette() === null ? 'null (nothing rendered)' : 'LEAKED');
console.log('commands:', commands.map((command) => command.id).join(','));

const find = commands.find((command) => command.id === 'session.find');
find.resolve({ region: 'page', modal: null, target: null }).run();

let tree = Palette();
const input = collectByType(tree, 'input')[0];
console.log('open render has input:', input !== undefined);
console.log('input placeholder:', input.props.placeholder === undefined ? 'none' : JSON.stringify(input.props.placeholder));

const panel = tree;
console.log('panel style:', JSON.stringify(panel.props.style));
console.log('panel right clears the card by 80px:', panel.props.style.right === '240px');
console.log('panel bottom keeps a 6px gap under the card:', panel.props.style.bottom === '135px');
const field = tree.children.find((node) => node.props?.className === 'dsh-find-field');
const counterInField = field !== undefined
  && field.children.some((node) => node.props?.className === 'dsh-find-count');
console.log('counter sits inside the input field:', counterInField);

// The card grows as the draft gets longer: the panel must follow its new top edge.
card.rect = { left: 432, top: 640, right: 1144, bottom: 795, width: 712, height: 155 };
console.log('panel follows composer growth:', Palette().props.style.bottom === '192px');

// Regression: a tall rounded box (the growing textarea) also lives in the seat; the panel must
// keep following the card, not latch onto that box and fly to the top of the window.
const tall = new Element('div');
tall.attributes.set('class', 'tall-editor');
tall.rect = { left: 440, top: 120, right: 1136, bottom: 792, width: 696, height: 672 };
tall.style = { borderTopLeftRadius: '12px' };
card.append(tall);
console.log('panel ignores the tall rounded editor:', Palette().props.style.bottom === '192px');
tall.remove?.();
card.rect = { left: 432, top: 697, right: 1144, bottom: 795, width: 712, height: 98 };

input.props.onChange({ target: { value: 'needle' } });
tree = Palette();
const count = collectByType(tree, 'span').find((node) => node.props.className === 'dsh-find-count');
console.log('count after first search:', count.children[0]);
console.log('buttons:', collectByType(tree, 'button').map((node) => node.children[0]).join(' '));

// Nearest-first: the hit inside `near` (rect centre 400) beats the one inside `far` (centre 80).
console.log('first jump scrolled to nearest:', globalThis.__scrolled[0] === near);
console.log('highlight layers:', [...globalThis.window.CSS.highlights.keys()].join('+'));

const next = collectByType(tree, 'button')[1];
next.props.onClick();
next.props.onClick();
tree = Palette();
const count2 = collectByType(tree, 'span').find((node) => node.props.className === 'dsh-find-count');
console.log('count after next:', count2.children[0]);
console.log('second jump scrolled to far:', globalThis.__scrolled[globalThis.__scrolled.length - 1] === far);
console.log('excluded nodes never hit:', globalThis.__scrolled.includes(skipped) === false
  && String(globalThis.__scrolled).includes('chrome') === false);

// Case toggle: uppercase query must miss the lowercase text, then hit it.
const input2 = collectByType(tree, 'input')[0];
input2.props.onChange({ target: { value: 'NEEDLE' } });
tree = Palette();
const count3 = collectByType(tree, 'span').find((node) => node.props.className === 'dsh-find-count');
console.log('case-insensitive total:', count3.children[0]);
const aa = collectByType(tree, 'button')[2];
aa.props.onClick();
tree = Palette();
const count4 = collectByType(tree, 'span').find((node) => node.props.className === 'dsh-find-count');
console.log('case-sensitive total:', count4.children[0]);

// Close clears the highlight layers so nothing lingers on the page.
const close = collectByType(tree, 'button')[3];
close.props.onClick();
console.log('closed render again:', Palette() === null ? 'null' : 'LEAKED');
console.log('highlights after close:', globalThis.window.CSS.highlights.size);

// Session isolation: a different session id must drop query, hits, and highlights.
await new Promise((resolve) => setTimeout(resolve, 300));
find.resolve({ region: 'page', modal: null, target: null }).run();
let tree2 = Palette();
collectByType(tree2, 'input')[0].props.onChange({ target: { value: 'needle' } });
console.log('hits before switch:', globalThis.window.CSS.highlights.size);
root.attributes.set('data-conversation-session', 'session-b');
globalThis.__mutations[0].callback();
console.log('render after session switch:', Palette() === null ? 'null (hidden)' : 'STILL OPEN');
console.log('highlights after session switch:', globalThis.window.CSS.highlights.size);
