# 🎯 PromptMag — DREAM

<div align="center">

**“别让你的灵感，排在 Agent 的进度条后面。”**
*Don't let your ideas wait for the progress bar.* 🔫

</div>

<p align="center">
  <b><a href="#-english">English</a></b>&nbsp;&nbsp;|&nbsp;&nbsp;<b><a href="#-中文">中文</a></b>
</p>

---

<!-- ==================== English ==================== -->

## 🇺🇸 English

> **Think faster than your Agent runs. Load your next shot, pin the images, and let the CLI auto-relay.**
>
> *A floating tactical prompt magazine for CLI coding agents — Claude Code / Codex / Antigravity friendly.*

### ⚡ Elevator Pitch (3 seconds)

A tiny floating window beside your terminal: press `Alt+Q`, pin multiple screenshots **precisely where your cursor is** (`[图1]`, `[图2]`...), and your AI agent — after finishing its current task — reads the queue file and picks up the next job all by itself.

### 🌐 Official Website

**[promptmag.dev](https://promptmag.dev)** — the project's bilingual landing page: what PromptMag is, the three eject modes (Shotgun / Revolver / Pistol), and download links. Pure static page deployed on Vercel; source lives in [`website/`](website/).

### 🌌 Why This Tool Exists

The AI-agent era introduced a subtle mismatch into our workflow:

- **Before**: the bottleneck was *how fast you could type*.
- **Now**: the bottleneck is *the minutes you wait for the agent to think and finish*.

During those minutes, your brain refuses to stop:

1. **Ideas overflow.** Watching it refactor an API, you suddenly recall the next page needs a style tweak, and the unit tests after that. But the terminal is scrolling wildly — you can't type into it, and sticky notes get messy fast.
2. **Pasting images is maddening.** You want to say "make the button in image 1 match the color in image 2, and fix the error in image 3." Half the time the CLI refuses image pastes at all; when it accepts them, you're stuck writing a paragraph explaining which image is which — terrified the model will mix up the order.
3. **Relay duty chains you to the desk.** You already know the next three steps, yet you must babysit the agent, wait for step one to finish, then manually copy-paste step two.

**Your most precious resource — flow — gets shredded by "waiting" and "paste failed."**

That's why PromptMag exists. We don't need another bloated notes app. We need a **tactical magazine clipped to your belt**.

### 🧠 Core Philosophy

| # | Principle | What it means |
|---|-----------|---------------|
| 1 | **Zero-Friction Capture** | Ideas have a 5-second shelf life. `Alt+Q` summons the window instantly; `Ctrl+Enter` chambers the round and the window vanishes. Never one extra click, never covering the code you're watching. |
| 2 | **Inline Pinning, Zero Ambiguity** | Humans point at things: "change *this* `[图1]` to look like *that* `[图2]`." You paste where you mean it — or drop a one-line note under each thumbnail. Path conversion, renumbering, and structured assembly are handled silently by the built-in **Prompt Compiler**. |
| 3 | **Fire and Forget** | You spray ideas; the agent clears the magazine in order. Through a minimal `next_tasks.md` two-way handshake, the agent ticks off finished tasks and bites into the next one — while you go make coffee. |

### 🚀 Dream Roadmap

#### 🌱 Phase 1 — Sharp Edge (MVP)

- [x] Minimal dark always-on-top floating window, summoned by `Alt+Q`
- [x] Silent clipboard-image interception, auto-saved to local absolute paths
- [x] Inline `[Img N]` anchors at the cursor + storyboard thumbnail cards with per-image notes
- [x] Zero-ambiguity Prompt Compiler (inline path expansion + bottom precise mapping table)
- [x] Agent auto-relay mode based on `next_tasks.md` + `fs.watch`

#### 🌿 Phase 2 — Tactical Workflow (v1.8 ~ v1.9, Achieved)

- [x] **Tri-form tactical dock**: `56px` glass orb (capsule), `440x195` slim input bar (quick), and full command deck (`420x560`) with automatic screen-edge tucking
- [x] **Multi-magazine project isolation**: create dedicated magazines per project/repo with separate queues & independent `magazines/<id>/tasks.md` files
- [x] **Three tactical firing modes**: 💥 Shotgun (FIFO), 🎯 Pistol (LIFO), 🎲 Revolver (Random chamber)
- [x] **⭐ Protected Favorites magazine**: permanent repository for snippets & instructions, image deletion protection, distraction-free view
- [x] **Safe prompt editing mode**: confirmation modal prevents accidental overwrites, in-place editing with `[Editing]` badge
- [x] **Autonomous multi-agent relay engine**: non-stop autonomous loop rule, mutex write locks with 3-5s wait-monitoring, dynamic new prompts discovery, and 1-click startup generator for Claude Code / Antigravity / General CLI agents
- [x] **Streamlined single-row tactical layout & zero-friction chip re-editing (v1.9.7)**: eliminated clumsy toolbar wrapping by elevating relay actions to magazine bar, and perfected secondary in-place keyword editing with cursor jump prevention & IME composition protection
- [x] **QuickPanel magazine indicators & keyboard switching (v1.9.8)**: real-time magazine status pill (color dot, title, pending count) with dropdown list; instant switching via `Ctrl+Tab`, `Ctrl+M`, `Ctrl+1~9` shortcuts right while typing; direct queue routing on save
- [x] **Reliable foreground HWND tracking & hotkey pop pasting (v1.9.8)**: 64-bit native HWND matching with `lastExternalHwnd` fallbacks, eliminating self-paste swallowing and premature task-done flags; seamless thumbnail-chip lifecycle sync on image deletion

- [x] **In-app version display & GitHub Releases auto-updater (v1.9.9)**: in-settings version badge with silent auto-check & manual refresh, release notes update modal, with instant install, ignore version, and remind me later options
- [x] **Categorized Settings deck & customizable magazine cycling hotkey (v1.9.10)**: restructured Settings into 4 dedicated tabs (Default, Hotkeys, Storage, Version/GitHub), customizable `hotkeyCycleMag` with global capture across full window and prompt/image queue list, QuickPanel 1-click expander, and external window refocus stabilization

- [x] **Default floating dock mode, taskbar icon toggle & storage cleanup polish (v1.9.11)**: default floating window launch with desktop taskbar icon suppression, customizable window scaling standard (floating dock vs original full deck), pre-filled default hotkeys, and excluded favorites from storage auto-cleanup

- [x] **Markdown release notes rendering & official site update redirection (v1.9.12)**: in-app release notes now render complete rich Markdown (headings, lists, code badges), and clicking "Update Now" redirects directly to official site https://promptmag.dev/ for instant downloads

- [x] **Capsule orb toast overlay & visual clipping fix (v1.9.13)**: eliminated erroneous toast messages clipping and text bleeding into 56px floating orb, auto-clearing toast state upon collapse to preserve clean glass sphere aesthetics

- [x] **Window scale mode baseline & edge auto-collapse fix (v1.9.14)**: fully resolved "Default to Floating Window" setting not applying to full window tucking, automatically scaling full window to floating capsule/panel upon edge tuck or blur instead of docking a 520px full window strip

- [x] **Silent hotkey pop in floating mode (v1.9.15)**: suppressed intrusive empty/all-done toast notifications and eliminated auto-expansion to quick panel when popping prompts in floating window (capsule / quick) states

- [x] **TitleBar & Settings gear render restoration (v1.9.16)**: fixed runtime setup reference error in TitleBar component, restoring full top bar with settings gear, pin, opacity, and window control buttons

- [x] **In-app seamless auto-update with user confirmation (v1.9.17)**: enabled native in-app package downloading with animated glowing progress bar, speed/size metrics, and user confirmation before downloading and restarting, completely eliminating external browser redirects
- [x] **Single-line pop guarantee & CLI multi-request elimination (v1.9.18)**: completely flattened multiline prompt text into clean single-line strings during pop, preventing terminal emulators (Antigravity CLI, PowerShell, Gemini CLI, Claude Code) from interpreting newlines as separate Enter triggers; added 600ms hotkey debounce and concurrency mutex

#### 🌳 Phase 3 — The Next Horizons (v2.0+)

- [ ] **Screenshot visual annotations & crop**: draw red boxes, crop, or highlight directly on thumbnail cards before firing
- [ ] **Native MCP Server engine**: lightweight built-in MCP server exposing `get_next_prompt()`, `claim_task()`, `complete_task()` directly to Claude Code, Cursor, Windsurf, and Antigravity
- [ ] **Multi-Agent concurrent dispatch deck**: visual split-deck coordinating frontend, backend, and QA agents running in parallel across workspaces

### 💬 To Everyone Building the Future from a Terminal

The highest form of a tool is that you forget it exists and only feel your mind extended.

May this little floating window catch every flash of brilliance you have — and keep your thinking forever one step ahead of the compute.

**Load your thoughts. Let the Agent cook.** 🔫✨

---

<!-- ==================== 中文 ==================== -->

## 🇨🇳 中文

> **脑子比 Agent 快？把下一个灵感压进弹夹，让 CLI 自动接力连发。**
>
> *专为 Claude Code / Codex / Antigravity 打造的悬浮战术弹夹。*

### ⚡ 电梯演讲（3 秒看懂）

一个悬浮在终端旁的小窗：按 `Alt+Q` 呼出，把多张截图**精准钉在光标所在的位置**（`[图1]`、`[图2]`…），跑完当前任务的 AI Agent 会自己去读队列文件，咬住下一单继续干。

### 🌐 官方网站

**[promptmag.dev](https://promptmag.dev)** ——项目的中英双语落地页：介绍 PromptMag 是什么、三种出弹模式（霰弹枪 / 左轮 / 手枪），以及下载入口。纯静态页面，部署在 Vercel 上；源码在 [`website/`](website/) 目录。

### 🌌 为什么要做这个工具？

进入 AI Agent 编程时代后，我们的工作流发生了一个微妙的错位：

- **以前**写代码，瓶颈在**“敲键盘的手速”**；
- **现在**用 CLI Agent 写代码，瓶颈变成了**“等待 Agent 思考和跑完当前任务的那几分钟”**。

在这几分钟里，脑子并没有停下：

1. **灵感在溢出**：看着它改接口，你突然想到下一个页面样式要微调、再下一个单元测试要补齐。但终端正在疯狂滚动输出，没法打字，写在记事本里又乱又碎。
2. **贴图在抓狂**：你想说“把图1的按钮改成图2的颜色，顺便修掉图3的报错”。结果 CLI 窗口死活粘贴不进图片；就算贴进去了，也得战战兢兢写一堆废话解释哪张是哪张，生怕大模型张冠李戴。
3. **接力靠死守**：明明已经想好了后面三步，却必须守在屏幕前等它跑完第一棒，再手动复制粘贴第二棒。

**人类最宝贵的心流，就这样被撕碎在一次次的“等待”和“粘贴报错”里。**

这就是 PromptMag 诞生的原因。我们不需要另一个笨重的笔记软件，我们需要一个挂在腰间的**战术弹夹**。

### 🧠 核心设计哲学

| # | 原则 | 含义 |
|---|------|------|
| 1 | **零摩擦捕获** | 灵感只有 5 秒保质期。`Alt+Q` 窗口秒现；`Ctrl+Enter` 子弹入膛、窗口隐身。绝不让你多点一次鼠标，绝不遮挡你正在观察的代码。 |
| 2 | **所见即所指，零歧义** | 人类说话是指着东西说的：“把这个 `[图1]` 改成那个 `[图2]`”。你在哪粘贴，图就钉在哪；或者在截图下面甩一句批注。路径转存、编号对齐、结构化组装，全部交给底层**提示词编译器**静默完成。 |
| 3 | **异步接力，把“监工”变成“派单”** | 你负责密集输出想法，Agent 负责按序清空弹夹。通过 `next_tasks.md` 双向握手，Agent 干完一单自动划掉清单、无缝咬住下一单——你只管去泡咖啡。 |

### 🚀 梦想路线图

#### 🌱 Phase 1：利器出鞘（MVP 阶段 · 已实现）

- [x] 极简暗黑置顶悬浮窗，`Alt+Q` 闪现呼出
- [x] 剪贴板图片静默拦截，自动转存本地绝对路径
- [x] 光标处内联 `[图N]` 锚点 + 缩略图分镜单句批注
- [x] 无歧义 Prompt 编译器（正文内联路径展开 + 底部精准映射表）
- [x] 基于 `next_tasks.md` 与 `fs.watch` 的 Agent 自动接力模式

#### 🌿 Phase 2：丝滑进化与战术闭环（v1.8 ~ v1.9 · 已全部实现）

- [x] **三形态无缝切换与边缘吸附**：`56px` 灵动玻璃球（胶囊）+ `440x195` 快捷输入条 + 完整战术工作台，支持屏幕边缘半缩进自动贴边
- [x] **项目级多弹夹队列隔离**：支持按项目创建独立弹夹，各弹夹拥有独立队列与专属 `magazines/<id>/tasks.md`，保存支持弹窗选项目标弹夹
- [x] **三大战术出弹模式**：💥 霰弹枪（先进先出 FIFO）、🎯 手枪（后进先出 LIFO）、🎲 左轮（轮盘随机抽弹）
- [x] **⭐ 常用收藏弹夹与图片防删保护**：独立副本收藏机制、图片文件级防删保护、纯净知识库视图
- [x] **提示词安全防覆盖编辑**：点击二次弹窗确认、原位编辑 `[✏️编辑中]` 标识、安全更新不丢历史
- [x] **多 Agent 全自动接力闭环引擎**：无人值守自主循环、互斥写锁监控等待循环（3~5秒重读）、动态新词感知与一键生成专属接力启动指令（适配 Claude Code / Antigravity agy / 通用 Agent）
- [x] **流线型单行战术排版与框内关键词零摩擦重编（v1.9.7）**：接力启动归位顶层弹夹控制区彻底告别换行凌乱，彻底解决图片关键词框二次编辑光标跳动与失焦问题，支持 IME 防抖与 `Ctrl+Enter` 原地快速提交
- [x] **快捷弹窗实时弹夹信息与全局快捷切换（v1.9.8）**：快捷录入窗顶部常驻弹夹状态徽章（色彩、名称、待用数），支持打字时免切出使用 `Ctrl+Tab`、`Ctrl+M`、`Ctrl+1~9` 极速切换弹夹，回车直接存入当前目标弹夹
- [x] **前台句柄智能嗅探与热键弹出粘贴防吞（v1.9.8）**：彻底修复 64 位原生 HWND 判定失效导致的自吞粘贴与过早标记问题，引入外部历史句柄追踪与鼠标悬停双重保底；完善图片删除/清空与框内关联卡片生命周期联动
- [x] **应用内版本号展示与 GitHub Releases 自动检测更新（v1.9.9）**：设置面板直观回显当前版本与更新状态，启动自动静默比对与手动一键检查，新版本发行说明弹窗提醒，支持「立即更新」、「忽略此版本（不再弹窗）」与「稍后提醒」自由掌控
- [x] **设置面板四大分类重构与全场景快速换弹自定义（v1.9.10）**：将设置重构为「默认设置」、「快捷键」、「存储管理」、「版本与更新（含 Git 仓库）」四大专属 Tab 告别冗长滚动；支持用户自定义快速换弹快捷键（`hotkeyCycleMag`），且在图片列表队列中全局随时响应 `Ctrl+Tab` 极速换弹；快捷面板新增一键展开完整面板，并彻底解决编辑提交后快捷键首次弹出失效的焦点恢复问题

- [x] **默认悬浮窗启动、桌面栏图标隐藏与缩放基准配置（v1.9.11）**：默认以紧凑悬浮窗开启并在桌面任务栏隐藏图标；支持设置窗口缩放基准（默认缩放为悬浮窗 vs 原窗口缩放）；默认快捷键自动预填防空；存储管理自动清理彻底排除收藏夹

- [x] **更新日志 Markdown 排版渲染与官网跳转下载（v1.9.12）**：更新提醒弹窗支持完整 Markdown 富文本渲染（标题、列表、加粗、代码块完美排版）；点击「立即前往下载更新」一键跳转至官网 https://promptmag.dev/ 极速下载

- [x] **悬浮球 Toast 提示文字遮挡截断修复（v1.9.13）**：彻底修复收起为 56px 悬浮球图标时全局 Toast 提示文本在球体内文字错位截断遮挡的显示问题，收起时自动清除残留 Toast 保持纯净通透徽标

- [x] **窗口缩放基准配置生效与贴边/失焦自动缩放为悬浮窗修复（v1.9.14）**：彻底解决设置「默认缩放为悬浮窗」后贴边与失焦依旧按原大窗口缩进的问题；选择后贴边或离开自动缩放为精致悬浮窗/悬浮球，关闭设置自动回缩，杜绝 520px 原窗口长黑条遮挡

- [x] **悬浮窗状态静默出弹与免弹窗提示优化（v1.9.15）**：在悬浮窗状态（悬浮球或快捷面板）下按出弹热键且弹夹已耗尽或为空时，不再强制展开面板也不再弹出提示 Toast，实现完全静默防打扰体验

- [x] **顶栏标题栏与设置按钮恢复修复（v1.9.16）**：修复 TitleBar 组件 setup 缺失导入导致的挂载异常，完整恢复顶部标题栏、设置齿轮 ⚙️、置顶钉子、透明度滑块及窗口控制按钮

- [x] **应用内原生自动升级与用户确认流程（v1.9.17）**：彻底摆脱跳转外部浏览器，支持在应用内直接流式下载更新包，配备发光进度条、网速与大小指示；下载前与重启前严格需用户主动确认，升级更平滑无感
- [x] **出弹单行保证与终端换行防多次请求（v1.9.18）**：彻底平铺压缩出弹提示词内的所有换行符为单行指令，根除终端/CLI（Antigravity、PowerShell、Gemini CLI、Claude Code）将换行解析为多次回车而触发多次请求的问题；增加 600ms 出弹热键防抖与并发互斥锁，并在出弹后与已用清理即时联动

#### 🌳 Phase 3：终极形态与未来愿景（v2.0+ · 筹划中）

- [ ] **截图快速涂鸦与红框画笔**：在缩略图卡片上直接画红框、标箭头、局部裁剪，保存时自动更新本地图片
- [ ] **原生内置 MCP Server 引擎**：内置轻量级 MCP Server，向 Claude Code、Cursor、Windsurf、Antigravity 暴露标准工具 `get_next_prompt()`、`claim_task()`、`complete_task()`，实现毫秒级零上下文损耗原生调度
- [ ] **多 Agent 并发指挥舱**：可视化分栏调度台，前端 Agent、后端 Agent、测试 Agent 并发接力协同作战

### 💬 致同样在用 CLI 创造未来的你

工具的最高境界，是让你忘记工具的存在，只感受到思维的延伸。

希望这个小小的悬浮窗，能接住你每一个一闪而过的绝妙点子，让你的思维永远跑在算力的前面。

**Load your thoughts. Let the Agent cook.** 🔫✨
