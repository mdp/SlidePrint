<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { capturePageMessage, outputReady, openOutput, removeSlide, moveSlide, autoCapture, ensureContentReady, sendToBg } from '../../utils/messageHandling'
import { findHandlerFor } from '../../handlers'
import type { Slide } from '../../types/Slide'
import { useT, initI18n, setLocaleOverride } from '../../utils/i18n'
import packageJson from '../../package.json'

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

async function cropImage(imgUri: string, dimensions?: DOMRect): Promise<string> {
  if (!dimensions) return imgUri
  const canvas = document.createElement('canvas')
  const img = new Image()
  img.src = imgUri
  return await new Promise((resolve) => {
    img.onload = () => {
      try {
        // Apply device pixel ratio scaling for HiDPI displays
        // The screenshot is captured at device resolution, but selection coords are in CSS pixels
        const devicePixelRatio = window.devicePixelRatio || 1
        const scaledX = dimensions.x * devicePixelRatio
        const scaledY = dimensions.y * devicePixelRatio
        const scaledWidth = dimensions.width * devicePixelRatio
        const scaledHeight = dimensions.height * devicePixelRatio
        
        canvas.width = dimensions.width
        canvas.height = dimensions.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight, 0, 0, dimensions.width, dimensions.height)
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
  busy.value = true
  try {
    await capturePageMessage(false, selection.value || undefined)
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
  <section class="retro-container">
    <!-- Holographic Header -->
    <header class="retro-header">
      <div class="header-content">
        <!-- Main Title with Glitch Effect -->
        <div class="title-container">
          <h1 class="retro-title">
            <span class="title-main">SLIDE</span>
            <span class="title-accent">PRINT</span>
            <span class="title-version">v{{ packageJson.version }}</span>
          </h1>
          <div class="title-underline"></div>
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
      
      <!-- Holographic Instructions Panel -->
      <div class="instructions-panel">
        <div class="panel-header">
          <span class="panel-title">{{ isAutoSupported ? 'AUTO MODE' : 'MANUAL MODE' }}</span>
          <div class="status-indicator" :class="{ active: isAutoSupported }"></div>
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
        <button class="retro-btn primary" :disabled="busy" @click="doSelect">
          <span class="btn-icon">🎯</span>
          <span class="btn-text">{{ t('button_selectArea') }}</span>
          <div class="btn-glow"></div>
        </button>
        
        <button class="retro-btn secondary" :disabled="busy" @click="doCapture">
          <span class="btn-icon">📸</span>
          <span class="btn-text">{{ t('button_capture') }}</span>
          <span class="btn-shortcut">SHIFT+K</span>
          <div class="btn-glow"></div>
          <svg v-if="busy" class="loading-spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity="0.25"/>
            <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8v4A4 4 0 008 12H4z"/>
          </svg>
        </button>
      </div>

      <!-- Secondary Controls -->
      <div class="secondary-controls">
        <button class="retro-btn tertiary" :disabled="busy" @click="doClear">
          <span class="btn-text">{{ t('button_clear') }}</span>
        </button>
        
        <button class="retro-btn success" :disabled="busy || !slides.length" @click="doFinish">
          <span class="btn-icon">💾</span>
          <span class="btn-text">{{ t('button_printSave') }}</span>
          <div class="btn-glow"></div>
        </button>
      </div>

      <!-- Auto Capture -->
      <div v-if="isAutoSupported" class="auto-capture-section">
        <button class="retro-btn auto-capture" :disabled="autoBusy" @click="doAutoCapture">
          <span class="btn-icon">🤖</span>
          <span class="btn-text">{{ t('button_autoCapture') }}</span>
          <div class="btn-glow"></div>
        </button>
        
        <div v-if="autoBusy || autoStatus" class="auto-status">
          <div class="status-spinner" v-if="autoBusy"></div>
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
        <div class="empty-animation"></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Ultra Retrowave 80s Styling */
.retro-container {
  padding: 20px;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}

/* Header Styling */
.retro-header {
  margin-bottom: 24px;
  position: relative;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.title-container {
  position: relative;
}

.retro-title {
  font-family: 'Orbitron', monospace;
  font-size: 28px;
  font-weight: 900;
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  animation: hologramGlitch 8s infinite;
}

.title-main {
  background: linear-gradient(45deg, var(--color-brand), #ff6600);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 
    0 0 10px rgba(255, 0, 128, 0.8),
    0 0 20px rgba(255, 0, 128, 0.6),
    0 0 30px rgba(255, 0, 128, 0.4);
  filter: drop-shadow(0 0 8px rgba(255, 0, 128, 0.5));
}

.title-accent {
  background: linear-gradient(45deg, var(--color-accent), #8a2be2);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 
    0 0 10px rgba(0, 255, 255, 0.8),
    0 0 20px rgba(0, 255, 255, 0.6),
    0 0 30px rgba(0, 255, 255, 0.4);
  filter: drop-shadow(0 0 8px rgba(0, 255, 255, 0.5));
}

.title-version {
  font-size: 12px;
  color: var(--color-warning);
  text-shadow: 0 0 8px rgba(255, 255, 0, 0.8);
  font-weight: 400;
}

.title-underline {
  height: 2px;
  background: linear-gradient(90deg, var(--color-brand), var(--color-accent), var(--color-brand));
  margin-top: 4px;
  border-radius: 1px;
  box-shadow: 0 0 8px rgba(255, 0, 128, 0.6);
  animation: neonFlicker 3s infinite alternate;
}

/* Language Selector */
.lang-selector {
  display: flex;
  gap: 4px;
  align-items: center;
}

.lang-btn {
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: 'Rajdhani', sans-serif;
}

.lang-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.4);
}

.lang-btn.active {
  background: rgba(0, 255, 255, 0.1);
  border-color: var(--color-accent);
  color: var(--color-accent);
  box-shadow: 0 0 12px rgba(0, 255, 255, 0.6);
}

/* Instructions Panel */
.instructions-panel {
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 8px;
  padding: 16px;
  backdrop-filter: blur(10px);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-title {
  font-family: 'Orbitron', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-accent);
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
}

.status-indicator.active {
  background: var(--color-accent);
  box-shadow: 0 0 12px rgba(0, 255, 255, 0.8);
  animation: neonFlicker 2s infinite alternate;
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
  padding-left: 32px;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.2);
}

.instruction-item::before {
  content: counter(step-counter);
  position: absolute;
  left: 0;
  top: 0;
  width: 20px;
  height: 20px;
  background: linear-gradient(45deg, var(--color-brand), var(--color-accent));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: white;
  box-shadow: 0 0 8px rgba(255, 0, 128, 0.6);
}

/* Control Panel */
.control-panel {
  margin-bottom: 20px;
}

/* Permission Alert */
.permission-alert {
  margin-bottom: 16px;
  background: linear-gradient(45deg, rgba(255, 255, 0, 0.1), rgba(255, 102, 0, 0.1));
  border: 1px solid var(--color-warning);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 0 16px rgba(255, 255, 0, 0.3);
  animation: neonFlicker 2s infinite alternate;
}

.alert-content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  font-weight: 600;
}

.alert-icon {
  font-size: 16px;
  animation: neonFlicker 1s infinite alternate;
}

.enable-btn {
  padding: 6px 12px;
  background: var(--color-warning);
  color: black;
  border: none;
  border-radius: 4px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(255, 255, 0, 0.6);
  transition: all 0.3s ease;
}

.enable-btn:hover {
  box-shadow: 0 0 20px rgba(255, 255, 0, 0.8);
  transform: translateY(-1px);
}

/* Button Styling */
.retro-btn {
  position: relative;
  padding: 12px 20px;
  border: 2px solid;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-family: 'Rajdhani', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  overflow: hidden;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.retro-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.retro-btn .btn-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transform: translateX(-100%);
  transition: transform 0.6s ease;
}

.retro-btn:hover .btn-glow {
  transform: translateX(100%);
}

.retro-btn.primary {
  border-color: var(--color-brand);
  box-shadow: 
    0 0 20px rgba(255, 0, 128, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.retro-btn.primary:hover {
  box-shadow: 
    0 0 30px rgba(255, 0, 128, 0.6),
    0 0 60px rgba(255, 0, 128, 0.3);
  transform: translateY(-2px);
}

.retro-btn.secondary {
  border-color: var(--color-accent);
  box-shadow: 
    0 0 20px rgba(0, 255, 255, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.retro-btn.secondary:hover {
  box-shadow: 
    0 0 30px rgba(0, 255, 255, 0.6),
    0 0 60px rgba(0, 255, 255, 0.3);
  transform: translateY(-2px);
}

.retro-btn.tertiary {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 
    0 0 20px rgba(255, 255, 255, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.retro-btn.tertiary:hover {
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: 
    0 0 30px rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
}

.retro-btn.success {
  border-color: var(--color-secondary);
  box-shadow: 
    0 0 20px rgba(138, 43, 226, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.retro-btn.success:hover {
  box-shadow: 
    0 0 30px rgba(138, 43, 226, 0.6),
    0 0 60px rgba(138, 43, 226, 0.3);
  transform: translateY(-2px);
}

.retro-btn.auto-capture {
  border-color: var(--color-tertiary);
  box-shadow: 
    0 0 20px rgba(255, 102, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.retro-btn.auto-capture:hover {
  box-shadow: 
    0 0 30px rgba(255, 102, 0, 0.6),
    0 0 60px rgba(255, 102, 0, 0.3);
  transform: translateY(-2px);
}

.btn-icon {
  font-size: 16px;
}

.btn-shortcut {
  font-size: 10px;
  opacity: 0.7;
  font-weight: 400;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
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

.auto-capture-section .retro-btn {
  width: 100%;
}

.auto-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.status-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* Selection Display */
.selection-display {
  margin-bottom: 20px;
}

.selection-info {
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid var(--color-accent);
  border-radius: 8px;
  padding: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
}

.info-label {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-accent);
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
  display: block;
  margin-bottom: 8px;
}

.coordinates {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Rajdhani', monospace;
}

.coord-value {
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-accent);
  text-shadow: 0 0 4px rgba(0, 255, 255, 0.4);
}

.coord-separator {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}

/* Slides Grid */
.slides-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.slide-card {
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  overflow: hidden;
  backdrop-filter: blur(10px);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 20px rgba(255, 0, 128, 0.2);
  transition: all 0.3s ease;
}

.slide-card:hover {
  border-color: var(--color-brand);
  box-shadow: 
    0 12px 40px rgba(0, 0, 0, 0.6),
    0 0 30px rgba(255, 0, 128, 0.4);
  transform: translateY(-4px);
}

.slide-card.drag-over {
  border-color: var(--color-accent);
  box-shadow: 
    0 0 40px rgba(0, 255, 255, 0.6);
}

.slide-preview {
  position: relative;
  aspect-ratio: 16/9;
  overflow: hidden;
}

.slide-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.9) contrast(1.1);
}

.slide-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  padding: 4px 8px;
  backdrop-filter: blur(10px);
}

.slide-number {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  font-weight: 700;
  color: var(--color-accent);
  text-shadow: 0 0 4px rgba(0, 255, 255, 0.6);
}

.slide-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.drag-handle {
  padding: 4px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.6);
  cursor: grab;
  transition: all 0.3s ease;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.4);
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
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.control-btn.up:hover,
.control-btn.down:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.4);
}

.control-btn.delete {
  border-color: rgba(255, 0, 0, 0.3);
  color: rgba(255, 0, 0, 0.8);
}

.control-btn.delete:hover {
  border-color: #ff0000;
  color: #ff0000;
  box-shadow: 0 0 8px rgba(255, 0, 0, 0.4);
}

/* Empty State */
.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  margin-top: 40px;
}

.empty-content {
  text-align: center;
  position: relative;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.6;
  animation: neonFlicker 4s infinite alternate;
}

.empty-title {
  font-family: 'Orbitron', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-accent);
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
  margin: 0 0 8px 0;
}

.empty-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.2);
}

.empty-animation {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  border: 2px solid rgba(0, 255, 255, 0.1);
  border-radius: 50%;
}

.empty-animation::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  bottom: 10px;
  border: 1px solid rgba(255, 0, 128, 0.1);
  border-radius: 50%;
}

/* Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes neonFlicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes hologramGlitch {
  0% { transform: translateX(0); }
  10% { transform: translateX(-1px); }
  20% { transform: translateX(1px); }
  30% { transform: translateX(0); }
  100% { transform: translateX(0); }
}
</style>
