import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";

export default function RegisterPage() {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();

        // ✅ Validation
        if (!username || !password) {
            setError("Please fill in all fields.");
            return;
        }

        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const res = await API.post("/auth/register", {
                username,
                password,
            });

            // ✅ Success
            if (res.status === 200) {
                alert("Account created successfully 🎉");
                navigate("/login");
            } else {
                setError("Registration failed.");
            }

        } catch (e) {
            console.log("Register Error:", e);

            setError(
                e.response?.data?.detail ||
                e.response?.data?.message ||
                "Registration failed."
            );

        } finally {
            setLoading(false); // ✅ always stop loading
        }
    };

    return (
        <div className="page" style={{ background: "var(--bg)" }}>
            <div className="card card-sm">
                <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
                    <div
                        style={{
                            width: "44px",
                            height: "44px",
                            background: "var(--navy)",
                            borderRadius: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto .75rem",
                            fontSize: "1.2rem",
                            fontWeight: 900,
                            color: "#fff",
                        }}
                    >
                        Q
                    </div>
                    <div className="auth-logo">Create Account</div>
                    <div className="auth-tagline">
                        Join QuizGenius AI for free
                    </div>
                </div>

                {/* ❌ Error Message */}
                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleRegister}>
                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <input
                            className="form-input"
                            placeholder="Choose a username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="At least 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Confirm Password</label>
                        <input
                            className="form-input"
                            type="password"
                            placeholder="Repeat password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                        />
                    </div>

                    <button
                        className="btn btn-primary btn-full"
                        style={{ marginTop: ".5rem" }}
                        disabled={loading}
                    >
                        {loading ? "Creating account..." : "Create Account"}
                    </button>
                </form>

                <div className="auth-switch" style={{ marginTop: "1.25rem" }}>
                    Already have an account?{" "}
                    <span onClick={() => navigate("/login")}>
                        Sign in
                    </span>
                </div>
            </div>
        </div>
    );
}
