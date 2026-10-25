/* VeilMail service worker — static shell only. Never caches private email data. */
const CACHE_VERSION = "veilmail-static-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
];

/** Paths that must never be written to Cache Storage */
function isSensitive(url) {
  const p = url.pathname;
  if (p.startsWith("/api/")) return true;
  if (p.startsWith("/inbox/")) return true;
  if (p.startsWith("/dashboard") || p.startsWith("/account")) return true;
  if (
    p.startsWith("/login") ||
    p.startsWith("/register") ||
    p.startsWith("/forgot-password") ||
    p.startsWith("/reset-password") ||
    p.startsWith("/verify-email")
  ) {
    return true;
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        await cache.addAll(STATIC_ASSETS);
      } catch {
        // Individual failures are fine; install still completes
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Never intercept sensitive or API traffic — pass through to network only
  if (isSensitive(url)) {
    return;
  }

  // Static asset extensions: cache-first for icons/fonts/css/js from same origin
  const isStaticAsset =
    /\.(?:png|svg|ico|webp|jpg|jpeg|woff2?|css|js)$/i.test(url.pathname) ||
    url.pathname === "/manifest.webmanifest";

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(CACHE_VERSION);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return (
            cached ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }
      })()
    );
    return;
  }

  // Navigations: network-first; offline fallback to cached shell (/)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const shell = await caches.match("/");
          if (shell) return shell;
          return new Response(
            "<!DOCTYPE html><html><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>VeilMail</title><style>body{margin:0;background:#050A14;color:#F4F9FF;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center}p{color:#A9BAD0;max-width:28rem;line-height:1.5}</style></head><body><div><h1>VeilMail</h1><p>You are offline. Connect to the internet to open inboxes or receive email. No messages are available offline.</p></div></body></html>",
            {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        }
      })()
    );
  }
});
