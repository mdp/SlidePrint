<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { capturePageMessage, outputReady, openOutput, removeSlide, moveSlide, autoCapture, ensureContentReady, sendToBg } from '../../utils/messageHandling'
import { findHandlerFor } from '../../handlers'
import type { Slide } from '../../types/Slide'
import { useT, initI18n, setLocaleOverride } from '../../utils/i18n'
import packageJson from '../../package.json'
import { cropImageWithHiDPI } from '../../utils/imageCropping'

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
const selectedLang = ref<'en' | 'zh_CN' | 'de' | ''>('')
const needsPermission = ref(false)
const pendingAction = ref<null | 'select' | 'auto' | 'capture'>(null)


async function refreshSlides() {
  slides.value = await outputReady()
  const cropped = await Promise.all(slides.value.map(async (s) => {
    if (s.dimensions) {
      try {
        return await cropImageWithHiDPI({
          imgUri: s.img,
          dimensions: s.dimensions as unknown as DOMRect,
          coordinatesAlreadyScaled: !!s.preScaled,
        })
      } catch {
        return s.img
      }
    }
    return s.img
  }))
  thumbs.value = cropped
}

async function doSelect() {
  // Fire and close the popup immediately so user can draw
  try { void sendToBg('select:start') } catch {}
  try { window.close() } catch {}
}

async function doCapture() {
  busy.value = true
  try {
    await capturePageMessage(false, selection.value || undefined, false)
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
    const value = stored?.localeOverride as 'en' | 'zh_CN' | 'de' | undefined
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

function setLang(val: 'en' | 'zh_CN' | 'de') { selectedLang.value = val; setLocaleOverride(val) }
function onLangChange(e: Event) { const val = (e.target as HTMLSelectElement).value as 'en' | 'zh_CN' | 'de' | ''; selectedLang.value = val; setLocaleOverride(val || null) }

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
  <section class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <!-- Title -->
        <div class="title-container">
          <h1 class="title">
            <span class="title-main">SLIDEPRINT</span>
            <span class="title-version"><a href="https://github.com/mdp/slideprint">v{{ packageJson.version }}</a></span>
          </h1>
          <div class="title-border"></div>
        </div>
        
        <!-- Language Selector -->
        <div class="lang-selector">
          <button 
            v-for="lang in [{ code: 'en', label: 'EN' }, { code: 'de', label: 'DE' }, { code: 'zh_CN', label: '中' }]"
            :key="lang.code"
            class="lang-btn"
            :class="{ active: selectedLang === lang.code }"
            @click="setLang(lang.code as 'en' | 'zh_CN' | 'de')"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>
      
      <!-- Instructions Panel -->
      <div class="instructions-panel">
        <div class="panel-header">
          <span class="panel-title">{{ isAutoSupported ? 'AUTO MODE' : 'MANUAL MODE' }}</span>
          <div class="status-led" :class="{ active: isAutoSupported }"></div>
        </div>
        
        <ol class="instruction-list">
          <li v-if="isAutoSupported" v-html="t('instr_auto_step1')" class="instruction-item"></li>
          <li v-if="isAutoSupported" v-html="t('instr_auto_stepManual1')" class="instruction-item"></li>
          <li v-if="isAutoSupported" v-html="t('instr_auto_stepManual2')" class="instruction-item"></li>
          <li v-if="isAutoSupported" v-html="t('instr_auto_step4')" class="instruction-item"></li>
          
          <li v-if="!isAutoSupported" v-html="t('instr_manual_step1')" class="instruction-item"></li>
          <li v-if="!isAutoSupported" v-html="t('instr_manual_step2')" class="instruction-item"></li>
          <li v-if="!isAutoSupported" v-html="t('instr_manual_step3')" class="instruction-item"></li>
        </ol>
      </div>
    </header>

    <!-- Control Panel -->
    <div class="control-panel">
      <!-- Permission Alert -->
      <div v-if="needsPermission" class="permission-alert">
        <div class="alert-content">
          <div class="alert-icon">⚡</div>
          <span>ENABLE SITE ACCESS TO CAPTURE</span>
          <button class="enable-btn" @click="requestSitePermission">ENABLE</button>
        </div>
      </div>

      <!-- Primary Controls -->
      <div class="primary-controls">
        <button 
          class="btn" 
          :class="{ 
            'btn-active': !selection && !busy,
            'btn-inactive': selection || busy
          }"
          :disabled="busy" 
          @click="doSelect"
        >
          <span class="btn-text">{{ t('button_selectArea') }}</span>
        </button>
        
        <button 
          class="btn" 
          :class="{ 
            'btn-active': selection && !busy,
            'btn-inactive': !selection || busy
          }"
          :disabled="busy" 
          @click="doCapture"
        >
          <span class="btn-text">{{ t('button_capture') }}</span>
          <span class="btn-shortcut">SHIFT+K</span>
          <div v-if="busy" class="loading-pixels">...</div>
        </button>
      </div>

      <!-- Secondary Controls -->
      <div class="secondary-controls">
        <button class="btn btn-neutral" :disabled="busy" @click="doClear">
          <span class="btn-text">{{ t('button_clear') }}</span>
        </button>
        
        <button 
          class="btn" 
          :class="{ 
            'btn-active': slides.length > 0 && !busy,
            'btn-inactive': slides.length === 0 || busy
          }"
          :disabled="busy || !slides.length" 
          @click="doFinish"
        >
          <span class="btn-text">{{ t('button_printSave') }}</span>
        </button>
      </div>

      <!-- Auto Capture -->
      <div v-if="isAutoSupported" class="auto-capture-section">
        <button 
          class="btn btn-active" 
          :disabled="autoBusy" 
          @click="doAutoCapture"
        >
          <span class="btn-text">{{ t('button_autoCapture') }}</span>
        </button>
        
        <div v-if="autoBusy || autoStatus" class="auto-status">
          <div class="status-pixels" v-if="autoBusy">...</div>
          <span class="status-text">{{ autoStatus }}</span>
        </div>
      </div>
    </div>

    <!-- Selection Display -->
    <div v-if="selection" class="selection-display">
      <div class="selection-info">
        <span class="info-label">SELECTED AREA</span>
        <div class="coordinates">
          <code class="coord-value">{{ Math.round(selection.x) }},{{ Math.round(selection.y) }}</code>
          <span class="coord-separator">→</span>
          <code class="coord-value">{{ Math.round(selection.width) }}×{{ Math.round(selection.height) }}</code>
        </div>
      </div>
    </div>

    <!-- Slides Grid -->
    <div v-if="slides.length" class="slides-grid">
      <div
        v-for="(s, i) in slides"
        :key="i"
        class="slide-card"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i, $event)"
        @dragend="onDragEnd"
        :class="{ 'drag-over': overIndex === i }"
      >
        <div class="slide-preview">
          <img :src="thumbs[i] || s.img" class="slide-image" />
          <div class="slide-overlay">
            <span class="slide-number">#{{ String(i + 1).padStart(2, '0') }}</span>
          </div>
        </div>
        
        <div class="slide-controls">
          <button 
            class="drag-handle" 
            draggable="true" 
            @dragstart="onDragStart(i, $event)"
            title="Drag to reorder"
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </button>
          
          <div class="control-buttons">
            <button class="control-btn up" :disabled="i===0" @click="onMove(i,'up')">↑</button>
            <button class="control-btn down" :disabled="i===slides.length-1" @click="onMove(i,'down')">↓</button>
            <button class="control-btn delete" @click="onDelete(i)">×</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="empty-content">
        <h3 class="empty-title">{{ t('empty_noSlides') }}</h3>
        <p class="empty-subtitle">{{ t('empty_howTo') }}</p>
      </div>
    </div>
  </section>
</template>

<style>
/* Modern SaaS Business Dashboard Styling */
:root {
  --primary-color: #3b82f6; /* Modern blue */
  --primary-hover: #2563eb;
  --primary-light: #dbeafe;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --bg-card: #ffffff;
  --border-light: #e2e8f0;
  --border-medium: #cbd5e1;
  --border-strong: #94a3b8;
  --success: #059669;
  --success-light: #d1fae5;
  --warning: #d97706;
  --warning-light: #fef3c7;
  --error: #dc2626;
  --error-light: #fee2e2;
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --radius: 8px;
  --radius-sm: 6px;
  --radius-lg: 12px;
}

.container {
  padding: 20px;
  background: var(--bg-secondary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
}

/* Header Styling */
.header {
  margin-bottom: 24px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title-container {
  flex: 1;
}

.title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: var(--text-primary);
  letter-spacing: -0.025em;
}

.title-main {
  color: var(--text-primary);
}

.title-accent {
  color: var(--primary-color);
}

.title-version {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 400;
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

/* Language Selector */
.lang-selector {
  display: flex;
  gap: 4px;
  align-items: center;
}

.lang-btn {
  padding: 6px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-xs);
}

.lang-btn:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-medium);
  color: var(--text-primary);
}

.lang-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

/* Instructions Panel */
.instructions-panel {
  padding: 0;
  margin-bottom: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--error);
}

.status-led.active {
  background: var(--success);
}

.instruction-list {
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: step-counter;
}

.instruction-item {
  counter-increment: step-counter;
  position: relative;
  padding-left: 28px;
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.instruction-item::before {
  content: counter(step-counter);
  position: absolute;
  left: 0;
  top: 0;
  width: 20px;
  height: 20px;
  background: var(--primary-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: white;
}

/* Control Panel */
.control-panel {
  margin-bottom: 24px;
}

/* Permission Alert */
.permission-alert {
  margin-bottom: 16px;
  background: #fef3cd;
  border: 1px solid #fde68a;
  border-radius: var(--radius);
  padding: 12px;
}

.alert-content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #92400e;
}

.alert-icon {
  font-size: 16px;
}

.enable-btn {
  padding: 6px 12px;
  background: var(--warning);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.enable-btn:hover {
  background: #d97706;
}

/* Button Styling */
.btn {
  padding: 14px 18px;
  border: 1px solid var(--border-medium);
  border-radius: var(--radius);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  transition: all 0.15s ease;
  box-shadow: var(--shadow-xs);
  position: relative;
  overflow: hidden;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: var(--shadow-sm);
}

.btn.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.btn.secondary {
  background: var(--bg-secondary);
  border-color: var(--border-medium);
  color: var(--text-primary);
}

.btn.tertiary {
  background: var(--bg-primary);
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.btn.success {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.btn.success:hover:not(:disabled) {
  background: #059669;
  border-color: #059669;
}

.btn.auto-capture {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.btn.auto-capture:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

/* Intelligent Button States */
.btn.btn-active {
  background: var(--primary-color) !important;
  border-color: var(--primary-color) !important;
  color: white !important;
  box-shadow: var(--shadow-md), 0 0 0 3px rgba(59, 130, 246, 0.12);
  font-weight: 600;
}

.btn.btn-active:hover:not(:disabled) {
  background: var(--primary-hover) !important;
  border-color: var(--primary-hover) !important;
  color: white !important;
  box-shadow: var(--shadow-lg), 0 0 0 3px rgba(59, 130, 246, 0.2);
  transform: translateY(-2px);
}

.btn.btn-inactive {
  background: var(--bg-tertiary);
  border-color: var(--border-light);
  color: var(--text-muted);
  box-shadow: var(--shadow-xs);
}

.btn.btn-inactive:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--border-medium);
  color: var(--text-secondary);
  transform: translateY(-1px);
}

.btn.btn-neutral {
  background: var(--bg-secondary);
  border-color: var(--border-medium);
  color: var(--text-secondary);
  box-shadow: var(--shadow-xs);
}

.btn.btn-neutral:hover:not(:disabled) {
  background: var(--bg-tertiary);
  border-color: var(--border-strong);
  color: var(--text-primary);
  transform: translateY(-1px);
}

.btn-text {
  font-size: 13px;
}

.btn-shortcut {
  font-size: 11px;
  opacity: 0.7;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 4px;
  border-radius: 2px;
}

.loading-pixels {
  font-size: 12px;
  opacity: 0.7;
}

/* Control Layout */
.primary-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.secondary-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.auto-capture-section {
  margin-bottom: 16px;
}

.auto-capture-section .btn {
  width: 100%;
}

.auto-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status-pixels {
  font-size: 12px;
  opacity: 0.7;
}

/* Selection Display */
.selection-display {
  margin-bottom: 24px;
}

.selection-info {
  background: var(--primary-light);
  border: 2px solid var(--primary-color);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  display: block;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.coordinates {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.coord-value {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  font-size: 11px;
  color: var(--text-primary);
}

.coord-separator {
  color: var(--text-muted);
  font-size: 12px;
}

/* Slides Grid */
.slides-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.slide-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.slide-card:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.slide-card.drag-over {
  border-color: var(--primary-color);
  background: var(--bg-secondary);
}

.slide-preview {
  position: relative;
  aspect-ratio: 16/9;
  overflow: hidden;
}

.slide-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #ffffff;
}

.slide-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  backdrop-filter: blur(4px);
}

.slide-number {
  font-size: 11px;
  font-weight: 500;
}

.slide-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-light);
}

.drag-handle {
  padding: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: grab;
  transition: all 0.2s ease;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.drag-handle svg {
  width: 12px;
  height: 12px;
}

.control-buttons {
  display: flex;
  gap: 4px;
}

.control-btn {
  padding: 4px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.control-btn.up:hover:not(:disabled),
.control-btn.down:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-secondary);
}

.control-btn.delete {
  border-color: var(--error);
  color: var(--error);
}

.control-btn.delete:hover:not(:disabled) {
  background: var(--error);
  color: white;
}

/* Empty State */
.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 160px;
  margin-top: 32px;
  background: var(--bg-card);
  border: 2px dashed var(--border-medium);
  border-radius: var(--radius-lg);
  padding: 32px;
}

.empty-content {
  text-align: center;
  max-width: 320px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.empty-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Version link: unstyled and dark grey */
.title-version a {
  color: #374151; /* dark grey */
  text-decoration: none;
}
.title-version a:visited {
  color: #374151;
}
.title-version a:hover,
.title-version a:active,
.title-version a:focus {
  color: #374151;
  text-decoration: none;
}

</style>
