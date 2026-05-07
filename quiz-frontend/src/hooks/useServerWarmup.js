/**
 * useServerWarmup — pre-warms the Render backend on page load
 * ============================================================
 * Render free-tier dynos sleep after 15 min of inactivity.
 * Cold-start takes 30-60 seconds. If the user tries to upload a PDF
 * during a cold start, the request times out or returns a 503.
 *
 * This hook fires a lightweight GET /ping request as soon as the app
 * mounts. By the time the user selects a PDF and clicks Generate,
 * the server is already awake.
 *
 * Usage: call useServerWarmup() once in App.js AppShell.
 */
import { useEffect } from "react";

const BASE_URL     = "https://dl-project-pdf-to-mcq.onrender.com";
const PING_URL     = `${BASE_URL}/ping`;
const PING_TIMEOUT = 90_000;   // 90s — generous enough for cold start

export default function useServerWarmup() {
    useEffect(() => {
        let controller = new AbortController();

        async function warmup() {
            console.log("[Warmup] Pinging backend to pre-warm server…");
            try {
                const res = await fetch(PING_URL, {
                    method:  "GET",
                    signal:  controller.signal,
                });
                if (res.ok) {
                    console.log("[Warmup] Server is awake ✓");
                    window.dispatchEvent(new CustomEvent("qf:server-ready"));
                }
            } catch (e) {
                if (e.name !== "AbortError") {
                    console.warn("[Warmup] Ping failed (server may still be waking):", e.message);
                }
            }
        }

        warmup();

        // Re-ping every 10 minutes to keep the dyno warm while app is open
        const interval = setInterval(warmup, 10 * 60 * 1000);

        return () => {
            controller.abort();
            clearInterval(interval);
            controller = new AbortController(); // reset for cleanup safety
        };
    }, []);
}
