/**
 * LoginPage (v2)
 * ==============
 * Changes:
 *   - Uses useAuthContext().login() instead of calling API directly
 *     → ensures AuthContext state is updated (no stale isLoggedIn)
 *   - Clears old localStorage keys that v1 used (backward compat)
 *   - Guest login also goes through AuthContext
 *   - Reads qf_session_expired flag (set by apiClient on hard logout)
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

export default function LoginPage() {
    const navigate                = useNavigate();
    const { login, startGuest }   = useAuthContext();

    const [username,       setUsername]       = useState("");
    const [password,       setPassword]       = useState("");
    const [error,          setError]          = useState("");
    const [loading,        setLoading]        = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);

    // Show banner if kicked here by the interceptor
    useEffect(() => {
        if (sessionStorage.getItem("qf_session_expired")) {
            setSessionExpired(true);
            sessionStorage.removeItem("qf_session_expired");
        }

        // Migrate old token key names (v1 → v2)
        const oldToken = localStorage.getItem("token");
        if (oldToken) {
            localStorage.removeItem("token");
            localStorage.removeItem("username");
            localStorage.removeItem("isGuest");
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username || !password) { setError("Please fill in all fields."); return; }
        setLoading(true);
        setError("");

        try {
            await login(username, password);
            // Clear stale session data from previous user
            localStorage.removeItem("qg_questions");
            localStorage.removeItem("qf_last_pdf");
            navigate("/home");
        } catch (err) {
            setError(err.response?.data?.detail || "Invalid credentials.");
        } finally {
            setLoading(false);
        }
    };

    const handleGuest = () => {
        startGuest();
        localStorage.removeItem("qg_questions");
        localStorage.removeItem("qf_last_pdf");
        navigate("/home");
    };

    return (
        <div className="page" style={{ background: "var(--bg)" }}>
            <div className="card card-sm">
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
                    <div style={{
                        width: "44px", height: "44px", background: "var(--navy)", borderRadius: "12px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto .75rem", fontSize: "1.2rem", fontWeight: 900, color: "#fff",
                    }}>Q</div>
                    <div className="auth-logo">QuizGenius AI</div>
                    <div className="auth-tagline">Sign in to continue learning</div>
                </div>

                {/* Session-expired notice */}
                {sessionExpired && (
                    <div style={{
                        background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.4)",
                        borderRadius: "8px", padding: ".7rem 1rem", marginBottom: "1rem",
                        fontSize: ".82rem", color: "#92400E", display: "flex", gap: ".5rem", alignItems: "center",
                    }}>
                        ⏱ <strong>Session expired.</strong> Please log in again to continue.
                    </div>
                )}

                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <input
                            className="form-input"
                            placeholder="Enter username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn btn-primary btn-full"
                        style={{ marginTop: ".5rem" }}
                        disabled={loading}
                    >
                        {loading ? "Signing in…" : "Sign In"}
                    </button>
                </form>

                <hr className="divider" />

                <button className="btn btn-outline btn-full" onClick={handleGuest}>
                    Continue as Guest
                </button>

                <div className="auth-switch" style={{ marginTop: "1.25rem" }}>
                    Don't have an account?{" "}
                    <span onClick={() => navigate("/register")}>Sign up free</span>
                </div>
            </div>
        </div>
    );
}
