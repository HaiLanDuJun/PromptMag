<div align="center">

# 🎯 PromptMag

**CLI 提示词弹夹 · The Tactical Prompt Magazine for CLI Coding Agents**

**脑子比 Agent 快？把下一个灵感压进弹夹，让 CLI 自动接力连发。**

[English](#-english) | [中文](#-中文)

</div>

---

## 🇺🇸 English

A tiny always-on-top floating window for people who work with CLI coding agents (Claude Code / Codex / Antigravity). Capture prompts and screenshots the instant ideas strike — without fighting the terminal — then let your agent consume them in order, all by itself.

### ✨ Features

- **📌 Inline image pinning** — `Ctrl+V` pastes the clipboard image and inserts an `[图N]` anchor **exactly at your cursor**. The compiled prompt embeds local absolute paths, so the model can never mix up image order.
- **🖼 Storyboard note cards** — every screenshot gets a numbered thumbnail card with a one-line note field; drag to reorder, delete to auto-renumber (tokens in your text are synced automatically).
- **⚙️ Zero-ambiguity Prompt Compiler** — inline tokens are expanded to `[图1 (本地路径: "...")]` in place, and a precise bottom mapping table is appended — natural-language references like "the second image" are covered too.
- **⚡ Magazine queue** — `Ctrl+Enter` chambers a task; copy & pop, copy only, edit-backfill, or delete from the floating queue.
- **📚 Snippet library** — high-frequency directives as one-click capsules inserted at the cursor.
- **🤖 Agent auto-relay** — the queue is mirrored to `~/.prompt-mag/next_tasks.md`; when the agent finishes a task it flips `- [ ]` to `- [x]`, and the UI updates in real time via `fs.watch`. Copied prompts can carry a relay instruction telling the agent to read the queue file next.
- **🕶 Ghost mode** — frameless dark floating window, `Alt+Q` global summon, opacity 40%–100%, always-on-top toggle.

### 🚀 Quick Start

```bash
git clone https://github.com/HaiLanDuJun/PromptMag.git
cd PromptMag
npm install
npm run dev:all    # dev mode (Vite HMR + Electron)
npm run preview    # production build + run
```

> Windows screenshot tools often steal focus — the **🖼 贴图** button in the composer is a manual fallback for pasting clipboard images.

### 📁 Data Layout

Everything lives in `~/.prompt-mag/`:

```
~/.prompt-mag/
├── images/          # pasted screenshots (referenced by absolute path)
├── data.json        # queue / snippets / window settings
└── next_tasks.md    # auto-relay queue file (agent ticks off tasks here)
```

### 🗺 Roadmap

See [DREAM.md](./DREAM.md) for the full vision (bilingual).

---

## 🇨🇳 中文

一个为 CLI 编码 Agent（Claude Code / Codex / Antigravity）用户打造的置顶悬浮小窗。灵感闪现的瞬间就把它和多张截图一起捕获——不用跟终端搏斗——然后让 Agent 自己按顺序消化。

### ✨ 功能

- **📌 光标处内联贴图**：`Ctrl+V` 将剪贴板图片落盘并在**光标所在位置**插入 `[图N]` 锚点；编译后的 Prompt 内嵌本地绝对路径，模型绝不认错图片顺序。
- **🖼 图片分镜卡**：每张截图一张带角标的缩略图卡 + 单行批注框；拖拽调序、删除自动重排编号，正文中的 `[图N]` 标记同步更新。
- **⚙️ 无歧义 Prompt 编译器**：内联标记原地展开为 `[图1 (本地路径: "...")]`，末尾自动追加精准映射表；口语化的“第二张图”也有对应提示。
- **⚡ 待发弹夹队列**：`Ctrl+Enter` 入膛；支持复制并弹出、仅复制、编辑回填、删除。
- **📚 常用词库**：高频指令一键胶囊，点击插入光标处。
- **🤖 Agent 自动接力**：队列实时镜像到 `~/.prompt-mag/next_tasks.md`；Agent 完成任务把 `- [ ]` 勾成 `- [x]`，界面经 `fs.watch` 实时同步状态；复制时可自动附上接力指令。
- **🕶 幽灵模式**：无边框暗黑悬浮窗、`Alt+Q` 全局呼出、透明度 40%~100%、置顶开关。

### 🚀 快速开始

```bash
git clone https://github.com/HaiLanDuJun/PromptMag.git
cd PromptMag
npm install
npm run dev:all    # 开发模式（Vite 热更新 + Electron）
npm run preview    # 生产构建 + 运行
```

> Windows 截图工具常抢焦点，输入区的 **🖼 贴图** 按钮是手动兜底。

### 📁 数据布局

所有数据都在 `~/.prompt-mag/`：`images/` 存图片、`data.json` 存状态、`next_tasks.md` 供 Agent 自动接力勾选。

### 🗺 路线图

完整愿景见 [DREAM.md](./DREAM.md)（中英双语）。

---

## 📄 License

[MIT](./LICENSE) © 2026 HaiLanDuJun
