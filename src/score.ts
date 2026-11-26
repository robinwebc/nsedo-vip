export type Band = 'high' | 'mid' | 'low'

export interface VipScore {
  score: number
  band: Band
  tags: string[]
}

interface Span {
  len: number
  atEnd: boolean
}

function bestRun(value: string): Span {
  let best = 1
  let atEnd = false
  let current = 1
  for (let i = 1; i <= value.length; i++) {
    if (i < value.length && value[i] === value[i - 1]) {
      current += 1
      continue
    }
    const ends = i === value.length
    if (current > best || (current === best && ends)) {
      best = current
      atEnd = ends
    }
    current = 1
  }
  return { len: best, atEnd }
}

function bestSeq(value: string): Span {
  let best = 1
  let atEnd = false
  let current = 1
  for (let i = 1; i <= value.length; i++) {
    const continues =
      i < value.length && Math.abs(Number(value[i]) - Number(value[i - 1])) === 1 && value[i] !== value[i - 1]
    if (continues) {
      current += 1
      continue
    }
    const ends = i === value.length
    if (current > best || (current === best && ends)) {
      best = current
      atEnd = ends
    }
    current = 1
  }
  return { len: best, atEnd }
}

function windowAt(value: string, size: number, test: (slice: string) => boolean): { atEnd: boolean } | null {
  let found: { atEnd: boolean } | null = null
  for (let i = 0; i + size <= value.length; i++) {
    if (!test(value.slice(i, i + size))) continue
    const atEnd = i + size === value.length
    found = { atEnd }
    if (atEnd) return found
  }
  return found
}

function isAbab(slice: string): boolean {
  return slice[0] !== slice[1] && slice[0] === slice[2] && slice[1] === slice[3]
}

function isAbba(slice: string): boolean {
  return slice[0] !== slice[1] && slice[0] === slice[3] && slice[1] === slice[2]
}

function isPalindrome(value: string): boolean {
  if (value.length < 4) return false
  if (new Set(value).size < 2) return false
  return value === [...value].reverse().join('')
}

export function vipScore(local: string): VipScore {
  const tail = local.slice(-8)
  const tags: string[] = []
  let score = 6

  const run = bestRun(tail)
  if (run.len >= 3) {
    score += (run.len - 2) * 14
    if (run.atEnd) score += 10
    tags.push(`${run.atEnd ? 'run-end' : 'run'}-${run.len}`)
  }

  const seq = bestSeq(tail)
  if (seq.len >= 3) {
    score += (seq.len - 2) * 11
    if (seq.atEnd) score += 8
    tags.push(`${seq.atEnd ? 'seq-end' : 'seq'}-${seq.len}`)
  }

  const abab = windowAt(tail, 4, isAbab)
  if (abab) {
    score += 16
    if (abab.atEnd) score += 8
    tags.push(abab.atEnd ? 'abab-end' : 'abab')
  }

  const mirror = windowAt(tail, 4, isAbba)
  if (mirror) {
    score += 16
    if (mirror.atEnd) score += 8
    tags.push(mirror.atEnd ? 'mirror-end' : 'mirror')
  }

  if (isPalindrome(tail)) {
    score += 22
    tags.push('pal-8')
  } else if (isPalindrome(tail.slice(2))) {
    score += 14
    tags.push('pal-6')
  }

  const unique = new Set(tail).size
  if (unique <= 2) {
    score += 16
    tags.push('sparse-2')
  } else if (unique <= 3) {
    score += 8
    tags.push('sparse-3')
  }

  score = Math.max(1, Math.min(99, score))
  const band: Band = score >= 70 ? 'high' : score >= 42 ? 'mid' : 'low'
  return { score, band, tags }
}
