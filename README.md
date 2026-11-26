# nSedo VIP

Bangla-first search for open Robi and Airtel mobile numbers in Bangladesh. Pick an operator, one or more number blocks, and a pattern. nSedo checks those numbers on the operator’s public availability service and lists only the ones that are still open, with a VIP score, a copy button, and a link to buy on the operator’s own site.

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

- Repeated digit, sequence, mirror (ABBA), pair (ABAB), exact ending, or a custom 11-digit mask (`X` is any digit).
- The motif can sit at the start, middle, or end. An exact ending always sits at the end.
- Several series (0180–0189 or 0160–0169) can be scanned in one pass, with an optional tighter block such as `01815`.
- Spaces of 150 numbers or fewer are checked in full. Wider spaces are sampled, up to the cap (40 / 80 / 160 / 320), spread across the selected blocks.
- The browser sends about two checks a second, backs off on HTTP 429 and 5xx, and stops the scan after five failures in a row.

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
