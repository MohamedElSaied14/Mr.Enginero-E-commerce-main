# Deployment guide

Taking Mr.Enginero from a laptop to a live shop, in order.

Work through it top to bottom — the security steps come first because a leaked
database password is not something a good deploy can undo later.

---

## Contents

- [Before anything else](#before-anything-else)
- [Choosing a host](#choosing-a-host)
- [Environment variables](#environment-variables)
- [Option A — Railway or Render](#option-a--railway-or-render)
- [Option B — a VPS with Docker](#option-b--a-vps-with-docker)
- [Option C — a VPS without Docker](#option-c--a-vps-without-docker)
- [MongoDB Atlas](#mongodb-atlas)
- [Google sign-in in production](#google-sign-in-in-production)
- [Email in production](#email-in-production)
- [First run](#first-run)
- [Post-deploy checklist](#post-deploy-checklist)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Before anything else

### 1. Rotate the MongoDB password

If the connection string has ever been pasted into a chat, an email, or a
screenshot, treat it as public.

Atlas → **Database Access** → your user → **Edit** → **Edit Password** →
*Autogenerate Secure Password* → **Update User**. Then put the new string into
`MONGODB_URI`.

### 2. Generate a real `AUTH_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

This signs every session token. The server refuses to treat a placeholder or
anything under 24 characters as configured, and says so at boot.

> Changing it later signs everyone out. That is the correct behaviour, but pick
> it once and keep it.

### 3. Confirm `.env` was never committed

```bash
git log --all --full-history -- .env
```

Any output means the secrets are in the repository history and **all of them**
must be rotated — database, `AUTH_SECRET`, the Google client secret, and the
Gmail app password.

---

## Choosing a host

| | Railway / Render | VPS (Hetzner, DigitalOcean) |
| --- | --- | --- |
| Cost | ~$5–7 / month | ~$5 / month |
| HTTPS | automatic | you configure it |
| Deploy | push to git | `docker compose up -d` or systemd |
| Effort | minutes | an hour or two |
| Control | limited | complete |

**Vercel and Netlify will not work.** They host static files and short-lived
functions; this app is a long-running Node server holding a database connection
pool.

For a shop this size, **Railway** is the least work. The VPS route is documented
below for when that changes.

---

## Environment variables

Set these wherever your host keeps configuration — never in a committed file.

| Variable | Example | Notes |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster…` | the rotated password |
| `MONGODB_DB` | `shopzone` | |
| `AUTH_SECRET` | *(48 random bytes)* | see above |
| `ADMIN_EMAILS` | `you@gmail.com` | comma-separated; these become admins on first sign-in |
| `PUBLIC_ORIGIN` | `https://shop.example.com` | **must** be the real https URL |
| `NODE_ENV` | `production` | |
| `TRUST_PROXY` | `1` | number of proxies in front; `0` if none |
| `API_PORT` | `3000` | |
| `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com` | |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-…` | |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | `you@gmail.com` | |
| `SMTP_PASS` | *(16-char app password)* | not your Gmail password |
| `SMTP_FROM` | `Mr.Enginero <you@gmail.com>` | |
| `ORDERS_EMAIL_TO` | `you@gmail.com` | where order alerts land |

### `PUBLIC_ORIGIN` matters more than it looks

It is the single source of truth for three things:

1. the OAuth redirect URI sent to Google,
2. the links inside verification emails,
3. whether HSTS and `upgrade-insecure-requests` are switched on.

That last one is keyed on the **scheme**, not on `NODE_ENV`. A production build
served over plain HTTP does not send those headers — otherwise the browser would
rewrite every request to `https://` and the site would stop loading.

### `TRUST_PROXY` matters too

Behind a proxy, the visitor's real address arrives in `X-Forwarded-For`. Set to
`0` and rate limiting sees every visitor as the proxy — one person — and throttles
the whole shop at once.

| Setup | Value |
| --- | :---: |
| Railway, Render, Fly, Heroku | `1` |
| Your own nginx or Caddy | `1` |
| Cloudflare in front of nginx | `2` |
| Container exposed directly | `0` |

---

## Option A — Railway or Render

1. Push to GitHub. Check `.env` is not in the diff:
   ```bash
   git status --short
   ```
2. **New Project → Deploy from GitHub repo.**
3. Add every variable from the table above under **Variables**.
4. Build and start commands:
   ```
   Build:  npm ci && npm run build
   Start:  npm run serve:prod
   ```
   Both platforms also detect the `Dockerfile` — either path works.
5. **Settings → Domains** → add your domain and point the DNS record it shows.
   HTTPS is issued automatically.
6. Set `PUBLIC_ORIGIN` to that final `https://` URL and redeploy.

---

## Option B — a VPS with Docker

The repository ships a production `Dockerfile` (multi-stage, non-root, with a
health check) and a `docker-compose.yml`.

```bash
ssh you@your-server
git clone <your-repo-url> && cd Mr.Enginero-E-commerce-main
```

Create `.env` on the server — never copy the development one:

```bash
nano .env      # paste the variables, with PUBLIC_ORIGIN set to your https URL
chmod 600 .env
```

```bash
docker compose up -d --build
```

```bash
docker compose logs -f
```

You are looking for four lines:

```
API listening on http://localhost:3000
MongoDB connected, indexes ready
[mail] SMTP ready, order alerts go to …
[auth] Google sign-in ready. Registered redirect URI must be exactly: …
```

### Reverse proxy and HTTPS

The container speaks plain HTTP on 3000. Put Caddy in front — it obtains and
renews the certificate on its own:

```caddyfile
# /etc/caddy/Caddyfile
shop.example.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

<details>
<summary>nginx instead of Caddy</summary>

```nginx
server {
    listen 80;
    server_name shop.example.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

The `X-Forwarded-*` headers are what `TRUST_PROXY=1` reads. Without them rate
limiting and HTTPS detection both misbehave. Then:

```bash
sudo certbot --nginx -d shop.example.com
```
</details>

### Firewall

Only 80 and 443 should be reachable. Port 3000 must not be:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

---

## Option C — a VPS without Docker

```bash
sudo apt update && sudo apt install -y nodejs npm
node -v          # must be 20.19 or newer
```

```bash
git clone <your-repo-url> && cd Mr.Enginero-E-commerce-main
npm ci
npm run build
```

Run it under systemd so it survives reboots and crashes:

```ini
# /etc/systemd/system/mr-enginero.service
[Unit]
Description=Mr.Enginero storefront
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/mr-enginero
EnvironmentFile=/srv/mr-enginero/.env
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=5

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/mr-enginero

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now mr-enginero
sudo systemctl status mr-enginero
```

Then set up the reverse proxy exactly as in Option B.

---

## MongoDB Atlas

### Lock down network access

Atlas → **Network Access**. If `0.0.0.0/0` is listed, every machine on the
internet can attempt to connect. Delete it and add your server's address:

```bash
curl -s ifconfig.me      # run this on the server
```

> Railway and Render do not publish fixed egress addresses on their lower tiers.
> If you are on one of those you may have to keep `0.0.0.0/0` — in which case the
> database password is your only defence, so make it long and never reuse it.

### Least privilege

The application user needs **readWrite on the `shopzone` database only** — not
`atlasAdmin`, and not access to every database on the cluster.

### Backups

Atlas → **Backup**. Even the free tier keeps recent snapshots. Turn it on before
you have orders worth losing.

---

## Google sign-in in production

[console.cloud.google.com](https://console.cloud.google.com) → your project.

1. **Credentials → your OAuth client → Authorised redirect URIs → Add:**
   ```
   https://shop.example.com/api/auth/google/callback
   ```
   Keep the localhost entry for development. Google compares this string
   character for character — a trailing slash or `http` instead of `https` is a
   `redirect_uri_mismatch`.

2. **OAuth consent screen → PUBLISH APP.**

   Until you do, **only the addresses under "Test users" can sign in.** Every
   real customer is refused. This is the single most common thing to forget.

The server prints the exact URI it will send at boot, so you can compare rather
than guess:

```
[auth] Google sign-in ready. Registered redirect URI must be exactly:
       https://shop.example.com/api/auth/google/callback
```

---

## Email in production

Gmail needs an **App Password**, not the account password: enable 2-Step
Verification, then Google Account → Security → App passwords, and use the
16-character code as `SMTP_PASS`.

Gmail allows roughly **500 messages a day**. That is plenty at first. Past it,
move to a transactional provider (Resend, Brevo, Postmark) — only the four
`SMTP_*` variables change; no code does.

If SMTP is wrong the store still takes orders. Messages are written to the log
instead, the dashboard shows an amber banner, and the outcome of every attempt is
recorded on the order. Nothing fails silently.

---

## First run

Load the catalogue once, from your machine, pointed at the production database:

```bash
npm run db:seed
```

Then create your admin account: open `https://shop.example.com/register` and
sign up with an address listed in `ADMIN_EMAILS` — or use **Continue with
Google**. It becomes an admin on first sign-in. There are no seeded accounts.

---

## Post-deploy checklist

```bash
curl https://shop.example.com/api/health
```

Then, in the browser:

- [ ] **Dashboard → Settings** shows *"Everything is configured"* with no warnings
- [ ] Sign in with Google from the live domain
- [ ] The padlock is present and `http://` redirects to `https://`
- [ ] Place a test order from a private window
- [ ] The order alert reaches your inbox
- [ ] The order appears on the Orders board
- [ ] Cancel the test order and confirm stock is returned
- [ ] Open the shop on a phone — no sideways scrolling
- [ ] Product images load (they come from the retailers' CDNs)

Verify the security headers are actually being sent:

```bash
curl -sI https://shop.example.com | grep -iE "content-security|strict-transport|x-frame|x-content-type"
```

You should see `Strict-Transport-Security` — it only appears once
`PUBLIC_ORIGIN` is an `https://` URL.

Finally, put an uptime monitor on `/api/health`
([UptimeRobot](https://uptimerobot.com) is free). Without one, you find out the
site is down when a customer tells you.

---

## Updating

**Railway / Render** — push to the tracked branch; it redeploys.

**Docker:**

```bash
git pull && docker compose up -d --build
```

**systemd:**

```bash
git pull && npm ci && npm run build && sudo systemctl restart mr-enginero
```

### Refreshing prices

Catalogue prices are a snapshot from when it was built:

```bash
npm run catalog:build      # re-reads every retailer feed
npm run db:seed            # upserts — existing product ids are kept
```

The dashboard flags any product whose current price has drifted from the one
captured at the source.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Site loads unstyled | CSP blocked the stylesheet | `inlineCritical` must stay `false` in `angular.json` |
| `redirect_uri_mismatch` | The URI is not registered, or differs | Compare with the boot log, character for character |
| Google says "app not verified" and blocks customers | Consent screen still in Testing | Publish it |
| Everyone rate-limited at once | `TRUST_PROXY` wrong | `1` behind one proxy, `2` behind Cloudflare + nginx |
| Emails logged, never sent | SMTP not set, or app password wrong | Check the boot log for `[mail] SMTP ready` |
| Verification links point at localhost | `PUBLIC_ORIGIN` unset | Set it to the https URL and restart |
| `MongoServerError: bad auth` | Password rotated, config stale | Update `MONGODB_URI` |
| Connection times out | Atlas IP allowlist | Add the server's address under Network Access |
| Cannot reach the dashboard | Your address is not an admin | Add it to `ADMIN_EMAILS`, restart, sign in again |
| Config changes do nothing | `.env` is read once, at boot | Restart the process |

> **`.env` is read only at startup.** Almost every "I changed it and nothing
> happened" turns out to be a missing restart.
