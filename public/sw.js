// Field volunteers visit applicants wherever they live — not guaranteed to
// have signal. This doesn't try to make the whole app work offline (most
// pages are server-rendered against live DB state, which genuinely can't
// be "offline-first"); it does two honest things instead:
//   1. Caches whatever page shell the volunteer already loaded, so losing
//      signal mid-visit shows the last-seen page instead of the browser's
//      dinosaur-game error.
//   2. Lets the app be installed to a home screen (manifest + this file
//      existing is what makes Chrome/Android offer "Add to Home Screen").
// The actual offline *write* path (verification submissions) is handled
// separately by lib/offline-queue.ts, which is a deliberate app-level
// queue, not something a generic service worker cache can do safely.
const CACHE_NAME = "maatram-shell-v1";

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

  // Never cache API routes or Server Action POST-equivalents — those must
  // always reflect live DB state, never a stale snapshot.
  if (new URL(request.url).pathname.startsWith("/api/")) return;

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
