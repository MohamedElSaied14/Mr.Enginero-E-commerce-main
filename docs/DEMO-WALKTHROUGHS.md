# Mr.Enginero — Demo Walkthroughs

Two step-by-step walkthroughs: one from the customer's side, one from the admin's.
Every step below was executed against the running application on 12 August 2026; the
output shown is the real response, not an illustration.

> **On video:** these are written and screenshot demos. Screen recording is not something
> this environment can produce. Each step names the URL and the exact click, so the flow can
> be recorded in one pass by following it.

**To run it yourself**

```bash
npm run dev
```

Then open <http://localhost:4200> (or <http://localhost:3000> if you built with `npm run build`).

---

# Part 1 — Customer walkthrough

## Step 1 · Landing on the storefront

**URL:** `/`

The hero states the catalogue size, and three counters read live from the database.

```
catalogue: 150 products · 109 on sale · 140 ready to ship
categories: 11
supplier facets visible to shopper: 0     ← sourcing stays hidden
```

Below the hero: **Shop by category**. On desktop this is a grid of 11 tiles. On a phone
(under 640 px) the same list becomes a single dropdown — one tap instead of a long scroll.

## Step 2 · Searching

**Action:** type `RTX 5060` into the search box.

Input is debounced 300 ms, so a word is one request rather than one per keystroke.

```
"RTX 5060" -> 8 results, cheapest first:
  EGP 30,000   RYZEN-5 8400F tray + Gigabyte A620M-H AM5 + ASUS Dual…
  EGP 39,523   NOVA CORE PC CORE I5-12400F + 5060 + MONITOR 144HZ…
  EGP 44,444   MART STROM 1 – i5-14400F Gaming PC | RTX 5060 8GB…
```

## Step 3 · Filtering

**Action:** Graphics Cards → In stock only → On sale → sort by Biggest discount.

Filtering happens in MongoDB, not the browser, and the whole filter set lives in the URL —
so the view is shareable and survives a reload.

```
-> 3 results
  −31%  EGP   450  was   650   2B (CV143) Type C Male to VGA – HDMI
  −27%  EGP   550  was   750   2B (CV146) Type C Male to VGA – HDMI – D
  −18%  EGP   450  was   550   2B (CV224) Converter From Type C Male
```

## Step 4 · Opening a product

**URL:** `/product/3`

```
MART STROM 1 – i5-14400F Gaming PC | RTX 5060 8GB | 16GB DDR5 + SSD
price EGP 44,444 · was EGP 47,000 · 5% off · 3 in stock
images: 1 · related products: 4
supplier field present: false          ← invisible to shoppers
```

The page shows a gallery, the price with its struck-through original, a stock line, a
quantity stepper, and four related items from the same category.

## Step 5 · Creating an account

**URL:** `/register` — or **Continue with Google**, which skips the email step entirely
because Google has already verified the address.

```
account: Sara Kamal · role: user · verified: false
"Account created. Email verification could not be sent — SMTP is not configured."
```

That message is the honest one. Once SMTP credentials are in `.env`, the same step sends a
confirmation link valid for 24 hours. The account works either way — an amber banner asks
for confirmation rather than blocking anything.

## Step 6 · Checking out, cash on delivery

**URL:** `/checkout`

The form asks for the recipient, an Egyptian mobile (validated against `010/011/012/015` +
8 digits), an optional email, and a governorate/city/street address.

```
reference: MRE-20260812-0003
  2 × Lian Li SM088X 8.8in Universal Screen for PC
  subtotal 8,500 + delivery 0 + COD fee 20 = EGP 8,520
  status: pending
  stock reserved atomically: 2 → 0
```

Three things happen server-side that are worth naming:

1. **Prices are recomputed from the database.** Anything the browser sends is ignored.
2. **Stock is reserved under a guard**, so two shoppers racing for the last unit cannot both win.
3. **A reference is issued** that reads cleanly over the phone.

## Step 7 · The receipt

**URL:** `/order/MRE-20260812-0003`

```
MRE-20260812-0003 · pending · EGP 8,520
deliver to: Sara Kamal, 22 Port Said Street, building 9, flat 3, Sidi Gaber
internal trail hidden from customer: true
```

A progress tracker, the full order, the delivery address, and a WhatsApp button that
pre-fills the order reference. The page is reachable later with the reference alone — but it
never exposes the contact log or the email trail.

---

## Safety checks built into this flow

These were run as part of the walkthrough, not asserted.

**A tampered cart cannot change the price.**

```
product #53, real price EGP 234,333
client claimed  unitPrice = 1
server charged  unitPrice = 234,333  →  total EGP 234,353
```

**The store cannot oversell.**

```
POST /api/orders for an item with 0 left
→ 409 "Only 0 left of 'PC BUNDLE | AMD Ryzen 5 8500G…'. Please adjust the quantity."
```

---

# Part 2 — Admin walkthrough

## Step 1 · Signing in

**URL:** `/login`

There are no demo buttons and no seeded accounts. Sign in with your own address; it is on
`ADMIN_EMAILS`, so it is an admin.

```
Mohamed El-Saied · mediadosefp12@gmail.com · role: admin
```

Two extra nav items appear once you are an admin: **Suppliers** and **Dashboard**.

## Step 2 · The Orders board

**URL:** `/dashboard` → *Orders* tab (the default; it carries a badge with the new-order count).

```
4 orders · 6 units · EGP 487,355 cash to collect
by status: {"pending": 4}
mail transport: log → mediadosefp12@gmail.com
```

Four KPI cards: **Awaiting your call**, Live orders, Units sold, **Cash to collect**.

An amber banner sits above them while SMTP is unconfigured — the dashboard tells you alerts
are not going out rather than letting you assume they are.

## Step 3 · Opening an order

**Action:** click any row to expand it.

```
MRE-20260812-0003 · Sara Kamal · 01122334455
22 Port Said Street, building 9, flat 3, Sidi Gaber, Alexandria
collect EGP 8,520 in cash · 1 item
manager alert sent: false (SMTP not configured — message logged only)
```

The drawer holds the items with photos, the totals, the delivery address, and three contact
buttons: **Call**, **WhatsApp** (pre-filled with the customer's name and order reference),
and **Email app**.

## Step 4 · Confirming after the call

**Action:** *Mark confirmed*, with a note.

```
status → confirmed · history entries: 2
last note: "Called Sara, delivery Thursday morning."
```

A checkbox controls whether the customer is emailed about the change.

## Step 5 · Logging the call

**Action:** choose *Log a phone call*, type what was said, save.

```
logged: phone by mediadosefp12@gmail.com
"Confirmed address and asked her to have exact cash ready."
```

Everything said to a customer is stamped with who said it and when. Choosing *Send an email*
instead composes and sends a real message, and records whether it was delivered.

## Step 6 · Through to delivered

**Action:** *Mark preparing* → *Mark shipped* → *Mark delivered*.

```
delivered · payment: paid
full trail: pending → confirmed → preparing → shipped → delivered
```

Marking an order delivered is what flips it to paid, which matches how cash on delivery works.

## Step 7 · Cancelling returns stock

**Action:** *Cancel order* on a live order, confirm the prompt.

```
cancelled MRE-20260812-0004 — product #53 stock 18 → 19 (returned 1)
```

Cancelling puts every unit back exactly once; a second cancel is rejected, so stock is never
double-restored.

## Step 8 · The catalogue tab and price provenance

**Action:** *Catalogue* tab. Every row carries a **Price source** column.

```
iLOCK power strip 3 universal outlets
  from El Nour Tech · Cairo · captured EGP 350
  https://elnour-tech.com/ar/product/ilock-power-strip-3-universal-outlets…

Metal Stand for School Laptop and Tablet
  from El Nour Tech · Cairo · captured EGP 150
  https://elnour-tech.com/ar/product/metal-stand-for-school-laptop-and-table…
```

The retailer name links straight to the original listing, with the capture date and price,
and a warning when your current price has drifted from what was captured.

Adding a product by hand offers the same fields, so you can record where you sourced a price.

## Step 9 · Supplier directory

**URL:** `/stores` (admin only)

```
CompuMarts                   Alexandria   33 products
UpToDate Tech                Alexandria   32 products
Elyamama Store               Cairo        31 products
El Nour Tech                 Cairo        28 products
El Hamd Computer Supplies    Alexandria   26 products
Sigma Computer               Alexandria    0 products  [not connected]
```

Search and filter by city; each card carries the address, specialities, a map link, a phone
link where known, and a *Browse their stock* button that filters the catalogue to that shop.

**Sigma is listed but marked "Not connected"** — their storefront publishes no machine-readable
product feed, so none of their stock could be priced. That is stated on the card rather than
hidden.

## Step 10 · Catalogue KPIs

**Action:** *Catalogue* tab, top of the page.

```
150 products · 139 in stock · 11 out · 109 on sale
inventory value: EGP 45,505,990 · average rating 4.32
```

Plus a per-category bar chart of product count and inventory value.

---

# Screens captured live

These were taken from the running application during this session:

| Screen | Viewport | What it shows |
| --- | --- | --- |
| Home | 1280 desktop, dark | Hero, live counters, logo in header |
| Supplier directory | 1280 desktop, dark | CompuMarts / UpToDate cards with counts |
| Supplier directory (scrolled) | 1280 desktop, dark | El Hamd, and Sigma marked *Not connected* |
| Shop filtered to El Hamd | 1280 desktop, dark | 26 products, supplier line on each card |
| Checkout | 1280 desktop, dark | Filled COD form, Alexandria address |
| Login | 1280 desktop, light | Sign-in with the Google button, no demo accounts |
| Admin dashboard | 1280 desktop, light | KPI cards, category bars, product table |
| Order drawer | 1280 desktop, dark | Items, address, Call/WhatsApp, status actions |
| Product editor | 1280 desktop, light | Full form with images, description, price source |

---

# Resetting the demo data

The walkthrough above created accounts and orders. To clear them and start clean:

```bash
npm run db:reset
```

That reloads the 150 products, wipes demo users, and re-applies `ADMIN_EMAILS`.
