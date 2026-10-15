# PromptMag

CLI 提示词弹夹。为 Claude Code / Codex 等 CLI 编码 Agent 设计的桌面悬浮工具：随时捕获提示词与多张截图，编译成无歧义的图文 Prompt，并通过本地任务文件实现自动接力。

[English](#english) · [中文](#中文)

---

## 中文

### 解决什么问题

用 CLI Agent 干活时，终端被滚动输出占着：想法来了没法随手记，截图贴不进终端，好不容易贴进去还怕模型认错图片顺序；任务跑完一单，还得守在屏幕前手动传下一棒。

PromptMag 是一个置顶小窗。`Alt+Q` 呼出，`Ctrl+V` 在光标处贴图（自动落盘为本地文件并插入 `[图1]` 锚点），`Ctrl+Enter` 入队。复制时编译器把锚点展开成带绝对路径的结构化文本，模型不会认错图。开启「接力」后，队列实时写入 `~/.prompt-mag/next_tasks.md`，Agent 每勾掉一行，界面同步一行。

### 功能

- 光标处内联贴图：`[图N]` 锚点 + 本地绝对路径；删除、拖拽重排后自动改号
- 图片分镜卡片：每张图一条批注；点击缩略图可在光标处补插锚点
- Prompt 编译器：内联路径展开 + 底部精确映射表，兼容「第二张图」这类口语指代
- 待发队列：复制并弹出 / 仅复制 / 编辑回填 / 删除
- 常用词库：高频指令胶囊，一键插入光标处
- Agent 自动接力：`next_tasks.md` 双向同步（`fs.watch`），复制时可选注入接力指令
- 悬浮窗：无边框胶囊造型、置顶、透明度 40%–100%、全局快捷键

### 编译效果

输入框里写：

```text
把 [图1] 的导航栏改成 [图2] 的配色
```

复制到剪贴板的内容：

```text
把 [图1 (本地路径: "C:/Users/you/.prompt-mag/images/img_01.png")] 的导航栏改成 [图2 (本地路径: "C:/Users/you/.prompt-mag/images/img_02.png")] 的配色

---
### 附加上下文图片精确映射（请严格按编号对应读取本地图片文件）：
- 【图1 / 第一张图】路径: "C:/Users/you/.prompt-mag/images/img_01.png" | 针对此图的说明: 当前导航栏
- 【图2 / 第二张图】路径: "C:/Users/you/.prompt-mag/images/img_02.png" | 针对此图的说明: 目标配色
```

主输入框没写正文、只在每张图下写了批注时，编译器自动汇总为逐图分步指令。

### 快速开始

```bash
git clone https://github.com/HaiLanDuJun/PromptMag.git
cd PromptMag
npm install
npm run dev:all      # 开发模式（Vite 热更新，端口 5199 + Electron）
npm run dev:static   # 构建前端后直接启动，不起任何端口
npm run preview      # 生产构建 + 运行
```

前端开发服务默认监听 `5199`（可用 `PM_DEV_PORT` 覆盖），不再占用 5173；
`npm start` / `npm run dev:static` / 打包产物都直接加载 `dist/`，不依赖任何端口。

Windows 截图工具常会抢焦点，输入区的「贴图」按钮是手动兜底。

### 打包成 exe

```bash
npm run dist            # 产出 release/ 下两个 exe
```

- `PromptMag-Portable-x.x.x.exe`：单文件免安装，双击即用
- `PromptMag-Setup-x.x.x.exe`：安装向导版，可自选安装目录

打包只是源码的快照，之后继续改代码、重新 `npm run dist` 即可产出新版本；用户数据默认在 `~/.prompt-mag/`，替换 exe 不丢数据。

### 架构

纯本地 Electron 桌面应用，无服务端、无网络依赖：

| 进程 | 技术 | 职责 |
|------|------|------|
| 主进程 | Node.js（`electron/main.cjs`） | 窗口与快捷键、剪贴板图片落盘、`data.json` / `next_tasks.md` 读写与监听、本地图片协议 |
| 渲染进程 | Vue 3 + Vite + Tailwind | 输入区、图片卡片、队列、词库 |

### 数据目录

默认 `~/.prompt-mag/`，可改为任意位置：标题栏齿轮 → 「更改…」选择目录，
现有数据会复制到新目录并自动重启应用。配置记录在 `%APPDATA%\prompt-mag\app-config.json`。

```text
<数据目录>/
├── images/            # 贴入的截图（Prompt 中引用绝对路径）
├── data.json          # 队列 / 词库 / 窗口设置
├── next_tasks.md      # 自动接力队列（Agent 在此勾选）
└── window-state.json  # 窗口位置与形态
```

### 悬浮形态

三种形态，核心是「平时几乎不占屏幕」：

| 形态 | 尺寸 | 说明 |
|------|------|------|
| 胶囊 `capsule` | 176×46 真圆角胶囊 | 悬停或点击即开输入面板；按住拖动可移动（点击与拖拽互不干扰） |
| 快捷输入 `quick` | 400×210 | 类输入法悬浮窗：可直接打字、`Ctrl+V` 贴图、`Ctrl+Enter` 存弹夹 |
| 完整 `full` | 396×640（可拉伸） | 队列 / 词库 / 图片分镜批注全功能 |

- 鼠标移出快捷面板约 0.7 秒自动收回胶囊；正在输入（窗口持有焦点）时不收起
- **边缘半缩进（0 侵入）**：失焦且靠近屏幕边缘（<90px）时自动缩进到最近的边，只露出一半，
  鼠标移到露出的部分即滑回原位（判定基于真实光标位置，不依赖窗口事件）
- 拖拽期间禁用悬停响应，拖拽不打断、不误触
- 窗口位置、尺寸与形态自动记忆

### 路线图

见 [DREAM.md](./DREAM.md)（中英双语）。

### License

[MIT](./LICENSE)

---

## English

A desktop floating tool for people working with CLI coding agents (Claude Code / Codex, etc.). Capture prompts and screenshots the moment ideas strike, compile them into unambiguous image-text prompts, and hand tasks to your agent automatically via a local queue file.

### The Problem

While a CLI agent is running, the terminal is flooded with output: you can't jot down the next idea, screenshots won't paste, and when they do, the model may mix up image order. When a task finishes, you still have to babysit the terminal to feed the next one.

PromptMag is a small always-on-top window. `Alt+Q` summons it; `Ctrl+V` pastes a clipboard image at your cursor (saved to a local file, with an inline `[图1]` anchor); `Ctrl+Enter` queues the task. On copy, the compiler expands anchors into structured text with absolute paths — the model can't misread which image is which. With relay mode on, the queue is mirrored to `~/.prompt-mag/next_tasks.md`; every line the agent ticks off syncs back to the UI in real time.

### Features

- Inline image pinning at the cursor: `[图N]` anchors + local absolute paths; auto-renumbering on delete / drag-reorder
- Storyboard cards: one note per image; click a thumbnail to insert its anchor at the cursor
- Prompt compiler: inline path expansion + a precise bottom mapping table; handles natural references like "the second image"
- Queue: copy & pop / copy only / edit backfill / delete
- Snippet library: high-frequency directives as one-click capsules
- Agent auto-relay: two-way `next_tasks.md` sync via `fs.watch`, optional relay instruction appended on copy
- Floating window: frameless capsule design, always-on-top, 40%–100% opacity, global hotkey

### Compile Example

What you type:

```text
把 [图1] 的导航栏改成 [图2] 的配色
```

What lands on your clipboard:

```text
把 [图1 (本地路径: "C:/Users/you/.prompt-mag/images/img_01.png")] 的导航栏改成 [图2 (本地路径: "C:/Users/you/.prompt-mag/images/img_02.png")] 的配色

---
### 附加上下文图片精确映射（请严格按编号对应读取本地图片文件）：
- 【图1 / 第一张图】路径: "C:/Users/you/.prompt-mag/images/img_01.png" | 针对此图的说明: 当前导航栏
- 【图2 / 第二张图】路径: "C:/Users/you/.prompt-mag/images/img_02.png" | 针对此图的说明: 目标配色
```

If the main input is empty and you only wrote per-image notes, the compiler turns them into step-by-step instructions.

### Quick Start

```bash
git clone https://github.com/HaiLanDuJun/PromptMag.git
cd PromptMag
npm install
npm run dev:all      # dev mode (Vite HMR on port 5199 + Electron)
npm run dev:static   # build the renderer, then launch with no port at all
npm run preview      # production build + run
```

The dev server listens on `5199` (override with `PM_DEV_PORT`) instead of 5173. `npm start`, `npm run dev:static` and packaged builds load `dist/` directly — no dev server needed.

### Package as exe

```bash
npm run dist            # produces two executables under release/
```

- `PromptMag-Portable-x.x.x.exe`: single-file, no installation, double-click to run
- `PromptMag-Setup-x.x.x.exe`: installer wizard with a choosable install directory

A package is just a snapshot of the source; keep coding and re-run `npm run dist` for a new build. User data lives in `~/.prompt-mag/` and survives exe replacement.

### Architecture

Fully local Electron app — no server, no network dependency:

| Process | Stack | Responsibility |
|---------|-------|----------------|
| Main | Node.js (`electron/main.cjs`) | window & hotkeys, clipboard image saving, `data.json` / `next_tasks.md` I/O & watching, local image protocol |
| Renderer | Vue 3 + Vite + Tailwind | composer, image cards, queue, snippets |

### Data Layout

Everything lives in `~/.prompt-mag/`: `images/` for pasted screenshots, `data.json` for queue / snippets / settings, `next_tasks.md` as the relay queue the agent ticks off.

### Roadmap

See [DREAM.md](./DREAM.md) (bilingual).

### License

[MIT](./LICENSE)
