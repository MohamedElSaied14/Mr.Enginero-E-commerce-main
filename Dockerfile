# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — build the Angular bundle
#
# Debian slim rather than Alpine on purpose: the build pulls in native modules
# (sharp, and mongodb's optional bindings) and glibc prebuilds are the ones that
# are always published. Both stages share the base so nothing is compiled
# against a libc it will not run on.
###############################################################################
FROM node:22-slim AS build

WORKDIR /app

# Copy the manifests first. Docker caches this layer, so `npm ci` only re-runs
# when the dependencies actually change — not on every source edit.
COPY package.json package-lock.json ./
RUN npm ci

COPY angular.json tsconfig*.json ./
COPY src ./src
COPY public ./public

RUN npm run build


###############################################################################
# Stage 2 — runtime
#
# Only what the server needs to run: production dependencies, the built bundle,
# the API source and the seed data. No Angular CLI, no sharp, no source maps.
###############################################################################
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    API_PORT=3000 \
    TRUST_PROXY=1

WORKDIR /app

# `--omit=dev` drops the Angular toolchain and sharp — roughly 400 MB of tooling
# that has no business being on a production host.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY scripts ./scripts
COPY data ./data
COPY public ./public
COPY --from=build /app/dist ./dist

# Run as the unprivileged user the Node images already provide, so a container
# breakout does not land on root.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Reports the container unhealthy if MongoDB stops answering, not merely if the
# process is alive — a server that cannot reach its database is not serving.
#
# Sets `exitCode` and lets the event loop drain rather than calling
# `process.exit()` from inside the promise: forcing an exit while the fetch
# handle is still closing trips a libuv assertion and the check reports 127
# instead of a real result.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/health').then(r=>{process.exitCode=r.ok?0:1}).catch(()=>{process.exitCode=1})"

# The app installs its own SIGTERM/SIGINT handlers to close the Mongo pool
# cleanly, so Node can be PID 1. Run with `--init` (or `init: true` in compose)
# to get a reaper for any stray child processes.
CMD ["node", "server/index.mjs"]
