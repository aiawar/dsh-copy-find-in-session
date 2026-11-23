window.__ModuleLoader__.load({
  id: '@local/dsh-find-in-session',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useReducer, useRef } = React;

    /** Search state, scoped to one conversation session at a time. */
    const state = { open: false, query: '', caseSensitive: false, index: 0, total: 0, session: '' };
    const listeners = new Set();
    let ranges = [];
    let observer = null;

    function emit() { listeners.forEach((fn) => fn()); }
    function patch(next) { Object.assign(state, next); emit(); }

    // Read the APIs off `window`: sibling plugins may declare a module-scope `const CSS`
    // string in the same script realm, which shadows the global binding.
    const cssApi = window.CSS;
    const HighlightApi = window.Highlight;
    const HL_SUPPORTED = cssApi !== undefined && cssApi !== null && cssApi.highlights !== undefined
      && typeof HighlightApi === 'function';

    function chatRoot() {
      return document.querySelector('[data-conversation-scroll]') || document.querySelector('main') || document.body;
    }

    function sessionKey() {
      const holder = document.querySelector('[data-conversation-session]');
      if (holder === null) return '';
      return holder.getAttribute('data-conversation-session') || '';
    }

    // A chat switch must not carry a query, a hit index, or highlights across.
    function syncSession() {
      const key = sessionKey();
      if (key === state.session) return false;
      const hadQuery = state.query !== '';
      if (HL_SUPPORTED) { cssApi.highlights.delete('dsh-find'); cssApi.highlights.delete('dsh-find-current'); }
      ranges = [];
      state.session = key;
      patch({ open: false, query: '', index: 0, total: 0 });
      if (hadQuery) emit();
      return true;
    }

    const SKIP = 'script,style,textarea,input,select,option,button,.sr-only,[data-text-interaction-exclude]';

    function collect(node, needle, out) {
      if (out.length >= 4000) return;
      const parent = node.parentElement;
      if (parent === null) return;
      if (parent.closest(SKIP) !== null) return;
      if (parent.closest('[aria-hidden="true"]') !== null && parent.closest('.katex-html') === null) return;
      const text = node.data;
      if (text === '') return;
      const hay = needle.caseSensitive ? text : text.toLowerCase();
      const find = needle.caseSensitive ? needle.text : needle.lower;
      let at = 0;
      while (out.length < 4000) {
        const hit = hay.indexOf(find, at);
        if (hit < 0) break;
        const range = document.createRange();
        range.setStart(node, hit);
        range.setEnd(node, hit + find.length);
        out.push(range);
        at = hit + Math.max(1, find.length);
      }
    }

    // Text inside a display:none subtree has no box, so it can be neither measured nor
    // scrolled to; it still counts as a hit but sorts after everything the reader can see.
    function measure(element) {
      if (element === null) return null;
      try {
        if (element.getClientRects().length === 0) return null;
        const rect = element.getBoundingClientRect();
        if (rect.height === 0 && rect.width === 0) return null;
        return rect;
      } catch (error) { return null; }
    }

    // Nearest-to-the-reader first: hits are ordered by their distance from the middle of
    // the viewport, ties keep document order.
    function rankByProximity(list) {
      const center = (window.innerHeight || 800) / 2;
      const seen = new Map();
      const distance = (range) => {
        const element = range.startContainer.parentElement;
        let rect = seen.get(element);
        if (rect === undefined) { rect = measure(element); seen.set(element, rect); }
        if (rect === null) return Number.POSITIVE_INFINITY;
        return Math.abs((rect.top + rect.bottom) / 2 - center);
      };
      return list
        .map((range, order) => ({ range, order, distance: distance(range) }))
        .sort((a, b) => (a.distance - b.distance) || (a.order - b.order))
        .map((row) => row.range);
    }

    function search() {
      syncSession();
      const query = state.query;
      if (query === '') { ranges = []; patch({ total: 0, index: 0 }); paint(); return; }
      const root = chatRoot();
      const out = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const needle = { text: query, lower: query.toLowerCase(), caseSensitive: state.caseSensitive };
      let node = walker.nextNode();
      while (node !== null) { collect(node, needle, out); node = walker.nextNode(); }
      ranges = rankByProximity(out);
      patch({ total: ranges.length, index: 0 });
      paint();
      if (ranges.length > 0) jump(0);
    }

    function paint() {
      if (!HL_SUPPORTED) return;
      cssApi.highlights.delete('dsh-find');
      cssApi.highlights.delete('dsh-find-current');
      if (ranges.length === 0) return;
      cssApi.highlights.set('dsh-find', new HighlightApi(...ranges));
      const current = ranges[state.index];
      if (current !== undefined) cssApi.highlights.set('dsh-find-current', new HighlightApi(current));
    }

    // Collapsed turns use hidden="until-found" and expand through `beforematch`; clear the
    // attribute only when no owner answers.
    function reveal(range) {
      let element = range.startContainer.parentElement;
      while (element !== null) {
        if (element.hasAttribute('hidden')) {
          element.dispatchEvent(new Event('beforematch'));
          if (element.hasAttribute('hidden')) element.removeAttribute('hidden');
        }
        element = element.parentElement;
      }
    }

    // The chat follows the tail and re-pins itself to the bottom for a few frames after any
    // programmatic scroll, which would cancel a jump. Re-assert the target top each frame
    // until the tail follower gives up (its attribute disappears) or the allowance runs out.
    let holdFrame = 0;
    function holdScroll(element, top) {
      if (holdFrame !== 0) cancelAnimationFrame(holdFrame);
      let left = 20;
      const pin = () => {
        element.scrollTop = top;
        left -= 1;
        const following = document.querySelector('[data-chat-following-tail]') !== null;
        if (left > 0 && following) holdFrame = requestAnimationFrame(pin);
        else holdFrame = 0;
      };
      pin();
    }

    // Centre the hit in the viewport by setting the scroller's own top: scrollIntoView alone
    // loses to the tail follower, and the arithmetic keeps the surrounding rows in place.
    function centre(range) {
      const element = range.startContainer.parentElement;
      const rect = measure(element);
      if (rect === null) return false;
      const scroller = chatRoot();
      if (scroller === null || typeof scroller.scrollTop !== 'number') return false;
      const box = scroller.getBoundingClientRect();
      const offset = rect.top - box.top;
      const room = scroller.clientHeight - rect.height;
      const top = Math.max(0, Math.round(scroller.scrollTop + offset - (room > 0 ? room / 2 : 0)));
      holdScroll(scroller, top);
      return true;
    }

    function jump(delta) {
      if (ranges.length === 0) return;
      const next = ((state.index + delta) % ranges.length + ranges.length) % ranges.length;
      state.index = next;
      const range = ranges[next];
      reveal(range);
      paint();
      const element = range.startContainer.parentElement;
      if (element !== null) element.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (!centre(range)) {
        // A collapsed body answered `beforematch` and expanded after layout; retry once the
        // browser has laid the revealed content out.
        requestAnimationFrame(() => { if (ranges[next] === range) centre(range); });
      }
      emit();
    }

    function releaseHold() {
      if (holdFrame !== 0) { cancelAnimationFrame(holdFrame); holdFrame = 0; }
    }

    function clearHighlights() {
      if (HL_SUPPORTED) { cssApi.highlights.delete('dsh-find'); cssApi.highlights.delete('dsh-find-current'); }
      ranges = [];
    }

    function close() {
      releaseHold();
      clearHighlights();
      patch({ open: false, query: '', index: 0, total: 0 });
    }

    function open() {
      syncSession();
      patch({ open: true });
      if (state.query !== '') search();
    }

    // One gesture can reach both the key listener and the registry, so a short guard keeps
    // a single press from opening and closing the panel in the same frame.
    let lastToggle = 0;
    function toggle() {
      const now = Date.now();
      if (now - lastToggle < 250) return;
      lastToggle = now;
      if (state.open) close(); else open();
    }

    const styles = `
      [data-chat-flow] :is(p, li, pre, code, h1, h2, h3, h4, h5, h6, td, th, blockquote, span),
      [data-conversation-content], [data-conversation-content] *,
      [data-text-interaction-source], [data-text-interaction-source] * {
        user-select: text; -webkit-user-select: text; cursor: auto;
      }
      ::highlight(dsh-find) { background-color: rgba(255, 208, 0, 0.42); }
      ::highlight(dsh-find-current) { background-color: #ff9632; color: #111111; }
      .dsh-find-panel { position: fixed; z-index: 60; display: flex; align-items: center;
        gap: 3px; padding: 2px 4px; border-radius: 7px; box-sizing: border-box;
        background: var(--dsw-alias-bg-l2, #ffffff); color: var(--dsw-alias-label-primary, #1c1c1c);
        border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.14));
        box-shadow: 0 3px 10px rgba(0,0,0,0.13); pointer-events: auto;
        font: 11px/1.2 var(--dsw-font-ui, system-ui, sans-serif); }
      .dsh-find-field { position: relative; display: inline-flex; align-items: center; }
      .dsh-find-input { width: 118px; height: 18px; padding: 0 40px 0 4px; border-radius: 4px;
        font: inherit; color: inherit; background: var(--dsw-alias-bg-l1, #f7f7f7);
        box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.14));
        outline: none; }
      .dsh-find-input:focus { border-color: var(--dsw-alias-border-l3, rgba(0,0,0,0.35)); }
      .dsh-find-count { position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
        pointer-events: none; text-align: right; font-variant-numeric: tabular-nums;
        font-size: 10px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
      .dsh-find-button { display: inline-flex; align-items: center; justify-content: center;
        width: 15px; height: 16px; padding: 0; border-radius: 3px; font: inherit;
        font-size: 10px; line-height: 1; cursor: pointer; color: inherit;
        background: transparent; border: 1px solid transparent; }
      .dsh-find-button:hover { background: var(--dsw-alias-bg-l3, rgba(0,0,0,0.06)); }
      .dsh-find-button[data-active="true"] { border-color: var(--dsw-alias-border-l2, rgba(0,0,0,0.2));
        background: var(--dsw-alias-bg-l3, rgba(0,0,0,0.06)); }
    `;

    // The composer card carries data-composer-card inside the seat. Several conversation roots can
    // be mounted at once (an old session kept around during a swap), so pick the composer actually
    // painted at the bottom of the chat pane: the live card has the greatest bottom coordinate.
    const PANEL_SHIFT = 80;
    const PANEL_GAP = 6;
    const FALLBACK_BOTTOM = 96;

    function liveBox(selector) {
      if (typeof document.querySelectorAll !== 'function') {
        const single = document.querySelector(selector);
        if (single === null) return null;
        const rect = single.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0 ? { element: single, rect } : null;
      }
      let best = null;
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (best === null || rect.bottom > best.rect.bottom) best = { element, rect };
      }
      return best;
    }

    function composerBox() {
      return liveBox('[data-composer-card]') ?? liveBox('[data-composer-seat]');
    }

    // Keep a constant PANEL_GAP between the panel and the card's top edge so the panel rides up
    // with the card as the draft grows, and never report a fallback that lands at the window top.
    function anchor() {
      const width = window.innerWidth || 1024;
      const height = window.innerHeight || 800;
      const found = composerBox();
      if (found === null) return { right: 20 + PANEL_SHIFT, bottom: FALLBACK_BOTTOM };
      const rect = found.rect;
      const gap = Math.max(PANEL_GAP, Math.round(height - rect.top + PANEL_GAP));
      return {
        right: Math.max(2, Math.round(width - rect.right) + PANEL_SHIFT),
        bottom: Math.min(gap, height - 32),
      };
    }

    // The card grows and shrinks with the draft, so its top edge moves; re-anchor whenever its box
    // changes, and re-bind when React swaps the card element for a new one.
    function watchComposer(onChange) {
      if (typeof ResizeObserver !== 'function') return () => {};
      const observer = new ResizeObserver(() => onChange());
      let bound = null;
      const bind = () => {
        const found = composerBox();
        const element = found === null ? null : found.element;
        if (element === bound) return;
        if (bound !== null) observer.unobserve(bound);
        bound = element;
        if (bound !== null) observer.observe(bound);
      };
      bind();
      const timer = setInterval(() => { bind(); onChange(); }, 400);
      return () => { clearInterval(timer); observer.disconnect(); };
    }

    function FindPalette() {
      const [, force] = useReducer((value) => value + 1, 0);
      useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
      const inputRef = useRef(null);
      const open = state.open;

      useEffect(() => {
        if (!open) return undefined;
        const frame = requestAnimationFrame(() => {
          if (inputRef.current !== null) { inputRef.current.focus(); inputRef.current.select(); }
        });
        return () => cancelAnimationFrame(frame);
      }, [open]);

      useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
        const onResize = () => force();
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        const stopWatch = watchComposer(() => force());
        return () => {
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onResize);
          stopWatch();
        };
      }, [open]);

      if (!open) return null;
      const place = anchor();
      const counter = state.total === 0 ? (state.query === '' ? '' : '0') : `${state.index + 1}/${state.total}`;

      return h('div', {
        className: 'dsh-find-panel',
        style: { right: place.right + 'px', bottom: place.bottom + 'px' },
        onKeyDown: (event) => {
          if (event.key === 'Enter') { event.preventDefault(); jump(event.shiftKey ? -1 : 1); }
          if (event.key === 'Escape') { event.preventDefault(); close(); }
        },
      },
        h('div', { className: 'dsh-find-field' },
          h('input', {
            ref: inputRef,
            className: 'dsh-find-input',
            value: state.query,
            onChange: (event) => { patch({ query: event.target.value }); search(); },
          }),
          h('span', { className: 'dsh-find-count' }, counter),
        ),
        h('button', {
          type: 'button', className: 'dsh-find-button', title: '上一处 (Shift+Enter)',
          onClick: () => jump(-1), 'aria-label': '上一处',
        }, '↑'),
        h('button', {
          type: 'button', className: 'dsh-find-button', title: '下一处 (Enter)',
          onClick: () => jump(1), 'aria-label': '下一处',
        }, '↓'),
        h('button', {
          type: 'button', className: 'dsh-find-button', title: '区分大小写',
          'data-active': state.caseSensitive ? 'true' : 'false',
          onClick: () => { patch({ caseSensitive: !state.caseSensitive }); search(); },
        }, 'Aa'),
        h('button', {
          type: 'button', className: 'dsh-find-button', title: '关闭 (Esc)',
          onClick: close, 'aria-label': '关闭',
        }, '✕'),
      );
    }

    return {
      inject: ['slots', 'shortcuts'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.dshFindInSession = '';
          style.textContent = styles;
          document.head.append(style);
          return () => style.remove();
        }, 'dsh-find-in-session: styles');

        ctx.effect(() => {
          installObserver();
          return () => uninstallObserver();
        }, 'dsh-find-in-session: session watch');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'dsh-find-in-session.palette', order: 900,
        }, FindPalette));

        if (ctx.shortcuts !== undefined) {
          ctx.effect(() => ctx.shortcuts.register({
            id: 'session.find',
            label: () => '查找会话文字',
            aliases: ['find in session', 'find text'],
            defaults: {
              'desktop:macos': { code: 'KeyF', modifiers: ['primary'] },
              'desktop:windows': { code: 'KeyF', modifiers: ['primary'] },
              'desktop:linux': { code: 'KeyF', modifiers: ['primary'] },
              'web:macos': { code: 'KeyF', modifiers: ['primary', 'alt'] },
              'web:windows': { code: 'KeyF', modifiers: ['primary', 'alt'] },
            },
            regions: ['page', 'editable'],
            modals: [],
            resolve: () => ({ status: 'handled', run: toggle }),
          }), 'dsh-find-in-session: find command');
        }

        // Desktop forwards keys through the main-process bridge and the web shell reserves
        // primary+KeyF, so a capture-phase listener keeps the gesture working either way.
        ctx.effect(() => {
          const onKey = (event) => {
            if (event.defaultPrevented || event.repeat) return;
            if (event.altKey || event.shiftKey) return;
            if (!(event.ctrlKey || event.metaKey)) return;
            // Injected and IME paths can leave code empty, so fall back to the character.
            const key = String(event.key || '').toLowerCase();
            if (event.code !== 'KeyF' && key !== 'f') return;
            event.preventDefault();
            toggle();
          };
          window.addEventListener('keydown', onKey, true);
          return () => window.removeEventListener('keydown', onKey, true);
        }, 'dsh-find-in-session: find key listener');
      },
    };

    // A chat switch swaps the conversation DOM in place, so watch the session attribute.
    function installObserver() {
      if (observer !== null) return;
      if (typeof MutationObserver !== 'function') return;
      const target = document.body;
      if (target === null) return;
      observer = new MutationObserver(() => { syncSession(); });
      observer.observe(target, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['data-conversation-session'],
      });
      syncSession();
    }

    function uninstallObserver() {
      if (observer === null) return;
      observer.disconnect();
      observer = null;
    }
  },
});
