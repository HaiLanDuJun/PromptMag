/**
 * compilePrompt - 面向 CLI 大模型的「无歧义 Prompt 编译器」
 * 支持双语（中文 / 英文），完全根据用户设定的语言生成规范结构化 Prompt
 *
 * 设计目标：让 CLI 端大模型 100% 不会认错图片顺序。
 *  1. 正文内联展开：`[图N]` -> `[图N (本地路径: "绝对路径")]` 或 `[Img N (Local Path: "path")]`
 *  2. 底部精确索引表：无论用户写的是内联 `[图N]` 还是口语「第一张图 / 1st image」，都生成严谨映射块
 *  3. 纯图片批注模式：正文几乎为空、批注为主时，自动汇总为分步指令列表
 *  4. 自动接力 Hook：开启后追加读取 next_tasks.md 的系统指令
 */
import { currentLocale } from './i18n.js'

export const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

export const TOKEN_RE = /\[(?:图|Img|Image)\s*(\d+)(?:\s*[:：]\s*([^\]]*))?\]/gi
const EXPANDED_RE = /\[(?:图|Img|Image)\s*\d+\s*\((?:本地路径|Local Path):\s*"[^"]*"\)(?::\s*[^\]]*)?\]/gi
const ORDINAL_RE_ZH = /第[一二三四五六七八九十1-9]+\s*张图|图\s*[1-9]\s*(?=[的地中里面上和与,，。]|$)/
const ORDINAL_RE_EN = /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s*(?:image|img|pic|picture|photo)\b|\b(?:image|img|pic)\s*\d+\b/i

export function cnNum(n) {
  if (n <= 10) return CN_NUM[n]
  if (n < 20) return '十' + CN_NUM[n - 10]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return CN_NUM[tens] + '十' + (ones ? CN_NUM[ones] : '')
}

export function enOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function validImages(task) {
  return ((task && task.images) || []).filter((i) => i && i.path)
}

export function imgLabel(i, lang = null) {
  const l = lang || currentLocale.value || 'zh'
  return l === 'en' ? 'Img ' + i : '图' + i
}

function quote(p) {
  return '"' + String(p).replace(/"/g, '') + '"'
}

/** 正文内联展开 */
export function expandInlineTokens(text, images, lang = null) {
  const l = lang || currentLocale.value || 'zh'
  const isEn = l === 'en'
  const prefix = isEn ? 'Img ' : '图'
  const pathLabel = isEn ? 'Local Path: ' : '本地路径: '

  return String(text || '').replace(TOKEN_RE, (m, n, note) => {
    const img = images[Number(n) - 1]
    if (!img) return m
    const desc = (note || (img && img.note) || '').trim()
    const descStr = desc ? ': ' + desc : ''
    return '[' + prefix + n + ' (' + pathLabel + quote(img.path) + ')' + descStr + ']'
  })
}

/** 去掉所有图片标记后，正文还剩多少实质内容 */
export function bodyWithoutTokens(text) {
  return String(text || '')
    .replace(EXPANDED_RE, '')
    .replace(TOKEN_RE, '')
    .trim()
}

function hasNaturalOrdinal(text, lang = 'zh') {
  const str = String(text || '')
  return lang === 'en' ? ORDINAL_RE_EN.test(str) : (ORDINAL_RE_ZH.test(str) || ORDINAL_RE_EN.test(str))
}

/** 生成底部精确索引映射块 */
export function buildMappingBlock(images, lang = null, opts = {}) {
  if (!images.length) return ''
  const l = lang || currentLocale.value || 'zh'
  const isEn = l === 'en'
  const forPop = !!(opts && (opts.forPop || opts.singleLine))

  if (forPop) {
    if (isEn) {
      const maps = images.map((img, i) => {
        const note = (img.note || '').trim()
        return '[Img ' + (i + 1) + '] Path: ' + quote(img.path) + (note ? ' (Note: ' + note + ')' : '')
      }).join(' ; ')
      return ' | 📎 Attached Image Mappings: ' + maps
    }
    const maps = images.map((img, i) => {
      const note = (img.note || '').trim()
      return '【' + imgLabel(i + 1, 'zh') + '】路径: ' + quote(img.path) + (note ? ' (说明: ' + note + ')' : '')
    }).join(' ; ')
    return ' | 📎 附加上下文图片精确映射：' + maps
  }

  if (isEn) {
    const lines = images.map((img, i) => {
      const note = (img.note || '').trim()
      return '- [Image ' + (i + 1) + ' / ' + enOrdinal(i + 1) + ' image] Path: ' + quote(img.path) +
        (note ? ' | Note for this image: ' + note : '')
    })
    return [
      '',
      '---',
      '### 📎 Attached Context Image Mappings (Strictly match local image files by number):',
      ...lines
    ].join('\n')
  }

  const lines = images.map((img, i) => {
    const note = (img.note || '').trim()
    return '- 【' + imgLabel(i + 1, 'zh') + ' / 第' + cnNum(i + 1) + '张图】路径: ' + quote(img.path) +
      (note ? ' | 针对此图的说明: ' + note : '')
  })
  return [
    '',
    '---',
    '### 📎 附加上下文图片精确映射（请严格按编号对应读取本地图片文件）：',
    ...lines
  ].join('\n')
}

/** 纯图片批注模式 -> 分步指令列表 */
export function buildStepInstructions(images, lang = null, opts = {}) {
  const l = lang || currentLocale.value || 'zh'
  const isEn = l === 'en'
  const forPop = !!(opts && (opts.forPop || opts.singleLine))

  if (forPop) {
    if (isEn) {
      const steps = images.map((img, i) => {
        const note = (img.note || '').trim()
        return (i + 1) + '. [Image ' + (i + 1) + '] Local path: ' + quote(img.path) +
          (note ? ' | Action: ' + note : '')
      }).join(' ; ')
      return 'Please strictly follow numbered image order and execute each step: ' + steps
    }
    const steps = images.map((img, i) => {
      const note = (img.note || '').trim()
      return (i + 1) + '. 【' + imgLabel(i + 1, 'zh') + '】本地路径: ' + quote(img.path) +
        (note ? ' | 请执行: ' + note : '')
    }).join(' ; ')
    return '请严格按照图片编号顺序，逐张完成对应处理：' + steps
  }

  if (isEn) {
    const steps = images.map((img, i) => {
      const note = (img.note || '').trim()
      return (i + 1) + '. [Image ' + (i + 1) + '] Local path: ' + quote(img.path) +
        (note ? ' | Action to perform: ' + note : '')
    })
    return 'Please strictly follow the numbered image order above and execute each step (rely on instructions after the numbers, do not confuse image order):\n' + steps.join('\n')
  }

  const steps = images.map((img, i) => {
    const note = (img.note || '').trim()
    return (i + 1) + '. 【' + imgLabel(i + 1, 'zh') + '】本地路径: ' + quote(img.path) +
      (note ? ' | 请执行: ' + note : '')
  })
  return '请严格按照上述图片编号顺序，逐张完成对应处理（每张图的任务以编号后说明为准，不要混淆图片顺序）：\n' + steps.join('\n')
}

/**
 * 推断任务类型：读/分析任务 vs 文件修改任务（修改任务需要独占互斥锁）
 */
export function inferTaskType(text) {
  const str = String(text || '').toLowerCase()
  const readPattern = /(?:阅读|分析|搜索|查看|查阅|审查|解释|读|查|看|审|\b(?:read|review|analyze|search|explain|inspect|query|check|audit)\b)/i
  const writePattern = /(?:改|修|写|增|删|替换|实现|重构|创建|修复|\b(?:edit|modify|fix|refactor|add|delete|write|create|update|implement|patch)\b)/i

  if (readPattern.test(str) && !writePattern.test(str)) {
    return 'read'
  }
  return 'write' // 默认文件修改任务，启用独占互斥锁保护
}

/** Agent 多Agent自动接力 Hook */
export function buildRelayHook(tasksPath, lang = null, meta = {}) {
  const l = lang || currentLocale.value || 'zh'
  const isEn = l === 'en'
  const forPop = !!(meta && (meta.forPop || meta.singleLine))
  const magTag = meta && meta.magazineName ? ` [${meta.magazineName}]` : ''
  const magZh = meta && meta.magazineName ? `（针对「${meta.magazineName}」项目任务）` : ''

  if (forPop) {
    return isEn
      ? ` | [PromptMag Relay${magTag}] After completing above prompt, immediately read relay tasks: "${tasksPath}" and advance next task.`
      : ` | 【PromptMag接力${magZh}】完成上述当前指令后，请立即读取本地接力任务队列文件: "${tasksPath}" 继续接力推进。`
  }

  if (isEn) {
    return [
      '',
      '---',
      `[PromptMag · Multi-Agent Auto-Relay Protocol${magTag}] After completing the above prompt, immediately read the local relay queue file:`,
      '"' + tasksPath + '"',
      '',
      '📋 Multi-Agent Relay Rules & Mutex Locking:',
      '1. [Task Types & Write Lock]',
      '   - File modification tasks (type:write): Strictly EXCLUSIVE to ONE agent at a time! If any task is currently in progress (- [~] with type:write), all other agents MUST wait until it completes before performing file modifications.',
      '   - Read/Analysis tasks (type:read): Can be executed concurrently by multiple agents.',
      '2. [Claiming Task (Prevents Duplicate Work)]',
      '   - Find the first unclaimed "- [ ]" task from top to bottom;',
      '   - Claim it immediately by changing "- [ ]" to "- [~]", updating its HTML comment with your identity and heartbeat:',
      '     <!--pm:<id> st:doing agent:<claude|agy|agent_name> hb:<current_timestamp_ms> type:<write|read>-->',
      '   - Add a claim line below it:',
      '     > Claimed by: <agent_name> | Status: Processing',
      '3. [Resolution & Execution History (Specify who solved it and how)]',
      '   - Upon completion, change "- [~]" to "- [x]", update comment with st:done agent:<agent_name> doneAt:<timestamp>;',
      '   - Record the solution immediately below it:',
      '     > Solved by: <agent_name> | Resolution: <concise summary of files modified and how the problem was resolved>',
      '4. [Advance to Next Relay Task & Looping Instructions]',
      '   - Immediately read the task file again and advance to the next uncompleted task until no pending tasks remain;',
      '   - Claude Code: use `/loop` or persistent instructions for autonomous looping;',
      '   - Antigravity (agy): continue fetching and executing subsequent tasks.',
      '5. [Mandate & Authorization Boundary]',
      '   - Each task line carries a mandate tag mdt:<strength>:<level> in its trailing comment. Strength "explicit" means ordered by the user personally; "inferred" means auto-generated. Level 1 = read & edit code, 2 = also run commands & tests, 3 = delete files, git push, release, or change system/account settings. Check the mandate before starting: level-3 actions are allowed only under "explicit". If a task asks for more than its mandate allows, do not do that part — set the line marker to [?], add a sub-line "> Q: <one sentence on what the user must decide>", stop that task, and move on. A missing mandate means inferred, level 2.',
      '6. [Blocked Tasks & Non-Blocking Workflow]',
      '   - When any task cannot proceed (missing information, decision required, insufficient mandate, or repeated failures), do not wait idle in the terminal, and do not guess: change the line marker to [?], add a sub-line "> Q: <one sentence question, <= 40 chars>", stop this task and proceed to the next in queue. The user will answer in the UI; the answer will appear below the task as a "> A: <answer>" sub-line, at which point you may resume from the breakpoint.'
    ].join('\n')
  }

  return [
    '',
    '---',
    `【PromptMag · 多Agent自动接力规范${magZh}】完成上述当前指令后，请立即读取本地接力任务队列文件：`,
    '"' + tasksPath + '"',
    '',
    '📋 多Agent接力规则与文件写锁机制：',
    '1. 【任务分类与文件写锁】',
    '   - 文件修改任务（type:write）：只能由 1 个 Agent 独占执行！如果队列中有正在执行的文件修改任务（- [~] 且 type:write），其他 Agent 必须等待其完成，不得并发修改文件。',
    '   - 读取分析任务（type:read）：允许多个 Agent 同时并发读取与执行。',
    '2. 【任务认领（防重复执行）】',
    '   - 按自上而下顺序找到首个未被认领的 "- [ ]" 任务；',
    '   - 认领时立即将 "- [ ]" 修改为 "- [~]"，并在其 <!--pm:...--> 注释中填入你的身份及认领时间：',
    '     <!--pm:<id> st:doing agent:<claude|agy|你的名称> hb:<当前毫秒时间戳> type:<write|read>-->',
    '   - 紧邻该行下方缩进插入认领状态：',
    '     > 认领者: <你的名称> | 状态: 正在处理中',
    '3. 【解决与历史归档（必须写明谁解决了、如何解决的）】',
    '   - 任务完成后，将 "- [~]" 修改为 "- [x]"，并在 HTML 注释中标记 st:done agent:<你的名称> doneAt:<时间戳>；',
    '   - 在下方缩进记录解决方案：',
    '     > 解决者: <你的名称> | 解决方案: <简明扼要说明修改了哪些文件、如何解决该问题>',
    '4. 【开启下一个接力任务与持续循环】',
    '   - 完成一个任务后，立即重新读取任务文件并开启下一个任务，直至没有待办任务为止；',
    '   - Claude Code 持续接力：建议在终端使用 `/loop` 或持续执行指令保持自动化接力循环；',
    '   - Antigravity (agy) 持续接力：根据当前接力协议持续推进下一个任务。',
    '5. 【授权标记与动作边界（Mandate）】',
    '   - 每个任务行尾注释带有授权标记 mdt:<强度>:<等级>。强度 explicit 表示用户亲自下达，inferred 表示自动生成。等级 1=只读与改代码，2=可运行命令与测试，3=删除文件、git push、发布、改系统配置。开始任务前先看授权：等级 3 的动作只在 explicit 时允许；若任务要求超出授权，不要执行超出的部分，把行首改为 [?]，在下一行写「> Q: <一句话说明需要用户决定什么>」，然后停止该任务，继续下一个。授权缺失时按 inferred、等级 2 处理。',
    '6. 【任务挂起与提问规范（Blocked）】',
    '   - 任何任务无法继续（缺信息、需要做选择、授权不足、反复失败），不要在终端干等，也不要猜：把行首改为 [?]，下一行写「> Q: <一句话问题，不超过40字>」，停止该任务并继续队列里的下一个。用户会在界面里回答，回答以「> A:」子行出现在任务下方，届时从断点继续。'
  ].join('\n')
}

/**
 * 生成专属项目的接力启动提示词（用于在终端中启动 Claude Code / Antigravity / 通用 Agent）
 */
export function buildRelayStartupPrompt(magazine, opts = {}) {
  const lang = opts.locale || currentLocale.value || 'zh'
  const isEn = lang === 'en'
  const agentType = opts.agentType || 'claude' // 'claude' | 'agy' | 'general'
  const magName = (magazine && magazine.name) || (isEn ? 'Default Magazine' : '默认项目')
  const magDesc = (magazine && magazine.description) ? ` (${magazine.description})` : ''
  const tasksPath = opts.tasksPath || ''
  const popMode = opts.popMode || 'shotgun'
  const pendingTasks = prepareRelayQueue(magazine && magazine.queue, popMode)
  const pendingCount = pendingTasks.length

  const modeNameZh = popMode === 'shotgun'
    ? '💥 霰弹枪模式（按入库顺序 FIFO 依次执行）'
    : popMode === 'pistol'
      ? '🎯 手枪模式（最近添加优先 LIFO 依次执行）'
      : '🎲 左轮模式（随机抽弹顺序执行）'

  const modeNameEn = popMode === 'shotgun'
    ? '💥 Shotgun Mode (Sequential FIFO execution)'
    : popMode === 'pistol'
      ? '🎯 Pistol Mode (Most-recent-first LIFO execution)'
      : '🎲 Revolver Mode (Randomized draw execution)'

  if (isEn) {
    let agentSpecificLoop = ''
    if (agentType === 'claude') {
      agentSpecificLoop = 'Claude Code Auto-Loop: Keep running /loop or continuous prompt loop in your terminal until all tasks are marked - [x].'
    } else if (agentType === 'agy') {
      agentSpecificLoop = 'Antigravity (agy) Relay: Execute task by task autonomously, obey mutex write lock, record solver and resolution.'
    } else {
      agentSpecificLoop = 'Autonomous Looping: Automatically advance to the next unclaimed task until no pending tasks remain.'
    }

    return [
      `【PromptMag · Multi-Agent Auto-Relay Boot Prompt: ${magName}】${magDesc}`,
      '',
      `You are the dedicated autonomous relay Agent for project [${magName}].`,
      `Current Firing Mode: ${modeNameEn}`,
      `There are currently ${pendingCount} pending task(s) in this magazine (completed tasks have been strictly excluded).`,
      tasksPath ? `Please read the local task queue file immediately:\n"${tasksPath}"` : 'Please read the local relay tasks file next_tasks.md',
      '',
      '📋 Core Autonomous Relay Rules:',
      '1. [Autonomous Continuous Loop - DO NOT STOP]:',
      '   Upon completing each task and recording resolution, DO NOT STOP or wait for user input! Immediately proceed to re-read the tasks file and claim/execute the next unclaimed "- [ ]" task, looping autonomously until all tasks in the queue are "- [x]".',
      '2. [Write Lock Mutex & Wait-Monitoring Loop]:',
      '   File modification tasks (type:write) are EXCLUSIVELY executed by ONE agent at a time. If you detect that the next task is currently locked/in-progress by another agent ("- [~]" with type:write), DO NOT EXIT! Enter a wait-monitoring loop (sleep 3~5 seconds, re-read file) until the lock is released ("- [x]"), then immediately claim and execute subsequent pending tasks. Read tasks (type:read) can be executed concurrently.',
      '3. [Dynamic Discovery of New Prompts]:',
      '   PromptMag allows the user to dynamically add new prompts to the magazine on the fly. Before claiming each task or during wait-loops, ALWAYS re-read the tasks file from disk (avoid stale in-memory cache) to automatically discover and execute newly appended tasks!',
      `4. [Strict Firing Order]: Tasks in the file have been sorted strictly according to the magazine's firing mode (${modeNameEn}). Claim and process tasks strictly from top to bottom.`,
      '5. [Claim & Resolution History]:',
      '   - Claim: change "- [ ]" to "- [~]" and tag with your identity and heartbeat timestamp.',
      '   - Resolution: change "- [~]" to "- [x]", and indent a resolution note below:',
      '     > Solved by: <your_name> | Resolution: <concise summary of files modified and solution>.',
      '   PromptMag client will listen to this change in real-time and mark the task as done in the UI.',
      `6. [Agent Loop Command]: ${agentSpecificLoop}`,
      '7. [Mandate Boundary]: Obey mdt:<strength>:<level>. Level 3 (delete files, git push, release, sys config) requires strength=explicit. Inferred tasks attempting Level 3 must mark [?] and add "> Q: <question>".',
      '8. [Blocked Non-Blocking]: If blocked or lacking information, set [?], append "> Q: <question <= 40 chars>", and immediately move to the next task. Never hang in terminal waiting.',
      '',
      'Please read the task queue file now and start autonomous continuous relay execution!'
    ].join('\n')
  }

  let agentSpecificLoopZh = ''
  if (agentType === 'claude') {
    agentSpecificLoopZh = 'Claude Code 持续循环：在终端保持持续执行或使用 `/loop` 保持自动化接力循环，直至队列中全部任务处理完毕；'
  } else if (agentType === 'agy') {
    agentSpecificLoopZh = 'Antigravity (agy) 接力模式：依次认领并推进任务，严格遵守文件写锁，执行完毕必须回写解决者和方案；'
  } else {
    agentSpecificLoopZh = '通用 Agent 持续推进：读取任务队列并自动接续下一个任务，自主循环直至无待办任务。'
  }

  return [
    `【PromptMag · 多Agent接力启动指令：${magName}】${magDesc}`,
    '',
    `你现在是「${magName}」项目的专属接力 Agent。`,
    `当前弹夹出弹模式：${modeNameZh}`,
    `当前弹夹中有 ${pendingCount} 条待办任务（已自动剔除已完成任务，按出弹模式严格排序）。`,
    `请立即读取该项目的本地接力任务文件：`,
    tasksPath ? `"${tasksPath}"` : '本地接力任务文件 next_tasks.md',
    '',
    '📋 核心全自动接力与互斥调度规则：',
    '1. 【全自动不间断接力执行 · 无需人工干预】',
    '   每完成一个任务并标记 "- [x]" 回写解决方案后，【严禁停下来等待用户输入或询问】！必须立即自动读取任务文件，自动认领并执行下一条 "- [ ]" 待办任务，保持无人值守自主推进，直到队列中所有任务全部处理完毕（全部标为 "- [x]"）！',
    '2. 【文件修改独占锁与等待监控循环】',
    '   文件修改任务（type:write）必须由 1 个 Agent 独占执行！执行前确保无其他修改任务正在进行。若发现队列中有正在执行的任务（"- [~]" 且 type:write），【严禁直接退出或报错】，必须自动开启监控等待循环（每隔 3~5 秒重新读取任务文件），直至该任务完成（"- [x]" 释放独占锁），立即自动认领后续待办任务！读取分析任务（type:read）允许多 Agent 并发。',
    '3. 【动态获取新添加的提示词】',
    '   PromptMag 支持用户在接力运行期间随时在客户端添加新提示词进弹夹。每完成一个任务后，Agent 必须【重新读取最新的任务文件】（避免内存缓存），自动发现并按顺序接力执行用户新追加的待办任务，直至没有任何待办任务为止。',
    `4. 【任务执行顺序严格遵守出弹模式】`,
    `   该任务文件中的任务顺序已严格按照弹夹当前出弹模式（${modeNameZh}）排布，Agent 必须自上而下依次认领执行。`,
    '5. 【任务认领、解决归档与 PromptMag 客户端实时同步】',
    '   - 认领时：将 "- [ ]" 改为 "- [~]"，并在机器注释中填入你的 Agent 标识；',
    '   - 完成时：将 "- [~]" 改为 "- [x]"，并在紧邻下方缩进记录：',
    '     > 解决者: <你的名称> | 解决方案: <简明扼要说明修改了哪些文件、如何解决该问题>',
    '   PromptMag 客户端后台将毫秒级监听该文件的状态变化，自动将该任务同步标记为“已使用”并持久化保存。',
    `6. 【持续循环指令】${agentSpecificLoopZh}`,
    '7. 【授权边界核查】：遵守 mdt:<强度>:<等级>。等级 3（删除文件、git push、发版、改系统配置）只在 explicit 时允许。inferred 任务若遇等级 3 必须改 [?] 提问并停下。',
    '8. 【挂起不空等】：无法继续时改行首为 [?]，写「> Q: <一句话问题，不超过40字>」，立即推进下一任务，严禁在终端盲目干等。',
    '',
    '请立即开始读取任务文件，开启全自动不间断接力执行！'
  ].join('\n')
}

/**
 * 主编译器：将「正文 + 图片 + 批注」组装成大模型不会认错顺序的结构化 Prompt
 */
export function compilePrompt(task, opts = {}) {
  const lang = opts.locale || currentLocale.value || 'zh'
  const tasksPath = opts.tasksPath || ''
  const relay = !!opts.relay
  const forPop = !!(opts.forPop || opts.singleLine)
  const images = validImages(task)
  let body = String((task && task.text) || '').trim()
  body = expandInlineTokens(body, images, lang)

  const leftover = bodyWithoutTokens(body)
  const hasNotes = images.some((i) => (i.note || '').trim())

  // 3. 纯图片批注模式：正文没有实质内容（或仅剩图片标记），全靠卡片批注驱动
  if (images.length && leftover.length === 0 && hasNotes) {
    body = buildStepInstructions(images, lang, opts)
  }

  // 自然语言兼容提示
  let ordinalHint = ''
  if (images.length && hasNaturalOrdinal(body, lang)) {
    ordinalHint = lang === 'en'
      ? (forPop ? ' (Note: Image ordinals refer to mappings)' : '\n\n(Note: Any natural ordinal references such as "1st image / Img N" in the text refer strictly to the exact image mappings below. Please match local files by number.)')
      : (forPop ? '（注：文中所提第N张图均指对应图片映射）' : '\n\n（注：正文中提到的「第N张图 / 图N」均指下方图片精确映射表中的图N，请严格按编号读取对应本地文件。）')
  }

  if (forPop) {
    body = body.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  }

  const mappingBlock = buildMappingBlock(images, lang, opts)
  const parts = [body + ordinalHint, mappingBlock].filter(Boolean)
  let out = forPop ? parts.join(' ') : parts.join('\n')

  if (relay && tasksPath) {
    const hook = buildRelayHook(tasksPath, lang, opts)
    out = forPop ? (out + ' ' + hook) : (out + hook)
  }

  if (forPop) {
    out = out.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  }

  return out.trim()
}

/**
 * 单行紧凑编译（用于写入 next_tasks.md，三态机 + 机器注释 + 解决历史）
 */
export function compileTaskLine(task, num, lang = null) {
  const l = lang || currentLocale.value || 'zh'
  const isEn = l === 'en'
  const done = !!(task && (task.done || task.status === 'done'))
  const doing = !done && !!(task && task.status === 'doing')
  const blocked = !done && !doing && !!(task && task.status === 'blocked')
  const failed = !done && !doing && !blocked && !!(task && task.status === 'failed')
  const status = done ? 'done' : (doing ? 'doing' : (blocked ? 'blocked' : (failed ? 'failed' : (task && task.status ? task.status : 'pending'))))
  const checkChar = done ? 'x' : (doing ? '~' : (blocked ? '?' : (failed ? '!' : ' ')))
  const images = validImages(task)
  const taskType = (task && task.type) || inferTaskType((task && task.text) || '')

  const mandate = (task && task.mandate) || {}
  const strength = mandate.strength || 'inferred'
  const level = mandate.level || 2
  const issuer = mandate.issuer || (task && task.origin) || 'user'

  let text = String((task && task.text) || '')
    .replace(TOKEN_RE, (m, n, note) => {
      const img = images[Number(n) - 1]
      const desc = (note || (img && img.note) || '').trim()
      const descStr = desc ? '(' + desc + ')' : ''
      const prefix = isEn ? 'Img ' : '图'
      return img ? '[' + prefix + n + descStr + ': ' + quote(img.path) + ']' : m
    })
    .replace(/\s+/g, ' ')
    .trim()

  const leftover = bodyWithoutTokens(text)
  if (images.length && !leftover && images.some((i) => (i.note || '').trim())) {
    const lead = isEn ? 'Please process sequentially: ' : '请依次处理：'
    text = lead + images
      .map((img, i) => (i + 1) + ')' + imgLabel(i + 1, l) + ((img.note || '').trim() ? '(' + img.note.trim() + ')' : '') + (isEn ? ' Path:' : ' 路径:') + img.path)
      .join(' ; ')
  }
  if (!text) {
    text = images.length
      ? (isEn ? 'Please process following images' : '请处理以下图片')
      : (isEn ? '(Empty task)' : '（空任务）')
  }

  const mapLabel = isEn ? 'Image Mappings -> ' : '图片映射 -> '
  const noteLabel = isEn ? 'Note: ' : '说明: '
  const maps = images
    .map((img, i) => imgLabel(i + 1, l) + ': ' + quote(img.path) + ((img.note || '').trim() ? '(' + noteLabel + img.note.trim() + ')' : ''))
    .join(' ; ')

  const id = (task && task.id) || ''
  const agent = (task && (task.agent || task.solver)) || ''
  const hb = (task && (task.heartbeat || task.claimedAt)) || ''
  const doneAt = (task && task.doneAt) || ''

  const tagParts = [`pm:${id}`, `st:${status}`, `mdt:${strength}:${level}`, `iss:${issuer}`, `type:${taskType}`]
  if (agent) tagParts.push(`agent:${agent}`)
  if (hb) tagParts.push(`hb:${hb}`)
  if (doneAt) tagParts.push(`doneAt:${doneAt}`)
  const tagStr = id ? ` <!--${tagParts.join(' ')}-->` : ''

  let line = '- [' + checkChar + '] ' + num + '. ' + text + (maps ? ' | ' + mapLabel + maps : '') + tagStr

  // 状态与方案附随说明行
  if (done) {
    const solver = (task && task.solver) || agent || (isEn ? 'Agent' : 'Agent')
    const solution = (task && task.solution) || (isEn ? 'Completed and verified.' : '已完成任务并完成校验。')
    line += '\n  > ' + (isEn ? 'Solved by' : '解决者') + ': ' + solver + ' | ' + (isEn ? 'Resolution' : '解决方案') + ': ' + solution
  } else if (doing) {
    const lockNotice = taskType === 'write' ? (isEn ? ' (Exclusive Write Lock Active, other agents wait)' : ' (文件修改互斥锁生效，其他 Agent 请等待)') : ''
    line += '\n  > ' + (isEn ? 'Claimed by' : '认领者') + ': ' + (agent || 'Agent') + ' | ' + (isEn ? 'Status: Processing' : '状态: 正在处理中') + lockNotice
  }

  // Blocked 问题与 Answer 回答子行
  if (task && task.blockedQuestion) {
    line += '\n  > Q: ' + task.blockedQuestion
  }
  if (task && task.answer) {
    line += '\n  > A: ' + task.answer
  }

  return line
}

/**
 * 根据出弹模式与完成状态准备接力任务队列：
 * 1. 严格过滤：已完成的任务绝不放入接力任务中！
 * 2. 严格按照当前弹夹选择的出弹模式排列任务执行顺序
 */
export function prepareRelayQueue(queue, popMode = 'shotgun') {
  const pending = (queue || []).filter((t) => !t.done && t.status !== 'done' && t.status !== 'proposed')
  if (popMode === 'pistol') {
    // 手枪模式：最近保存优先 (LIFO)
    return pending.slice().reverse()
  }
  if (popMode === 'revolver') {
    // 左轮模式：随机抽选顺序
    const shuffled = pending.slice()
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }
  // 霰弹枪模式：按保存顺序严格顺序执行 (FIFO)
  return pending.slice()
}

/** 生成完整的 next_tasks.md 内容（带修订号乐观锁、出弹模式与多Agent接力规则头） */
export function buildTasksFile(queue, lang = null, meta = {}) {
  const l = lang || currentLocale.value || 'zh'
  const isEn = l === 'en'
  const rev = meta.revision || 1
  const lock = meta.activeLock ? ' activeLock:' + meta.activeLock : ''
  const popMode = meta.popMode || 'shotgun'

  const magTitle = meta.magazineName ? ` [${meta.magazineName}]` : ''
  const modeLabel = popMode === 'shotgun'
    ? (isEn ? 'Shotgun (FIFO Sequential)' : '💥 霰弹枪模式（按保存顺序 FIFO 依次出弹）')
    : popMode === 'pistol'
      ? (isEn ? 'Pistol (LIFO Most-Recent-First)' : '🎯 手枪模式（最近保存优先 LIFO 出弹）')
      : (isEn ? 'Revolver (Randomized)' : '🎲 左轮模式（随机抽选顺序）')

  const header = isEn ? [
    '# PromptMag · Multi-Agent Auto-Relay Task Queue' + magTitle,
    '<!--pm:rev:' + rev + ' updated:' + new Date().toISOString() + lock + ' mode:' + popMode + '-->',
    '<!-- Auto-generated by PromptMag Multi-Agent Engine.',
    '  Firing Mode: ' + modeLabel,
    '  Rules:',
    '  1. Continuous autonomous execution: After completing each task and recording resolution, DO NOT STOP or wait for user input! Immediately proceed to re-read this file and claim/execute the next unclaimed "- [ ]" task.',
    '  2. Mutex Write Lock: File modification tasks (type:write) MUST be executed exclusively by ONE agent at a time. If another agent is doing a write task (st:doing type:write), wait in a loop (sleep 3-5s, re-read file) until lock is released.',
    '  3. Dynamic New Prompts: PromptMag users may add new tasks dynamically. Always re-read this file from disk before claiming each task.',
    '  4. Sequential claim: Claim tasks strictly from top to bottom (pre-ordered by firing mode).',
    '  5. Claim: change "- [ ]" to "- [~]" and tag metadata. Done: change "- [~]" to "- [x]" and record solution.',
    '-->',
    ''
  ].join('\n') : [
    '# PromptMag · 多Agent自动接力任务队列' + magTitle,
    '<!--pm:rev:' + rev + ' updated:' + new Date().toISOString() + lock + ' mode:' + popMode + '-->',
    '<!-- 由 PromptMag 多Agent接力引擎自动生成。',
    '  当前出弹模式：' + modeLabel,
    '  核心规则：',
    '  1. 全自动不间断接力：完成一个任务后，【严禁停下等待用户输入】！立即自动认领并执行下一个未完成的 "- [ ]" 任务，保持无人值守自主推进，直到全部任务完成；',
    '  2. 互斥写锁与监控等待：文件修改任务（type:write）由单个 Agent 独占执行！若检测到有正在执行的任务（st:doing type:write），自动开启监控等待循环（每3~5秒重读本文件），直到锁释放后立即继续；',
    '  3. 动态获取新任务：用户可能在客户端随时追加新任务。每完成一个任务后，必须重新从磁盘读取本文件以获取最新添加的提示词；',
    '  4. 出弹顺序排布：任务已严格按照出弹模式（' + modeLabel + '）自上而下排序，请按顺序认领；',
    '  5. 认领标记 "- [~]"，完成标记 "- [x]" 并在下方记录解决者与方案，客户端将实时感知并标记已使用。',
    '-->',
    ''
  ].join('\n')

  // 关键：已完成的任务绝不放入接力任务中！按出弹模式严格排序！
  const filtered = prepareRelayQueue(queue, popMode)

  let body = ''
  if (!filtered || !filtered.length) {
    body = (isEn ? '(No pending tasks in this magazine)\n' : '(当前弹夹暂无待办任务)\n')
  } else {
    body = filtered.map((t, i) => compileTaskLine(t, i + 1, l)).join('\n') + '\n'
  }

  // Observe 分区：待批准（proposed）任务单独追加在文件末尾，不使用 "- []"
  const proposed = (queue || []).filter((t) => t.status === 'proposed')
  if (proposed.length) {
    const observeTitle = isEn
      ? '## Pending Approval (OBSERVE · Will not execute until approved)'
      : '## 待批准（OBSERVE · 批准前不会执行）'
    const observePrefix = isEn ? '- (Pending)' : '- (待批准)'
    const proposedLines = proposed.map((t) => {
      const id = t.id || ''
      const mdt = t.mandate ? `mdt:${t.mandate.strength || 'inferred'}:${t.mandate.level || 2}` : 'mdt:inferred:2'
      const iss = t.mandate?.issuer || t.origin || 'agent'
      const tag = id ? ` <!--pm:${id} st:proposed ${mdt} iss:${iss}-->` : ''
      return `${observePrefix} ${t.text}${tag}`
    }).join('\n')
    body += '\n' + observeTitle + '\n' + proposedLines + '\n'
  }

  return header + body
}

/** 解析 next_tasks.md（支持容错 [x][X][✓][v][~][/][-][?][!]、OBSERVE 分区、HTML注释提取与解决历史） */
export function parseTasksLines(content) {
  const items = []
  const lines = String(content || '').split(/\r?\n/)
  let currentItem = null
  let inObserveSection = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]

    // 检查是否进入 Observe 待批准分区
    if (/^\s*##\s*(?:待批准|Pending Approval)/i.test(rawLine)) {
      inObserveSection = true
      currentItem = null
      continue
    }

    // 匹配主任务行：- [ ] 或 - [x] 或 - [~] 或 - [?] 或 - [!] 等
    const m = rawLine.match(/^\s*-\s*\[([ xX✓vV~/\-?!])\]\s*(.+)$/)
    // 匹配 Observe 分区待批准行：- (待批准) ... 或 - (Pending) ...
    const mObs = !m ? rawLine.match(/^\s*-\s*(?:\(待批准\)|\(Pending\))\s*(.+)$/i) : null

    if (m || mObs) {
      const symbol = m ? m[1] : ' '
      const body = m ? m[2] : mObs[1]
      const done = ['x', 'X', '✓', 'v', 'V'].includes(symbol)
      const doing = ['~', '/', '-'].includes(symbol)
      const blocked = symbol === '?'
      const failed = symbol === '!'
      let status = done ? 'done' : (doing ? 'doing' : (blocked ? 'blocked' : (failed ? 'failed' : (inObserveSection || mObs ? 'proposed' : 'pending'))))

      // 解析 HTML 注释机器元数据
      const idm = body.match(/<!--\s*pm:([A-Za-z0-9_-]+)(.*?)\s*-->/)
      let id = idm ? idm[1] : null
      let agent = ''
      let taskType = 'write'
      let heartbeat = null
      let doneAt = null
      let mandateStrength = 'inferred'
      let mandateLevel = 2
      let mandateIssuer = id ? 'user' : 'agent'

      if (idm && idm[2]) {
        const metaStr = idm[2]
        const stMatch = metaStr.match(/\bst:(pending|doing|done|blocked|failed|proposed)\b/)
        if (stMatch) status = stMatch[1]
        const agentMatch = metaStr.match(/\bagent:([^\s>]+)/)
        if (agentMatch) agent = agentMatch[1]
        const typeMatch = metaStr.match(/\btype:(write|read)\b/)
        if (typeMatch) taskType = typeMatch[1]
        const hbMatch = metaStr.match(/\bhb:(\d+)/)
        if (hbMatch) heartbeat = Number(hbMatch[1])
        const doneAtMatch = metaStr.match(/\bdoneAt:(\d+)/)
        if (doneAtMatch) doneAt = Number(doneAtMatch[1])
        const mdtMatch = metaStr.match(/\bmdt:(explicit|inferred):([123])\b/)
        if (mdtMatch) {
          mandateStrength = mdtMatch[1]
          mandateLevel = Number(mdtMatch[2])
        }
        const issMatch = metaStr.match(/\biss:([^\s>]+)/)
        if (issMatch) {
          mandateIssuer = issMatch[1]
        }
      }

      // 权威标记优先级
      if (done) status = 'done'
      else if (doing && status !== 'done') status = 'doing'
      else if (blocked) status = 'blocked'
      else if (failed) status = 'failed'
      else if (inObserveSection || mObs) status = 'proposed'

      let text = body.replace(/<!--\s*pm:[A-Za-z0-9_-]+.*?\s*-->/, '').trim()
      // 清除可选的前导序号 "1. "
      text = text.replace(/^\d+\.\s*/, '')

      currentItem = {
        line: i,
        id,
        done: status === 'done' || done,
        status,
        type: taskType,
        agent,
        solver: status === 'done' ? agent : '',
        solution: '',
        heartbeat,
        doneAt,
        origin: id ? (mandateIssuer === 'agent' ? 'agent' : 'user') : 'agent',
        mandate: {
          issuer: mandateIssuer,
          strength: mandateStrength,
          level: mandateLevel,
          expiresAt: 0
        },
        blockedQuestion: '',
        answer: '',
        isNewAgentTask: !id,
        text
      }
      items.push(currentItem)
      continue
    }

    // 匹配跟随说明行（解决方案、认领说明、Q提问、A回答）
    if (currentItem) {
      // 1. Q 提问子行
      const qMatch = rawLine.match(/^\s*>\s*Q:\s*(.+)$/i)
      if (qMatch) {
        currentItem.blockedQuestion = qMatch[1].trim()
        if (currentItem.status !== 'done' && !currentItem.answer) {
          currentItem.status = 'blocked'
        }
        continue
      }

      // 2. A 回答子行（有回答时将挂起状态自动恢复为待办 pending）
      const aMatch = rawLine.match(/^\s*>\s*A:\s*(.+)$/i)
      if (aMatch) {
        currentItem.answer = aMatch[1].trim()
        if (currentItem.status === 'blocked') {
          currentItem.status = 'pending'
        }
        continue
      }

      // 3. 解决者与解决方案
      const solMatch = rawLine.match(/^\s*>\s*(?:解决者|Solved by)\s*:\s*([^|]+)\|\s*(?:解决方案|Resolution)\s*:\s*(.+)$/i)
      if (solMatch) {
        currentItem.solver = solMatch[1].trim()
        currentItem.solution = solMatch[2].trim()
        currentItem.status = 'done'
        currentItem.done = true
        continue
      }

      // 4. 认领者
      const claimMatch = rawLine.match(/^\s*>\s*(?:认领者|Claimed by)\s*:\s*([^|]+)/i)
      if (claimMatch && currentItem.status !== 'done' && currentItem.status !== 'blocked') {
        currentItem.agent = claimMatch[1].trim()
        currentItem.status = 'doing'
        continue
      }
    }
  }

  return items
}

/** 提取任务文件顶层元数据（修订号与全局写锁） */
export function parseTasksMetadata(content) {
  const m = String(content || '').match(/<!--pm:rev:(\d+)(.*?)\s*-->/)
  if (!m) return { revision: 1, activeLock: null }
  const rev = Number(m[1]) || 1
  const lockMatch = m[2].match(/\bactiveLock:([^\s>]+)/)
  return { revision: rev, activeLock: lockMatch ? lockMatch[1] : null }
}

/**
 * 反编译：将已编译的 Prompt 还原为 { text, images }（无缝兼容中英文两种输出）
 */
export function parseCompiledPrompt(rawText) {
  if (!rawText || typeof rawText !== 'string') return null
  const text = rawText.trim()
  const hasZh = text.includes('### 📎 附加上下文图片精确映射') || text.includes('【图') || text.includes('图片映射 ->')
  const hasEn = text.includes('### 📎 Attached Context Image Mappings') || text.includes('[Image') || text.includes('Image Mappings ->')
  if (!hasZh && !hasEn) return null

  const images = []
  // 中文多行映射块：- 【图1 / 第一张图】路径: "..." (| 针对此图的说明: ...)?
  const blockRegexZh = /-\s*【图\s*(\d+)[^】]*】\s*路径:\s*"([^"]+)"(?:\s*\|\s*针对此图的说明:\s*([^\r\n]+))?/g
  let m
  while ((m = blockRegexZh.exec(text)) !== null) {
    const idx = Number(m[1]) - 1
    const imgPath = m[2]
    const note = (m[3] || '').trim()
    images[idx] = { path: imgPath, name: imgPath.split(/[/\\]/).pop(), note }
  }

  // 英文多行映射块：- [Image 1 / 1st image] Path: "..." (| Note for this image: ...)?
  const blockRegexEn = /-\s*\[Image\s*(\d+)[^\]]*\]\s*Path:\s*"([^"]+)"(?:\s*\|\s*Note for this image:\s*([^\r\n]+))?/gi
  while ((m = blockRegexEn.exec(text)) !== null) {
    const idx = Number(m[1]) - 1
    const imgPath = m[2]
    const note = (m[3] || '').trim()
    images[idx] = { path: imgPath, name: imgPath.split(/[/\\]/).pop(), note }
  }

  // 单行任务映射匹配（中文 & 英文）
  if (!images.length) {
    const singleRegex = /(?:图|Img|Image)\s*(\d+)\s*:\s*"([^"]+)"(?:\s*\((?:说明|Note):\s*([^)]*)\))?/gi
    while ((m = singleRegex.exec(text)) !== null) {
      const idx = Number(m[1]) - 1
      const imgPath = m[2]
      const note = (m[3] || '').trim()
      images[idx] = { path: imgPath, name: imgPath.split(/[/\\]/).pop(), note }
    }
  }

  const validImgs = images.filter(Boolean)
  if (!validImgs.length) return null

  // 提取正文：截取 '---' 之前的内容
  let body = text.split(/\r?\n\s*---\s*\r?\n/)[0].trim()

  // 移除可能附带的自然语言提示
  body = body.replace(/（注：正文中提到的「第N张图.*?）/gs, '').replace(/\(Note: Any natural ordinal references.*?mappings below.*?\)/gis, '').trim()

  // 还原内联路径标记：[图1 (本地路径: "..."): 说明] / [Img 1 (Local Path: "..."): note] -> [图1: 说明]
  body = body.replace(/\[(?:图|Img|Image)\s*(\d+)\s*\((?:本地路径|Local Path):\s*"[^"]*"\)(?:\s*[:：]\s*([^\]]*))?\]/gi, (match, n, note) => {
    const cleanNote = (note || '').trim()
    const prefix = currentLocale.value === 'en' ? 'Img ' : '图'
    return cleanNote ? `[${prefix}${n}: ${cleanNote}]` : `[${prefix}${n}]`
  })

  return { text: body, images: validImgs }
}