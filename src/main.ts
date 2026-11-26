import { checkAvailability } from './api.ts'
import { loadChecked, note, saveChecked, verdict, type CacheRow } from './cache.ts'
import { formatCount, groupLocal } from './format.ts'
import { translate, type MessageKey } from './i18n.ts'
import { operatorById, operatorByPrefix, type Brand, type Lang } from './operators.ts'
import { matchesMask } from './pattern.ts'
import { createCursor, parseQuery, planSameEnding, type CandidateCursor, type QueryOptions, type QueryPlan } from './query.ts'
import { scan, type Progress } from './scan.ts'
import { vipScore, type VipScore } from './score.ts'

type Phase = 'idle' | 'running' | 'paused' | 'stopped' | 'done'
type Special = null | 'same3' | 'same4'

interface StoredHit {
  local: string
  brand: Brand
  score: VipScore
}

const langBtn = document.querySelector<HTMLButtonElement>('#langBtn')!
const themeBtn = document.querySelector<HTMLButtonElement>('#themeBtn')!
const iconSun = document.querySelector<SVGElement>('#iconSun')!
const iconMoon = document.querySelector<SVGElement>('#iconMoon')!
const form = document.querySelector<HTMLFormElement>('#search')!
const queryInput = document.querySelector<HTMLInputElement>('#q')!
const quickBox = document.querySelector<HTMLDivElement>('#quick')!
const blockInput = document.querySelector<HTMLInputElement>('#blockInput')!
const preview = document.querySelector<HTMLParagraphElement>('#preview')!
const planNote = document.querySelector<HTMLParagraphElement>('#planNote')!
const scanBtn = document.querySelector<HTMLButtonElement>('#scanBtn')!
const progress = document.querySelector<HTMLDivElement>('#progress')!
const bar = document.querySelector<HTMLDivElement>('#bar')!
const barFill = document.querySelector<HTMLSpanElement>('#barFill')!
const progressText = document.querySelector<HTMLParagraphElement>('#progressText')!
const rateNote = document.querySelector<HTMLParagraphElement>('#rateNote')!
const resultsList = document.querySelector<HTMLOListElement>('#resultsList')!
const resultsMeta = document.querySelector<HTMLParagraphElement>('#resultsMeta')!
const empty = document.querySelector<HTMLParagraphElement>('#empty')!
const live = document.querySelector<HTMLParagraphElement>('#live')!
const sortSelect = document.querySelector<HTMLSelectElement>('#sort')!
const resultFilter = document.querySelector<HTMLInputElement>('#resultFilter')!
const footRobi = document.querySelector<HTMLAnchorElement>('#footRobi')!
const footAirtel = document.querySelector<HTMLAnchorElement>('#footAirtel')!

const QUICK: { id: string; text?: string; key?: MessageKey }[] = [
  ...['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'].map((id) => ({ id, text: id })),
  { id: '1234', text: '1234' },
  { id: '6789', text: '6789' },
  { id: '9876', text: '9876' },
  { id: '0123', text: '0123' },
  { id: '1212', text: '1212' },
  { id: 'same3', key: 'same3' },
  { id: 'same4', key: 'same4' },
  { id: 'birthday', key: 'birthday' },
]

function setHidden(el: Element, hidden: boolean) {
  if (hidden) el.setAttribute('hidden', '')
  else el.removeAttribute('hidden')
}

let lang: Lang = localStorage.getItem('nsedo-lang') === 'en' ? 'en' : 'bn'
let theme: 'light' | 'dark' = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
let followSystem = localStorage.getItem('nsedo-theme') === null
let special: Special = null
let activeQuick = ''
let phase: Phase = 'idle'
let running = false
let hits: StoredHit[] = []
let cursor: CandidateCursor | null = null
let masks: string[] = []
let planSignature = ''
let activeLabel = ''
let lastProgress: Progress | null = null
let abort: AbortController | null = null
let resumeResolve: (() => void) | null = null
let generation = 0
let tail: Promise<void> = Promise.resolve()
let sortMode: 'score' | 'number' | 'operator' = 'score'
let filterBrand: 'all' | Brand = 'all'
let filterText = ''
let freshLocal = ''
let paint = 0
let saves = 0
let cache: Map<string, CacheRow> = new Map()

try {
  cache = loadChecked(localStorage)
} catch {
  cache = new Map()
}

function t(key: MessageKey, ...args: string[]): string {
  return translate(lang, key, ...args)
}

function readOptions(): QueryOptions {
  const scope = form.querySelector<HTMLInputElement>('input[name="scope"]:checked')?.value
  const position = form.querySelector<HTMLInputElement>('input[name="pos"]:checked')?.value
  const operators: QueryOptions['operators'] = scope === 'robi' || scope === 'airtel' ? scope : 'all'
  const place: QueryOptions['position'] = position === 'start' || position === 'middle' ? position : 'end'
  return { operators, position: place, block: blockInput.value }
}

function currentPlan(): QueryPlan {
  const options = readOptions()
  if (special === 'same3') return planSameEnding(3, options)
  if (special === 'same4') return planSameEnding(4, options)
  return parseQuery(queryInput.value, options)
}

function signature(plan: Extract<QueryPlan, { ok: true }>): string {
  return `${plan.total}|${plan.jobs.map((item) => item.brand + item.mask).join(',')}`
}

function syncButton() {
  const plan = currentPlan()
  let key: MessageKey = 'startScan'
  let stopping = false
  if (running && phase === 'paused') key = 'resume'
  else if (running) {
    key = 'stop'
    stopping = true
  } else if (cursor && lastProgress && lastProgress.checked < lastProgress.total && plan.ok && signature(plan) === planSignature) {
    key = 'more'
  }
  scanBtn.textContent = t(key)
  scanBtn.classList.toggle('is-stop', stopping)
  scanBtn.disabled = key === 'startScan' && !plan.ok
}

function updatePreview() {
  const plan = currentPlan()
  const box = preview.parentElement
  if (!plan.ok) {
    if (box) box.hidden = plan.error === 'empty'
    preview.textContent = '—'
    planNote.textContent = plan.error === 'empty' ? '' : t(`err_${plan.error}` as MessageKey)
    planNote.classList.toggle('is-bad', plan.error !== 'empty')
    syncButton()
    return
  }
  if (box) box.hidden = false
  planNote.classList.remove('is-bad')
  const shown = plan.jobs.slice(0, 2).map((item) => groupLocal(item.mask))
  preview.textContent = plan.jobs.length > 2 ? `${shown.join('  ·  ')}  ·  +${plan.jobs.length - 2}` : shown.join('  ·  ')
  planNote.textContent = t('planFull', formatCount(plan.total, lang))
  syncButton()
}

function visibleHits(): StoredHit[] {
  return hits.filter((hit) => {
    if (filterBrand !== 'all' && hit.brand !== filterBrand) return false
    if (filterText && !hit.local.includes(filterText)) return false
    return true
  })
}

function tagText(tag: string): string {
  const run = /^run-(end-)?(\d+)$/.exec(tag)
  if (run) return t(run[1] ? 'runEnd' : 'run', formatCount(Number(run[2]), lang))
  const seq = /^seq-(end-)?(\d+)$/.exec(tag)
  if (seq) return t(seq[1] ? 'seqEnd' : 'seq', formatCount(Number(seq[2]), lang))
  return t(`tag_${tag}` as MessageKey)
}

function updateEmpty() {
  const shown = visibleHits()
  empty.hidden = shown.length > 0
  if (shown.length) return
  if (hits.length) {
    empty.textContent = t('emptyFilter')
    return
  }
  const key: MessageKey =
    phase === 'running' || phase === 'paused' ? 'emptyRunning' : phase === 'done' || phase === 'stopped' ? 'emptyNone' : 'emptyIdle'
  empty.textContent = t(key)
}

function updateProgress() {
  if (!lastProgress && phase === 'idle') return
  progress.hidden = false
  const total = lastProgress?.total ?? 0
  const checked = lastProgress?.checked ?? 0
  const pct = total ? Math.min(100, Math.round((checked / total) * 100)) : 0
  barFill.style.width = `${phase === 'done' ? 100 : pct}%`
  bar.setAttribute('aria-valuenow', String(phase === 'done' ? 100 : pct))
  const found = formatCount(hits.length, lang)
  const checkedText = formatCount(checked, lang)
  const totalText = formatCount(total, lang)
  if (phase === 'paused') progressText.textContent = t('pausedFail')
  else if (phase === 'done') progressText.textContent = t('scanDone', found, checkedText)
  else if (phase === 'stopped') progressText.textContent = t('scanStopped', found, checkedText)
  else progressText.textContent = t('progress', checkedText, totalText, found)
  const parts = [t('resultsMeta', found)]
  if (activeLabel && !activeLabel.startsWith('same')) parts.push(t('resultsFor', activeLabel))
  resultsMeta.textContent = hits.length || activeLabel ? parts.join(' · ') : ''
}

function renderHit(hit: StoredHit): HTMLLIElement {
  const op = operatorByPrefix(hit.local)
  const li = document.createElement('li')
  li.className = hit.local === freshLocal ? 'result fresh' : 'result'
  const num = document.createElement('p')
  num.className = 'num'
  num.translate = false
  num.textContent = groupLocal(hit.local)
  const score = document.createElement('p')
  score.className = 'score'
  const strong = document.createElement('b')
  strong.textContent = String(hit.score.score)
  const band = document.createElement('small')
  band.textContent = t(`band_${hit.score.band}` as MessageKey)
  score.append(strong, band)
  const why = document.createElement('p')
  why.className = 'why'
  const bits = [op ? op.name[lang] : '']
  for (const tag of hit.score.tags.slice(0, 2)) bits.push(tagText(tag))
  why.textContent = bits.filter(Boolean).join(' · ')
  const actions = document.createElement('div')
  actions.className = 'actions'
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.textContent = t('copy')
  copy.addEventListener('click', () => copyNumber(hit.local, copy))
  actions.append(copy)
  if (op) {
    const buy = document.createElement('a')
    buy.href = op.buy[lang]
    buy.target = '_blank'
    buy.rel = 'noopener noreferrer'
    const label = document.createElement('span')
    label.textContent = op.buyLabel[lang]
    const host = document.createElement('span')
    host.className = 'host'
    host.textContent = op.host
    buy.append(label, host)
    actions.append(buy)
  }
  li.append(num, score, why, actions)
  if (hit.local === freshLocal) window.setTimeout(() => li.classList.remove('fresh'), 1200)
  return li
}

function renderResults() {
  const sorted = visibleHits().sort((a, b) => {
    if (sortMode === 'number') return a.local < b.local ? -1 : a.local > b.local ? 1 : 0
    if (sortMode === 'operator') return a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : b.score.score - a.score.score
    return b.score.score - a.score.score || (a.local < b.local ? -1 : 1)
  })
  resultsList.replaceChildren(...sorted.map(renderHit))
  updateEmpty()
  updateProgress()
}

function schedulePaint() {
  if (paint) return
  paint = window.requestAnimationFrame(() => {
    paint = 0
    renderResults()
  })
}

async function copyNumber(local: string, button: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(local)
    button.textContent = t('copied')
  } catch {
    const area = document.createElement('textarea')
    area.value = local
    area.setAttribute('readonly', '')
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    button.textContent = ok ? t('copied') : t('copyFail')
  }
  window.setTimeout(() => {
    button.textContent = t('copy')
  }, 1600)
}

function persistCache() {
  try {
    saveChecked(localStorage, cache)
  } catch {
    /* storage may be full or blocked */
  }
}

function waitForResume(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (aborting: boolean) => {
      signal.removeEventListener('abort', onAbort)
      resumeResolve = null
      if (aborting) reject(new DOMException('aborted', 'AbortError'))
      else resolve()
    }
    const onAbort = () => finish(true)
    resumeResolve = () => finish(false)
    if (signal.aborted) finish(true)
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function execute(fresh: boolean, gen: number) {
  const plan = currentPlan()
  if (!plan.ok) {
    updatePreview()
    return
  }
  if (fresh || !cursor || signature(plan) !== planSignature) {
    cursor = createCursor(plan.jobs)
    masks = plan.jobs.map((item) => item.mask)
    planSignature = signature(plan)
    activeLabel = plan.label
    hits = []
    lastProgress = { checked: 0, failed: 0, found: 0, total: plan.total, rateLimits: 0 }
    freshLocal = ''
  }
  if (!cursor) return
  running = true
  phase = 'running'
  abort = new AbortController()
  const signal = abort.signal
  progress.hidden = false
  syncButton()
  schedulePaint()
  live.textContent = t('started')
  try {
    const outcome = await scan({
      cursor,
      masks,
      signal,
      workers: 2,
      check: checkAvailability,
      lookup: (local, brand) => verdict(cache, brand, local),
      remember(local, brand, available) {
        note(cache, brand, local, available)
        saves += 1
        if (saves % 25 === 0) persistCache()
      },
      onHit(hit) {
        if (!masks.some((mask) => matchesMask(mask, hit.local))) return
        freshLocal = hit.local
        hits.push({ local: hit.local, brand: hit.brand, score: vipScore(hit.local) })
        schedulePaint()
      },
      onProgress(next) {
        lastProgress = next
        schedulePaint()
      },
      onPause() {
        phase = 'paused'
        syncButton()
        live.textContent = t('pausedFail')
      },
      onRateLimit() {
        rateNote.hidden = false
      },
      waitForResume,
    })
    if (gen !== generation) return
    phase = outcome.status === 'done' ? 'done' : outcome.status === 'paused' ? 'paused' : 'stopped'
    const found = formatCount(hits.length, lang)
    const checked = formatCount(outcome.checked, lang)
    live.textContent =
      phase === 'paused' ? t('pausedFail') : phase === 'done' ? t('scanDone', found, checked) : t('scanStopped', found, checked)
  } catch {
    if (gen !== generation) return
    phase = signal.aborted ? 'stopped' : 'paused'
  } finally {
    if (gen === generation) {
      running = false
      persistCache()
      syncButton()
      schedulePaint()
    }
  }
}

function begin(fresh: boolean) {
  if (phase === 'paused' && resumeResolve && !fresh) {
    phase = 'running'
    syncButton()
    resumeResolve()
    return
  }
  const gen = ++generation
  abort?.abort()
  tail = tail
    .catch(() => undefined)
    .then(() => execute(fresh, gen))
}

function renderQuick() {
  quickBox.replaceChildren()
  for (const item of QUICK) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = item.key ? 'word' : ''
    button.dataset.quick = item.id
    button.textContent = item.key ? t(item.key) : (item.text ?? item.id)
    button.setAttribute('aria-pressed', item.id === activeQuick ? 'true' : 'false')
    button.addEventListener('click', () => {
      activeQuick = item.id
      renderQuick()
      if (item.id === 'birthday') {
        queryInput.placeholder = '01011990'
        special = null
        queryInput.focus()
        updatePreview()
        if (queryInput.value.replace(/\D/g, '').length >= 4) begin(true)
        return
      }
      if (item.id === 'same3' || item.id === 'same4') {
        special = item.id
        queryInput.value = ''
        updatePreview()
        begin(true)
        return
      }
      special = null
      queryInput.value = item.id
      updatePreview()
      begin(true)
    })
    quickBox.append(button)
  }
}

function syncThemeButton() {
  const dark = theme === 'dark'
  themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false')
  themeBtn.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark'))
  setHidden(iconSun, !dark)
  setHidden(iconMoon, dark)
}

function applyTheme(next: 'light' | 'dark') {
  theme = next
  document.documentElement.dataset.theme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#14202B' : '#F3F5F8')
  syncThemeButton()
}

function applyI18n() {
  document.documentElement.lang = lang
  document.title = t('title')
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'))
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', t('title'))
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as MessageKey
    if (el === scanBtn || el === langBtn) return
    el.textContent = t(key)
  })
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria as MessageKey | undefined
    if (key) el.setAttribute('aria-label', t(key))
  })
  langBtn.textContent = t('langBtn')
  langBtn.setAttribute('aria-label', t('langAria'))
  if (queryInput.placeholder !== '01011990') queryInput.placeholder = lang === 'bn' ? '5555 বা 018XX5555' : '5555 or 018XX5555'
  resultFilter.placeholder = t('filterPlaceholder')
  footRobi.href = operatorById('robi').buy[lang]
  footAirtel.href = operatorById('airtel').buy[lang]
  renderQuick()
  syncThemeButton()
  updatePreview()
  renderResults()
}

function bind() {
  langBtn.addEventListener('click', () => {
    lang = lang === 'bn' ? 'en' : 'bn'
    localStorage.setItem('nsedo-lang', lang)
    applyI18n()
  })
  themeBtn.addEventListener('click', () => {
    followSystem = false
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('nsedo-theme', next)
    applyTheme(next)
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!followSystem) return
    applyTheme(event.matches ? 'dark' : 'light')
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (running && phase === 'paused') {
      begin(false)
      return
    }
    if (running) {
      abort?.abort()
      return
    }
    const plan = currentPlan()
    const reuse = plan.ok && cursor && signature(plan) === planSignature && lastProgress && lastProgress.checked < lastProgress.total
    begin(!reuse)
  })
  queryInput.addEventListener('input', () => {
    queryInput.value = queryInput.value.toUpperCase().replace(/[^0-9X]/g, '').slice(0, 11)
    special = null
    activeQuick = ''
    for (const button of quickBox.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false')
    updatePreview()
  })
  blockInput.addEventListener('input', () => {
    blockInput.value = blockInput.value.replace(/\D/g, '').slice(0, 8)
    updatePreview()
  })
  form.addEventListener('change', (event) => {
    const target = event.target
    if (target instanceof HTMLInputElement && (target.name === 'scope' || target.name === 'pos')) updatePreview()
  })
  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value === 'number' ? 'number' : sortSelect.value === 'operator' ? 'operator' : 'score'
    renderResults()
  })
  resultFilter.addEventListener('input', () => {
    filterText = resultFilter.value.replace(/\D/g, '')
    resultFilter.value = filterText
    renderResults()
  })
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
    button.addEventListener('click', () => {
      const value = button.dataset.filter
      filterBrand = value === 'ROBI' || value === 'AIRTEL' ? value : 'all'
      for (const peer of document.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
        peer.setAttribute('aria-pressed', peer === button ? 'true' : 'false')
      }
      renderResults()
    })
  }
}

bind()
applyI18n()
applyTheme(theme)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}
