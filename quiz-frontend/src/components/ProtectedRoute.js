/**
 * ProtectedRoute.js
 * ==================
 * - Waits for `initializing` before deciding to redirect
 *   → PREVENTS the flash-logout on page refresh while token validates
 * - Shows a spinner during the silent refresh check
 * - Reads from AuthContext (not localStorage directly)
 */
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
    const { isLoggedIn, initializing } = useAuthContext();

    // Still checking auth (silent refresh in progress) — show spinner, not login redirect
    if (initializing) {
        return (
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                minHeight: "100vh", background: "var(--bg, #f8fafc)",
            }}>
                <div style={{ textAlign: "center", color: "var(--text-muted, #64748b)" }}>
                    <div style={{
                        width: "32px", height: "32px",
                        border: "3px solid currentColor",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        margin: "0 auto 12px",
                    }} />
                    <div style={{ fontSize: "0.875rem" }}>Loading…</div>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!isLoggedIn) return <Navigate to="/login" replace />;

    return children;
}
