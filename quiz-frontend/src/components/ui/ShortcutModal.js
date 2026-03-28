/**
 * ShortcutModal — Press '?' anywhere to see all keyboard shortcuts.
 * All shortcuts are ACTUALLY IMPLEMENTED here:
 *   - G → H/G/S/T/D  navigation chords (two-key, 1s window)
 *   - Esc            closes this modal
 *   - ?              toggles modal
 *
 * Study Mode shortcuts (N/P/B/T) live in StudyPage via useKeyboardShortcuts.
 */
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const SHORTCUTS = [
    { section: "Navigation (press G first, then the key)" },
    { key: "G → H", desc: "Go to Home" },
    { key: "G → G", desc: "Go to Generate" },
    { key: "G → S", desc: "Go to Study" },
    { key: "G → T", desc: "Go to Test" },
    { key: "G → D", desc: "Go to Dashboard" },
    { key: "G → A", desc: "Go to About" },
    { section: "Study Mode (active when on Study page)" },
    { key: "N", desc: "Next question" },
    { key: "P", desc: "Previous question" },
    { key: "B", desc: "Bookmark current question" },
    { key: "T", desc: "Toggle AI Tutor" },
    { section: "Global" },
    { key: "?", desc: "Show / hide this shortcuts panel" },
    { key: "Esc", desc: "Close this panel" },
];

const G_ROUTES = {
    h: "/home",
    g: "/generate",
    s: "/study",
    t: "/test",
    d: "/dashboard",
    a: "/about",
};

export default function ShortcutModal() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const pendingG = useRef(false);   // true when 'g' was just pressed
    const gTimer   = useRef(null);    // clears pendingG after 1s

    useEffect(() => {
        const handler = (e) => {
            // Never fire when typing inside inputs
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

            const key = e.key.toLowerCase();

            // ── Close / toggle modal ────────────────────────────
            if (e.key === "Escape") {
                setOpen(false);
                pendingG.current = false;
                return;
            }

            if (e.key === "?" || (e.shiftKey && e.key === "?")) {
                e.preventDefault();
                pendingG.current = false;
                setOpen(o => !o);
                return;
            }

            // ── G → X navigation chords ─────────────────────────
            if (key === "g" && !e.ctrlKey && !e.metaKey) {
                // First G press — start waiting for second key
                if (!pendingG.current) {
                    e.preventDefault();
                    pendingG.current = true;
                    clearTimeout(gTimer.current);
                    gTimer.current = setTimeout(() => { pendingG.current = false; }, 1000);
                    return;
                }
            }

            if (pendingG.current && G_ROUTES[key]) {
                e.preventDefault();
                pendingG.current = false;
                clearTimeout(gTimer.current);
                navigate(G_ROUTES[key]);
                return;
            }

            // Any other key cancels pending G
            if (pendingG.current && key !== "g") {
                pendingG.current = false;
                clearTimeout(gTimer.current);
            }
        };

        window.addEventListener("keydown", handler);
        return () => {
            window.removeEventListener("keydown", handler);
            clearTimeout(gTimer.current);
        };
    }, [navigate]);

    if (!open) return null;

    return (
        /* Backdrop */
        <div
            onClick={() => setOpen(false)}
            style={{
                position: "fixed", inset: 0, zIndex: 99998,
                background: "rgba(15,25,56,.55)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "pageFade .2s ease",
            }}
        >
            {/* Modal panel */}
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "rgba(255,255,255,.97)",
                    backdropFilter: "blur(20px)",
                    borderRadius: "20px",
                    padding: "1.75rem",
                    width: "100%", maxWidth: "440px",
                    maxHeight: "80vh", overflowY: "auto",
                    boxShadow: "0 24px 64px rgba(0,0,0,.2), 0 0 0 1px rgba(99,102,241,.15)",
                    animation: "fadeInUp .25s ease",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1B2B4B" }}>⌨️ Keyboard Shortcuts</div>
                        <div style={{ fontSize: ".7rem", color: "#9CA3AF", marginTop: ".1rem" }}>
                            Press <kbd style={kbdStyle}>?</kbd> to toggle · <kbd style={kbdStyle}>Esc</kbd> to close
                        </div>
                    </div>
                    <button onClick={() => setOpen(false)} style={{
                        width: "30px", height: "30px", borderRadius: "50%",
                        border: "1px solid #E5E7EB", background: "#F9FAFB",
                        cursor: "pointer", fontSize: ".85rem", color: "#6B7280",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>✕</button>
                </div>

                {/* Shortcuts list */}
                <div style={{ display: "flex", flexDirection: "column", gap: ".25rem" }}>
                    {SHORTCUTS.map((s, i) => s.section ? (
                        <div key={i} style={{
                            fontSize: ".62rem", fontWeight: 700, color: "#9CA3AF",
                            textTransform: "uppercase", letterSpacing: ".1em",
                            padding: ".5rem 0 .25rem",
                            borderTop: i > 0 ? "1px solid #F3F4F6" : "none",
                            marginTop: i > 0 ? ".25rem" : 0,
                        }}>{s.section}</div>
                    ) : (
                        <div key={i} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: ".5rem .625rem", borderRadius: "8px",
                            transition: "background .12s",
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <span style={{ fontSize: ".82rem", color: "#374151" }}>{s.desc}</span>
                            <div style={{ display: "flex", gap: ".3rem", alignItems: "center" }}>
                                {s.key.split(" → ").map((k, ki) => (
                                    <React.Fragment key={ki}>
                                        {ki > 0 && <span style={{ fontSize: ".7rem", color: "#9CA3AF" }}>→</span>}
                                        <kbd style={kbdStyle}>{k}</kbd>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer tip */}
                <div style={{
                    marginTop: "1.25rem", padding: ".75rem", borderRadius: "10px",
                    background: "#EEF2FF", border: "1px solid rgba(99,102,241,.15)",
                    fontSize: ".72rem", color: "#4338CA",
                }}>
                    💡 <strong>Tip:</strong> Press <kbd style={{ ...kbdStyle, background: "#4338CA", color: "#fff" }}>G</kbd> then within 1 second press the destination key to navigate.
                </div>
            </div>
        </div>
    );
}

const kbdStyle = {
    display: "inline-block",
    padding: ".2rem .55rem",
    borderRadius: "6px",
    background: "#1B2B4B",
    color: "#fff",
    fontSize: ".7rem",
    fontWeight: 700,
    fontFamily: "monospace",
    border: "1px solid rgba(255,255,255,.15)",
    boxShadow: "0 2px 4px rgba(0,0,0,.2)",
};
