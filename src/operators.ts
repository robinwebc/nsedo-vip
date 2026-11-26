export type OperatorId = 'robi' | 'airtel'
export type Brand = 'ROBI' | 'AIRTEL'
export type Lang = 'bn' | 'en'

export interface Operator {
  id: OperatorId
  brand: Brand
  prefix: string
  name: Record<Lang, string>
  buyLabel: Record<Lang, string>
  buy: Record<Lang, string>
  host: string
}

/** Public prepaid availability check shared by Robi (018) and Airtel (016). */
export const AVAILABILITY_URL = 'https://da-api.robi.com.bd/da-nll/free-msisdn/get-msisdn-list'

export const OPERATORS: Operator[] = [
  {
    id: 'robi',
    brand: 'ROBI',
    prefix: '018',
    name: { bn: 'রবি', en: 'Robi' },
    buyLabel: { bn: 'রবির সাইটে কিনুন', en: 'Buy on the Robi site' },
    buy: {
      bn: 'https://www.robi.com.bd/bn/sim-services?requestType=NEW',
      en: 'https://www.robi.com.bd/en/sim-services?requestType=NEW',
    },
    host: 'robi.com.bd',
  },
  {
    id: 'airtel',
    brand: 'AIRTEL',
    prefix: '016',
    name: { bn: 'এয়ারটেল', en: 'Airtel' },
    buyLabel: { bn: 'এয়ারটেলের সাইটে কিনুন', en: 'Buy on the Airtel site' },
    buy: {
      bn: 'https://cirkle.digital/bn/sim-services?requestType=NEW',
      en: 'https://cirkle.digital/en/sim-services?requestType=NEW',
    },
    host: 'cirkle.digital',
  },
]

export const COMING_SOON: { id: string; prefix: string; name: Record<Lang, string> }[] = [
  { id: 'gp', prefix: '017 / 013', name: { bn: 'গ্রামীণফোন', en: 'Grameenphone' } },
  { id: 'bl', prefix: '019 / 014', name: { bn: 'বাংলালিংক', en: 'Banglalink' } },
  { id: 'tt', prefix: '015', name: { bn: 'টেলিটক', en: 'Teletalk' } },
]

export function operatorById(id: OperatorId): Operator {
  const found = OPERATORS.find((op) => op.id === id)
  if (!found) throw new Error('operator')
  return found
}

export function operatorByPrefix(prefix: string): Operator | undefined {
  return OPERATORS.find((op) => prefix.startsWith(op.prefix))
}

export function seriesOf(prefix: string): string[] {
  return Array.from({ length: 10 }, (_, i) => prefix + String(i))
}
