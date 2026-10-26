/* VeilMail service worker — static icons only. Never caches app shells, JS bundles, or private data. */
const CACHE_VERSION = "veilmail-static-v2";
const ICON_ASSETS = [
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/manifest.webmanifest",
];

/** Paths that must never be handled by the service worker */
function mustBypass(url) {
  const p = url.pathname;
  if (p.startsWith("/api/")) return true;
  if (p.startsWith("/_next/")) return true; // always network — avoid stale hashed bundles
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

function isIconOrManifest(url) {
  const p = url.pathname;
  if (p === "/manifest.webmanifest" || p === "/favicon.svg") return true;
  if (p.startsWith("/icons/")) return true;
  if (/\.(?:png|svg|ico|webp|woff2)$/i.test(p) && !p.startsWith("/_next/")) {
    return true;
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        await cache.addAll(ICON_ASSETS);
      } catch {
        // partial cache is fine
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
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
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

  if (url.origin !== self.location.origin) return;

  // Auth, API, Next.js runtime assets, inboxes: never intercept
  if (mustBypass(url)) {
    return;
  }

  // HTML navigations: network only (no stale homepage shell)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return new Response(
            "<!DOCTYPE html><html><head><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>VeilMail</title><style>body{margin:0;background:#050A14;color:#F4F9FF;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center}p{color:#A9BAD0;max-width:28rem;line-height:1.5}</style></head><body><div><h1>VeilMail</h1><p>You are offline. Connect to the internet to use VeilMail. Email and inboxes are not available offline.</p></div></body></html>",
            {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        }
      })()
    );
    return;
  }

  // Icons / manifest only: cache-first
  if (isIconOrManifest(url)) {
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
  }
});
