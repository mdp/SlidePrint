<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { capturePageMessage, outputReady, openOutput, removeSlide, moveSlide, autoCapture, ensureContentReady, sendToBg } from '../../utils/messageHandling'
import { findHandlerFor } from '../../handlers'
import type { Slide } from '../../types/Slide'
import { useT, initI18n, setLocaleOverride } from '../../utils/i18n'

const selection = ref<DOMRect | null>(null)
const slides = ref<Slide[]>([])
const busy = ref(false)
const thumbs = ref<string[]>([])
const isAutoSupported = ref(false)
const autoBusy = ref(false)
const autoStatus = ref('')
const autoTotal = ref<number | null>(null)
let autoInterval: number | null = null
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
const { t } = useT()
const selectedLang = ref<'en' | 'zh_TW' | ''>('')
const needsPermission = ref(false)
const pendingAction = ref<null | 'select' | 'auto' | 'capture'>(null)

async function cropImage(imgUri: string, dimensions?: DOMRect): Promise<string> {
  if (!dimensions) return imgUri
  const canvas = document.createElement('canvas')
  const img = new Image()
  img.src = imgUri
  return await new Promise((resolve) => {
    img.onload = () => {
      try {
        canvas.width = dimensions.width
        canvas.height = dimensions.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, dimensions.x, dimensions.y, dimensions.width, dimensions.height, 0, 0, dimensions.width, dimensions.height)
        resolve(canvas.toDataURL('image/jpeg'))
      } catch {
        resolve(imgUri)
      }
    }
    img.onerror = () => resolve(imgUri)
  })
}

async function refreshSlides() {
  slides.value = await outputReady()
  const results: string[] = []
  for (const s of slides.value) {
    results.push(await cropImage(s.img, s.dimensions || undefined))
  }
  thumbs.value = results
}

async function doSelect() {
  // Fire and close the popup immediately so user can draw
  try { void sendToBg('select:start') } catch {}
  try { window.close() } catch {}
}

async function doCapture() {
  if (!selection.value) return
  busy.value = true
  try {
    await capturePageMessage(false, selection.value)
    await refreshSlides()
  } finally {
    busy.value = false
  }
}

async function doFinish() { await openOutput() }

async function doClear() {
  await browser.runtime.sendMessage({ event: 'reset' })
  slides.value = []
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const origin = new URL(tab.url).origin
      const key = `selection:${origin}`
      await browser.storage.local.remove(key)
    }
  } catch {}
  selection.value = null
}

// Handlers
let storageHandler: ((changes: Record<string, any>, area: any) => void) | null = null
const handleActivated = async () => {
  try {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true })
    if (active?.url) isAutoSupported.value = !!findHandlerFor(active.url)
    else isAutoSupported.value = false
  } catch { isAutoSupported.value = false }
}
const handleUpdated = async (_tabId: number, _changeInfo: any, tab: any) => {
  try { if (tab?.active) await handleActivated() } catch {}
}
const onSlidesUpdated = async (msg: any) => {
  if (msg?.event === 'slides:updated') { await refreshSlides() }
}
const onCaptureNeedsPermission = (msg: any) => {
  if (msg?.event === 'capture:need-permission') { needsPermission.value = true; pendingAction.value = 'capture' }
}

onMounted(async () => {
  await initI18n()
  try {
    const stored = await browser.storage.local.get('localeOverride')
    const value = stored?.localeOverride as 'en' | 'zh_TW' | undefined
    selectedLang.value = value || ''
  } catch {}
  // Notify background popup opened to prepare offscreen
  try { await browser.runtime.sendMessage({ event: 'popup:opened' }) } catch {}
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try { isAutoSupported.value = !!findHandlerFor(tab.url) } catch { isAutoSupported.value = false }
    selection.value = null
    const origin = new URL(tab.url).origin
    const key = `selection:${origin}`
    // Load existing selection immediately (popup might open after selection already saved)
    try {
      const stored = await browser.storage.local.get(key)
      if (stored && stored[key]) selection.value = stored[key]
    } catch {}
    storageHandler = (changes: Record<string, any>, area: any) => {
      if (area !== 'local') return
      if (changes[key]) selection.value = changes[key].newValue
    }
    try { if (storageHandler) browser.storage.onChanged.addListener(storageHandler) } catch {}
  }
  await refreshSlides()
  try { browser.tabs.onActivated.addListener(handleActivated) } catch {}
  try { browser.tabs.onUpdated.addListener(handleUpdated) } catch {}
  try { browser.runtime.onMessage.addListener(onSlidesUpdated) } catch {}
  try { browser.runtime.onMessage.addListener(onCaptureNeedsPermission) } catch {}
})

onUnmounted(() => {
  try { if (storageHandler) browser.storage.onChanged.removeListener(storageHandler) } catch {}
  try { browser.tabs.onActivated.removeListener(handleActivated) } catch {}
  try { browser.tabs.onUpdated.removeListener(handleUpdated) } catch {}
  try { browser.runtime.onMessage.removeListener(onSlidesUpdated) } catch {}
  try { browser.runtime.onMessage.removeListener(onCaptureNeedsPermission) } catch {}
})

async function onDelete(i: number) { await removeSlide(i); await refreshSlides() }
async function onMove(i: number, dir: 'up' | 'down') { const to = dir === 'up' ? i - 1 : i + 1; await moveSlide(i, to); await refreshSlides() }
function onDragStart(i: number, e: DragEvent) { dragIndex.value = i; overIndex.value = null; try { e.dataTransfer?.setData('text/plain', String(i)) } catch {}; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }
function onDragOver(i: number, e: DragEvent) { e.preventDefault(); overIndex.value = i; if (e.dataTransfer) e.dataTransfer.dropEffect = 'move' }
async function onDrop(i: number, e: DragEvent) { e.preventDefault(); const from = dragIndex.value; dragIndex.value = null; overIndex.value = null; if (from === null || from === i) return; await moveSlide(from, i); await refreshSlides() }
function onDragEnd() { dragIndex.value = null; overIndex.value = null }

async function doAutoCapture() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isAutoSupported.value) return
  try {
    const ready = await ensureContentReady(tab.id)
    if (!ready) { needsPermission.value = true; pendingAction.value = 'auto'; return }
  } catch { needsPermission.value = true; pendingAction.value = 'auto'; return }
  let onOutputOpened: ((msg: any) => void) | null = null
  let onAutoProgress: ((msg: any) => void) | null = null
  try {
    autoBusy.value = true
    autoStatus.value = t('auto_status', [0, 0])
    onOutputOpened = async (msg: any) => {
      if (msg?.event === 'output:opened') {
        autoBusy.value = false
        autoStatus.value = t('auto_done')
        await refreshSlides()
      }
    }
    onAutoProgress = (msg: any) => {
      if (msg?.event === 'auto:progress' && msg?.data) {
        const { current, total } = msg.data
        if (typeof total === 'number') autoTotal.value = total
        if (typeof current === 'number' && typeof total === 'number') {
          autoStatus.value = t('auto_status', [current, total])
        }
      }
    }
    try {
      if (onOutputOpened) browser.runtime.onMessage.addListener(onOutputOpened)
      if (onAutoProgress) browser.runtime.onMessage.addListener(onAutoProgress)
    } catch {}
    await autoCapture()
  } finally {
    try { if (onOutputOpened) browser.runtime.onMessage.removeListener(onOutputOpened) } catch {}
    try { if (onAutoProgress) browser.runtime.onMessage.removeListener(onAutoProgress) } catch {}
  }
}

function setLang(val: 'en' | 'zh_TW') { selectedLang.value = val; setLocaleOverride(val) }
function onLangChange(e: Event) { const val = (e.target as HTMLSelectElement).value as 'en' | 'zh_TW' | ''; selectedLang.value = val; setLocaleOverride(val || null) }

async function requestSitePermission() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url
    if (!url) return
    let granted = false
    try {
      // @ts-ignore
      if (browser?.permissions?.request) {
        // @ts-ignore
        granted = await browser.permissions.request({ origins: ['<all_urls>'], permissions: ['activeTab', 'tabs'] as any })
      }
    } catch {}
    if (!granted) {
      try {
        // @ts-ignore
        granted = await new Promise<boolean>((resolve) => chrome?.permissions?.request?.({ origins: ['<all_urls>'], permissions: ['activeTab', 'tabs'] }, resolve))
      } catch {}
    }
    if (granted && tab?.id) {
      needsPermission.value = false
      await ensureContentReady(tab.id)
      const action = pendingAction.value
      pendingAction.value = null
      if (action === 'select') {
        setTimeout(() => { doSelect().catch(() => {}) }, 0)
      } else if (action === 'auto') {
        setTimeout(() => { doAutoCapture().catch(() => {}) }, 0)
      } else if (action === 'capture') {
        setTimeout(() => { doCapture().catch(() => {}) }, 0)
      }
    }
  } catch {}
}
</script>

<template>
  <section class="p-3 text-sm text-slate-800">
    <header class="mb-3 sticky top-0 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b z-10 relative">
      <div class="py-2">
        <h1 class="font-semibold text-slate-900">SlidePrint</h1>
        <div class="absolute right-3 top-2 text-xs text-slate-600 select-none">
          <button class="px-1 py-0.5 rounded hover:bg-slate-100" :class="{ 'text-slate-900 font-medium': selectedLang === 'en' }" title="English" @click="setLang('en')">en</button>
          <span class="px-0.5">|</span>
          <button class="px-1 py-0.5 rounded hover:bg-slate-100" :class="{ 'text-slate-900 font-medium': selectedLang === 'zh_TW' }" :title="t('lang_zh_TW')" @click="setLang('zh_TW')">中</button>
        </div>
        <div class="mt-1 grid grid-cols-1 md:grid-cols-[1fr_auto] md:items-start gap-2">
          <ol v-if="isAutoSupported" class="list-decimal pl-5 text-xs text-slate-600 space-y-0.5">
            <li v-html="t('instr_auto_step1')"></li>
            <li v-html="t('instr_auto_stepManual1')"></li>
            <li v-html="t('instr_auto_stepManual2')"></li>
            <li v-html="t('instr_auto_step4')"></li>
          </ol>
          <ol v-else class="list-decimal pl-5 text-xs text-slate-600 space-y-0.5">
            <li v-html="t('instr_manual_step1')"></li>
            <li v-html="t('instr_manual_step2')"></li>
            <li v-html="t('instr_manual_step3')"></li>
          </ol>
          <div class="flex gap-2 md:justify-end">
            <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-white shadow-sm hover:bg-[var(--color-brand-600)] disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy" @click="doSelect">{{ t('button_selectArea') }}</button>
            <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white shadow-sm hover:bg-[var(--color-accent-600)] disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy || !selection" @click="doCapture" :title="t('tooltip_shiftK')">
              <svg v-if="busy" class="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"/></svg>
              <span>{{ t('button_capture') }} (Shift+K)</span>
            </button>
            <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy" @click="doClear">{{ t('button_clear') }}</button>
            <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy" @click="doFinish">{{ t('button_printSave') }}</button>
          </div>
        </div>

        <div v-if="needsPermission" class="mt-2 mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center justify-between">
          <span>Enable on this site to capture.</span>
          <button class="px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-500" @click="requestSitePermission">Enable</button>
        </div>

        <div v-if="isAutoSupported" class="mt-2 pb-2">
          <button class="w-full px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-600)] shadow-sm flex items-center justify-center gap-2 disabled:opacity-50" :disabled="autoBusy" @click="doAutoCapture" :title="t('button_autoCapture')">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-white"><path d="M12 5v14m-7-7h14"/></svg>
            <span>{{ t('button_autoCapture') }}</span>
          </button>
          <div v-if="autoBusy || autoStatus" class="mt-2 text-xs text-slate-600 flex items-center gap-2">
            <svg v-if="autoBusy" class="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"/></svg>
            <span>{{ autoStatus }}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="mb-2 text-xs text-slate-600" v-if="selection">
      <div class="inline-flex items-center gap-2 rounded-md border px-2 py-1 bg-white shadow-sm">
        <span class="text-slate-500">Selected</span>
        <code class="text-slate-700">{{ Math.round(selection.x) }},{{ Math.round(selection.y) }}</code>
        <span class="text-slate-400">→</span>
        <code class="text-slate-700">{{ Math.round(selection.width) }}×{{ Math.round(selection.height) }}</code>
      </div>
    </div>

    <div v-if="slides.length" class="grid grid-cols-2 gap-3 pr-2">
      <div
        v-for="(s, i) in slides"
        :key="i"
        class="border rounded-lg bg-white overflow-hidden shadow-sm"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i, $event)"
        @dragend="onDragEnd"
        :class="{ 'ring-2 ring-[var(--color-brand)]': overIndex === i }"
      >
        <img :src="thumbs[i] || s.img" class="w-full block" />
        <div class="flex items-center justify-between px-2 py-1 border-t bg-slate-50">
          <div class="flex items-center gap-2">
            <button class="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing rounded" title="Drag to reorder" aria-label="Drag to reorder" draggable="true" @dragstart="onDragStart(i, $event)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </button>
            <span class="text-[10px] text-slate-500">#{{ i + 1 }}</span>
          </div>
          <div class="flex gap-1">
            <button class="px-1.5 py-0.5 text-xs rounded bg-slate-200 hover:bg-slate-300" :disabled="i===0" @click="onMove(i,'up')">↑</button>
            <button class="px-1.5 py-0.5 text-xs rounded bg-slate-200 hover:bg-slate-300" :disabled="i===slides.length-1" @click="onMove(i,'down')">↓</button>
            <button class="px-1.5 py-0.5 text-xs rounded bg-red-600 text-white hover:bg-red-500" @click="onDelete(i)">Delete</button>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-slate-500 text-xs">
      <div class="mt-4 border-2 border-dashed rounded-lg p-4 text-center">
        <p class="mb-1">{{ t('empty_noSlides') }}</p>
        <p>{{ t('empty_howTo') }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
</style>
