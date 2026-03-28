/**
 * Toast — Premium slide-in toast notification system.
 * - Left border accent per variant
 * - Auto-dismiss progress bar
 * - Smooth slide/fade animations
 * Usage: const toast = useToast(); toast("message", "success"|"error"|"info"|"warning");
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const ToastCtx = createContext(null);
let _id = 0;

const VARIANTS = {
    success: { icon: "✅", border: "#10B981", bg: "#F0FDF4", color: "#065F46", shadow: "rgba(16,185,129,.2)" },
    error:   { icon: "❌", border: "#EF4444", bg: "#FEF2F2", color: "#7F1D1D", shadow: "rgba(239,68,68,.2)" },
    info:    { icon: "ℹ️",  border: "#6366F1", bg: "#EEF2FF", color: "#3730A3", shadow: "rgba(99,102,241,.2)" },
    warning: { icon: "⚠️", border: "#F59E0B", bg: "#FFFBEB", color: "#78350F", shadow: "rgba(245,158,11,.2)" },
};

function ToastItem({ id, message, variant, duration, onRemove }) {
    const [progress, setProgress] = useState(100);
    const [leaving, setLeaving] = useState(false);
    const v = VARIANTS[variant] || VARIANTS.success;

    useEffect(() => {
        const interval = 50;
        const steps = duration / interval;
        const decrement = 100 / steps;
        const timer = setInterval(() => setProgress(p => Math.max(p - decrement, 0)), interval);
        const dismiss = setTimeout(() => {
            setLeaving(true);
            setTimeout(() => onRemove(id), 300);
        }, duration);
        return () => { clearInterval(timer); clearTimeout(dismiss); };
    }, [id, duration, onRemove]);

    const handleClose = () => {
        setLeaving(true);
        setTimeout(() => onRemove(id), 300);
    };

    return (
        <div style={{
            display: "flex", flexDirection: "column",
            minWidth: "280px", maxWidth: "420px",
            background: "#fff",
            border: `1px solid ${v.border}22`,
            borderLeft: `4px solid ${v.border}`,
            borderRadius: "12px",
            boxShadow: `0 8px 32px ${v.shadow}, 0 2px 8px rgba(0,0,0,.08)`,
            overflow: "hidden",
            animation: leaving ? "toastOut .3s ease forwards" : "toastIn .3s ease",
            transition: "all .3s ease",
        }}>
            {/* Content row */}
            <div style={{
                display: "flex", alignItems: "center", gap: ".75rem",
                padding: ".875rem 1rem",
            }}>
                <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{v.icon}</span>
                <span style={{ flex: 1, fontSize: ".85rem", fontWeight: 600, color: "#1e293b", lineHeight: 1.45 }}>
                    {message}
                </span>
                <button onClick={handleClose} style={{
                    background: "none", border: "none", color: "#94A3B8",
                    cursor: "pointer", fontSize: "1rem", padding: "0 .25rem",
                    lineHeight: 1, flexShrink: 0,
                    transition: "color .15s",
                }}
                    onMouseEnter={e => e.target.style.color = "#475569"}
                    onMouseLeave={e => e.target.style.color = "#94A3B8"}
                >✕</button>
            </div>
            {/* Progress bar */}
            <div style={{ height: "3px", background: `${v.border}22`, flexShrink: 0 }}>
                <div style={{
                    height: "100%", width: `${progress}%`,
                    background: v.border, borderRadius: "999px",
                    transition: "width .05s linear",
                }} />
            </div>
        </div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, variant = "success", duration = 4000) => {
        const id = ++_id;
        setToasts(prev => [...prev, { id, message, variant, duration }]);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastCtx.Provider value={addToast}>
            {children}
            {/* Toast container — top-right */}
            <div style={{
                position: "fixed", top: "5rem", right: "1.5rem",
                display: "flex", flexDirection: "column", gap: ".625rem",
                zIndex: 99999, alignItems: "flex-end",
                pointerEvents: "none",
            }}>
                {toasts.map(t => (
                    <div key={t.id} style={{ pointerEvents: "auto" }}>
                        <ToastItem {...t} onRemove={removeToast} />
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}

export function useToast() {
    const fn = useContext(ToastCtx);
    if (!fn) throw new Error("useToast must be inside <ToastProvider>");
    return fn;
}

export default ToastProvider;
