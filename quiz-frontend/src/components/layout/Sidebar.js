/**
 * Sidebar — collapsible sidebar stub.
 * Currently renders nothing (future feature placeholder).
 * Import and mount when you're ready to build a sidebar experience.
 */
import React from "react";

export default function Sidebar({ isOpen = false, onClose }) {
    if (!isOpen) return null;

    return (
        <aside
            style={{
                position: "fixed", left: 0, top: "60px",
                height: "calc(100vh - 60px)", width: "240px",
                background: "var(--card)",
                borderRight: "1px solid var(--border)",
                boxShadow: "4px 0 16px rgba(0,0,0,.06)",
                zIndex: 50, padding: "1.5rem 1rem",
                overflowY: "auto",
            }}
        >
            <button
                onClick={onClose}
                style={{
                    position: "absolute", top: "1rem", right: "1rem",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "1rem", color: "var(--text-muted)",
                }}
            >✕</button>
            <div style={{ fontWeight: 700, fontSize: ".8rem", color: "var(--text-light)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: "1rem" }}>
                Menu
            </div>
            {/* Future navigation items go here */}
        </aside>
    );
}
