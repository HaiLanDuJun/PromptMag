<script setup>
/**
 * AccountsTab - 测试账号密码速记
 * 便捷记录测试账号凭据：账号/密码一键复制，密码默认掩码显示，
 * 可切换原文显示；密码落盘前经 safeStorage 系统级加密（Windows DPAPI）。
 */
import { reactive, ref } from 'vue'
import {
  state, t, currentLocale, toast,
  addAccount, removeAccount, revealPassword,
  copyAccountPassword, copyAccountUsername, isPasswordEncrypted
} from '../lib/store'

const showForm = ref(false)
const revealed = reactive({})   // id -> 是否正在原文显示
let revealTimers = {}

const form = reactive({ title: '', username: '', password: '' })

function resetForm() {
  form.title = ''
  form.username = ''
  form.password = ''
}

async function submitForm() {
  if (!form.username && !form.password) {
    toast(t('accounts.needInput'))
    return
  }
  await addAccount({ title: form.title, username: form.username, password: form.password })
  resetForm()
  showForm.value = false
}

async function toggleReveal(acc) {
  if (revealed[acc.id]) {
    revealed[acc.id] = false
    clearTimeout(revealTimers[acc.id])
    return
  }
  const plain = await revealPassword(acc)
  acc._plain = plain
  revealed[acc.id] = true
  clearTimeout(revealTimers[acc.id])
  // 原文显示 10 秒后自动恢复掩码，防止路过被窥屏
  revealTimers[acc.id] = setTimeout(() => {
    revealed[acc.id] = false
    delete acc._plain
  }, 10000)
}

function onDelete(acc) {
  if (!confirm(t('accounts.confirmDelete', { title: acc.title }))) return
  removeAccount(acc.id)
  toast(t('accounts.deleted'))
}

function encTag(acc) {
  return isPasswordEncrypted(acc)
    ? t('accounts.encryptedTag')
    : t('accounts.plainTag')
}
</script>

<template>
  <section class="space-y-2.5 select-none">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between pt-0.5">
      <div class="flex items-center gap-1.5">
        <span class="text-[13px] font-semibold text-slate-200">{{ t('accounts.title') }}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60">
          {{ state.accounts.length }}
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="btn !py-1 text-slate-300 hover:text-sky-300"
          :title="t('accounts.openPopup') + (state.settings.hotkeyAccounts ? ` (${state.settings.hotkeyAccounts})` : '')"
          @click="window.pm && window.pm.openSnippetPicker && window.pm.openSnippetPicker('accounts')"
        >
          ⧉ {{ t('accounts.popupBtn') }}
        </button>
        <button class="btn btn-primary !py-1" @click="showForm = !showForm">
          {{ showForm ? t('common.cancel') : t('accounts.addBtn') }}
        </button>
      </div>
    </div>

    <!-- 新增表单 -->
    <div v-if="showForm" class="rounded-xl border border-sky-400/25 bg-slate-900/70 p-2.5 space-y-2">
      <div>
        <div class="text-[10px] text-slate-400 mb-1">{{ t('accounts.fieldTitle') }}</div>
        <input
          v-model="form.title"
          type="text"
          class="w-full rounded-lg bg-slate-800/80 border border-slate-700/70 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400/60 transition-colors"
          :placeholder="t('accounts.titlePlaceholder')"
        />
      </div>
      <div>
        <div class="text-[10px] text-slate-400 mb-1">{{ t('accounts.fieldUsername') }}</div>
        <input
          v-model="form.username"
          type="text"
          class="w-full rounded-lg bg-slate-800/80 border border-slate-700/70 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400/60 transition-colors"
          :placeholder="t('accounts.usernamePlaceholder')"
          @keydown.enter="submitForm"
        />
      </div>
      <div>
        <div class="text-[10px] text-slate-400 mb-1">{{ t('accounts.fieldPassword') }}</div>
        <input
          v-model="form.password"
          type="password"
          class="w-full rounded-lg bg-slate-800/80 border border-slate-700/70 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-400/60 transition-colors"
          :placeholder="t('accounts.passwordPlaceholder')"
          @keydown.enter="submitForm"
        />
      </div>
      <div class="flex items-center justify-between pt-0.5">
        <span class="text-[9.5px] text-slate-500 leading-snug">{{ t('accounts.encHint') }}</span>
        <div class="flex items-center gap-1.5">
          <button class="btn !py-1" @click="resetForm(); showForm = false">{{ t('common.cancel') }}</button>
          <button class="btn btn-primary !py-1" @click="submitForm">{{ t('common.save') }}</button>
        </div>
      </div>
    </div>

    <!-- 账号列表 -->
    <div v-if="state.accounts.length === 0 && !showForm" class="py-8 text-center">
      <div class="text-2xl mb-2 opacity-40">🔐</div>
      <div class="text-[11px] text-slate-500">{{ t('accounts.empty') }}</div>
      <div class="text-[10px] text-slate-600 mt-1">{{ t('accounts.emptyHint') }}</div>
    </div>

    <div v-for="acc in state.accounts" :key="acc.id" class="rounded-xl border border-slate-700/60 bg-slate-900/50 p-2.5 hover:border-slate-600 transition-colors">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-slate-200 truncate">{{ acc.title }}</div>
          <div class="text-[9.5px] text-slate-500 mt-0.5">{{ encTag(acc) }}</div>
        </div>
        <button class="icon-btn hover:!text-rose-400 shrink-0" :title="t('common.delete')" @click="onDelete(acc)">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      <!-- 账号行 -->
      <div v-if="acc.username" class="flex items-center gap-1.5 mt-2">
        <span class="text-[10px] text-slate-500 w-8 shrink-0">{{ t('accounts.usernameShort') }}</span>
        <span class="flex-1 min-w-0 truncate text-[11px] text-slate-300 font-mono bg-slate-800/60 rounded px-2 py-1">{{ acc.username }}</span>
        <button class="btn !py-0.5 !px-2 shrink-0" :title="t('accounts.copyUsername')" @click="copyAccountUsername(acc)">
          {{ t('common.copy') }}
        </button>
      </div>

      <!-- 密码行 -->
      <div v-if="acc.password" class="flex items-center gap-1.5 mt-1.5">
        <span class="text-[10px] text-slate-500 w-8 shrink-0">{{ t('accounts.passwordShort') }}</span>
        <span class="flex-1 min-w-0 truncate text-[11px] text-slate-300 font-mono bg-slate-800/60 rounded px-2 py-1">
          {{ revealed[acc.id] ? (acc._plain || '') : '••••••••' }}
        </span>
        <button
          class="icon-btn shrink-0"
          :class="revealed[acc.id] ? '!text-amber-400' : ''"
          :title="revealed[acc.id] ? t('accounts.hidePassword') : t('accounts.showPassword')"
          @click="toggleReveal(acc)"
        >
          <svg v-if="!revealed[acc.id]" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        </button>
        <button class="btn !py-0.5 !px-2 shrink-0" :title="t('accounts.copyPassword')" @click="copyAccountPassword(acc)">
          {{ t('common.copy') }}
        </button>
      </div>

      <div v-if="acc.note" class="text-[10px] text-slate-500 mt-1.5 leading-snug">{{ acc.note }}</div>
    </div>

    <!-- 存储说明 -->
    <div class="text-[9.5px] text-slate-600 leading-snug pt-0.5">
      {{ t('accounts.storageHint') }}
    </div>
  </section>
</template>
