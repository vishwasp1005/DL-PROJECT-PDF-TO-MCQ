/**
 * RegisterPage.js
 * ================
 * - Fixed: backend returns 201, not 200 — old check caused silent fail
 * - Real-time inline field validation (mirrors backend rules)
 * - Green success banner + auto-redirect instead of alert()
 * - Exact error messages from backend surfaced to user
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";

export default function RegisterPage() {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirm,  setConfirm]  = useState("");
    const [error,    setError]    = useState("");
    const [success,  setSuccess]  = useState(false);
    const [loading,  setLoading]  = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setError("");

        if (!username.trim() || !password) { setError("Please fill in all fields."); return; }
        if (username.trim().length < 3)    { setError("Username must be at least 3 characters."); return; }
        if (password.length < 6)           { setError("Password must be at least 6 characters."); return; }
        if (password !== confirm)          { setError("Passwords do not match."); return; }

        setLoading(true);

        try {
            await API.post("/auth/register", { username: username.trim(), password });
            // Backend returns 201 — any 2xx (no exception) = success
            setSuccess(true);
            setTimeout(() => navigate("/login"), 1800);
        } catch (err) {
            setError(
                err.response?.data?.detail ||
                err.response?.data?.message ||
                "Registration failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    // Inline validation state
    const usernameTouched = username.length > 0;
    const usernameInvalid = usernameTouched && username.trim().length < 3;
    const passwordWeak    = password.length > 0 && password.length < 6;
    const confirmMismatch = confirm.length > 0 && confirm !== password;

    return (
        <div className="page" style={{ background: "var(--bg)" }}>
            <div className="card card-sm">

                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
                    <div style={{
                        width: "44px", height: "44px", background: "var(--navy)",
                        borderRadius: "12px", display: "flex", alignItems: "center",
                        justifyContent: "center", margin: "0 auto .75rem",
                        fontSize: "1.2rem", fontWeight: 900, color: "#fff",
                    }}>Q</div>
                    <div className="auth-logo">Create Account</div>
                    <div className="auth-tagline">Join QuizGenius AI for free</div>
                </div>

                {/* Success */}
                {success && (
                    <div style={{
                        background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.4)",
                        borderRadius: "8px", padding: ".75rem 1rem", marginBottom: "1rem",
                        fontSize: ".85rem", color: "#065f46",
                    }}>
                        ✅ Account created! Redirecting to login…
                    </div>
                )}

                {/* Error */}
                {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

                <form onSubmit={handleRegister} noValidate>

                    {/* Username */}
                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <input
                            className="form-input"
                            placeholder="At least 3 characters"
                            value={username}
                            onChange={e => { setUsername(e.target.value); setError(""); }}
                            style={usernameInvalid ? { borderColor: "#ef4444" } : {}}
                            autoFocus
                        />
                        {usernameInvalid && (
                            <div style={{ color: "#ef4444", fontSize: ".78rem", marginTop: "4px" }}>
                                Username must be at least 3 characters.
                            </div>
                        )}
                    </div>

                    {/* Password */}
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="At least 6 characters"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(""); }}
                            style={passwordWeak ? { borderColor: "#ef4444" } : {}}
                        />
                        {passwordWeak && (
                            <div style={{ color: "#ef4444", fontSize: ".78rem", marginTop: "4px" }}>
                                Password must be at least 6 characters.
                            </div>
                        )}
                    </div>

                    {/* Confirm */}
                    <div className="form-group">
                        <label className="form-label">Confirm Password</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="Repeat password"
                            value={confirm}
                            onChange={e => { setConfirm(e.target.value); setError(""); }}
                            style={confirmMismatch ? { borderColor: "#ef4444" } : {}}
                        />
                        {confirmMismatch && (
                            <div style={{ color: "#ef4444", fontSize: ".78rem", marginTop: "4px" }}>
                                Passwords do not match.
                            </div>
                        )}
                    </div>

                    <button
                        className="btn btn-primary btn-full"
                        style={{ marginTop: ".5rem" }}
                        disabled={loading || success || usernameInvalid || passwordWeak || confirmMismatch}
                    >
                        {loading ? "Creating account…" : "Create Account"}
                    </button>
                </form>

                <div className="auth-switch" style={{ marginTop: "1.25rem" }}>
                    Already have an account?{" "}
                    <span onClick={() => navigate("/login")}>Sign in</span>
                </div>
            </div>
        </div>
    );
}
