"use client";

import { useEffect } from "react";

/**
 * Registers the VeilMail service worker (production only).
 * Forces update checks so deployments are not blocked by stale workers.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let refreshing = false;

    const onControllerChange = () => {
      // Reload once when a new SW takes control so clients get fresh HTML/JS
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        // Activate waiting worker immediately when present
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              // New version ready; skipWaiting is already called in sw install
            }
          });
        });

        const onVisible = () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", onVisible);

        // Initial update check
        reg.update().catch(() => {});

        return () => {
          document.removeEventListener("visibilitychange", onVisible);
        };
      } catch {
        // Registration failures must not break the app
      }
    };

    void register();

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
