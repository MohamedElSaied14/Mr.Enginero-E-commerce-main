/**
 * Builds `docs/audit-report.html` — a single self-contained page with every
 * screenshot inlined as a data URI, so it opens anywhere with no asset folder
 * and can be emailed or printed as-is.
 *
 * Run:  npm run report      (after `npm run screens`)
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = join(ROOT, 'docs', 'screens');
const OUT = join(ROOT, 'docs', 'audit-report.html');

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function inline(file) {
  const buf = await readFile(join(SCREENS, file));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const main = async () => {
  const shots = JSON.parse(await readFile(join(SCREENS, 'index.json'), 'utf8'));
  const byName = new Map(shots.map((s) => [s.name, s]));

  const figure = async (name, extra = '') => {
    const shot = byName.get(name);
    if (!shot) return `<p class="missing">Screenshot “${esc(name)}” was not captured.</p>`;
    return `<figure class="shot${extra}">
      <img src="${await inline(shot.file)}" alt="${esc(shot.caption)}" loading="lazy">
      <figcaption><strong>${esc(shot.viewport)}</strong> · ${esc(shot.caption)}</figcaption>
    </figure>`;
  };

  const pair = async (a, b, title, note) => `<section class="pair">
    <h4>${esc(title)}</h4>
    ${note ? `<p class="note">${note}</p>` : ''}
    <div class="pair-grid">${await figure(a)}${await figure(b)}</div>
  </section>`;

  const markdown = await readFile(join(ROOT, 'docs', 'AUDIT-REPORT.md'), 'utf8').catch(() => '');
  const generated = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mr.Enginero — Technical &amp; UX Audit Report</title>
<style>
  :root {
    --ink:#16151a; --muted:#65616f; --line:#e5e2ea; --bg:#f7f6f9; --card:#fff;
    --brand:#0B62B5; --ok:#1f9254; --warn:#c9860a; --bad:#d13c3c;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#e9e8ee; --muted:#a3a0af; --line:#2a2a38; --bg:#0d0d14; --card:#16161f; }
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.65 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width:1080px; margin:0 auto; padding:0 20px 96px; }

  header.masthead {
    background:linear-gradient(140deg,#0d1b2a,#123a63 55%,#0B62B5);
    color:#fff; padding:56px 20px 48px; margin-bottom:40px;
  }
  .masthead-inner { max-width:1080px; margin:0 auto; }
  .eyebrow { text-transform:uppercase; letter-spacing:.2em; font-size:.72rem; opacity:.75; margin:0 0 10px; }
  h1 { font-size:clamp(1.8rem,4vw,2.6rem); margin:0 0 12px; line-height:1.15; }
  .masthead p { margin:0; opacity:.85; max-width:64ch; }
  .meta { display:flex; flex-wrap:wrap; gap:24px; margin-top:28px; padding-top:22px; border-top:1px solid rgba(255,255,255,.18); font-size:.85rem; }
  .meta div span { display:block; opacity:.6; font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; }

  h2 { font-size:1.5rem; margin:56px 0 6px; padding-bottom:10px; border-bottom:2px solid var(--line); }
  h3 { font-size:1.1rem; margin:34px 0 10px; }
  h4 { font-size:.95rem; margin:26px 0 8px; }
  p, li { color:var(--ink); }
  .note, figcaption { color:var(--muted); font-size:.85rem; }

  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin:22px 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; border-left:3px solid var(--brand); }
  .card b { display:block; font-size:1.6rem; line-height:1.2; }
  .card span { font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  .card.ok { border-left-color:var(--ok); } .card.warn { border-left-color:var(--warn); } .card.bad { border-left-color:var(--bad); }

  table { width:100%; border-collapse:collapse; margin:18px 0; font-size:.9rem; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th, td { text-align:left; padding:10px 14px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:color-mix(in srgb, var(--line) 45%, transparent); font-size:.74rem; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); }
  tr:last-child td { border-bottom:0; }
  .table-scroll { overflow-x:auto; }

  figure.shot { margin:0; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  figure.shot img { display:block; width:100%; height:auto; border-bottom:1px solid var(--line); }
  figure.shot figcaption { padding:10px 14px; }
  .pair { margin:30px 0; }
  .pair-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
  .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:18px; margin:18px 0; }
  .phone { max-width:390px; }

  code, .mono { font-family:var(--mono); font-size:.86em; background:color-mix(in srgb, var(--line) 45%, transparent); padding:1px 5px; border-radius:4px; }
  pre { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--brand); border-radius:10px; padding:14px 16px; overflow-x:auto; font-family:var(--mono); font-size:.82rem; line-height:1.6; }

  .pill { display:inline-block; padding:2px 9px; border-radius:99px; font-size:.72rem; font-weight:700; }
  .pill.ok { background:#e6f4ec; color:#1f9254; } .pill.warn { background:#fdf3e6; color:#c9860a; }
  .pill.bad { background:#fbeaea; color:#d13c3c; } .pill.info { background:#e7f0fa; color:#0B62B5; }

  .callout { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--warn); border-radius:10px; padding:14px 18px; margin:18px 0; }
  .callout.ok { border-left-color:var(--ok); } .callout.bad { border-left-color:var(--bad); }
  .missing { color:var(--bad); font-style:italic; }
  ul.tight li { margin:5px 0; }
  footer { margin-top:64px; padding-top:22px; border-top:1px solid var(--line); color:var(--muted); font-size:.82rem; }

  @media (max-width:760px) { .pair-grid { grid-template-columns:1fr; } }
  @media print { body { background:#fff; } .masthead { background:#0d1b2a !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>

<header class="masthead">
  <div class="masthead-inner">
    <p class="eyebrow">Technical &amp; UX Audit</p>
    <h1>Mr.Enginero storefront</h1>
    <p>Angular 19 · Express · MongoDB Atlas — a PC-hardware storefront for the Egyptian market,
       priced from five real retailers, selling cash on delivery.</p>
    <div class="meta">
      <div><span>Owner</span>Mohamed El-Saied</div>
      <div><span>Audited</span>${esc(generated)}</div>
      <div><span>Bundle</span>343 kB raw · 98 kB gzip</div>
      <div><span>Screens captured</span>${shots.length}</div>
    </div>
  </div>
</header>

<div class="wrap">

<h2>1 · Executive summary</h2>
<p>The project began as a front-end-only Angular demo: twelve hard-coded products, placeholder contact
details, no server, and a checkout button that simply emptied the cart. It is now a working storefront
with a real back end.</p>

<div class="cards">
  <div class="card"><b>150</b><span>Real products</span></div>
  <div class="card ok"><b>91</b><span>From Alexandria (61%)</span></div>
  <div class="card"><b>5</b><span>Retailer feeds</span></div>
  <div class="card ok"><b>0 px</b><span>Mobile overflow</span></div>
  <div class="card ok"><b>13</b><span>Defects fixed</span></div>
  <div class="card"><b>98 kB</b><span>Initial bundle (gzip)</span></div>
</div>

<div class="table-scroll"><table>
  <tr><th>Area</th><th>Before</th><th>After</th></tr>
  <tr><td>Data</td><td>12 products in a TypeScript array</td><td>150 real products in MongoDB Atlas</td></tr>
  <tr><td>Back end</td><td>none</td><td>Express API, 27 endpoints, 12 indexes</td></tr>
  <tr><td>Selling</td><td>a button that cleared the cart</td><td>COD orders, atomic stock, email alerts</td></tr>
  <tr><td>Auth</td><td>plaintext passwords in an array</td><td>scrypt hashes, signed tokens, Google SSO, email verification</td></tr>
  <tr><td>Admin</td><td>a product table</td><td>Orders · Catalogue · Users · Settings</td></tr>
  <tr><td>Mobile</td><td>39 px horizontal overflow, 31–36 px tap targets</td><td>0 px overflow, every target ≥ 40 px</td></tr>
</table></div>

<h2>2 · Key pages</h2>
<div class="gallery">
  ${await figure('01-home-desktop')}
  ${await figure('03-shop-desktop')}
  ${await figure('05-product-desktop')}
  ${await figure('07-deals-desktop')}
  ${await figure('09-checkout-desktop')}
  ${await figure('11-login-desktop')}
</div>

<h2>3 · Mobile versus desktop</h2>
<p>Audited programmatically at 375 × 812, 768 × 1024 and 1280 × 800 across all twelve routes, measuring
<code>scrollWidth − clientWidth</code> for overflow and the bounding box of every interactive element
for tap-target size. Then re-tested by driving the interface with real pointer events.</p>

<div class="table-scroll"><table>
  <tr><th>Viewport</th><th>Pages</th><th>Horizontal overflow</th><th>Tap targets &lt; 40 px</th></tr>
  <tr><td>375 px</td><td>12</td><td><span class="pill ok">0 px on every page</span></td><td><span class="pill ok">0</span></td></tr>
  <tr><td>768 px</td><td>10</td><td><span class="pill ok">0 px on every page</span></td><td>—</td></tr>
  <tr><td>1280 px</td><td>10</td><td><span class="pill ok">0 px on every page</span></td><td>—</td></tr>
</table></div>

${await pair('01-home-desktop', '02-home-mobile', 'Home — desktop and phone',
  'Eleven category tiles on desktop collapse to a single native dropdown below 640 px: one tap instead of a long scroll.')}

${await pair('03-shop-desktop', '04-shop-mobile', 'Shop — desktop and phone',
  'The filter sidebar moves behind a <em>Filters</em> button carrying a count of what is active. Category chips become a dropdown.')}

${await pair('05-product-desktop', '06-product-mobile', 'Product — desktop and phone',
  'Two columns become one; the quantity stepper is 44 px so it is comfortable with a thumb.')}

${await pair('09-checkout-desktop', '10-checkout-mobile', 'Checkout — desktop and phone',
  'All inputs render at 16 px on mobile, which is what stops iOS Safari zooming the page when a field is focused.')}

<section class="pair">
  <h4>Cart and dashboard on a phone</h4>
  <div class="pair-grid">
    ${await figure('08-cart-mobile')}
    ${await figure('18-dashboard-mobile')}
  </div>
</section>

<h2>4 · Defects found and fixed</h2>
<p>Every one of these was found by testing the running application, not by reading the code.</p>

<div class="table-scroll"><table>
  <tr><th>#</th><th>Severity</th><th>Defect</th><th>Evidence</th><th>Fix</th></tr>
  <tr><td>1</td><td><span class="pill bad">High</span></td>
      <td>Product photo links collapsed to 23 px tall, so tapping most of the image did nothing</td>
      <td><code>a</code> inside <code>.pcard-media</code> measured 311 × 23 against a 320 × 240 image</td>
      <td><code>display:block; height:100%</code></td></tr>
  <tr><td>2</td><td><span class="pill bad">High</span></td>
      <td>Supplier identity leaked to shoppers through <code>tags</code>, <code>brand</code> and retailer copy inside descriptions</td>
      <td>Searching “CompuMarts” as a shopper returned exactly their 33 products</td>
      <td>Sourcing ids removed from public tags, house-brands replaced, retailer names scrubbed from 86 descriptions. Leak count now <b>0</b> across 8 probe terms</td></tr>
  <tr><td>3</td><td><span class="pill bad">High</span></td>
      <td>Server answered any missing file with HTTP 200 and the SPA shell</td>
      <td><code>/logo.png</code> returned 200 and HTML while the file did not exist</td>
      <td>Requests with a file extension 404 honestly</td></tr>
  <tr><td>4</td><td><span class="pill warn">Medium</span></td>
      <td>39 px horizontal overflow on mobile from the header icon row</td>
      <td><code>.header-actions</code> measured 240 px wide, ending at x=414 in a 375 px viewport</td>
      <td>Icons redistributed below 560 px; wordmark allowed to truncate</td></tr>
  <tr><td>5</td><td><span class="pill warn">Medium</span></td>
      <td>Header downloaded the 1.2 MB logo to draw it at 38 px</td>
      <td>1,213,449 bytes for a 38 px mark</td>
      <td>Serves the 192 px cut — 39 kB, a <b>97% saving</b></td></tr>
  <tr><td>6</td><td><span class="pill warn">Medium</span></td>
      <td>Laptops classified as Graphics Cards — their titles advertise the GPU inside</td>
      <td>“AORUS MASTER 16 … RTX 5090” filed under Graphics Cards</td>
      <td>Laptops matched first, with SKU-suffix patterns for models that never say “laptop”</td></tr>
  <tr><td>7</td><td><span class="pill warn">Medium</span></td>
      <td>“Gaming PC Case” products filed under Prebuilt PCs</td><td>Fractal Design cases in the Prebuilt bucket</td><td>Per-category exclusion patterns</td></tr>
  <tr><td>8</td><td><span class="pill warn">Medium</span></td>
      <td>Motherboards classified as Processors — boards advertise the CPUs they socket</td>
      <td>“Z890 EAGLE … for Intel Core Ultra” under Processors</td><td>Exclusion on the Processors matcher</td></tr>
  <tr><td>9</td><td><span class="pill warn">Medium</span></td>
      <td>Brand filter rows were 31 px — missed by the first audit because the sidebar was collapsed when measured</td>
      <td>Found only by opening the sidebar and re-measuring</td>
      <td><code>min-height:40px</code> on the label, which is the real target</td></tr>
  <tr><td>10</td><td><span class="pill warn">Medium</span></td>
      <td>Admin sign-in ignored <code>returnTo</code> and always forced the dashboard</td>
      <td>An admin signing in from a product page was bounced away from it</td>
      <td>Honour the origin; fall back to the dashboard only when there is none</td></tr>
  <tr><td>11</td><td><span class="pill info">Low</span></td>
      <td>Sold-out products sorted to the top of the grid</td><td>First two results on the default sort were sold out</td>
      <td>Availability is the first sort key under every sort option</td></tr>
  <tr><td>12</td><td><span class="pill info">Low</span></td>
      <td>Receipt claimed “a copy has been emailed” with SMTP unconfigured</td><td>No mail had left the server</td>
      <td><code>receiptEmailed</code> flag; the page claims only what happened</td></tr>
  <tr><td>13</td><td><span class="pill info">Low</span></td>
      <td>Logo squashed — 3:2 artwork in a square container</td><td>Visible distortion in the header</td><td><code>object-fit: contain</code></td></tr>
</table></div>

<h2>5 · Sourcing and the Alexandria businesses</h2>
<p><code>npm run catalog:build</code> reads live feeds from five Egyptian retailers across two storefront
platforms — Shopify and WooCommerce, whose prices arrive in minor units.</p>

<div class="table-scroll"><table>
  <tr><th>Retailer</th><th>City</th><th>Platform</th><th>Listings read</th><th>Products used</th></tr>
  <tr><td>CompuMarts</td><td>Alexandria — Roushdy, Deeb Mall</td><td>Shopify</td><td>1,500</td><td>33</td></tr>
  <tr><td>UpToDate Tech</td><td>Alexandria — Smouha</td><td>WooCommerce</td><td>600</td><td>32</td></tr>
  <tr><td>El Hamd Computer Supplies</td><td>Alexandria — Roushdy</td><td>WooCommerce</td><td>382</td><td>26</td></tr>
  <tr><td>Elyamama Store</td><td>Cairo</td><td>Shopify</td><td>910</td><td>31</td></tr>
  <tr><td>El Nour Tech</td><td>Cairo</td><td>WooCommerce</td><td>563</td><td>28</td></tr>
  <tr><td><b>Sigma Computer</b></td><td>Alexandria — Smouha</td><td>—</td><td><b>0</b></td><td><b>0</b></td></tr>
</table></div>

<div class="callout">
  <strong>Sigma Computer could not be connected.</strong> Their storefront is a client-rendered Next.js
  application talking to a private API; there is no public product feed, and every documented endpoint
  pattern returned 404. Sigma is listed in the directory with an explicit <em>Not connected</em> badge
  and a note explaining why, rather than being omitted or padded with invented data.
</div>

${await figure('17-suppliers-desktop')}

<h3>What is real and what is generated</h3>
<div class="table-scroll"><table>
  <tr><th>Real, straight from the retailer</th><th>Generated for the demo</th></tr>
  <tr><td>Product name and brand</td><td>Unit stock counts</td></tr>
  <tr><td>Selling price and original price (EGP)</td><td>Star ratings</td></tr>
  <tr><td>Product photography, up to 4 per item</td><td>Review counts</td></tr>
  <tr><td>Marketing copy and spec bullets</td><td></td></tr>
  <tr><td>Stock availability, supplier and city</td><td></td></tr>
</table></div>
<p>109 of 150 products carry a genuine discount: <code>originalPrice</code> is the retailer's own
compare-at price and <code>discount</code> is derived from the two. No discount is invented.</p>

<h2>6 · Sourcing confidentiality</h2>
<p>Which shop supplies a product, and what it cost there, is competitive information. Both
<code>supplier</code> and <code>priceSource</code> are stripped from every public response and returned
only to an admin. Responses are <code>Cache-Control: private</code> with <code>Vary: Authorization</code>
so a shared cache cannot serve an admin's copy to a shopper.</p>

<pre>Shopper   supplier: absent · priceSource: absent · /api/suppliers: 401
          "CompuMarts" 0 · "El Hamd" 0 · "UpToDate" 0 · "Alexandria" 0 · "Sigma" 0
Admin     supplier: present · 5 suppliers, 2 cities · /api/suppliers: 200
          "CompuMarts" 33 · "El Hamd" 26
Shopper search unaffected:  RTX 33 · laptop 17 · Gigabyte 28 · DDR5 24</pre>

<h2>7 · Admin dashboard</h2>
<div class="gallery">
  ${await figure('13-dashboard-orders')}
  ${await figure('14-dashboard-catalogue')}
  ${await figure('15-dashboard-users')}
  ${await figure('16-dashboard-settings')}
</div>

<ul class="tight">
  <li><b>Orders</b> — cash to collect, order board, contact log, status workflow. Cancelling returns stock exactly once.</li>
  <li><b>Catalogue</b> — full CRUD with a price-source column linking to the original listing, and a drift warning when your price no longer matches what was captured.</li>
  <li><b>Users</b> — roles, verification, removal. You cannot demote or delete yourself, the last admin cannot be demoted, and addresses in <code>ADMIN_EMAILS</code> are protected.</li>
  <li><b>Settings</b> — delivery and cash-handling fees applied to the next order without a restart, a pause switch for stocktaking, and live system status.</li>
</ul>

<h2>8 · Security</h2>
<div class="table-scroll"><table>
  <tr><th>In place</th><th>Detail</th></tr>
  <tr><td>Password storage</td><td>Salted scrypt, compared in constant time</td></tr>
  <tr><td>Sessions</td><td>HMAC-signed tokens, 7-day expiry, <code>timingSafeEqual</code> verification</td></tr>
  <tr><td>Privilege</td><td><code>role</code> never read from a request body; admin comes from <code>ADMIN_EMAILS</code></td></tr>
  <tr><td>Order pricing</td><td>Computed server-side — a tampered cart claiming <code>unitPrice: 1</code> was still charged EGP 234,333</td></tr>
  <tr><td>Stock</td><td>Guarded decrements; concurrent checkouts cannot oversell, cancels cannot double-restore</td></tr>
  <tr><td>OAuth</td><td>State is a nonce plus HMAC; unverified Google addresses refused; token returned in the URL fragment and scrubbed from history</td></tr>
</table></div>

<div class="callout bad">
  <strong>Outstanding — owner action required.</strong>
  <ul class="tight">
    <li>Rotate the MongoDB Atlas password — the connection string was shared in chat.</li>
    <li>Add SMTP credentials; until then no order email leaves the server.</li>
    <li>Add Google OAuth credentials; until then the button redirects to <code>?sso=unconfigured</code>.</li>
    <li>Add rate limiting on <code>/api/auth/*</code> — there is no brute-force protection today.</li>
  </ul>
</div>

<h2>9 · Performance</h2>
<div class="table-scroll"><table>
  <tr><th>Measure</th><th>Value</th></tr>
  <tr><td>Initial bundle</td><td>343 kB raw · <b>98 kB compressed</b></td></tr>
  <tr><td>Routes</td><td>All lazy-loaded — 13 chunks</td></tr>
  <tr><td>Change detection</td><td>OnPush on every component</td></tr>
  <tr><td>Header logo</td><td>39 kB instead of 1.2 MB — 97% saving</td></tr>
  <tr><td>Search</td><td>Debounced 300 ms (shop) / 250 ms (header)</td></tr>
  <tr><td>Products per page</td><td>24, paginated in MongoDB — not 150 in the browser</td></tr>
  <tr><td>API round-trips</td><td>One <code>$facet</code> aggregation per page, not one per widget</td></tr>
</table></div>

<h2>10 · What is not done</h2>
<ol class="tight">
  <li><b>Sigma Computer products</b> — no public feed exists; the company is listed but carries no stock.</li>
  <li><b>Video recordings</b> — not possible in this environment; step-by-step visual demos are provided instead.</li>
  <li><b>Google OAuth is unconfigured</b> — code complete and tested to the redirect boundary, but it needs your Client ID and Secret.</li>
  <li><b>SMTP is unconfigured</b> — the mailer works and is tested; it writes to the console until credentials exist, and the dashboard says so.</li>
  <li><b>Facebook content pack</b> — requested earlier, still to write.</li>
  <li><b>Ratings and stock counts are generated</b> — no retailer feed exposes them.</li>
  <li><b>No automated test suite</b> — verification here was manual and script-driven.</li>
  <li><b>Cash on delivery only</b> — no card gateway integrated.</li>
</ol>

<footer>
  Generated by <code>npm run report</code> from ${shots.length} screenshots captured with
  <code>npm run screens</code> against the running application.<br>
  Mr.Enginero · Mohamed El-Saied · ${esc(generated)}
</footer>

</div>
</body>
</html>`;

  await writeFile(OUT, html);
  const { size } = await stat(OUT);
  console.log(`docs/audit-report.html — ${Math.round(size / 1024)} kB, ${shots.length} screenshots inlined`);
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
