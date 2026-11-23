# DSH 会话内查找

按 `Ctrl+F` 在当前会话里打开一条小搜索条。正文中每一处命中都会高亮，当前命中用更深的橙色标出并滚动到视图中央。`Enter` / `Shift+Enter` 在命中之间前后跳，`Aa` 切换区分大小写，`Esc` 关闭搜索条。

搜索条默认不显示，只有按键后才出现；它一次只属于一个会话——切换会话会清空查询、命中和高亮，搜索不会串到另一个对话里。

## 快捷键

- 桌面端：`Ctrl+F` 打开搜索条。
- 网页端：`Ctrl+F` 同样可以打开，`Ctrl+Alt+F` 是可改绑的等价键位（浏览器自己占用了无修饰的 `Ctrl+F`）。
- 命令已注册进快捷键目录，因此可以在 设置 → 快捷键 里改绑。

桌面端的按键有两条通路。注册表持有 `Ctrl+F`，由主进程键盘桥转发；同时有一个 capture 阶段的监听器直接匹配手势，因为键盘桥只转发注册表已发布的键，而且某些输入路径送来的 `code` 是空串。250 毫秒的防抖保证一次物理按键不会把搜索条开关两次。

## 搜索原理

它遍历会话滚动容器（`[data-conversation-scroll]`）下的文本节点，跳过 `script/style/textarea/input/select/option/button`、`.sr-only`、`[data-text-interaction-exclude]` 以及 `aria-hidden` 的装饰性文字（KaTeX 的 `.katex-html` 除外），再用 CSS Custom Highlight API 标记命中——不修改会话 DOM，所以选中、复制和 React 状态都不受影响。落在折叠区块里的命中，会通过派发 `beforematch` 展开使用 `hidden="until-found"` 的折叠轮次和工具行，另有属性兜底。单次查询的命中上限是 4000 处。

命中按最近优先排序：`rankByProximity` 依据命中框中心到视口中心的距离排序，位于未渲染子树里的文本（`getClientRects()` 为空）排在最后，因为它们既无法测量也无法滚动到。

跳转到命中时是直接设置滚动容器自己的 `scrollTop` 来居中，而不是依赖 `scrollIntoView`：流式输出期间聊天区会把自己钉在尾部，所以跳转会逐帧重申目标位置，直到尾部跟随器释放（`[data-chat-following-tail]` 消失）或累计 20 帧为止。

会话从未渲染过的文字（从未展开的折叠工具结果、滚出屏幕被虚拟化的行）搜不到；先滚动到附近再搜一次即可。

## 复制

复制用的是浏览器原生的光标选中——没有复制按钮，也没有复制快捷键。在正文任意位置拖选，然后按 Ctrl+C。注入的样式表给流式列（`[data-chat-flow]` 下的段落、列表项、代码、标题、表格单元格、引用、span）以及 `[data-conversation-content] *` 设置了 `user-select: text`，所以选区可以跨消息正文、代码块和工具输出。

## 位置

搜索条锚定在输入卡片上，而不是锚定在窗口上。`composerBox()` 取实际绘制的 `[data-composer-card]`（旧版本回退到 `[data-composer-seat]`），并选择 `bottom` 最大的候选，这样会话切换时残留挂载的旧会话根节点不会胜出。随后 `anchor()` 把搜索条放在卡片右缘左侧 `PANEL_SHIFT`（80 像素）处，并在搜索条底部与卡片顶部之间保持恒定的 `PANEL_GAP`（6 像素）。

草稿变高时这个间距保持不变，所以更高的输入框会把搜索条一起往上带，而不是把它丢在原处——并且它永远不会返回一个把搜索条顶到窗口上方的位置。卡片上的 `ResizeObserver` 会重新锚定搜索条，并且每 400 毫秒重新绑定一次，以免 React 换掉卡片元素后观察器还指向已脱离的节点。

计数（`n/total`）嵌在输入框内部、贴住其右侧，并设置 `pointer-events: none`，所以输入框可以变宽而不会把搜索条撑宽。搜索条本身保持窄小——11 像素字号、118×18 像素输入框（文字右侧留 32 像素给计数）、15×16 像素按钮——约为最初版本的三分之一。

## 样式

所有类名都带 `dsh-find-` 前缀；颜色取自 DSH 主题变量（`--dsw-alias-*`）并带兜底值，因此搜索条会跟随浅色与深色主题。

---

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
