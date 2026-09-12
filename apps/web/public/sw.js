/**
 * Plutão Service Worker — transparent update strategy
 *
 * - Network-first for navigations
 * - NEVER cache /api/* (stale JSON breaks cockpit: empty missions, etc.)
 * - Cache static shell assets only
 * - skipWaiting + clients.claim for fast deploys
 */

const CACHE_VERSION = "plutao-v0.2.0";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;

const SHELL_ASSETS = ["/", "/manifest.webmanifest"];

function isApiRequest(url) {
  try {
    const u = new URL(url);
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("shell-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // API must always hit the network — never serve stale JSON.
  if (isApiRequest(request.url)) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "OFFLINE" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets: cache-first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (
          response.ok &&
          request.url.startsWith(self.location.origin) &&
          !isApiRequest(request.url)
        ) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
