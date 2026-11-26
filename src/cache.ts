const KEY = 'nsedo-checked-v1'
const MAX = 4000
const TAKEN_TTL = 12 * 60 * 60 * 1000
const OPEN_TTL = 30 * 60 * 1000

export interface CacheRow {
  a: 0 | 1
  t: number
}

export function cacheKey(brand: string, local: string): string {
  return `${brand}:${local}`
}

export function loadChecked(storage: Pick<Storage, 'getItem'>): Map<string, CacheRow> {
  const map = new Map<string, CacheRow>()
  try {
    const raw = JSON.parse(storage.getItem(KEY) || '[]') as unknown
    if (!Array.isArray(raw)) return map
    const now = Date.now()
    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 2) continue
      const key = String(item[0])
      const row = item[1] as CacheRow
      if (!row || (row.a !== 0 && row.a !== 1) || typeof row.t !== 'number') continue
      if (now - row.t > (row.a === 1 ? OPEN_TTL : TAKEN_TTL)) continue
      map.set(key, row)
    }
  } catch {
    return map
  }
  return map
}

export function saveChecked(storage: Pick<Storage, 'setItem'>, map: Map<string, CacheRow>): void {
  const rows = [...map.entries()].sort((a, b) => a[1].t - b[1].t).slice(-MAX)
  storage.setItem(KEY, JSON.stringify(rows))
}

export function verdict(map: Map<string, CacheRow>, brand: string, local: string, now = Date.now()): 'open' | 'taken' | 'miss' {
  const row = map.get(cacheKey(brand, local))
  if (!row) return 'miss'
  if (now - row.t > (row.a === 1 ? OPEN_TTL : TAKEN_TTL)) return 'miss'
  return row.a === 1 ? 'open' : 'taken'
}

export function note(map: Map<string, CacheRow>, brand: string, local: string, available: boolean, now = Date.now()): void {
  map.set(cacheKey(brand, local), { a: available ? 1 : 0, t: now })
  if (map.size <= MAX + 250) return
  const oldest = [...map.entries()].sort((a, b) => a[1].t - b[1].t)
  for (const [key] of oldest.slice(0, map.size - MAX)) map.delete(key)
}
