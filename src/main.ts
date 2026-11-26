import { checkAvailability } from './api.ts'
import { formatCount, groupLocal } from './format.ts'
import { translate, type MessageKey } from './i18n.ts'
import { operatorById, operatorByPrefix, seriesOf, type Lang, type OperatorId } from './operators.ts'
import { buildPlan, type PatternKind, type Plan, type Position, type SearchInput, type SeqDir } from './pattern.ts'
import { scan, type Progress } from './scan.ts'
import { vipScore, type VipScore } from './score.ts'

type Phase = 'idle' | 'running' | 'done' | 'stopped' | 'error'

interface StoredHit {
  local: string
  intl: string
  score: VipScore
}

const langBtn = document.querySelector<HTMLButtonElement>('#langBtn')!
const themeBtn = document.querySelector<HTMLButtonElement>('#themeBtn')!
const iconSun = document.querySelector<SVGElement>('#iconSun')!
const iconMoon = document.querySelector<SVGElement>('#iconMoon')!

function setHidden(el: Element, hidden: boolean) {
  if (hidden) el.setAttribute('hidden', '')
  else el.removeAttribute('hidden')
}
const form = document.querySelector<HTMLFormElement>('#search')!
const fields = document.querySelector<HTMLFieldSetElement>('#fields')!
const blockInput = document.querySelector<HTMLInputElement>('#blockInput')!
const chipBox = document.querySelector<HTMLDivElement>('#chipBox')!
const allSeriesBtn = document.querySelector<HTMLButtonElement>('#allSeriesBtn')!
const digitsBox = document.querySelector<HTMLDivElement>('#digits')!
const preview = document.querySelector<HTMLParagraphElement>('#preview')!
const planNote = document.querySelector<HTMLParagraphElement>('#planNote')!
const scanBtn = document.querySelector<HTMLButtonElement>('#scanBtn')!
const progress = document.querySelector<HTMLDivElement>('#progress')!
const bar = document.querySelector<HTMLDivElement>('#bar')!
const barFill = document.querySelector<HTMLSpanElement>('#barFill')!
const progressText = document.querySelector<HTMLParagraphElement>('#progressText')!
const resultsList = document.querySelector<HTMLOListElement>('#resultsList')!
const resultsMeta = document.querySelector<HTMLParagraphElement>('#resultsMeta')!
const empty = document.querySelector<HTMLParagraphElement>('#empty')!
const live = document.querySelector<HTMLParagraphElement>('#live')!
const sortSelect = document.querySelector<HTMLSelectElement>('#sort')!
const capSelect = document.querySelector<HTMLSelectElement>('#capSelect')!
const customInput = document.querySelector<HTMLInputElement>('#customInput')!
const endingInput = document.querySelector<HTMLInputElement>('#endingInput')!
const pairA = document.querySelector<HTMLInputElement>('#pairA')!
const pairB = document.querySelector<HTMLInputElement>('#pairB')!
const seqStart = document.querySelector<HTMLSelectElement>('#seqStart')!
const footRobi = document.querySelector<HTMLAnchorElement>('#footRobi')!
const footAirtel = document.querySelector<HTMLAnchorElement>('#footAirtel')!
const panelBlock = document.querySelector<HTMLDivElement>('#panelBlock')!
const panelRepeat = document.querySelector<HTMLDivElement>('#panelRepeat')!
const panelSeq = document.querySelector<HTMLDivElement>('#panelSeq')!
const panelPair = document.querySelector<HTMLDivElement>('#panelPair')!
const panelEnding = document.querySelector<HTMLDivElement>('#panelEnding')!
const panelCustom = document.querySelector<HTMLDivElement>('#panelCustom')!
const panelPos = document.querySelector<HTMLDivElement>('#panelPos')!

let lang: Lang = localStorage.getItem('nsedo-lang') === 'en' ? 'en' : 'bn'
let theme: 'light' | 'dark' = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
let followSystem = localStorage.getItem('nsedo-theme') === null
let repeatDigit = 5
let selectedChips = new Set<string>()
let kindBeforeCustom: PatternKind = 'repeat'
let running = false
let phase: Phase = 'idle'
let hits: StoredHit[] = []
let activeMotif = ''
let lastProgress: Progress | null = null
let abort: AbortController | null = null
let sortMode: 'score' | 'number' = 'score'
let freshLocal = ''

function t(key: MessageKey, ...args: string[]): string {
  return translate(lang, key, ...args)
}

function currentOp() {
  const picked = form.querySelector<HTMLInputElement>('input[name="op"]:checked')?.value
  const id: OperatorId = picked === 'airtel' ? 'airtel' : 'robi'
  return operatorById(id)
}

function currentKind(): PatternKind {
  const value = form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value
  if (value === 'sequence' || value === 'mirror' || value === 'abab' || value === 'ending' || value === 'custom') return value
  return 'repeat'
}

function radioValue(name: string, fallback: string): string {
  return form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? fallback
}

function readInput(): SearchInput {
  const op = currentOp()
  const blocks = [...selectedChips]
  const custom = blockInput.value.replace(/\D/g, '')
  if (custom) blocks.push(custom)
  return {
    prefix: op.prefix,
    blocks,
    kind: currentKind(),
    position: radioValue('pos', 'end') as Position,
    repeatDigit,
    repeatLen: Number(radioValue('rlen', '4')),
    seqStart: Number(seqStart.value),
    seqLen: Number(radioValue('seqlen', '4')),
    seqDir: radioValue('seqdir', 'up') as SeqDir,
    pairA: Number(pairA.value || '0'),
    pairB: Number(pairB.value || '0'),
    ending: endingInput.value.replace(/\D/g, '').slice(0, 6),
    customMask: customInput.value,
    cap: Number(capSelect.value),
  }
}

function syncPanels() {
  const kind = currentKind()
  panelBlock.hidden = kind === 'custom'
  panelRepeat.hidden = kind !== 'repeat'
  panelSeq.hidden = kind !== 'sequence'
  panelPair.hidden = kind !== 'mirror' && kind !== 'abab'
  panelEnding.hidden = kind !== 'ending'
  panelCustom.hidden = kind !== 'custom'
  panelPos.hidden = kind === 'ending' || kind === 'custom'
}

function syncScanButton() {
  scanBtn.textContent = t(running ? 'stop' : 'startScan')
  scanBtn.classList.toggle('is-stop', running)
  scanBtn.setAttribute('aria-pressed', running ? 'true' : 'false')
}

function syncSeriesButton() {
  const chips = [...chipBox.querySelectorAll<HTMLButtonElement>('.chip')]
  const allOn = chips.length > 0 && chips.every((chip) => chip.getAttribute('aria-pressed') === 'true')
  allSeriesBtn.textContent = t(allOn ? 'clearSeries' : 'allSeries')
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

function tagText(tag: string): string {
  const run = /^run-(end-)?(\d+)$/.exec(tag)
  if (run) return t(run[1] ? 'runEnd' : 'run', formatCount(Number(run[2]), lang))
  const seq = /^seq-(end-)?(\d+)$/.exec(tag)
  if (seq) return t(seq[1] ? 'seqEnd' : 'seq', formatCount(Number(seq[2]), lang))
  return t(`tag_${tag}` as MessageKey)
}

function updateEmpty() {
  empty.hidden = hits.length > 0
  if (hits.length) return
  const key: MessageKey =
    phase === 'running' ? 'emptyRunning' : phase === 'error' ? 'emptyError' : phase === 'done' || phase === 'stopped' ? 'emptyNone' : 'emptyIdle'
  empty.textContent = t(key)
}

function updateProgress() {
  if (!lastProgress) return
  progress.hidden = false
  const pct = lastProgress.total ? Math.min(100, Math.round((lastProgress.checked / lastProgress.total) * 100)) : 0
  const settled = phase === 'done' || phase === 'stopped' || phase === 'error'
  barFill.style.width = `${settled ? 100 : pct}%`
  bar.setAttribute('aria-valuenow', String(settled ? 100 : pct))
  const found = formatCount(hits.length, lang)
  const checked = formatCount(lastProgress.checked, lang)
  const total = formatCount(lastProgress.total, lang)
  if (phase === 'error') progressText.textContent = t('scanError')
  else if (phase === 'stopped') progressText.textContent = t('scanStopped', found, checked)
  else if (phase === 'done') progressText.textContent = t('scanDone', found, checked)
  else progressText.textContent = t('progress', checked, total, found)
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
  score.setAttribute('aria-label', `${t('scoreLabel')} ${strong.textContent} ${band.textContent}`)
  const why = document.createElement('p')
  why.className = 'why'
  const bits = [op ? op.name[lang] : '', t('matched', activeMotif)]
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

async function copyNumber(local: string, button: HTMLButtonElement) {
  const original = t('copy')
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
    button.textContent = original
  }, 1600)
}

function renderResults() {
  const sorted = [...hits].sort((a, b) => {
    if (sortMode === 'number') return a.local < b.local ? -1 : a.local > b.local ? 1 : 0
    return b.score.score - a.score.score || (a.local < b.local ? -1 : a.local > b.local ? 1 : 0)
  })
  resultsList.replaceChildren(...sorted.map(renderHit))
  const parts = [t('resultsMeta', formatCount(hits.length, lang))]
  if (activeMotif) parts.push(t('resultsFor', activeMotif))
  resultsMeta.textContent = hits.length || activeMotif ? parts.join(' · ') : ''
  updateEmpty()
}

function describe(plan: Plan) {
  if (!plan.ok) {
    preview.textContent = '—'
    planNote.textContent = t(`err_${plan.error}` as MessageKey)
    planNote.classList.add('is-bad')
    if (!running) scanBtn.disabled = true
    return
  }
  planNote.classList.remove('is-bad')
  preview.textContent =
    plan.masks.length === 1
      ? groupLocal(plan.masks[0].mask)
      : t('previewMany', formatCount(plan.masks.length, lang), groupLocal(plan.masks[0].mask))
  const note = plan.sampled
    ? t('planSample', formatCount(plan.total, lang), formatCount(plan.queue.length, lang), formatCount(plan.masks.length, lang))
    : t('planAll', formatCount(plan.queue.length, lang), formatCount(plan.masks.length, lang))
  planNote.textContent = plan.overlap ? `${note} ${t('planOverlap')}` : note
  if (!running) scanBtn.disabled = plan.queue.length === 0
}

function updatePreview() {
  describe(buildPlan(readInput()))
}

function renderChips() {
  const prefix = currentOp().prefix
  chipBox.replaceChildren()
  for (const series of seriesOf(prefix)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chip'
    button.textContent = series
    button.dataset.block = series
    button.setAttribute('aria-pressed', selectedChips.has(series) ? 'true' : 'false')
    button.addEventListener('click', () => {
      if (selectedChips.has(series)) selectedChips.delete(series)
      else selectedChips.add(series)
      button.setAttribute('aria-pressed', selectedChips.has(series) ? 'true' : 'false')
      syncSeriesButton()
      updatePreview()
    })
    chipBox.append(button)
  }
  syncSeriesButton()
}

function renderDigits() {
  digitsBox.replaceChildren()
  for (let digit = 0; digit <= 9; digit++) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'digit-btn'
    button.textContent = String(digit)
    button.setAttribute('aria-pressed', digit === repeatDigit ? 'true' : 'false')
    button.addEventListener('click', () => {
      repeatDigit = digit
      for (const peer of digitsBox.querySelectorAll('button')) peer.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-pressed', 'true')
      updatePreview()
    })
    digitsBox.append(button)
  }
}

function applyI18n() {
  document.documentElement.lang = lang
  document.title = t('title')
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'))
  const ogTitle = document.querySelector('meta[property="og:title"]')
  ogTitle?.setAttribute('content', t('title'))
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as MessageKey
    if (el === scanBtn || el === allSeriesBtn || el === langBtn) return
    el.textContent = t(key)
  })
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria as MessageKey | undefined
    if (key) el.setAttribute('aria-label', t(key))
  })
  langBtn.textContent = t('langBtn')
  langBtn.setAttribute('aria-label', t('langAria'))
  const robi = operatorById('robi')
  const airtel = operatorById('airtel')
  footRobi.href = robi.buy[lang]
  footAirtel.href = airtel.buy[lang]
  syncScanButton()
  syncSeriesButton()
  syncThemeButton()
  updatePreview()
  updateProgress()
  renderResults()
}

function onOperator() {
  const op = currentOp()
  const block = blockInput.value.replace(/\D/g, '')
  if (!block.startsWith(op.prefix)) blockInput.value = `${op.prefix}15`
  selectedChips = new Set()
  if (!running) {
    hits = []
    activeMotif = ''
    phase = 'idle'
    lastProgress = null
    progress.hidden = true
    renderResults()
  }
  renderChips()
  updatePreview()
}

function onKind() {
  const kind = currentKind()
  if (kind === 'custom' && customInput.value.trim() === '') {
    const plan = buildPlan({ ...readInput(), kind: kindBeforeCustom })
    if (plan.ok && plan.masks[0]) customInput.value = plan.masks[0].mask
  }
  if (kind !== 'custom') kindBeforeCustom = kind
  syncPanels()
  updatePreview()
}

async function onSubmit(event: Event) {
  event.preventDefault()
  if (running) {
    abort?.abort()
    return
  }
  const plan = buildPlan(readInput())
  if (!plan.ok || plan.queue.length === 0) {
    updatePreview()
    return
  }
  running = true
  phase = 'running'
  abort = new AbortController()
  hits = []
  activeMotif = plan.motif.length === 11 ? groupLocal(plan.motif) : plan.motif
  lastProgress = { checked: 0, failed: 0, found: 0, total: plan.queue.length }
  fields.disabled = true
  syncScanButton()
  renderResults()
  updateProgress()
  live.textContent = t('started')
  const op = currentOp()
  const signal = abort.signal
  try {
    const outcome = await scan({
      queue: plan.queue,
      masks: plan.masks.map((mask) => mask.mask),
      brand: op.brand,
      prefix: op.prefix,
      signal,
      workers: 2,
      check: checkAvailability,
      onHit(hit) {
        freshLocal = hit.local
        hits.push({ ...hit, score: vipScore(hit.local) })
        renderResults()
      },
      onProgress(next) {
        lastProgress = next
        updateProgress()
      },
    })
    phase = outcome.status
  } catch {
    phase = signal.aborted ? 'stopped' : 'error'
  } finally {
    running = false
    fields.disabled = false
    syncScanButton()
    updatePreview()
    updateProgress()
    updateEmpty()
    const found = formatCount(hits.length, lang)
    const checked = formatCount(lastProgress?.checked ?? 0, lang)
    if (phase === 'error') live.textContent = t('scanError')
    else if (phase === 'stopped') live.textContent = t('scanStopped', found, checked)
    else live.textContent = t('scanDone', found, checked)
  }
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
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', (event) => {
    if (!followSystem) return
    applyTheme(event.matches ? 'dark' : 'light')
  })
  form.addEventListener('submit', onSubmit)
  form.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) {
      updatePreview()
      return
    }
    if (target.name === 'op') onOperator()
    else if (target.name === 'kind') onKind()
    else updatePreview()
  })
  blockInput.addEventListener('input', () => {
    blockInput.value = blockInput.value.replace(/\D/g, '').slice(0, 8)
    updatePreview()
  })
  endingInput.addEventListener('input', () => {
    endingInput.value = endingInput.value.replace(/\D/g, '').slice(0, 6)
    updatePreview()
  })
  customInput.addEventListener('input', () => {
    customInput.value = customInput.value.toUpperCase().replace(/[^0-9X]/g, '').slice(0, 11)
    updatePreview()
  })
  for (const input of [pairA, pairB]) {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1)
      updatePreview()
    })
  }
  capSelect.addEventListener('change', updatePreview)
  seqStart.addEventListener('change', updatePreview)
  allSeriesBtn.addEventListener('click', () => {
    const series = seriesOf(currentOp().prefix)
    const allOn = series.every((item) => selectedChips.has(item))
    selectedChips = allOn ? new Set() : new Set(series)
    renderChips()
    updatePreview()
  })
  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value === 'number' ? 'number' : 'score'
    renderResults()
  })
}

renderDigits()
renderChips()
syncPanels()
bind()
applyI18n()
applyTheme(theme)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}
