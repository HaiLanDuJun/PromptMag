# PromptMag

CLI 提示词弹夹。为 Claude Code / Codex / AGY 等 CLI 编码 Agent 设计的桌面悬浮工具：随时捕获提示词与多张截图，编译成无歧义的图文 Prompt，通过多项目弹夹与多 Agent 安全互斥接力实现全自动编码协作。

[English](#english) · [中文](#中文)

---

## 中文

### 下载（v1.9.10，Windows x64，开箱即用）

| 包 | 说明 | 路径 |
|------|------|------|
| **绿色版（推荐）** | 双击即用，免安装，数据存 `~/.prompt-mag/` | [`installer/PromptMag-Portable-1.9.10.exe`](/installer/PromptMag-Portable-1.9.10.exe) |
| 安装版 | NSIS 向导安装，支持中英双语选择，可建桌面/开始菜单快捷方式 | [`installer/PromptMag-Setup-1.9.10.exe`](/installer/PromptMag-Setup-1.9.10.exe) |

也可以从 [Releases](https://github.com/HaiLanDuJun/PromptMag/releases) 页面直接下载。下载后双击运行，默认 `Alt+Q` 呼出悬浮窗。

### 解决什么问题

用 CLI Agent 干活时，终端被滚动输出占着：想法来了没法随手记，截图贴不进终端，好不容易贴进去还怕模型认错图片顺序；多 Agent（如 Claude Code、Codex、AGY）协同修改代码时，缺乏写入排他互斥机制容易冲掉文件；任务跑完一单，还得守在屏幕前手动传下一棒。

PromptMag 是一个置顶小窗。`Alt+Q` 呼出，`Ctrl+V` 在光标处贴图（自动落盘为本地文件并插入 `[图1]` 锚点），`Ctrl+Enter` 入队。复制时编译器把锚点展开成带绝对路径的结构化文本，模型绝不认错图。开启「接力」后，各项目弹夹队列实时写入本地任务文件，多 Agent 遵循单写多读互斥锁安全接力，界面与终端实时双向同步。

### 核心功能

- **多项目弹夹与独立队列隔离**：
  - 支持按项目或工作区新建专属弹夹，相互隔离互不干扰；
  - 任务保存支持弹窗选择目标弹夹，或直接存入当前/默认弹夹；
  - 每个弹夹拥有专属的接力任务文件与历史队列。
- **多 Agent 安全接力与互斥写锁**：
  - **单写多读锁机制**：文件修改类任务同一时刻仅限一个 Agent 独占（写锁保护），读取类任务支持多 Agent 并发；写锁释放后自动触发接力交接；
  - **三态流转（pending → doing → done）**：清晰呈现任务正在被谁执行（Claude、AGY、Codex 等），执行完成后自动记录「谁解决的」与「解决方案」，无缝开启下一棒；
  - **一键复制接力启动提示词**：为每个项目弹夹一键生成量身定制的 Agent 启动指令，完美适配 Claude `loop` 等持续工作机制。
- **⭐ 收藏弹夹与资产永久防删保护**：
  - 常用提示词与高频指令一键收藏入库，收藏弹夹常驻展示在默认弹夹旁；
  - **文件级防删保护**：被收藏的提示词及其关联的截图享有强力防删保护，自动清理或批量删除其他任务时，被引用的图片绝不丢失；
  - **纯净知识库模式**：收藏弹夹自动屏蔽待办/已办流转与出弹控制，专注模板沉淀与一键回填复用。
- **提示词安全编辑模式（防误触覆盖）**：
  - 点击列表提示词弹出确认框，防误触冲掉当前输入框中的新内容；
  - 编辑态下原条目**不提前删除**，列表中常驻显示并带有 `[✏️ 编辑中]` 醒目标签；
  - 取消编辑原样保留，点击「保存修改」（`Ctrl+Enter`）后原地更新文本与图片映射，并自动生成结构化 Prompt 写入剪贴板。
- **弹夹独立定时自动清理策略**：
  - 每个弹夹均可独立设置自动清理周期（3天/7天/30天或“不自动清理”），收藏弹夹永久免疫自动清理；
  - 支持一键「清理未收藏且未使用的提示词与图片」，彻底释放磁盘空间；
  - 清空弹夹具备二次确认防误删提醒。
- **三种出弹模式（弹夹出弹规则自由切换）**：
  - 💥 **霰弹枪模式（默认）**：先进先出（FIFO），最先保存的提示词最先弹出；
  - 🎲 **左轮模式**：轮盘随机，从所有待用提示词中随机挑选一条弹出；
  - 🎯 **手枪模式**：后进先出（LIFO），先入的提示词最后弹出（最新保存的先弹出）；
  - 列表顶部指示胶囊一键循环切换，设置面板提供卡片式切换。
- **中英双语国际化（i18n）**：
  - 安装程序原生支持语言选择（简体中文 / English）；
  - 界面所有组件、设置浮层、托盘菜单、提示气泡全面中英双语化；
  - 编译器输出与接力指令严格贴合所选语言（中文 `[图1]` / 英文 `[Img 1]` 及其双语指令块）；
  - 顶栏一键 `中 / EN` 极速切换。
- **原生级安全光标粘贴**：
  - 独家原生输入辅助组件，智能等待用户物理按键释放，杜绝组合键冲突；
  - 安全激活外部前台应用（微信、VS Code、记事本、Windows Terminal 等），解决粘贴后导致目标窗口异常关闭的问题；
  - 「弹出提示词」（默认 `Alt+V`）：根据出弹模式自动将待办提示词直接粘贴至光标处并标记为已用。
- **光标处内联贴图与提示词编译器**：
  - `[图N]` 锚点 + 本地绝对路径；删除、拖拽重排后自动改号；
  - 复制时自动展开为包含精准多图映射说明的结构化 Prompt，模型无法认错图。
- **悬浮形态与无冲突人体工学快捷键**：
  - 圆球 `capsule` / 快捷输入 `quick` / 完整 `full` 三种形态；
  - 悬停即开、失焦靠近边缘自动缩进（仅露约 20px）、置顶自愈；
  - 快捷键可随时解绑清空，默认左手按键彻底避开微信与常用软件热键。

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
- `installer/PromptMag-Portable-1.9.10.exe`：单文件免安装绿色版，双击即用
- `installer/PromptMag-Setup-1.9.10.exe`：安装向导版，可自选安装目录与桌面快捷方式
- 用户配置与队列数据默认保存在 `~/.prompt-mag/`，替换或更新 exe 均不影响既有数据。

### 架构

纯本地 Electron 桌面应用，无服务端、无网络依赖：

| 进程 | 技术 | 职责 |
|------|------|------|
| 主进程 | Node.js（`electron/main.cjs`） | 窗口与快捷键、剪贴板图片落盘、`data.json` / `next_tasks.md` 读写与监听、本地图片协议 |
| 渲染进程 | Vue 3 + Vite + Tailwind | 输入区、图片卡片、队列、弹夹管理与设置 |

### 数据目录结构

默认 `~/.prompt-mag/`，可改为任意位置：标题栏齿轮 → 「更改…」选择目录，
现有数据会复制到新目录并自动重启应用。配置记录在 `%APPDATA%\prompt-mag\app-config.json`。

```text
<数据目录>/
├── images/            # 贴入的截图（Prompt 中引用绝对路径）
├── data.json          # 弹夹配置、任务队列、窗口设置与自动清理策略
├── next_tasks.md      # 默认接力任务文件（支持项目弹夹独立分发）
├── magazines/         # 项目专属弹夹与任务队列
└── window-state.json  # 窗口位置与形态
```

### 悬浮形态

三种形态，核心是「平时几乎不占屏幕」：

| 形态 | 尺寸 | 说明 |
|------|------|------|
| 圆球 `capsule` | 56×56 深色圆球（青色发光核心） | 悬停或点击即开输入面板；按住拖动可移动（点击与拖拽互不干扰）；靠近边缘自动缩进，只露约 20px |
| 快捷输入 `quick` | 400×210 | 类输入法悬浮窗：可直接打字、`Ctrl+V` 粘贴文字或图片、`Ctrl+Enter` 存弹夹 |
| 完整 `full` | 396×640（可拉伸） | 队列 / 收藏弹夹 / 图片分镜批注全功能 |

- 鼠标移出快捷面板约 0.18 秒极速自动收回圆球；正在输入（窗口持有焦点）时不收起
- **边缘缩进（0 侵入）**：失焦且靠近屏幕边缘（<90px）时自动缩进到最近的边，只露约 20px（圆球）/ 26px（面板），鼠标移到露出的部分即滑回原位；收成圆球后会重新排队缩进
- **置顶自愈**：每 2s 检测一次，若被全屏/游戏/远控类窗口挤出 TOPMOST 则自动重新置顶（掉线时才动作）
- 拖拽期间禁用悬停响应，拖拽不打断、不误触
- 窗口位置、尺寸与形态自动记忆

### 开源交流与支持

如果你觉得 PromptMag 对你的日常开发或 Agent 协作有所帮助，欢迎在设置面板点击跳转或前往 [GitHub 仓库](https://github.com/HaiLanDuJun/PromptMag) 为我们点亮一个 ⭐ Star，这对我们是极大的鼓励！

### 路线图

见 [DREAM.md](./DREAM.md)（中英双语）。

### License

[MIT](./LICENSE)

---

## English

### Download (v1.9.10, Windows x64)

- **Portable (recommended)**: [`installer/PromptMag-Portable-1.9.10.exe`](/installer/PromptMag-Portable-1.9.10.exe) — no install needed, portable mode
- Installer: [`installer/PromptMag-Setup-1.9.10.exe`](/installer/PromptMag-Setup-1.9.10.exe) — with English/Chinese language selection

Or grab the latest build from [Releases](https://github.com/HaiLanDuJun/PromptMag/releases). Default hotkey to summon the window: `Alt+Q`.

### The Problem

While CLI agents (Claude Code, Codex, AGY, etc.) are busy running, terminal outputs flood the screen: you can't jot down the next task, screenshots won't paste, and when they do, models often confuse image sequence. Furthermore, when multiple agents collaborate, concurrent writes can corrupt task files, and manual relay requires constant babysitting.

PromptMag provides an always-on-top floating dock. Press `Alt+Q` to summon, paste screenshots directly at cursor with `Ctrl+V` (saved locally and pinned with `[Img 1]`), and press `Ctrl+Enter` to queue. On copy, the compiler expands anchors into unambiguous absolute file paths with mapping tables. With Relay Mode enabled, multi-agent mutual exclusion locks ensure only one agent writes while others wait or read, creating a seamless automated handoff.

### Core Features

- **Multi-Magazine Project Isolation**:
  - Create dedicated magazines per project or repo with independent queues;
  - Save prompts directly to the active magazine or choose target magazine via modal;
  - Project-level relay tasks prevent cross-project interference.
- **Multi-Agent Relay with Mutex Write Lock**:
  - **Single-Writer Multi-Reader Lock**: File modification tasks are strictly locked by one agent (e.g. Claude Code), while other agents (like AGY) wait or read;
  - **Three-State Workflow (pending → doing → done)**: Tracks which agent claimed the task, records resolution details upon completion, and unlocks the next task;
  - **Relay Startup Prompt Generator**: One-click generation of tailored instructions for agents, fully compatible with continuous loop execution.
- **⭐ Protected Favorites Magazine**:
  - Permanent repository for frequent prompts and instructions right next to the Default Magazine;
  - **File-Level Protection**: Images referenced by favorited prompts are permanently locked against auto-cleanup and batch deletion;
  - **Clean Knowledge Base View**: Strips away pending/done toggle clutter for a distraction-free snippet library.
- **Safe Prompt Editing Mode (Anti-Overwrite Protection)**:
  - Clicking any prompt item prompts a confirmation modal to avoid overwriting current editor inputs;
  - Retains the item in the list marked with `[✏️ Editing]` badge;
  - Cancel keeps original content intact; saving (`Ctrl+Enter`) updates text/images in place and copies the compiled prompt.
- **Independent Magazine Auto-Cleanup**:
  - Configurable retention period per magazine (3/7/30 days or never);
  - One-click clean for unstarred and unused prompts & images;
  - Favorites Magazine is permanently exempt from auto-cleaning.
- **Three Firing Modes (Magazine Rules)**:
  - 💥 **Shotgun Mode (Default)**: First-In First-Out (FIFO) — oldest saved prompt pops first
  - 🎲 **Revolver Mode**: Random chamber — randomly pops any pending prompt
  - 🎯 **Pistol Mode**: Last-In First-Out (LIFO) — newest saved prompt pops first (bottom of magazine fired last)
  - Interactive mode badge on top of queue tab to switch with one click, plus a 3-card selector in Preferences
- **Full Bilingual Support (i18n)**:
  - Installer with English / Simplified Chinese selection
  - Complete UI, settings, system tray, and notifications in English & Chinese
  - Dynamic compiled prompts and Agent relay directives matching your selected language
  - Quick `中 / EN` toggle button on the title bar
- **Safe Hardware-Level Cursor Paste**:
  - Native helper detects physical modifier release to prevent key collision (`Ctrl+Alt+V`)
  - Safely brings external foreground apps (WeChat, VS Code, Notepad, Windows Terminal) into focus without closing or crashing windows
  - Pop Prompt (`Alt+V`): automatically paste next pending prompt directly into active cursor (by active firing mode)
- **Inline Image Pinning**: `[Img N]` anchors + local absolute paths; auto-renumbering on delete / drag-reorder
- **Storyboard Cards & Lightbox**: double-click thumbnail or keyword badge to zoom into full-resolution preview
- **Prompt Compiler**: inline path expansion + precise bottom mapping table
- **Floating Form Factors & Hotkeys**: frameless dark orb with glowing core, always-on-top, 40%–100% opacity, customizable conflict-free global hotkeys

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
npm run update:exe    # produces two executables under installer/
```

- `installer/PromptMag-Portable-1.9.10.exe`: single-file, no installation, double-click to run
- `installer/PromptMag-Setup-1.9.10.exe`: installer wizard with a choosable install directory
- User data lives in `~/.prompt-mag/` and survives exe replacement.

### Architecture

Fully local Electron app — no server, no network dependency:

| Process | Stack | Responsibility |
|---------|-------|----------------|
| Main | Node.js (`electron/main.cjs`) | window & hotkeys, clipboard image saving, `data.json` / `next_tasks.md` I/O & watching, local image protocol |
| Renderer | Vue 3 + Vite + Tailwind | composer, image cards, queue, magazine management & settings |

### Data Layout

```text
<data-dir>/
├── images/            # Pasted screenshots (referenced in prompts via absolute path)
├── data.json          # Magazines, queue, snippets, settings, auto-clean policies
├── next_tasks.md      # Relay queue file
├── magazines/         # Dedicated project magazines
└── window-state.json  # Window positions & mode
```

### Community & Support

If you find PromptMag helpful for your development workflow or Agent orchestration, please give us a ⭐ Star on [GitHub](https://github.com/HaiLanDuJun/PromptMag)!

### Roadmap

See [DREAM.md](./DREAM.md) (bilingual).

### License

[MIT](./LICENSE)
