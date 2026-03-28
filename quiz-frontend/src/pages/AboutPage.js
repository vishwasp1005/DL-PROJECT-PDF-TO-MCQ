import React from "react";
import { useNavigate } from "react-router-dom";

const TECH = [
    { icon: "⚛️", name: "React 18", desc: "Fast, reactive UI" },
    { icon: "🐍", name: "FastAPI", desc: "High-performance Python API" },
    { icon: "🤖", name: "Groq LLaMA 3", desc: "AI question generation" },
    { icon: "🗄️", name: "SQLite", desc: "Lightweight database" },
    { icon: "📄", name: "PyPDF2", desc: "PDF text extraction" },
    { icon: "🔒", name: "JWT Auth", desc: "Secure authentication" },
];

const FEATURES = [
    "AI-powered MCQ, True/False & Fill-in-Blank generation",
    "Smart PDF text extraction with word count analysis",
    "Study Mode with bookmarks, AI Tutor & source context",
    "Flashcard Mode with 3D flip animation",
    "Adaptive Test Mode (Beginner / Standard / Expert)",
    "Score history tracking and detailed review",
    "Export questions as HTML or PDF",
    "Guest mode — try without an account",
];

// Professional LinkedIn & GitHub SVG icons
const LinkedInIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);

const GitHubIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
);

export default function AboutPage() {
    const navigate = useNavigate();
    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "3rem 1.5rem" }}>
            <div style={{ maxWidth: "820px", margin: "0 auto" }}>

                {/* Hero */}
                <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
                    <div style={{
                        width: "72px", height: "72px",
                        background: "linear-gradient(135deg,#1B2B4B,#4F6AF5)",
                        borderRadius: "18px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 1.25rem", fontSize: "1.8rem", fontWeight: 900, color: "#fff",
                        boxShadow: "0 8px 24px rgba(79,106,245,.35)",
                    }}>Q</div>
                    <h1 className="page-title" style={{ textAlign: "center" }}>
                        QuizGenius <span style={{ color: "#4F6AF5" }}>AI</span>
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "1rem", maxWidth: "520px", margin: "0 auto 1.75rem", lineHeight: 1.75 }}>
                        The world's most advanced AI study partner. Transform any PDF into precision-engineered MCQs, flashcards, and adaptive tests in seconds.
                    </p>
                    <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap" }}>
                        <button className="btn btn-primary" onClick={() => navigate("/generate")}>⚡ Try It Free</button>
                        <button className="btn btn-outline" onClick={() => navigate("/home")}>← Back to Home</button>
                    </div>
                </div>

                {/* Mission */}
                <div className="card" style={{ marginBottom: "1.5rem", padding: "2rem" }}>
                    <h2 className="section-title">🎯 Our Mission</h2>
                    <p style={{ fontSize: ".9rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
                        QuizGenius AI was built to solve one core problem: studying is time-consuming and ineffective with traditional methods.
                        We harness the latest AI models to instantly convert your study materials into interactive, adaptive assessments —
                        helping you learn faster, retain more, and perform better.
                    </p>
                </div>

                {/* Features */}
                <div className="card" style={{ marginBottom: "1.5rem", padding: "2rem" }}>
                    <h2 className="section-title">✨ Key Features</h2>
                    <div style={{ columns: "2", gap: "1rem" }}>
                        {FEATURES.map(f => (
                            <div key={f} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start", marginBottom: ".6rem", breakInside: "avoid" }}>
                                <span style={{ color: "var(--success)", fontWeight: 700, flexShrink: 0, marginTop: ".05rem" }}>✓</span>
                                <span style={{ fontSize: ".85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{f}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tech stack */}
                <div className="card" style={{ marginBottom: "1.5rem", padding: "2rem" }}>
                    <h2 className="section-title">🛠 Technology Stack</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: ".75rem" }}>
                        {TECH.map(({ icon, name, desc }) => (
                            <div key={name} style={{
                                padding: "1rem", background: "var(--surface)", borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)", textAlign: "center",
                            }}>
                                <div style={{ fontSize: "1.5rem", marginBottom: ".3rem" }}>{icon}</div>
                                <div style={{ fontWeight: 700, fontSize: ".85rem", color: "var(--navy)", marginBottom: ".15rem" }}>{name}</div>
                                <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>{desc}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Developer / Connect */}
                <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
                    <h2 className="section-title" style={{ marginBottom: "1rem" }}>👨‍💻 Meet the Developer</h2>

                    {/* Avatar ring */}
                    <div style={{
                        width: "72px", height: "72px", borderRadius: "50%", margin: "0 auto 1rem",
                        background: "linear-gradient(135deg,#1B2B4B,#4F6AF5)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1.75rem", fontWeight: 900, color: "#fff",
                        boxShadow: "0 6px 20px rgba(79,106,245,.3)",
                    }}>V</div>

                    <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--navy)", marginBottom: ".3rem" }}>
                        Vishwas Patel
                    </div>
                    <div style={{ fontSize: ".82rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                        Full-Stack Developer · AI Enthusiast · Builder of QuizGenius AI
                    </div>

                    {/* Social links */}
                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                        {/* LinkedIn */}
                        <a
                            href="https://www.linkedin.com/in/vishwas-patel-ba91a2288"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "flex", alignItems: "center", gap: ".625rem",
                                padding: ".75rem 1.375rem",
                                background: "#0A66C2",
                                color: "#fff",
                                borderRadius: "12px",
                                textDecoration: "none",
                                fontWeight: 700, fontSize: ".88rem",
                                boxShadow: "0 4px 14px rgba(10,102,194,.35)",
                                transition: "transform .15s, box-shadow .15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(10,102,194,.45)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(10,102,194,.35)"; }}
                        >
                            <LinkedInIcon />
                            LinkedIn
                        </a>

                        {/* GitHub */}
                        <a
                            href="https://github.com/vishwasp1005"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "flex", alignItems: "center", gap: ".625rem",
                                padding: ".75rem 1.375rem",
                                background: "#24292F",
                                color: "#fff",
                                borderRadius: "12px",
                                textDecoration: "none",
                                fontWeight: 700, fontSize: ".88rem",
                                boxShadow: "0 4px 14px rgba(36,41,47,.35)",
                                transition: "transform .15s, box-shadow .15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(36,41,47,.45)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(36,41,47,.35)"; }}
                        >
                            <GitHubIcon />
                            GitHub
                        </a>
                    </div>

                    <div style={{ marginTop: "1.5rem", fontSize: ".75rem", color: "var(--text-muted)" }}>
                        © 2024 QuizGenius AI · Built with ❤️ by Vishwas Patel
                    </div>
                </div>

            </div>
        </div>
    );
}
