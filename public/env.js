// Placeholder, served as-is in dev and overwritten by docker/entrypoint.sh in
// the container. Vite copies everything in public/ to the dist root untouched.
//
// An empty object is the correct "unconfigured" state: src/lib/env.ts falls
// through to Vite's build-time import.meta.env, and if that is empty too the app
// shows the setup screen rather than failing to start.
//
// Without this file, /env.js would 404 in dev and the Vite dev server would
// answer with index.html, producing a MIME-type console error on every load.

window.__ARISE_ENV__ = {};
