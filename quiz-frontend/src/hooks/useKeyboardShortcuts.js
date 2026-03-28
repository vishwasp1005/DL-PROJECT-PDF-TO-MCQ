/**
 * useKeyboardShortcuts — registers keyboard event listeners.
 *
 * Usage:
 *   useKeyboardShortcuts({
 *     "a": () => handleAnswer(qId, "A"),
 *     "b": () => handleAnswer(qId, "B"),
 *     "ArrowRight": () => goNext(),
 *   });
 *
 * Pass `enabled = false` to temporarily disable (e.g. when typing in an input).
 */
import { useEffect } from "react";

export default function useKeyboardShortcuts(shortcuts = {}, enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const handler = (e) => {
            // Don't fire when typing in inputs / textareas
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

            const fn = shortcuts[e.key] || shortcuts[e.key.toLowerCase()];
            if (fn) {
                e.preventDefault();
                fn(e);
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [shortcuts, enabled]);
}
