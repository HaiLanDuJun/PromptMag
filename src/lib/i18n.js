import { ref } from 'vue'

export const currentLocale = ref('zh')

export const messages = {
  zh: {
    common: {
      appName: 'PromptMag',
      ok: '确定',
      cancel: '取消',
      save: '保存',
      delete: '删除',
      copy: '复制',
      copied: '已复制',
      search: '搜索',
      close: '关闭',
      clear: '清空',
      edit: '编辑',
      open: '打开',
      status: '状态',
      pending: '待使用',
      done: '已使用',
      all: '全部'
    },
    titleBar: {
      title: '保存关键词',
      alwaysOnTopOn: '窗口置顶（开启中）',
      alwaysOnTopOff: '点击置顶窗口',
      opacity: '窗口透明度',
      settings: '设置',
      miniMode: '迷你快捷输入面板',
      collapseToOrb: '收起为悬浮图标',
      closeWindow: '关闭窗口 (Alt+Q 重新呼出)',
      relayActive: 'Agent 自动接力已开启',
      switchLang: '切换语言 / Language'
    },
    composer: {
      placeholder: '输入关键词与提示词… 提示：先输入文字，选中某一段关键词后按 Ctrl+V 贴图，即可将图片与该词强关联并在框内随时修改',
      uploadBtn: '贴图 / 上传',
      uploadBtnTitle: '上传图片文件（选中文字后点击，将与选中文本强关联）',
      snippetsBtn: '常用词库',
      snippetsBtnTitle: '打开专属常用词库弹窗 (Alt+C) 选中后直接复制并粘贴到光标处',
      pasteBtn: '粘贴',
      pasteBtnTitle: '粘贴剪贴板文字',
      clearBtn: '清空',
      clearBtnTitle: '清空当前输入与图片',
      copyBtn: '复制',
      copyBtnTitle: '编译提示词（含图文精确锚点）并复制到剪贴板',
      saveBtn: '保存',
      saveBtnTitle: '保存关键词 (Ctrl+Enter)',
      relatedImages: '关联图片',
      doubleClickPreview: '· 双击图片放大预览',
      clearImages: '清空图片',
      clearImagesTitle: '清空所有关联图片',
      imgBadge: '图{n}',
      addMoreImages: '添加图片',
      addMoreImagesTitle: '上传更多图片',
      deleteImageTitle: '删除此图片'
    },
    editor: {
      badgeTitle: '点击或双击放大查看图片',
      deleteBinding: '删除此图片关联',
      imgBadge: '图{n}'
    },
    tabs: {
      history: '历史关键词',
      snippets: '常用词库'
    },
    queue: {
      title: '历史关键词',
      pendingTag: '待用 {count}',
      resetAllPending: '全部重置待用',
      resetAllPendingTitle: '将所有已使用的提示词一键恢复为待使用',
      clear: '清空',
      clearTitle: '清空历史关键词',
      unnamed: '未命名关键词',
      imageCount: '[{count} 张图片]',
      copyTitle: '复制结构化提示词',
      editTitle: '回填到输入框编辑',
      toggleDoneTitle: '切换为已使用/待使用',
      deleteTitle: '删除此关键词',
      empty: '暂无历史关键词，在上方输入框编辑后按保存'
    },
    snippets: {
      addPlaceholder: '输入常用指令或关键词，Enter 添加',
      addBtn: '添加',
      emptyTitle: '词库是空的',
      emptyDesc: '添加后会显示为输入框下方的快捷胶囊',
      insertTitle: '插入到输入框光标处',
      copyTitle: '复制',
      deleteTitle: '删除'
    },
    snippetPicker: {
      title: '常用提示词库',
      shortcutsHint: '↑↓ 选择 · Enter / 1-9 填入 · Esc 关闭',
      searchPlaceholder: '搜索常用提示词...',
      emptySearch: '未找到相关提示词',
      selectToInsert: '回车或点击直接填入到光标处'
    },
    quickPanel: {
      title: 'PromptMag · 快捷输入',
      placeholder: '输入关键词，回车保存…',
      pinned: '已置顶',
      clickPin: '点击置顶',
      expandFull: '展开为完整面板',
      collapseOrb: '收起为小圆球',
      uploadImg: '上传图片',
      pasteText: '粘贴文本',
      saveBtn: '保存'
    },
    preview: {
      title: '图片预览',
      imgBadge: '图{n}',
      showInFolder: '在文件夹中定位原图文件',
      copyPath: '复制图片绝对路径',
      prev: '上一张 (←)',
      next: '下一张 (→)',
      close: '关闭 (ESC)'
    },
    settings: {
      title: '应用设置',
      language: '界面与提示词语言 / Language',
      langZh: '简体中文 (默认)',
      langEn: 'English',
      hotkeysTitle: '全局快捷键',
      hotkeyPopDesc: '复制弹夹里最老的未使用提示词，并标记为已使用',
      hotkeyPopLabel: '弹出最旧未用',
      hotkeyCollectDesc: '把当前选中文字一键收录到词库',
      hotkeyCollectLabel: '收录选中文字',
      hotkeySnippetsDesc: '呼出专属收藏夹提示词弹窗，选择后直接复制并粘贴到光标处',
      hotkeySnippetsLabel: '常用词库弹窗',
      hotkeyTip: '支持直接键盘按键录制，录制完成后自动全局注册。',
      relayTitle: 'Agent 自动接力 (next_tasks.md)',
      relayDesc: '双向同步 next_tasks.md',
      relayOn: '已开启',
      relayOff: '已关闭',
      dataDirTitle: '数据存放目录',
      changeDir: '更改目录（迁移重启）',
      openDir: '打开'
    },
    toast: {
      imagesAdded: '已添加并关联 {count} 张图片',
      restoredPrompt: '已还原图片与关键词 [图{count}]',
      pastedText: '已粘贴文本',
      noClipboardText: '剪贴板中无文本',
      composerEmpty: '输入框是空的',
      copiedFullPrompt: '已复制完整提示词（含图片本地路径映射）',
      pleaseInputOrImg: '请输入提示词或添加图片',
      savedPrompt: '已保存关键词',
      clearedImages: '已清空所有关联图片',
      copiedKeyword: '已复制关键词',
      backfilled: '已回填到输入框',
      removed: '已移除',
      clearedHistory: '已清空历史关键词',
      addedToSnippets: '已加入词库',
      copied: '已复制',
      magAllDone: '弹夹中提示词已全部使用过（点击列表标签可一键恢复为待使用）',
      magEmpty: '弹夹空了：暂无提示词',
      poppedPrompt: '已弹出最旧未用提示词并自动粘贴（已标记为已使用，剩余 {n} 条待用）',
      popFailed: '弹出失败',
      collectedSnippet: '已收录选中文字到词库',
      noSelectedText: '没有捕获到选中文本',
      resetAllPending: '已全部重置为待使用',
      taskMarkedDone: '已标记为已使用',
      taskMarkedPending: '已恢复为待使用',
      copiedImgPath: '已复制图片本地路径',
      langChanged: '语言已切换为：{lang}',
      autoRelayOn: '自动接力已开启',
      autoRelayOff: '自动接力已关闭（next_tasks.md 保留）'
    }
  },
  en: {
    common: {
      appName: 'PromptMag',
      ok: 'OK',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      copy: 'Copy',
      copied: 'Copied',
      search: 'Search',
      close: 'Close',
      clear: 'Clear',
      edit: 'Edit',
      open: 'Open',
      status: 'Status',
      pending: 'Pending',
      done: 'Used',
      all: 'All'
    },
    titleBar: {
      title: 'Prompt Magazine',
      alwaysOnTopOn: 'Always on top (Enabled)',
      alwaysOnTopOff: 'Click to stay on top',
      opacity: 'Window Opacity',
      settings: 'Settings',
      miniMode: 'Mini quick panel',
      collapseToOrb: 'Collapse to floating orb',
      closeWindow: 'Close window (Alt+Q to reopen)',
      relayActive: 'Agent auto-relay is active',
      switchLang: 'Language / 语言切换'
    },
    composer: {
      placeholder: 'Enter keywords & prompt… Tip: type text first, select keywords and press Ctrl+V to strongly bind image with text',
      uploadBtn: 'Attach / Upload',
      uploadBtnTitle: 'Upload image file (select text first to bind with image)',
      snippetsBtn: 'Snippets',
      snippetsBtnTitle: 'Open snippets popup (Alt+C), select to copy & paste to cursor',
      pasteBtn: 'Paste',
      pasteBtnTitle: 'Paste clipboard text',
      clearBtn: 'Clear',
      clearBtnTitle: 'Clear current text and images',
      copyBtn: 'Copy',
      copyBtnTitle: 'Compile structured prompt (with image mapping) and copy',
      saveBtn: 'Save',
      saveBtnTitle: 'Save to magazine (Ctrl+Enter)',
      relatedImages: 'Attached Images',
      doubleClickPreview: '· Double-click to zoom',
      clearImages: 'Clear Images',
      clearImagesTitle: 'Clear all attached images',
      imgBadge: 'Img {n}',
      addMoreImages: 'Add Image',
      addMoreImagesTitle: 'Upload more images',
      deleteImageTitle: 'Remove this image'
    },
    editor: {
      badgeTitle: 'Click or double-click to view image',
      deleteBinding: 'Remove this image binding',
      imgBadge: 'Img {n}'
    },
    tabs: {
      history: 'History Prompts',
      snippets: 'Snippets Library'
    },
    queue: {
      title: 'History Prompts',
      pendingTag: '{count} Pending',
      resetAllPending: 'Reset All Pending',
      resetAllPendingTitle: 'Restore all used prompts to pending status',
      clear: 'Clear',
      clearTitle: 'Clear history prompts',
      unnamed: 'Untitled prompt',
      imageCount: '[{count} Images]',
      copyTitle: 'Copy compiled prompt',
      editTitle: 'Backfill to input box for editing',
      toggleDoneTitle: 'Toggle used/pending status',
      deleteTitle: 'Delete this prompt',
      empty: 'No prompts yet. Type in the input box above and click Save'
    },
    snippets: {
      addPlaceholder: 'Enter frequent prompt or instruction, Enter to add',
      addBtn: 'Add',
      emptyTitle: 'Snippets library is empty',
      emptyDesc: 'Added snippets will appear as quick capsules below',
      insertTitle: 'Insert at cursor in input box',
      copyTitle: 'Copy',
      deleteTitle: 'Delete'
    },
    snippetPicker: {
      title: 'Snippets Collection',
      shortcutsHint: '↑↓ Select · Enter / 1-9 Insert · Esc Close',
      searchPlaceholder: 'Search snippets...',
      emptySearch: 'No matching snippets found',
      selectToInsert: 'Click or press Enter to insert at cursor'
    },
    quickPanel: {
      title: 'PromptMag · Quick Input',
      placeholder: 'Type keywords, Enter to save…',
      pinned: 'Pinned on top',
      clickPin: 'Click to pin on top',
      expandFull: 'Expand to full panel',
      collapseOrb: 'Collapse to orb',
      uploadImg: 'Upload Image',
      pasteText: 'Paste Text',
      saveBtn: 'Save'
    },
    preview: {
      title: 'Image Preview',
      imgBadge: 'Img {n}',
      showInFolder: 'Show original file in folder',
      copyPath: 'Copy absolute image path',
      prev: 'Previous (←)',
      next: 'Next (→)',
      close: 'Close (ESC)'
    },
    settings: {
      title: 'Preferences',
      language: 'Language / 界面语言',
      langZh: '简体中文 (Default)',
      langEn: 'English',
      hotkeysTitle: 'Global Hotkeys',
      hotkeyPopDesc: 'Copy oldest pending prompt and mark as used',
      hotkeyPopLabel: 'Pop Oldest Prompt',
      hotkeyCollectDesc: 'Collect selected text into snippets library',
      hotkeyCollectLabel: 'Collect Selected Text',
      hotkeySnippetsDesc: 'Open snippets popup, select and paste to cursor',
      hotkeySnippetsLabel: 'Snippets Popup',
      hotkeyTip: 'Click input to record keys, changes apply globally.',
      relayTitle: 'Agent Auto-Relay (next_tasks.md)',
      relayDesc: 'Bidirectional sync with next_tasks.md',
      relayOn: 'Enabled',
      relayOff: 'Disabled',
      dataDirTitle: 'Data Directory',
      changeDir: 'Change Directory (Restart)',
      openDir: 'Open'
    },
    toast: {
      imagesAdded: 'Added and bound {count} image(s)',
      restoredPrompt: 'Restored images and keywords [Img {count}]',
      pastedText: 'Pasted text',
      noClipboardText: 'Clipboard has no text',
      composerEmpty: 'Input box is empty',
      copiedFullPrompt: 'Copied compiled prompt (with local image mappings)',
      pleaseInputOrImg: 'Please enter prompt text or add images',
      savedPrompt: 'Prompt saved to magazine',
      clearedImages: 'Cleared all bound images',
      copiedKeyword: 'Prompt copied',
      backfilled: 'Backfilled to editor',
      removed: 'Removed',
      clearedHistory: 'History prompts cleared',
      addedToSnippets: 'Added to snippets library',
      copied: 'Copied',
      magAllDone: 'All prompts used (click tag to reset to pending)',
      magEmpty: 'Magazine is empty: no prompts',
      poppedPrompt: 'Popped oldest prompt & pasted to cursor ({n} pending)',
      popFailed: 'Failed to pop prompt',
      collectedSnippet: 'Collected selected text to snippets',
      noSelectedText: 'No text selected',
      resetAllPending: 'All prompts reset to pending',
      taskMarkedDone: 'Marked as used',
      taskMarkedPending: 'Restored to pending',
      copiedImgPath: 'Copied local image path',
      langChanged: 'Language changed to: {lang}',
      autoRelayOn: 'Auto-relay enabled',
      autoRelayOff: 'Auto-relay disabled (next_tasks.md retained)'
    }
  }
}

/**
 * 翻译解析函数，支持点路径（如 'composer.placeholder'）以及变量替换（如 {count}）
 */
export function t(path, params = {}) {
  const lang = currentLocale.value === 'en' ? 'en' : 'zh'
  const keys = path.split('.')
  let val = messages[lang]
  for (const k of keys) {
    if (val && typeof val === 'object' && k in val) {
      val = val[k]
    } else {
      val = null
      break
    }
  }

  // 兜底中文
  if (typeof val !== 'string') {
    let fallback = messages.zh
    for (const k of keys) {
      if (fallback && typeof fallback === 'object' && k in fallback) {
        fallback = fallback[k]
      } else {
        fallback = path
        break
      }
    }
    val = typeof fallback === 'string' ? fallback : path
  }

  // 替换参数 {var}
  if (params && typeof params === 'object') {
    return val.replace(/\{(\w+)\}/g, (_, match) => {
      return match in params ? String(params[match]) : `{${match}}`
    })
  }

  return val
}

export function setLocale(lang) {
  const next = lang === 'en' ? 'en' : 'zh'
  currentLocale.value = next
  try {
    if (window.pm && window.pm.setLocale) {
      window.pm.setLocale(next)
    }
  } catch { /* ignore */ }
}
