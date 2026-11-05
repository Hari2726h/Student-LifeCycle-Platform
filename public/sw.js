// Field volunteers visit applicants wherever they live — not guaranteed to
// have signal. This doesn't try to make the whole app work offline (most
// pages are server-rendered against live DB state, which genuinely can't
// be "offline-first"); it does two honest things instead:
//   1. Caches the public, non-personalized app shell (home, login, static
//      assets) so losing signal shows the last-seen shell instead of the
//      browser's dinosaur-game error.
//   2. Lets the app be installed to a home screen (manifest + this file
//      existing is what makes Chrome/Android offer "Add to Home Screen").
// The actual offline *write* path (verification submissions) is handled
// separately by lib/offline-queue.ts, which is a deliberate app-level
// queue, not something a generic service worker cache can do safely.
//
// Deliberately NOT cached: anything under /staff, /portal, /applicant,
// /mentor, or /apply — those are personalized/authenticated pages. On a
// shared device (a tablet several volunteers use), caching one person's
// authenticated page and later serving it from the cache as an offline
// fallback to a different logged-in user would leak their data across
// sessions. Those routes are network-only here; offline, they fail
// normally instead of risking a stale, wrong-person page.
const CACHE_NAME = "maatram-shell-v2";
const AUTHENTICATED_PREFIXES = ["/staff", "/portal", "/applicant", "/mentor", "/apply", "/api"];

function isCacheable(pathname) {
  if (AUTHENTICATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return true;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(["/manifest.webmanifest", "/icon.svg"])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutations

  const pathname = new URL(request.url).pathname;
  if (!isCacheable(pathname)) return; // network-only — let the browser's own request/error handling run

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
