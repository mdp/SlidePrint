<script lang="ts" setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { capturePageMessage, outputReady, selectArea, openOutput, removeSlide, moveSlide, autoCapture } from '../../utils/messageHandling'
import { findHandlerFor } from '../../handlers'
import type { Slide } from '../../types/Slide'

const selection = ref<DOMRect | null>(null)
const slides = ref<Slide[]>([])
const busy = ref(false)
const thumbs = ref<string[]>([])
const isAutoSupported = ref(false)
const autoBusy = ref(false)
const autoStatus = ref('')
let autoInterval: number | null = null
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

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
  // regenerate thumbnails cropped to slide.dimensions
  const results: string[] = []
  for (const s of slides.value) {
    results.push(await cropImage(s.img, s.dimensions || undefined))
  }
  thumbs.value = results
}

async function ensureContentReady(tabId: number) {
  // Try a quick ping; if it fails, inject and retry a few times
  for (let i = 0; i < 8; i++) {
    try {
      const res = await browser.tabs.sendMessage(tabId, { event: 'content:ready' })
      if (res?.result === true || res === true) return
    } catch {}
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: ['injected.js'] })
    } catch {}
    await new Promise(r => setTimeout(r, 180))
  }
  throw new Error('Content script not ready')
}

async function doSelect() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.includes('chrome.google.com/webstore')) {
    console.warn('Cannot select on this page type')
    return
  }
  busy.value = true
  try {
    await ensureContentReady(tab.id)
    let rect: DOMRect
    try {
      rect = await selectArea(tab.id)
    } catch {
      await new Promise(r => setTimeout(r, 200))
      rect = await selectArea(tab.id)
    }
    selection.value = rect
    if (tab.url) {
      const origin = new URL(tab.url).origin
      const key = `selection:${origin}`
      await browser.storage.local.set({ [key]: rect })
    }
  } finally {
    busy.value = false
  }
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

async function doFinish() {
  await openOutput()
}

async function doClear() {
  await browser.runtime.sendMessage({ event: 'reset' })
  slides.value = []
}

onMounted(async () => {
  await browser.runtime.sendMessage({ event: 'sidepanel:opened' })
  // Load saved selection for current origin
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    // Detect site support for auto-capture
    try { isAutoSupported.value = !!findHandlerFor(tab.url) } catch { isAutoSupported.value = false }
    // Clear any previously shown selection on panel load
    selection.value = null
    const origin = new URL(tab.url).origin
    const key = `selection:${origin}`
    // Do not prefill selection from storage on load; wait for user action or updates

    // Watch for updates from background (e.g., keyboard shortcut flow)
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes[key]) {
        selection.value = changes[key].newValue
      }
    })
  }
  await refreshSlides()

  // Keep auto-capture support in sync with the active tab without injecting anything
  const updateAutoSupportFromActiveTab = async () => {
    try {
      const [active] = await browser.tabs.query({ active: true, currentWindow: true })
      if (active?.url) {
        isAutoSupported.value = !!findHandlerFor(active.url)
      } else {
        isAutoSupported.value = false
      }
    } catch {
      isAutoSupported.value = false
    }
  }

  const handleActivated = async () => { await updateAutoSupportFromActiveTab() }
  const handleUpdated = async (_tabId: number, _changeInfo: any, tab: any) => {
    try {
      if (tab?.active) await updateAutoSupportFromActiveTab()
    } catch {}
  }

  try { browser.tabs.onActivated.addListener(handleActivated) } catch {}
  try { browser.tabs.onUpdated.addListener(handleUpdated) } catch {}

  onUnmounted(() => {
    try { browser.tabs.onActivated.removeListener(handleActivated) } catch {}
    try { browser.tabs.onUpdated.removeListener(handleUpdated) } catch {}
  })
})

async function onDelete(i: number) {
  await removeSlide(i)
  await refreshSlides()
}

async function onMove(i: number, dir: 'up' | 'down') {
  const to = dir === 'up' ? i - 1 : i + 1
  await moveSlide(i, to)
  await refreshSlides()
}

function onDragStart(i: number, e: DragEvent) {
  dragIndex.value = i
  overIndex.value = null
  try { e.dataTransfer?.setData('text/plain', String(i)) } catch {}
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(i: number, e: DragEvent) {
  e.preventDefault()
  overIndex.value = i
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

async function onDrop(i: number, e: DragEvent) {
  e.preventDefault()
  const from = dragIndex.value
  dragIndex.value = null
  overIndex.value = null
  if (from === null || from === i) return
  await moveSlide(from, i)
  await refreshSlides()
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}

async function doAutoCapture() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isAutoSupported.value) return
  try {
    autoBusy.value = true
    autoStatus.value = 'Auto capturing…'
    const onOutputOpened = async (msg: any) => {
      if (msg?.event === 'output:opened') {
        if (autoInterval) clearInterval(autoInterval)
        autoInterval = null
        autoBusy.value = false
        autoStatus.value = 'Auto capture complete'
        await refreshSlides()
        try { browser.runtime.onMessage.removeListener(onOutputOpened) } catch {}
      }
    }
    try { browser.runtime.onMessage.addListener(onOutputOpened) } catch {}
    await autoCapture()
  } finally {
    if (autoInterval) clearInterval(autoInterval)
    autoInterval = window.setInterval(async () => {
      await refreshSlides()
    }, 800)
  }
}
</script>

<template>
  <section class="p-3 text-sm text-slate-800">
    <header class="mb-3 sticky top-0 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b z-10">
      <div class="py-2">
        <h1 class="font-semibold text-slate-900">SlidePrint</h1>
        <div class="mt-1 grid grid-cols-1 md:grid-cols-[1fr_auto] md:items-start gap-2">
          <ol class="list-decimal pl-5 text-xs text-slate-600 space-y-0.5">
            <li>Click <b>Select Area</b> and drag on the page (Esc to cancel).</li>
            <li>Navigate and click <b>Capture</b> for each slide.</li>
            <li>Reorder or delete below, then <b>Print / Save</b> to print or save as PDF.</li>
          </ol>
          <span class="hidden md:inline-flex items-center justify-center h-6 px-2 text-[11px] rounded bg-slate-100 text-slate-600 border">Alt+Shift+S</span>
        </div>
      </div>
      <div class="pb-2 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-2">
        <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-[var(--color-brand)] text-white shadow-sm hover:bg-[var(--color-brand-600)] disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy" @click="doSelect">Select Area</button>
        <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white shadow-sm hover:bg-[var(--color-accent-600)] disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy || !selection" @click="doCapture">
          <svg v-if="busy" class="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"/></svg>
          <span>Capture</span>
        </button>
        <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy" @click="doClear">Clear</button>
        <button class="w-full md:w-auto px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2" :disabled="busy" @click="doFinish">Print/Save</button>
      </div>

      <div v-if="isAutoSupported" class="pb-2">
        <button class="w-full px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-slate-800 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50" :disabled="autoBusy" @click="doAutoCapture" title="Automatically capture all slides on this site">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-[var(--color-brand)]"><path d="M12 5v14m-7-7h14"/></svg>
          <span>Auto Capture</span>
        </button>
        <div v-if="autoBusy || autoStatus" class="mt-2 text-xs text-slate-600 flex items-center gap-2">
          <svg v-if="autoBusy" class="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"/></svg>
          <span>{{ autoStatus }}</span>
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

    <div v-if="slides.length" class="grid grid-cols-1 gap-3 pr-2 overflow-auto" style="max-height: calc(100vh - 160px);">
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
            <button
              class="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing rounded"
              title="Drag to reorder"
              aria-label="Drag to reorder"
              draggable="true"
              @dragstart="onDragStart(i, $event)"
            >
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
        <p class="mb-1">No slides captured yet.</p>
        <p>Click <b>Select Area</b>, drag on the page, then <b>Capture</b> each slide.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
</style>
