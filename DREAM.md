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

#### 🌱 Phase 1 — Sharp Edge (MVP, current)

- [x] Minimal dark always-on-top floating window, summoned by `Alt+Q`
- [x] Silent clipboard-image interception, auto-saved to local absolute paths
- [x] Inline `[图N]` anchors at the cursor + storyboard thumbnail cards with per-image notes
- [x] Zero-ambiguity Prompt Compiler (inline path expansion + bottom precise mapping table)
- [x] Agent auto-relay mode based on `next_tasks.md` + `fs.watch`

#### 🌿 Phase 2 — Workflow Mastery

- [ ] **Dual-form switch**: a slim `420px` tactical bar by default; one click expands into a widescreen dashboard for long-form architecture prompts and snippet libraries
- [ ] **Per-project queue isolation**: auto-detect the active git repo / working directory so different projects never share a magazine
- [ ] **Screenshot doodles**: draw a red box or arrow right on the thumbnail card; saving overwrites the local image for sharper visual guidance

#### 🌳 Phase 3 — The Ultimate Vision

- [ ] **Native MCP server engine**: a featherweight built-in MCP service so any MCP-capable agent can call `pop_next_prompt()` — millisecond, zero-context-loss handoffs
- [ ] **Multi-agent dispatch deck**: magazine #1 feeds the frontend agent styling tasks, magazine #2 feeds the backend agent API work — a one-person command deck

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

#### 🌱 Phase 1：利器出鞘（MVP，当前阶段）

- [x] 极简暗黑置顶悬浮窗，`Alt+Q` 闪现呼出
- [x] 剪贴板图片静默拦截，自动转存本地绝对路径
- [x] 光标处内联 `[图N]` 锚点 + 缩略图分镜单句批注
- [x] 无歧义 Prompt 编译器（正文内联路径展开 + 底部精准映射表）
- [x] 基于 `next_tasks.md` 与 `fs.watch` 的 Agent 自动接力模式

#### 🌿 Phase 2：丝滑进化

- [ ] **双形态无缝切换**：平时是 `420px` 窄条战术悬浮窗；一键展开为宽屏工作台（Dashboard），从容管理长篇架构 Prompt 与高频词库
- [ ] **项目级队列隔离**：自动识别当前活跃的 Git 仓库或工作目录，不同项目的待办弹夹互不串台
- [ ] **截图涂鸦直通车**：在缩略图卡片上直接画个红框、打个箭头，保存时自动覆写本地图片，让视觉引导更精准

#### 🌳 Phase 3：终极形态

- [ ] **原生 MCP Server 引擎**：内置极轻量 MCP 服务，任何支持 MCP 的 Agent 都能原生调用 `pop_next_prompt()`，实现毫秒级零上下文损耗的任务交接
- [ ] **多 Agent 并发调度台**：1 号弹夹喂给前端 Agent 调样式，2 号弹夹喂给后端 Agent 写接口，实现“一人成军”的并发指挥舱

### 💬 致同样在用 CLI 创造未来的你

工具的最高境界，是让你忘记工具的存在，只感受到思维的延伸。

希望这个小小的悬浮窗，能接住你每一个一闪而过的绝妙点子，让你的思维永远跑在算力的前面。

**Load your thoughts. Let the Agent cook.** 🔫✨
