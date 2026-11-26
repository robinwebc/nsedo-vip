import { AVAILABILITY_URL, type Brand } from './operators.ts'
import { sleep } from './sleep.ts'

export interface Availability {
  available: boolean
  free: string[]
}

const TIMEOUT_MS = 12_000

export class OperatorError extends Error {
  readonly httpStatus: number

  constructor(httpStatus: number) {
    super(httpStatus === 429 ? 'rate-limit' : 'busy')
    this.name = httpStatus === 429 ? 'RateLimitError' : 'OperatorError'
    this.httpStatus = httpStatus
  }
}

async function once(intl: string, brand: Brand, signal: AbortSignal): Promise<Availability> {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError')
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, TIMEOUT_MS)
  try {
    const res = await fetch(AVAILABILITY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ msisdn: intl, brand, simCategory: 'PREPAID' }),
      signal: ctrl.signal,
      credentials: 'omit',
      cache: 'no-store',
    })
    if (res.status === 429 || res.status >= 500) throw new OperatorError(res.status)
    if (!res.ok) throw new Error(`http-${res.status}`)
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') throw new Error('bad-json')
    const body = data as { available?: unknown; status?: unknown; freeMsisdnList?: unknown }
    const accepted = body.status === undefined || body.status === 'SUCCESSFUL'
    const free = accepted && Array.isArray(body.freeMsisdnList) ? body.freeMsisdnList.map(String) : []
    return { available: accepted && body.available === true, free }
  } catch (error) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    if (timedOut) throw new Error('timeout')
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

export async function checkAvailability(intl: string, brand: Brand, signal: AbortSignal): Promise<Availability> {
  let delay = 700
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await once(intl, brand, signal)
    } catch (error) {
      if (signal.aborted) throw error
      last = error
      if (attempt === 2) break
      await sleep(delay, signal)
      delay *= 2
    }
  }
  throw last instanceof Error ? last : new Error('check-failed')
}
