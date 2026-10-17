# PromptMag

CLI 提示词弹夹。为 Claude Code / Codex 等 CLI 编码 Agent 设计的桌面悬浮工具：随时捕获提示词与多张截图，编译成无歧义的图文 Prompt，并通过本地任务文件实现自动接力。

[English](#english) · [中文](#中文)

---

## 中文

### 下载（v1.7.4，Windows x64，开箱即用）

| 包 | 说明 | 路径 |
|------|------|------|
| **绿色版（推荐）** | 双击即用，免安装，数据存 `~/.prompt-mag/` | [`installer/PromptMag-Portable-1.7.4.exe`](/installer/PromptMag-Portable-1.7.4.exe) |
| 安装版 | NSIS 向导安装，可建桌面/开始菜单快捷方式 | [`installer/PromptMag-Setup-1.7.4.exe`](/installer/PromptMag-Setup-1.7.4.exe) |

也可以从 [Releases](https://github.com/HaiLanDuJun/PromptMag/releases) 页面直接下载。下载后双击运行，默认 `Alt+Q` 呼出悬浮窗。

### 解决什么问题

用 CLI Agent 干活时，终端被滚动输出占着：想法来了没法随手记，截图贴不进终端，好不容易贴进去还怕模型认错图片顺序；任务跑完一单，还得守在屏幕前手动传下一棒。

PromptMag 是一个置顶小窗。`Alt+Q` 呼出，`Ctrl+V` 在光标处贴图（自动落盘为本地文件并插入 `[图1]` 锚点），`Ctrl+Enter` 入队。复制时编译器把锚点展开成带绝对路径的结构化文本，模型不会认错图。开启「接力」后，队列实时写入 `~/.prompt-mag/next_tasks.md`，Agent 每勾掉一行，界面同步一行。

### 功能

- 光标处内联贴图：`[图N]` 锚点 + 本地绝对路径；删除、拖拽重排后自动改号
- 图片分镜卡片：每张图一条批注；点击缩略图可在光标处补插锚点
- Prompt 编译器：内联路径展开 + 底部精确映射表，兼容「第二张图」这类口语指代
- **待发队列状态流转**：清晰显示「待使用 / 已使用」状态标签，点击自由切换，支持一键全部重置为待用；快捷键弹出时智能提示剩余待用数量
- **清爽输入面板**：移除了输入框下方拥挤局促的横排词库条，专注高效输入与图文锚定
- **专属收藏夹弹窗（直接贴入光标）**：全新设计独立悬浮弹窗，全局快捷键呼出，实时关键词过滤，↑↓ 键盘选择、Enter 一键复制并直接自动粘贴到当前前台应用（VS Code/微信/浏览器/终端等）光标处
- Agent 自动接力：`next_tasks.md` 双向同步（`fs.watch`），复制时可选注入接力指令
- 悬浮窗：无边框深色圆球（青色发光核心）造型、置顶、透明度 40%–100%、全局快捷键
- 置顶开关三处可达：完整窗口标题栏图钉、快捷面板图钉、托盘菜单「窗口置顶」（状态写入 `data.json`）
- `Ctrl+V` 智能粘贴：剪贴板是图片则落盘并插入 `[图N]` 锚点，是纯文本则直接粘贴到光标处
- **自定义全局快捷键**（设置面板可录制）：
  - 「呼出专属收藏夹」（默认 `Alt+C`）：呼出专属常用提示词弹窗，选中直接复制并自动粘贴到当前窗口光标处
  - 「弹出最旧未用」（默认 `Alt+V`）：一键复制弹夹里最老的未使用提示词并自动标记为已使用，按一次消耗一条
  - 「收录选中文字」（默认 `Alt+S`）：在其他应用里选中文字后按下，自动收藏进词库（后台借用剪贴板并自动还原，不打扰用户）

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

### 打包与更新 exe

每次项目代码修改或更新后，运行一行命令即可一键完成构建与打包：

```bash
npm run update:exe    # 或 npm run dist：构建前端并打包，自动将最新 exe 同步至 installer/
```

- 该命令会自动清除旧构建、执行 `vite build`、通过 `electron-builder` 产出绿色版与安装版，并由 `scripts/sync-installer.cjs` 自动清理旧版本并将最新版复制到 `installer/`。
- `installer/PromptMag-Portable-x.x.x.exe`：单文件免安装绿色版，双击即用
- `installer/PromptMag-Setup-x.x.x.exe`：安装向导版，可自选安装目录与桌面快捷方式
- 用户配置与队列数据默认保存在 `~/.prompt-mag/`，替换或更新 exe 均不影响既有数据。

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
| 圆球 `capsule` | 56×56 深色圆球（青色发光核心） | 悬停或点击即开输入面板；按住拖动可移动（点击与拖拽互不干扰）；靠近边缘自动缩进，只露约 20px |
| 快捷输入 `quick` | 400×210 | 类输入法悬浮窗：可直接打字、`Ctrl+V` 粘贴文字或图片、`Ctrl+Enter` 存弹夹 |
| 完整 `full` | 396×640（可拉伸） | 队列 / 词库 / 图片分镜批注全功能 |

- 鼠标移出快捷面板约 0.18 秒极速自动收回圆球；正在输入（窗口持有焦点）时不收起
- **边缘缩进（0 侵入）**：失焦且靠近屏幕边缘（<90px）时自动缩进到最近的边，只露约 20px（圆球）/ 26px（面板），
  鼠标移到露出的部分即滑回原位（判定基于真实光标位置，不依赖窗口事件）；收成圆球后会重新排队缩进
- **置顶自愈**：每 2s 检测一次，若被全屏/游戏/远控类窗口挤出 TOPMOST 则自动重新置顶（掉线时才动作）
- 拖拽期间禁用悬停响应，拖拽不打断、不误触
- 窗口位置、尺寸与形态自动记忆

### 路线图

见 [DREAM.md](./DREAM.md)（中英双语）。

### License

[MIT](./LICENSE)

---

## English

A desktop floating tool for people working with CLI coding agents (Claude Code / Codex, etc.). Capture prompts and screenshots the moment ideas strike, compile them into unambiguous image-text prompts, and hand tasks to your agent automatically via a local queue file.

### Download (v1.7.4, Windows x64)

- **Portable (recommended)**: [`installer/PromptMag-Portable-1.7.4.exe`](/installer/PromptMag-Portable-1.7.4.exe) — no install needed
- Installer: [`installer/PromptMag-Setup-1.7.4.exe`](/installer/PromptMag-Setup-1.7.4.exe)

Or grab the latest build from [Releases](https://github.com/HaiLanDuJun/PromptMag/releases).

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
- Floating window: frameless dark orb with glowing core, always-on-top, 40%–100% opacity, global hotkey

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
