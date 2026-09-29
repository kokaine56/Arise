#!/bin/sh
# Write the runtime configuration the browser reads at startup.
#
# Vite inlines `import.meta.env` at build time, so a plain image would bake in
# whatever project it was built against. Writing env.js here instead means one
# image is deployable to any environment, and pointing it at a different
# Supabase project is a container restart rather than a rebuild.
#
# This runs as a /docker-entrypoint.d hook, before the image's own entrypoint
# hands off to nginx. It therefore must not exec anything: the parent process
# is the one that starts the server.
#
# These values are written into a <script> served from the app's own origin, so
# this is an injection sink. Every value is validated against a strict
# allowlist rather than escaped: an unexpected value stops the container with a
# clear message, which is far better than shipping a broken or injected bundle.
set -eu

OUTPUT=/usr/share/nginx/html/env.js
URL="${VITE_SUPABASE_URL:-}"
KEY="${VITE_SUPABASE_ANON_KEY:-}"

# A Supabase project URL: https://<ref>.supabase.co (or .in for some regions).
# The same shape is required by `looksLikeUrl` in src/lib/env.ts — keep the two
# in step, or the container will happily serve config the app then rejects.
if [ -n "$URL" ] && ! printf '%s' "$URL" | grep -Eq '^https://[a-zA-Z0-9-]+\.supabase\.(co|in)$'; then
    echo "arise: VITE_SUPABASE_URL is not a Supabase project URL (https://<ref>.supabase.co)" >&2
    echo "arise: got ${URL}" >&2
    exit 1
fi

# The anon key is public by design — every table is protected by Row Level
# Security. What matters here is only that it cannot terminate a JavaScript
# string literal, so the check is on the character set, not the exact format:
# this admits both a modern JWT and an older opaque key while still rejecting
# quotes, backslashes, angle brackets, and newlines.
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9._-]{20,}$'; then
    echo "arise: VITE_SUPABASE_ANON_KEY is not a valid Supabase anon key" >&2
    exit 1
fi

# Reduced to an exact literal rather than interpolated: this one is not
# pattern-checked, so it must not be able to carry a payload.
case "${VITE_DEBUG_SUPABASE:-false}" in
    true|false) DEBUG="${VITE_DEBUG_SUPABASE:-false}" ;;
    *)
        echo "arise: VITE_DEBUG_SUPABASE must be 'true' or 'false'; using false" >&2
        DEBUG=false
        ;;
esac

# Empty is valid: the app renders its setup screen when it is unconfigured,
# which is the correct behaviour for a fresh deploy rather than a crash loop.
cat > "$OUTPUT" <<EOF
// Generated at container start by docker/entrypoint.sh. Do not edit.
window.__ARISE_ENV__ = {
  VITE_SUPABASE_URL: "${URL}",
  VITE_SUPABASE_ANON_KEY: "${KEY}",
  VITE_DEBUG_SUPABASE: "${DEBUG}"
};
EOF

# Read-only: nginx only ever needs to serve this.
chmod 444 "$OUTPUT"

echo "arise: runtime configuration written (supabase: ${URL:-not set})"
