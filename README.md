# dsh-copy-find-in-session

DSH 会话内的 Ctrl+F 查找与复制插件。

在 DeepSeek Harness（DSH）的会话正文里按 `Ctrl+F` 打开一条搜索栏：命中原地高亮，逐个跳转时按「离当前视野最近」优先，切换会话自动清空，消息正文保持可原生选中，拖选后 `Ctrl+C` 直接复制。

Ctrl+F search inside a DeepSeek Harness (DSH) session transcript. Hits are highlighted in place, stepping jumps to the nearest match first, and the transcript stays natively selectable so you can drag-select and Ctrl+C as usual.

## 功能 · What it does

- **`Ctrl+F` 打开紧凑搜索栏**，默认隐藏，按一次出现，再按一次消失。
- **每处命中原地高亮**，走 CSS Custom Highlight API，不改写会话 DOM —— React 状态、选区、内置消息按钮全部照常工作。
- **当前命中滚到视野中央**，用更深的橙色区分。
- **就近优先排序**：按命中框中心与视口中线的距离排序，按 `Enter` 从你正在看的位置向外走。
- **按会话隔离**：换会话即清空查询、命中与高亮，一次搜索不会漏进另一个对话。
- **原生复制**：没有复制按钮、没有自定义快捷键。正文列放开了 `user-select: text`，可跨消息正文、代码块、工具输出拖选后 `Ctrl+C`。
- **贴着输入框**：搜索栏与输入卡片右缘向左错开 80px，上方保持 6px 间距，草稿把卡片撑高时跟着移动。
- **双语**：`locale/zh.json` 与 `locale/en.json` 各自指向自己的详情文档，两份文档都含完整中英文，中文在前／英文在前各一份，长描述始终保持双语。

## 快捷键 · Keys

| Action | Desktop | Web |
| --- | --- | --- |
| Open / close the bar | `Ctrl+F` | `Ctrl+F`, or `Ctrl+Alt+F` |

命令注册在快捷键目录中，可在 设置 → 快捷键 里改键。Desktop 走主进程键盘桥转发；同时有 capture 阶段监听直接匹配手势，因为桥只转发登记过的键、且部分输入路径的 `event.code` 是空串。250ms guard 防止一次物理按键触发两次。

搜索栏内：`Enter` / `Shift+Enter` 逐个跳转，`Aa` 切换区分大小写，`Esc` 关闭。

## 安装 · Install

从 GitHub Release 装（当前唯一可直接安装的来源）：

```bash
dsh plugin install https://github.com/aiawar/dsh-copy-find-in-session/releases/download/v1.0.0/dsh-copy-find-in-session-1.0.0.tgz
```

或让市场直接按 git commit 装，见下面的市场索引段。

从市场装：订阅下面的索引源后，在 Discover 页搜索 `find in session`。

从源码装（本地 bundle，`link:` 即可，改源码后关开插件即生效）：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dsh": { "profile": { "bundles": ["dsh-copy-find-in-session"] } },
  "dependencies": { "dsh-copy-find-in-session": "link:/absolute/path/to/dsh-copy-find-in-session" }
}
```

然后在 Plugins 里把插件关一次再开，重载 client 半边。

## 市场索引 · Market index

本仓库自带 `dsh-index.json`（`format: 1`），任何 DSH profile 都能订阅：

```yaml
# cordis.patch.yml
- id: plugin-market
  name: "@deepseek-ai/dsh-plugin-market"
  config:
    indexes:
      - https://cdn.jsdelivr.net/gh/aiawar/dsh-copy-find-in-session@8f7f1997a934299aea847583c5856f043c01558e/dsh-index.json
```

地址钉在 40 位 commit `8f7f1997a934299aea847583c5856f043c01558e` 上是有意的：`@main` 与标签都会走 CDN 缓存，推送后仍返回旧内容（实测 `@main` 会滞后两个 commit）。索引声明一个插件 `dsh-copy-find-in-session` 的 `1.0.0`，源类型 `git` 并钉在同一 commit，Discover 页可浏览并安装。改动代码后同步更新 `versions[0].source.commit` 与订阅地址里的 commit。

同时收录于两个社区目录：

- [1024Store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) — `catalog/plugins/aiawar--dsh-copy-find-in-session.json`
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — `data/plugins/aiawar__dsh-copy-find-in-session.yml`

## 目录 · Layout

```
dsh-copy-find-in-session/
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

## 测试 · Tests

无依赖，两个脚本都用桩 React 与微 DOM，直接跑在 Node 下：

```bash
node test/smoke.mjs
node test/search.mjs
```

`search.mjs` 覆盖：默认隐藏、输入框无 placeholder、面板几何（左移 80px、6px 间距、跟随卡片增高、忽略 seat 里那个高圆角编辑框）、计数 `n/total` 内嵌在输入框右侧、就近优先跳转顺序、`button`/`aria-hidden` 排除、大小写切换、关闭后清高亮、切换会话隔离。

## 搜索原理 · How it searches

走会话滚动容器（`[data-conversation-scroll]`）下的文本节点，跳过 `script/style/textarea/input/select/option/button`、`.sr-only`、`[data-text-interaction-exclude]`，以及 `aria-hidden` 的装饰（KaTeX 的 `.katex-html` 除外）。折叠的轮次与工具行用 `hidden="until-found"`，命中落在其中时用 `beforematch` 展开，另带属性兜底。每次查询上限 4000 处命中。

会话没渲染过的文本 —— 从未展开的折叠工具结果、已滚出视口的虚拟化行 —— 搜不到。滚到附近再搜一次即可。

跳转靠设置滚动容器自身的 `scrollTop`，而不是 `scrollIntoView`：流式输出时聊天会自己钉在尾部，所以跳转每帧重申目标位置，直到尾部跟随释放（`[data-chat-following-tail]` 消失）或满 20 帧。

完整行为参考见 [docs/DETAIL.md](docs/DETAIL.md)（中文在前）或 [docs/DETAIL.en.md](docs/DETAIL.en.md)（英文在前）。

## 兼容性 · Compatibility

按 DSH desktop 的 `@deepseek-ai/dsh-client-ui-layout` 与 `@deepseek-ai/dsh-client-ui-conversation` 槽位编写。搜索栏注册进 `shell.overlay`（root 作用域），用 `[data-composer-card]` / `[data-composer-seat]` 标记定位；将来 DSH 若改这些标记名，会退回固定偏移而不是崩掉。

## 许可证 · License

MIT
