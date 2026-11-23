# DSH Find in session

Ctrl+F search inside a DeepSeek Harness (DSH) session transcript. Hits are highlighted in place, stepping jumps to the nearest match, and the transcript stays natively selectable so you can drag-select and Ctrl+C as usual.

## What it does

- **Ctrl+F opens a compact search bar** for the current session. It is hidden until you press the key.
- **Every hit is highlighted** with the CSS Custom Highlight API, so the transcript DOM is never modified — React state, selection, and the built-in message buttons all keep working.
- **The current hit is scrolled to the middle of the view** and painted in a stronger orange.
- **Nearest-first ordering**: hits are sorted by the distance between their box centre and the middle of the viewport, so pressing Enter walks outward from where you are reading.
- **Per-session isolation**: switching sessions clears the query, the hits, and the highlights. A search never leaks into another conversation.
- **Native copy**: no copy button, no custom shortcut. `user-select: text` is opened up on the flow column, so you can select across message bodies, code blocks, and tool output and press Ctrl+C.
- **Anchored to the composer**: the bar clears the composer card's right edge by 80px and keeps a constant 6px gap above it, following the card as the draft grows it taller.
- **Bilingual**: `locale/zh.json` and `locale/en.json` each point `meta.detail` at their own document, and both documents carry the full Chinese and English text — the Chinese half first under one language, the English half first under the other, so the long description always shows both.

## Keys

| Action | Desktop | Web |
| --- | --- | --- |
| Open / close the bar | `Ctrl+F` | `Ctrl+F`, or `Ctrl+Alt+F` |

The command is registered in the shortcut catalog, so it can be rebound in Settings → Shortcuts. Desktop forwards it through the main-process keyboard bridge; a capture-phase listener also matches the gesture directly, because the bridge only forwards keys the registry published and some input paths deliver an empty `event.code`. A 250 ms guard stops one physical press from toggling twice.

Inside the bar: `Enter` / `Shift+Enter` step through hits, `Aa` toggles case sensitivity, `Esc` closes.

## Install

```bash
dsh plugin install /absolute/path/to/dsh-find-in-session
```

Or point the profile at it directly — this is a local bundle, so `link:` install is enough and source edits reload on enable/disable:

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dsh": { "profile": { "bundles": ["@local/dsh-find-in-session"] } },
  "dependencies": { "@local/dsh-find-in-session": "link:/absolute/path/to/dsh-find-in-session" }
}
```

Then toggle the plugin off and on in Plugins to reload the client half.

## Market index

This repo ships its own `dsh-index.json`, a `format: 1` market index that any DSH profile can subscribe to:

```yaml
# cordis.patch.yml
- id: plugin-market
  name: "@deepseek-ai/dsh-plugin-market"
  config:
    indexes:
      - https://cdn.jsdelivr.net/gh/aiawar/dsh-find-in-session@v1.0.0/dsh-index.json
```

Pinned to the `v1.0.0` tag on purpose: `@main` is served from a CDN cache and can lag a push. The index declares one plugin, `dsh-find-in-session`, version `1.0.0`, as a `git` source pinned to a commit, so Discover lists it and installs straight from the repository. Bump `versions[0].source.commit` to the new HEAD whenever the code changes — a stale commit installs stale code.

Also listed in the two community directories:

- [1024Store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) — `catalog/plugins/aiawar--dsh-find-in-session.json`
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — `data/plugins/aiawar__dsh-find-in-session.yml`

## Layout

```
dsh-find-in-session/
  package.json          dsh.bundle.patch + dsh.client metadata
  cordis.patch.yml      inserts the plugin entry into the bundle
  index.js              host half (empty apply)
  client.js             the whole UI: search, highlight, jump, palette, styles
  icon.svg              plugin icon
  dsh-index.json        format-1 market index for this plugin
  locale/en.json        title, description, detail path (English page)
  locale/zh.json        same keys in Chinese
  docs/DETAIL.md        behaviour reference, Chinese first
  docs/DETAIL.en.md     same reference, English first
  test/smoke.mjs        factory wiring, shortcut bindings, style injection
  test/search.mjs       search/jump/ranking/anchor behaviour against a stub DOM
```

## Tests

No dependencies. Both scripts stub React and a minimal DOM and run under Node:

```bash
node test/smoke.mjs
node test/search.mjs
```

`search.mjs` covers: hidden until opened, no placeholder, panel geometry (80px left shift, 6px gap, follows composer growth, ignores a tall rounded editor in the seat), counter `n/total` inside the input field, nearest-first jump order, `button`/`aria-hidden` exclusion, case toggle, highlight cleanup on close, and session-switch isolation.

## How it searches

It walks the text nodes under the session's scroll container (`[data-conversation-scroll]`), skipping `script/style/textarea/input/select/option/button`, `.sr-only`, `[data-text-interaction-exclude]`, and `aria-hidden` chrome (KaTeX's `.katex-html` excepted). Collapsed turns and tool rows using `hidden="until-found"` are revealed via `beforematch` when a hit lands inside them, with an attribute fallback. Cap: 4000 hits per query.

Text the session never rendered — a collapsed tool result never expanded, a virtualized row that is off-screen — cannot be found. Scroll near it once and search again.

Stepping centres a hit by setting the scroll container's own `scrollTop`, not by relying on `scrollIntoView`: the chat pins itself to the tail while streaming, so the jump re-asserts the target top each frame until the tail follower releases (`[data-chat-following-tail]` disappears) or 20 frames pass.

See [docs/DETAIL.md](docs/DETAIL.md) (Chinese first) or [docs/DETAIL.en.md](docs/DETAIL.en.md) (English first) for the full behaviour reference.

## Compatibility

Written against DSH desktop `@deepseek-ai/dsh-client-ui-layout` and `@deepseek-ai/dsh-client-ui-conversation` slots. The bar registers into `shell.overlay` (root scope) and uses the `[data-composer-card]` / `[data-composer-seat]` markers to anchor. If a future DSH release renames those markers, the bar falls back to a fixed offset instead of breaking.

## License

MIT
