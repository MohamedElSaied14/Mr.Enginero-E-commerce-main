# Project structure — Mr.Enginero

Which languages the project uses, and where every file lives.

> Generated from the repository on 12 August 2026. Line counts are actual.

---

## Table of contents

- [Languages at a glance](#languages-at-a-glance)
- [How the pieces fit together](#how-the-pieces-fit-together)
- [Frontend — `src/`](#frontend--src)
- [Backend — `server/`](#backend--server)
- [Tooling — `scripts/`](#tooling--scripts)
- [Supporting folders](#supporting-folders)
- [Dependencies](#dependencies)
- [Where do I go to change…?](#where-do-i-go-to-change)

---

## Languages at a glance

The whole project is **one language family: JavaScript / TypeScript**. There is no PHP, Python,
Java, or raw SQL anywhere.

| Layer | Language | Files | Lines |
| --- | --- | ---: | ---: |
| **Frontend** | TypeScript | 47 | 4,251 |
| | HTML *(Angular templates)* | 13 | 2,097 |
| | CSS | 15 | 2,717 |
| **Backend** | JavaScript — ESM (`.mjs`) | 12 | 2,317 |
| **Tooling** | JavaScript — ESM (`.mjs`) | 7 | 1,323 |
| | | **94** | **12,705** |

### Why TypeScript on the front and plain JavaScript on the back?

- **Frontend is TypeScript** because Angular compiles anyway, so the type checking is free — and it
  catches mistakes in the shape of API responses before they reach the browser.
- **Backend is plain JavaScript** so it runs with `node server/index.mjs` directly. No compile step,
  no build output to keep in sync, no source maps to debug through. Types that matter are enforced
  at runtime instead, where untrusted input actually arrives.

---

## How the pieces fit together

```
┌─────────────────┐   HTTP    ┌──────────────────┐         ┌─────────────────┐
│    Browser      │ ────────► │  Express  :3000  │ ──────► │  MongoDB Atlas  │
│  Angular SPA    │  /api/*   │   server/        │  driver │    (cloud)      │
└─────────────────┘ ◄──────── └──────────────────┘ ◄────── └─────────────────┘
                      JSON            │
                                      │ SMTP
                                      ▼
                                   Gmail
```

**The frontend never touches the database.** Everything goes through the API, which is what keeps
prices, stock and permissions enforced on the server rather than in the browser where anyone could
change them.

In development two processes run side by side:

| Process | Port | Serves |
| --- | --- | --- |
| Angular dev server | 4200 | the UI, proxying `/api` to :3000 |
| Express API | 3000 | the API, and the built UI in production |

---

## Frontend — `src/`

**Angular 19** with standalone components and signals · **Bootstrap 5** (grid and form primitives
only) · **RxJS** for HTTP streams.

```
src/
├── index.html                  Shell page: favicon, og tags, no-flash theme script
├── main.ts                     Bootstraps the Angular app
├── styles.css        (515)     ★ Design tokens, dark mode, shared component classes
│
└── app/
    ├── app.ts                  Layout shell: header + <router-outlet> + footer
    ├── app.routes.ts           Every page, lazy-loaded
    ├── app.config.ts           HttpClient, Router, interceptors, app initialiser
    ├── brand.ts                ★ Name, phone, WhatsApp, Facebook — one place
    │
    ├── Components/             19 folders; each is a page or a reusable piece
    │   │
    │   │   ── Shell ──
    │   ├── header/             Nav, live search, cart & wishlist badges, theme toggle
    │   ├── footer/             Links, socials, contact details
    │   ├── shared/             toast-host · verify-banner
    │   │
    │   │   ── Storefront ──
    │   ├── home/               Hero, category picker, deals, new arrivals
    │   ├── shop/       (255)   Search, facet filters, sort, pagination
    │   ├── product-card/       ★ The one tile used by shop, home, deals, wishlist
    │   ├── product-details/    Gallery, buy box, spec list, related items
    │   ├── deals/              Discounted products with a countdown
    │   ├── stores/             🔐 Supplier directory (admin only)
    │   │
    │   │   ── Buying ──
    │   ├── cart/               Persisted cart, quantity steppers, order summary
    │   ├── checkout/           Address form, validation, live totals
    │   ├── order-confirmation/ Printable receipt at /order/:ref
    │   ├── wishlist/           Saved products
    │   │
    │   │   ── Accounts ──
    │   ├── login/              Password + "Continue with Google"
    │   ├── register/           Sign-up, triggers email verification
    │   ├── auth-callback/      Consumes the Google token from the URL fragment
    │   │
    │   │   ── Admin (🔐 admin only) ──
    │   ├── dashboard/          Four tabs, each its own component:
    │   │   ├── dashboard.*        (334) Catalogue CRUD + KPIs + price sources
    │   │   ├── orders-panel.*     (220) Orders board, statuses, customer contact
    │   │   ├── users-panel.*            Roles, verification, removal
    │   │   └── settings-panel.*         Fees, order pause, system status
    │   │
    │   │   ── Content ──
    │   ├── about/              Story and stats
    │   └── contact/            Contact form and channels
    │
    ├── services/               State and API access, injected where needed
    │   ├── product.service.ts    Catalogue: list, search, facets, CRUD, stock
    │   ├── order.service.ts      Checkout, order lookup, admin order actions
    │   ├── auth.service.ts       Session, login, register, Google, verification
    │   ├── admin.service.ts      Users and settings
    │   ├── cart.service.ts       Cart, persisted to localStorage
    │   ├── wishlist.service.ts   Wishlist, persisted to localStorage
    │   ├── theme.service.ts      Dark/light, persisted, follows the OS by default
    │   └── toast.service.ts      Non-blocking notifications
    │
    ├── Models/                 Shapes of the data the API returns
    │   ├── iproduct.ts           IProduct · IFacets · IProductPage · ISupplier
    │   └── iorder.ts             IOrder · IOrderPage · status flow
    │
    ├── guards/                 adminGuard — keeps non-admins off admin routes
    ├── interceptors/           Attaches the bearer token to every /api request
    ├── pipes/                  calc — formats money as "EGP 39,380"
    └── directives/             light-box
```

Each component folder holds up to three files with the same name:

| File | Holds |
| --- | --- |
| `name.ts` | logic — state, API calls, event handlers |
| `name.html` | markup |
| `name.css` | styles, scoped to that component only |

Small components keep their template and styles inline in the `.ts` instead.

★ = the files you are most likely to edit first.

---

## Backend — `server/`

**Node.js** + **Express 4** + the official **MongoDB driver** (no Mongoose — the queries are
aggregations, and an ODM would only get in the way).

```
server/
├── index.mjs           (103)  ★ Entry point. Wires middleware, routes, static files,
│                              startup checks and graceful shutdown
├── db.mjs               (67)  Pooled MongoClient, collections, index creation
├── auth.mjs             (78)  scrypt password hashing, signed tokens, admin guard,
│                              weak-secret detection
├── google-oauth.mjs    (151)  Google OAuth 2.0, called directly (no Passport)
├── mailer.mjs          (360)  SMTP transport with a log fallback + all HTML templates
├── settings.mjs         (83)  Editable store settings, cached in memory
├── brand.mjs            (15)  Server-side copy of the brand details, for emails
│
└── routes/                    One file per resource
    ├── products.mjs    (393)  List, facets, stats, detail, CRUD, atomic stock moves
    ├── orders.mjs      (460)  Checkout, stock reservation, status flow, contact log
    ├── auth.mjs        (252)  Register, login, Google, email verification, session
    ├── admin.mjs       (202)  🔐 User management and store settings
    └── suppliers.mjs   (153)  🔐 Supplier directory
```

### Request path

```
request → compression → express.json → withUser (decode token, no rejection)
        → route handler → requireAdmin (only on protected routes)
        → MongoDB → JSON response
```

`withUser` attaches `req.user` when a valid token is present but never rejects, so the same endpoint
can serve both shoppers and admins — and simply return more fields to an admin. That is how supplier
and price-source data stay invisible to customers.

---

## Tooling — `scripts/`

Run with `npm run …`. None of this ships to the browser.

| File | Command | What it does |
| --- | --- | --- |
| `sources.mjs` | *(library)* | Feed adapters for Shopify and WooCommerce storefronts |
| `build-catalog.mjs` | `npm run catalog:build` | Pulls the retailer feeds → `data/products.seed.json` |
| `seed-db.mjs` | `npm run db:seed` | Upserts the catalogue, grants admin, purges demo data |
| `make-icons.mjs` | `npm run icons` | Cuts favicons out of `public/logo.png` |
| `capture-screens.mjs` | `npm run screens` | Recaptures the screenshots in `docs/screens` |
| `build-report.mjs` | `npm run report` | Rebuilds `docs/audit-report.html` |
| `normalise-eol.mjs` | *(manual)* | Converts CRLF line endings to LF |

---

## Supporting folders

| Folder | Contents | In git? |
| --- | --- | :---: |
| `public/` | Logo, favicons, touch icons — copied to the site as-is | ✅ |
| `data/` | `products.seed.json` — the 150-product catalogue | ✅ |
| `docs/` | Audit report, demo walkthroughs, 20 screenshots | ✅ |
| `dist/` | Build output | ❌ generated |
| `node_modules/` | Installed packages | ❌ generated |
| `.env` | 🔒 Secrets: database URI, OAuth, SMTP | ❌ **never committed** |
| `.env.example` | The same keys with blank values, as documentation | ✅ |

---

## Dependencies

### Runtime

| Package | Used for |
| --- | --- |
| `@angular/*` 19 | The frontend framework |
| `rxjs` 7 | HTTP streams, debounced search |
| `zone.js` | Angular change detection |
| `express` 4 | HTTP server and routing |
| `mongodb` 6 | Official driver — queries and aggregations |
| `nodemailer` 9 | Sending order and verification email |
| `compression` | gzip on API responses |
| `dotenv` | Loads `.env` at boot |

### Development

| Package | Used for |
| --- | --- |
| `@angular/cli`, `@angular-devkit/build-angular` | Build and dev server |
| `typescript` 5.6 | Type checking |
| `concurrently` | Runs API and dev server together |
| `sharp` | Image processing for the favicon script |
| `karma`, `jasmine` | Test runner — configured, no suite written yet |

Deliberately **not** used: Mongoose, Passport, Redux/NgRx, Tailwind, a UI component library. Each
would have added weight for something the platform already does well enough here.

---

## Where do I go to change…?

| I want to change… | Edit |
| --- | --- |
| Store name, phone, WhatsApp, Facebook | `src/app/brand.ts` **and** `server/brand.mjs` |
| Colours, dark mode, spacing, shadows | `src/styles.css` — the tokens at the top |
| The logo | Replace `public/logo.png`, then `npm run icons` |
| Delivery fee, COD fee, free-delivery threshold | Dashboard → **Settings** (no code, no restart) |
| Which retailers the catalogue is built from | `scripts/sources.mjs` |
| How products are sorted into categories | `scripts/build-catalog.mjs` — the `CATEGORIES` array |
| Wording of an order email | `server/mailer.mjs` — the template functions |
| Add a page | Component under `src/app/Components/`, then register it in `app.routes.ts` |
| Add an API endpoint | The matching file in `server/routes/` |
| Who is an admin | `ADMIN_EMAILS` in `.env` |
| Governorates offered at checkout | `server/routes/orders.mjs` — the `GOVERNORATES` array |
