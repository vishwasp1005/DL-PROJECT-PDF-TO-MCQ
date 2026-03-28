/**
 * Modal — accessible dialog wrapper.
 *
 * Props:
 *   isOpen:  boolean — controls visibility
 *   onClose: () => void — called on backdrop click or close button
 *   title:   string (optional)
 *   children
 *   maxWidth: string CSS value (default "480px")
 */
import React, { useEffect } from "react";

export default function Modal({ isOpen, onClose, title, children, maxWidth = "480px" }) {
    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 9000,
                background: "rgba(0,0,0,.45)", backdropFilter: "blur(3px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "1rem",
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "var(--card)", borderRadius: "16px",
                    boxShadow: "0 20px 60px rgba(0,0,0,.2)",
                    width: "100%", maxWidth,
                    padding: "1.75rem",
                    animation: "scaleIn .2s ease",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                {title && (
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: "1rem",
                    }}>
                        <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--navy)" }}>{title}</div>
                        <button
                            onClick={onClose}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--text-muted)", padding: 0 }}
                        >✕</button>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}
