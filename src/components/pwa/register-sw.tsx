"use client";

import { useEffect } from "react";

/**
 * Registers the VeilMail service worker once on the client.
 * The worker only caches static shell assets and never stores API or inbox data.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register in production builds (avoid SW caching during local HMR)
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        // Prompt the browser to check for updates when the tab becomes visible
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => document.removeEventListener("visibilitychange", onVisible);
      } catch {
        // Registration failures should not break the app
      }
    };

    void register();
  }, []);

  return null;
}
