# nSedo VIP

Bangla-first search for open Robi and Airtel mobile numbers in Bangladesh. Type digits or a pattern, or tap a quick pattern. nSedo checks the full space on the operator’s public availability service until you stop it, and lists only numbers that are still open, with a VIP score, a copy button, and a link to buy on the operator’s own site.

nSedo does not take payment or personal data. It is not a mobile operator, and it is not affiliated with Robi, Airtel, Cirkle, Grameenphone, Banglalink, or Teletalk.

## Operators

| Operator | Prefix | Status | Check | Buy |
| --- | --- | --- | --- | --- |
| Robi | 018 | Live | `POST https://da-api.robi.com.bd/da-nll/free-msisdn/get-msisdn-list` with `brand: ROBI` | [robi.com.bd](https://www.robi.com.bd/bn/sim-services?requestType=NEW) |
| Airtel | 016 | Live | Same endpoint with `brand: AIRTEL` | [cirkle.digital](https://cirkle.digital/bn/sim-services?requestType=NEW) |
| Grameenphone | 017 / 013 | Coming soon | No usable public availability check found | — |
| Banglalink | 019 / 014 | Coming soon | No usable public availability check found | — |
| Teletalk | 015 | Coming soon | No usable public availability check found | — |

Robi and Airtel are both served by Robi Axiata’s public prepaid digital-acquisition check. A browser `OPTIONS` preflight from another origin returns `Access-Control-Allow-Origin: *`, so the site calls that endpoint directly. There is no proxy server.

The request body is `{ "msisdn": "8801XXXXXXXXX", "brand": "ROBI" | "AIRTEL", "simCategory": "PREPAID" }`. A successful body has `status: "SUCCESSFUL"`, `available: true|false`, and `freeMsisdnList`. Only `available: true`, or a listed number that also matches the pattern, is shown.

Verified on 26 November 2026: both brands returned `SUCCESSFUL`, and a number from `freeMsisdnList` came back `available: true` on a second check. Re-run that check with `npm run verify:live`.

## Patterns

- A single box. `5555` or `1234` searches that ending on both Robi and Airtel. `018XX5555` is expanded to an 11-digit mask. `01815` searches that whole block. `01011990` is treated as a birthday-style ending.
- Quick chips cover 0000–9999, a few sequences, 1212, last-3-same, last-4-same, and a birthday field.
- There is no sample cap. The scan walks every candidate, streaming open numbers as they are found, until you stop it or the space is finished. Stop, then “keep searching”, continues from the same place.
- Advanced options (collapsed) choose one operator, where a short digit pattern sits, and an optional block.
- The browser keeps about two checks in flight and spaces them by roughly half a second. HTTP 429 and 5xx back off and retry. After repeated failures the scan pauses instead of discarding the place, and resume continues. Checked numbers are remembered in this browser for the session so a repeat search skips them.
- Grameenphone, Banglalink, and Teletalk stay marked coming soon.

VIP score (1–99) is computed from the number itself: repeated digits, sequences, ABAB, mirrors, palindromes, and how few distinct digits it uses. Ending patterns score higher. Sort by score or by number.

## Develop

```bash
npm install
npm test
npm run dev
```

The dev server uses the GitHub Pages base path, so open `http://127.0.0.1:5173/nsedo-vip/`.

```bash
npm run build
npm run preview
```

## Deploy

GitHub Actions (`.github/workflows/pages.yml`) tests, builds, and deploys to GitHub Pages on every push to `main`. The Pages source must be **GitHub Actions**. The published URL is [https://robinwebc.github.io/nsedo-vip/](https://robinwebc.github.io/nsedo-vip/).

No server environment variables are required. The availability URL is fixed in `src/operators.ts`.

## Limitations

- Prepaid inventory only. The public check does not expose a postpaid catalogue.
- A number can sell between this check and the operator’s checkout. Buy on the operator’s site and confirm there.
- Wide patterns are a sample, not a full sweep of the block.
- Grameenphone, Banglalink, and Teletalk are shown as coming soon until a public availability check exists.
- The operator can change or rate-limit the endpoint. The scan slows down and then stops rather than inventing numbers.
