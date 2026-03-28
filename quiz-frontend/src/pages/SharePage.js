import React from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function SharePage() {
    const { data } = useParams();
    const navigate = useNavigate();

    let info = null;
    try {
        info = JSON.parse(atob(data));
    } catch {
        return (
            <div className="page" style={{ background: "var(--bg)" }}>
                <div className="empty-state">
                    <span className="emoji">🔗</span>
                    <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".5rem" }}>Invalid share link</div>
                    <button className="btn btn-primary" onClick={() => navigate("/home")}>Go Home</button>
                </div>
            </div>
        );
    }

    const { score, total, pct, difficulty, pdfName, date, username } = info;
    const emoji = pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "📚";
    const msg = pct >= 80 ? "Excellent Score!" : pct >= 50 ? "Good Effort!" : "Keep Practicing!";

    return (
        <div style={{ background: "var(--bg)", minHeight: "100vh", padding: "3rem 1.5rem" }}>
            <div style={{ maxWidth: "480px", margin: "0 auto" }}>
                {/* Score card */}
                <div className="card" style={{ textAlign: "center", padding: "2.5rem", background: "var(--navy)", border: "none", marginBottom: "1.25rem" }}>
                    <div style={{
                        width: "110px", height: "110px", borderRadius: "50%",
                        border: "3px solid rgba(255,255,255,.25)",
                        background: "rgba(255,255,255,.1)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 1.25rem",
                    }}>
                        <span style={{ fontSize: "2rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{pct}%</span>
                    </div>
                    <h2 style={{ color: "#fff", fontSize: "1.4rem", fontWeight: 800, marginBottom: ".375rem" }}>
                        {emoji} {msg}
                    </h2>
                    {username && (
                        <div style={{ color: "rgba(255,255,255,.6)", fontSize: ".85rem", marginBottom: ".375rem" }}>
                            Scored by <strong style={{ color: "#fff" }}>{username}</strong>
                        </div>
                    )}
                    <div style={{ color: "rgba(255,255,255,.65)", fontSize: ".85rem" }}>
                        {score}/{total} correct · {difficulty} · {date}
                    </div>
                </div>

                {/* PDF info */}
                {pdfName && (
                    <div className="card" style={{ marginBottom: "1.25rem" }}>
                        <div style={{ fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-light)", marginBottom: ".25rem" }}>
                            Source Document
                        </div>
                        <div style={{ fontWeight: 600, color: "var(--navy)", fontSize: ".9rem" }}>{pdfName}</div>
                    </div>
                )}

                {/* CTA */}
                <div className="card" style={{ textAlign: "center", padding: "1.75rem" }}>
                    <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".375rem" }}>Try QuizGenius AI</div>
                    <div style={{ fontSize: ".82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                        Generate your own AI-powered quizzes from any PDF
                    </div>
                    <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => navigate("/register")}>
                        Sign Up Free →
                    </button>
                </div>
            </div>
        </div>
    );
}
