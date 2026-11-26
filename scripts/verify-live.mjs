const URL = 'https://da-api.robi.com.bd/da-nll/free-msisdn/get-msisdn-list'

async function check(msisdn, brand) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ msisdn, brand, simCategory: 'PREPAID' }),
  })
  if (!res.ok) throw new Error(`${brand} HTTP ${res.status}`)
  const body = await res.json()
  if (body.status !== 'SUCCESSFUL' || typeof body.available !== 'boolean' || !Array.isArray(body.freeMsisdnList)) {
    throw new Error(`${brand} unexpected body: ${JSON.stringify(body).slice(0, 240)}`)
  }
  return body
}

const robi = await check('8801815000555', 'ROBI')
const airtel = await check('8801612000555', 'AIRTEL')
const listed = robi.freeMsisdnList[0] || airtel.freeMsisdnList[0]
if (!listed) throw new Error('neither brand returned a free number to re-check')
const brand = listed.startsWith('88016') ? 'AIRTEL' : 'ROBI'
const again = await check(listed, brand)
if (again.available !== true) throw new Error(`listed number ${listed} was not available on re-check`)

console.log(JSON.stringify({
  robi: { available: robi.available, free: robi.freeMsisdnList.length },
  airtel: { available: airtel.available, free: airtel.freeMsisdnList.length },
  confirmed: { msisdn: listed, brand, available: true },
}, null, 2))
