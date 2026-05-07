/**
 * ProtectedRoute (v2)
 * ====================
 * Changes:
 *   - Reads from AuthContext instead of localStorage directly
 *   - Waits for `initializing` to finish before deciding to redirect
 *     → PREVENTS the flash-logout on page refresh while token is being validated
 *   - Shows a minimal loading state during the silent refresh check
 */
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
    const { isLoggedIn, initializing } = useAuthContext();

    // Auth check in progress (silent refresh happening) — render nothing yet
    if (initializing) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                background: "var(--bg, #f8fafc)",
            }}>
                <div style={{ textAlign: "center", color: "var(--text-muted, #64748b)" }}>
                    <div style={{
                        width: "32px", height: "32px", border: "3px solid currentColor",
                        borderTopColor: "transparent", borderRadius: "50%",
                        animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
                    }} />
                    <div style={{ fontSize: "0.875rem" }}>Loading…</div>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!isLoggedIn) {
        return <Navigate to="/login" replace />;
    }

    return children;
}
