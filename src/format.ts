import type { Lang } from './operators.ts'

export function groupLocal(value: string): string {
  if (value.length !== 11) return value
  return `${value.slice(0, 5)}-${value.slice(5)}`
}

export function formatCount(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-US').format(value)
}
