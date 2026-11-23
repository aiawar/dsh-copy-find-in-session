# DSH Find in session

Ctrl+F opens a small search bar for the current session. Every hit in the transcript is highlighted; the current hit is a stronger orange and is scrolled to the middle of the view. Enter / Shift+Enter step through hits, `Aa` toggles case sensitivity, `Esc` closes the bar.

The bar is hidden until you press the key, and it belongs to one session at a time: switching sessions clears the query, the hits, and the highlights, so a search never leaks into another conversation.

## Keys

- Desktop: `Ctrl+F` opens the bar.
- Web: `Ctrl+F` also opens the bar, `Ctrl+Alt+F` is the rebindable equivalent (browsers keep bare `Ctrl+F` for themselves).
- The command appears in the shortcut catalog, so it can be rebound in Settings → Shortcuts.

Desktop key handling has two paths. The registry owns `Ctrl+F` and the desktop keyboard bridge forwards it; a capture-phase listener also matches the gesture directly, because the bridge only forwards keys the registry published and some input paths deliver an empty `code`. A 250 ms guard keeps one physical press from toggling the bar twice.

## How it searches

It walks the text nodes under the session's scroll container (`[data-conversation-scroll]`), skips `script/style/textarea/input/select/option/button`, `.sr-only`, `[data-text-interaction-exclude]` and `aria-hidden` chrome (KaTeX's `.katex-html` excepted), and marks hits with the CSS Custom Highlight API — the transcript DOM is not modified, so selection, copy, and React state stay untouched. Collapsed turns and tool rows using `hidden="until-found"` are revealed by dispatching `beforematch` when a hit lands inside them, with an attribute fallback. Hit cap is 4000 per query.

Hits are ordered nearest-first: `rankByProximity` sorts them by the distance between the hit's box centre and the middle of the viewport, and text inside an unrendered subtree (`getClientRects()` empty) sorts last, because it can be neither measured nor scrolled to.

Stepping to a hit centres it by setting the scroll container's own `scrollTop`, not by relying on `scrollIntoView`: the chat pins itself to the tail while streaming, so the jump re-asserts the target top each frame until the tail follower releases (`[data-chat-following-tail]` disappears) or 20 frames pass.

Text that the session never rendered (a collapsed tool result that was never expanded, a virtualized row that is off-screen) cannot be found; scroll near it once and search again.

## Copy

Copy is the browser's own cursor selection — there is no copy button and no copy shortcut. Drag over any part of the transcript and press Ctrl+C. The injected stylesheet sets `user-select: text` on the flow column (`[data-chat-flow]` paragraphs, list items, code, headings, table cells, quotes, spans) and on `[data-conversation-content] *`, so a selection can cross message bodies, code blocks, and tool output.

## Placement

The bar is anchored to the composer card, not to the window. `composerBox()` takes the painted `[data-composer-card]` (falling back to `[data-composer-seat]` on older builds), choosing the candidate with the greatest `bottom` so a stale conversation root left mounted during a session swap cannot win. `anchor()` then places the bar `PANEL_SHIFT` (80 px) left of the card's right edge and keeps a constant `PANEL_GAP` (6 px) between the bar's bottom and the card's top.

The gap stays constant while the draft grows, so a taller composer carries the bar upward with it instead of leaving it behind — and it never reports a position that puts the bar at the window top. A `ResizeObserver` on the card re-anchors the bar, re-bound every 400 ms so a React swap of the card element does not leave the observer pointing at a detached node.

The counter (`n/total`) sits inside the input field, pinned to its right side with `pointer-events: none`, so the input can be wide without widening the bar. The bar itself stays short — 11 px font, 118×18 px input (text padded 32 px on the right for the counter), 15×16 px buttons — about a third of the first version.

## Styles

All classes are prefixed `dsh-find-`; colors come from DSH theme aliases (`--dsw-alias-*`) with fallbacks, so the bar follows light and dark themes.
