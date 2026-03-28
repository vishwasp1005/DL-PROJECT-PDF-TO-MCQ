import React from "react";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)",
            padding: "2rem", fontFamily: "Inter, system-ui, sans-serif", textAlign: "center",
        }}>
            <div style={{ maxWidth: "440px", animation: "fadeInUp .45s ease" }}>
                {/* Big 404 */}
                <div style={{
                    fontSize: "7rem", fontWeight: 900, lineHeight: 1,
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    letterSpacing: "-.05em", marginBottom: ".5rem",
                    animation: "float 4s ease-in-out infinite",
                }}>
                    404
                </div>

                <div style={{
                    width: "72px", height: "72px", margin: "0 auto 1.5rem",
                    borderRadius: "22px",
                    background: "linear-gradient(135deg, rgba(99,102,241,.12), rgba(139,92,246,.08))",
                    border: "1.5px solid rgba(99,102,241,.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "2rem",
                }}>🔭</div>

                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1B2B4B", marginBottom: ".5rem", letterSpacing: "-.02em" }}>
                    Page Not Found
                </h1>
                <p style={{ color: "#6B7280", fontSize: ".88rem", lineHeight: 1.7, marginBottom: "2rem" }}>
                    The page you're looking for doesn't exist or has been moved.
                    Let's get you back to learning!
                </p>

                <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                        onClick={() => navigate("/home")}
                        style={{
                            padding: ".75rem 1.75rem", borderRadius: "999px",
                            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                            border: "none", color: "#fff", fontWeight: 700,
                            fontSize: ".88rem", cursor: "pointer",
                            boxShadow: "0 4px 16px rgba(99,102,241,.4)",
                            transition: "transform .15s, box-shadow .15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(99,102,241,.5)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(99,102,241,.4)"; }}
                    >
                        🏠 Go Home
                    </button>
                    <button
                        onClick={() => navigate("/generate")}
                        style={{
                            padding: ".75rem 1.75rem", borderRadius: "999px",
                            background: "#fff", border: "1.5px solid #E5E7EB",
                            color: "#374151", fontWeight: 600,
                            fontSize: ".88rem", cursor: "pointer",
                            transition: "border-color .15s, background .15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366F1"; e.currentTarget.style.background = "#EEF2FF"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#fff"; }}
                    >
                        ⚡ Generate Quiz
                    </button>
                </div>
            </div>
        </div>
    );
}
