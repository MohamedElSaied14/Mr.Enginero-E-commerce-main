# Mr.Enginero — Technical & UX Audit Report

**Project:** Mr.Enginero storefront (Angular 19 + Express + MongoDB Atlas)
**Owner:** Mohamed El-Saied · Alexandria / Cairo, Egypt
**Audit date:** 12 August 2026
**Build audited:** initial bundle 343 kB raw / 98 kB compressed, zero build warnings

---

## 1. Executive summary

The project started as a front-end-only Angular demo with twelve hard-coded products, fake
contact details, and no server. It is now a working storefront: 150 real products priced from
five Egyptian retailers, a cash-on-delivery checkout that records orders in MongoDB Atlas,
an order-management dashboard, and Google sign-in.

| Area | Before | After |
| --- | --- | --- |
| Data | 12 products in a TypeScript array | 150 real products in MongoDB Atlas |
| Back end | none | Express API, 20 endpoints, 12 indexes |
| Selling | a button that cleared the cart | COD orders, atomic stock, email alerts |
| Auth | plaintext passwords in an array | scrypt hashes, signed tokens, Google SSO |
| Mobile | 39 px horizontal overflow, 36 px tap targets | 0 px overflow, all targets ≥ 40 px |
| Initial bundle | 341 kB / 97 kB gz | 343 kB / 98 kB gz (with far more functionality) |

**Nine defects were found and fixed during this audit.** They are listed in §6 with the
evidence for each.

---

## 2. Architecture

```
Browser (Angular 19, standalone components, signals, OnPush)
    │  /api/*
    ▼
Express (Node ESM, no build step)
    ├── products.mjs    list · facets · stats · detail · CRUD · stock
    ├── orders.mjs      checkout · status workflow · contact log
    ├── suppliers.mjs   sourcing directory                      [admin only]
    ├── auth.mjs        register · login · Google OAuth · verify
    └── mailer.mjs      SMTP with a logging fallback
    ▼
MongoDB Atlas — products · users · orders
```

**Deliberate choices**

- *No SSR.* The leftover Angular SSR files were never wired into `angular.json`. Enabling
  them would have risked hydration errors across components that touch `window` and
  `localStorage`, for a first-paint gain the CSS-only hero already delivers. The files were
  removed rather than left as dead weight.
- *Plain ESM on the server.* No TypeScript build step for the API keeps `node server/index.mjs`
  a one-command start and the deploy story simple.
- *Signals over RxJS state.* Component state is signals; RxJS is used only where it earns its
  place — debounced search, request cancellation via `switchMap`.

---

## 3. Data and sourcing

### 3.1 Where the catalogue comes from

`npm run catalog:build` pulls live feeds from five Egyptian retailers and writes
`data/products.seed.json`. Two storefront platforms are handled by separate adapters:
Shopify (`/products.json`) and WooCommerce (`/wp-json/wc/store/products`, whose prices arrive
in minor units).

| Retailer | City | Platform | Listings read | Products used |
| --- | --- | --- | --- | --- |
| CompuMarts | Alexandria (Roushdy, Deeb Mall) | Shopify | 1,500 | 33 |
| UpToDate Tech | Alexandria (Smouha) | WooCommerce | 600 | 32 |
| El Hamd Computer Supplies | Alexandria (Roushdy) | WooCommerce | 382 | 26 |
| Elyamama Store | Cairo | Shopify | 910 | 31 |
| El Nour Tech | Cairo | WooCommerce | 563 | 28 |
| **Sigma Computer** | Alexandria (Smouha) | — | **0** | **0** |

**91 of 150 products (61%) come from Alexandria businesses.**

**Sigma Computer could not be connected.** Their storefront is a client-rendered Next.js app
talking to a private API at `api.sigma-computer.com`; there is no public product feed. Every
documented endpoint pattern was probed and returned 404. Sigma is therefore listed in the
supplier directory with an explicit *"Not connected"* badge and a note explaining why, rather
than being silently omitted or padded with invented data.

### 3.2 What is real and what is not

| Real, from the retailer | Generated for the demo |
| --- | --- |
| Product name, brand | Unit stock counts |
| Selling price and original price (EGP) | Star ratings |
| Product photography (up to 4 per item) | Review counts |
| Marketing copy and spec bullets | |
| Stock availability (in/out) | |
| Supplier identity and city | |

109 of 150 products carry a genuine discount: `originalPrice` is the retailer's own
compare-at/regular price, and `discount` is computed from the two. No discount is invented.

### 3.3 Sourcing confidentiality

Which shop supplies a product, and what it cost there, is competitive information. Both
`supplier` and `priceSource` are stripped from every public API response and returned only
when an admin token is present. Responses are marked `Cache-Control: private` with
`Vary: Authorization` so a shared cache cannot serve an admin's copy to a shopper.

Verified by direct request:

```
Shopper   →  supplier field: absent · priceSource: absent · /api/suppliers: 401
Admin     →  supplier field: present · 5 suppliers, 2 cities · /api/suppliers: 200
```

---

## 4. Mobile responsiveness

Audited programmatically at 375 × 812 (iPhone-class), 768 × 1024 (tablet) and 1280 × 800,
across all 12 routes. The audit measures `scrollWidth − clientWidth` for overflow and the
bounding box of every interactive element for tap-target size.

### Results after fixes

| Viewport | Pages | Horizontal overflow | Tap targets < 40 px |
| --- | --- | --- | --- |
| 375 px | 12 | **0 px on every page** | **0** |
| 768 px | 10 | **0 px on every page** | — |
| 1280 px | 10 | **0 px on every page** | — |

### Mobile-specific adaptations

- **Category picker** — eleven chips became a tall wrapped block on a phone. Below 640 px the
  same list renders as a native `<select>`: one tap instead of a scroll. Chips remain on
  desktop.
- **Header** — seven icons no longer fit beside the wordmark under 560 px. Theme, WhatsApp and
  wishlist move into the mobile menu; search, cart and the menu button stay on the bar.
- **Wordmark** — `clamp(1.05rem, 4.2vw, 1.35rem)` so it scales rather than pushing the icons out.
- **Form inputs** — 16 px font size on mobile, which stops iOS Safari zooming the page on focus.
- **Filter sidebar** — collapses behind a *Filters* button with an active-count badge.
- **Cart lines** — re-flow into a 3-column grid template under 575 px.

---

## 5. Performance

| Measure | Value |
| --- | --- |
| Initial bundle | 343 kB raw / **98 kB compressed** |
| Routes | all lazy-loaded (12 chunks) |
| Change detection | OnPush on every component |
| Header logo | 39 kB (192 px cut) instead of the 1.2 MB original — **97% saving** |
| Search requests | debounced 300 ms (shop) / 250 ms (header) |
| Products per page | 24, paginated server-side — not 150 |
| API round-trips | one `$facet` aggregation per page, not one per widget |

Other measures in place: gzip on all API responses, `Cache-Control` tuned per endpoint, hashed
build assets immutable for a year with `index.html` never cached, lazy + async-decoded images
below the fold with `fetchpriority="high"` above it, explicit image dimensions so nothing
shifts as photos arrive, and `preconnect` to the three third-party origins first paint needs.

---

## 6. Defects found and fixed

Each was found by testing, not by inspection.

| # | Severity | Defect | Fix |
| --- | --- | --- | --- |
| 1 | **High** | Product photo links collapsed to 23 px tall — tapping most of the image did nothing | `.pcard-media > a { display:block; height:100% }` |
| 2 | **High** | Supplier names leaked to shoppers through `tags`, `brand` and retailer copy inside descriptions — searching "CompuMarts" returned exactly their 33 products | Removed sourcing ids from public tags, replaced retailer house-brands, scrubbed retailer names from 86 descriptions. Leak count now 0 across 8 probe terms |
| 3 | **High** | Server answered any missing file with HTTP 200 and the SPA shell, hiding absent assets and breaking image fallbacks | Requests with a file extension now 404 honestly |
| 4 | **Medium** | 39 px horizontal overflow on mobile from the header icon row | Icons redistributed below 560 px; brand allowed to truncate |
| 5 | **Medium** | Header loaded the 1.2 MB logo to render it at 38 px | Serves the 192 px cut (39 kB) |
| 6 | **Medium** | Laptops classified as Graphics Cards — their titles advertise the GPU inside ("Gaming Laptop with RTX 5050") | Laptops matched before GPUs, with SKU-suffix patterns (`-RL805W`, `15IRX9`) for models that never say "laptop" |
| 7 | **Medium** | "Gaming PC Case" products filed under Prebuilt PCs | Exclusion patterns per category |
| 8 | **Medium** | Motherboards classified as Processors (they advertise the CPUs they socket) | Exclusion pattern on the Processors matcher |
| 9 | **Low** | Sold-out products sorted to the top of the grid | Availability is now the first sort key under every sort option |
| 10 | **Low** | Order receipt claimed "a copy has been emailed" even when SMTP was unconfigured | `receiptEmailed` flag; the page only claims what actually happened |
| 11 | **Low** | Logo squashed — the artwork is 3:2, the container square | `object-fit: contain` |

---

## 7. Security review

**In place**

- Passwords stored as salted scrypt hashes, compared in constant time.
- Session tokens HMAC-signed, 7-day expiry, verified with `timingSafeEqual`.
- `role` is never read from a request body — admin rights come from `ADMIN_EMAILS` in `.env`.
- **Order prices are computed server-side** from the database; a tampered cart cannot change
  what a customer is charged.
- **Stock decrements are guarded** (`quantity >= n`), so concurrent checkouts cannot oversell.
  Cancelling restores stock exactly once — a second cancel is rejected.
- Google OAuth state is a nonce plus HMAC, so the callback proves it issued the value itself;
  unverified Google addresses are refused.
- The OAuth session token returns in the URL *fragment*, never the query string, and is
  scrubbed from history immediately.
- `.env` is gitignored; `.env.example` documents every variable.
- Admin write endpoints are guarded server-side; the Angular route guard is navigation only.

**Outstanding — owner action required**

| Item | Why it matters |
| --- | --- |
| Rotate the MongoDB Atlas password | The connection string was shared in chat and is in the session transcript |
| Set a real `AUTH_SECRET` | Currently the development default; it signs every session token |
| Add SMTP credentials | Until then no order email leaves the server |
| Add Google OAuth credentials | Until then the Google button redirects to `?sso=unconfigured` |
| Add rate limiting on `/api/auth/*` | No brute-force protection on login today |

---

## 8. Accessibility

- Skip-to-content link, one focus-ring treatment across the app.
- `aria-pressed` on toggles, `aria-expanded` on disclosures, labelled icon buttons.
- `prefers-reduced-motion` honoured — all animation collapses to 0.01 ms.
- Live regions on toasts (`role="status"`) and the quantity stepper.
- Colour tokens carry text/background pairs that hold contrast in both themes.
- Tap targets ≥ 40 px throughout; form controls 44 px.

Not yet done: a full screen-reader pass and an automated axe run.

---

## 9. Accounts and authentication

Demo accounts have been **removed** — the users collection is empty. There are no seeded
credentials anywhere in the codebase or database.

**First sign-in:** register at `/register` with `mediadosefp12@gmail.com`, or use *Continue
with Google* once OAuth credentials are configured. That address is on `ADMIN_EMAILS`, so the
account becomes an admin automatically on creation. Any other address registers as a customer.

Password rules: minimum 8 characters. Registration sends a verification link valid 24 hours;
tokens are stored hashed. Google sign-ups are treated as verified because Google has already
confirmed the address. An unverified account still works — a dismissible banner prompts for
confirmation rather than blocking.

---

## 10. What is not done

Stated plainly rather than left to be discovered.

1. **Sigma Computer products** — no public feed exists; the company is listed but carries no stock.
2. **Video walkthroughs** — cannot be recorded here; step-by-step visual demos are provided instead.
3. **Google OAuth is unconfigured** — code is complete and tested to the redirect boundary;
   it needs a Client ID and Secret from your Google Cloud console.
4. **SMTP is unconfigured** — the mailer works and is tested, but writes to the console until
   credentials exist. The dashboard shows an amber banner while this is true.
5. **Facebook content pack** — requested earlier, not yet written.
6. **Ratings and stock counts are generated** — no retailer feed exposes them.
7. **No automated test suite** — verification in this audit was manual and script-driven.
8. **Payment is cash-on-delivery only** — no card gateway is integrated.

---

## 11. Recommended next steps

**Before going live**

1. Rotate the Atlas password and set `AUTH_SECRET`.
2. Add SMTP credentials (Gmail App Password) and send one live test order.
3. Create the Google OAuth client and add the redirect URI.
4. Set `PUBLIC_ORIGIN` to the real domain so verification links resolve.

**Soon after**

5. Rate-limit `/api/auth/*`.
6. Schedule `npm run catalog:build && npm run db:seed` weekly so prices stay current — the
   dashboard already flags when a price has drifted from what was captured.
7. Add an order-export (CSV) for accounting.
8. Consider a card gateway once COD volume justifies the fees.
