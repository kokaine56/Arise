# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Build
#
# Dependencies are installed in their own layer so that editing application
# source does not re-run `npm ci` on every build. The lockfile is copied with
# the manifest so this layer is only invalidated by a real dependency change.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# `npm ci` is deliberate: it installs exactly what package-lock.json pins and
# fails loudly if the two disagree, rather than silently resolving newer
# versions on the machine running the build.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .

# The Supabase URL and anon key are public by design — every table is protected
# by Row Level Security, and the service-role key is never referenced in this
# codebase. They are passed as build args purely as a fallback for images built
# without a runtime environment; the entrypoint overrides them at boot.
#
# Passing them as ARGs (not ENV) also keeps them out of `docker history`, which
# matters even for a public key: it avoids leaking a real project URL into an
# image layer that someone might inspect.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""

# `npm run build` is `tsc -b && vite build`, so a type error fails the image.
RUN VITE_SUPABASE_URL="${VITE_SUPABASE_URL}" \
    VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY}" \
    npm run build

# ---------------------------------------------------------------------------
# Runtime
#
# The output is a static SPA, so the runtime is just a file server. There is no
# Node process in the final image: nothing to patch, no server to attack, and
# `nginx-unprivileged` runs as a non-root user on port 8080.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# `nginx -t` fails the build if the config is malformed, rather than leaving it
# to be discovered as a crash loop in production.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
RUN nginx -t

COPY --from=build /app/dist /usr/share/nginx/html

# Runs before nginx starts: writes /usr/share/nginx/html/env.js from the real
# environment. The 40- prefix orders it after the image's own 10-40 scripts.
COPY docker/entrypoint.sh /docker-entrypoint.d/40-arise-env.sh
RUN chmod +x /docker-entrypoint.d/40-arise-env.sh

USER nginx

EXPOSE 8080

# Orchestrators use this to decide whether to route traffic to the container,
# and it is a real request through the real config rather than a "process is
# alive" check that would pass even if the fallback routing were broken.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
