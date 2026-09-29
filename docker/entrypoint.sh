#!/bin/sh
# Write the runtime configuration the browser reads at startup.
#
# Vite inlines `import.meta.env` at build time, so a plain image would bake in
# whatever project it was built against. Writing env.js here instead means one
# image is deployable to any environment, and pointing it at a different
# Supabase project is a container restart rather than a rebuild.
#
# These values are written into a <script> served from the same origin, so this
# is an injection sink. Every value is therefore validated against a strict
# allowlist rather than escaped: an unexpected value stops the container with a
# clear message, which is far better than shipping a broken or injected bundle.
set -eu

OUTPUT=/usr/share/nginx/html/env.js
URL="${VITE_SUPABASE_URL:-}"
KEY="${VITE_SUPABASE_ANON_KEY:-}"

# A Supabase project URL: https://<ref>.supabase.co (or .in for some regions).
# Anything else would fail the same check in env.ts, so stop here with a
# message that says what is actually wrong.
if [ -n "$URL" ] && ! printf '%s' "$URL" | grep -Eq '^https://[a-zA-Z0-9-]+\.supabase\.(co|in)$'; then
    echo "arise: VITE_SUPABASE_URL is not a Supabase project URL (https://<ref>.supabase.co)" >&2
    echo "arise: got ${URL}" >&2
    exit 1
fi

# The anon key is a JWT: base64url segments joined by dots. That character set
# contains nothing that can terminate a JavaScript string literal.
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'; then
    echo "arise: VITE_SUPABASE_ANON_KEY does not look like a Supabase anon key" >&2
    exit 1
fi

# Reduced to an exact literal rather than interpolated: this one is not
# pattern-checked, so it must not be able to carry a payload.
case "${VITE_DEBUG_SUPABASE:-false}" in
    true|false) DEBUG="${VITE_DEBUG_SUPABASE:-false}" ;;
    *) echo "arise: VITE_DEBUG_SUPABASE must be 'true' or 'false'; defaulting to false" >&2; DEBUG=false ;;
esac

# Empty is valid: the app renders its setup screen when it is unconfigured,
# which is the correct behaviour for a fresh deploy rather than a crash.
cat > "$OUTPUT" <<EOF
// Generated at container start by docker/entrypoint.sh. Do not edit.
window.__ARISE_ENV__ = {
  VITE_SUPABASE_URL: "${URL}",
  VITE_SUPABASE_ANON_KEY: "${KEY}",
  VITE_DEBUG_SUPABASE: "${DEBUG}"
};
EOF

chmod 444 "$OUTPUT"
chown nginx:nginx "$OUTPUT" 2>/dev/null || true

echo "arise: runtime configuration written (supabase ${URL:-not set})"

exec "$@"
