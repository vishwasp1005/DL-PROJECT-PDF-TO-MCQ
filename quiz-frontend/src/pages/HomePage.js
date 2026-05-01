import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Animated number counter — counts up when scrolled into view
function useCountUp(target, duration = 1400) {
    const [count, setCount] = useState(0);
    const [started, setStarted] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !started) setStarted(true);
        }, { threshold: 0.5 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [started]);

    useEffect(() => {
        if (!started) return;
        const start = performance.now();
        const raf = requestAnimationFrame(function tick(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(raf);
    }, [started, target, duration]);

    return { count, ref };
}

// Stats with animation config
const STATS_CONFIG = [
    { num: 10000, suffix: "K+", divisor: 1000, label: "Questions Generated", icon: "📝" },
    { num: 500,   suffix: "+",  divisor: 1,    label: "Active Daily Users",  icon: "👥" },
    { num: 95,    suffix: "%",  divisor: 1,    label: "Accuracy Rate",       icon: "🎯" },
];

function StatItem({ num, suffix, divisor, label, icon }) {
    const { count, ref } = useCountUp(num);
    const display = divisor > 1 ? Math.floor(count / divisor) + suffix : count + suffix;
    return (
        <div ref={ref} className="stat-card-home">
            <div className="stat-card-home-icon">{icon}</div>
            <div className="stat-card-home-value">{display}</div>
            <div className="stat-card-home-label">{label}</div>
        </div>
    );
}

const HOW_IT_WORKS = [
    { icon: "📄", num: "1. Upload PDF", desc: "Securely drag and drop your textbooks, articles, or handwritten notes into our system." },
    { icon: "📊", num: "2. Study Mode", desc: "Review key concepts with AI-generated summaries and flashcards before testing your knowledge." },
    { icon: "❓", num: "3. Adaptive Testing", desc: "Challenge yourself with dynamic questions that evolve based on your real-time performance." },
];

const DIFFICULTIES = [
    {
        tag: "FOUNDATIONAL", label: "Easy", emoji: "😊",
        desc: "Focuses on direct recall, key terminology, and fundamental concepts. Ideal for initial review.",
        bullets: ["100% Concept Recall", "Terminology Focus"],
        color: "var(--success)", bg: "var(--success-bg)",
    },
    {
        tag: "INTERMEDIATE", label: "Medium", emoji: "📈",
        desc: "Tests application and comprehension. Questions require connecting different parts of the material.",
        bullets: ["Real-world Application", "Conceptual Linking"],
        color: "var(--warning)", bg: "var(--warning-bg)",
    },
    {
        tag: "MASTERY", label: "Hard", emoji: "⚡",
        desc: "Advanced synthesis and analysis questions. Designed for top-tier exam preparation and deep mastery.",
        bullets: ["Synthesis & Analysis", "Edge Case Scenarios"],
        color: "var(--danger)", bg: "var(--danger-bg)",
    },
];

const FOOTER_LINKS = {
    Product: ["Q&A Generator", "Adaptive Study", "PDF Insights", "Enterprise"],
    Resources: ["Documentation", "API Reference", "Success Stories", "Help Center"],
    Connect: ["Twitter", "LinkedIn", "GitHub"],
};

export default function HomePage() {
    const navigate  = useNavigate();
    const token     = localStorage.getItem("token");
    const isGuest   = localStorage.getItem("isGuest") === "true";

    return (
        <div className="page-fade" style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)" }}>

            {/* ── HERO ──────────────────────────── */}
            <section className="hero-section">
                <div className="hero-content">
                    <div className="hero-eyebrow">
                        ✦ NEXT-GEN LEARNING
                    </div>
                    <h1 className="hero-headline">
                        Transform PDFs into{" "}
                        <span className="text-gradient" style={{ display: "inline-block" }}>
                            Smart MCQs
                        </span>
                    </h1>
                    <p className="hero-description">
                        AI-powered adaptive learning that turns your study materials into interactive quizzes in seconds. Boost your retention with precision-engineered questions.
                    </p>
                    <div className="hero-cta">
                        <button className="btn btn-primary hero-btn-primary"
                            onClick={() => navigate(token ? "/generate" : "/login")}>
                            ⚡ Start Generating
                        </button>
                        <button className="btn btn-outline hero-btn-outline"
                            onClick={() => navigate("/about")}>
                            Learn More →
                        </button>
                    </div>
                </div>

                {/* Mockup card — CSS-hidden on mobile via .hero-mockup */}
                <div className="hero-mockup">
                    <div style={{ display: "flex", gap: ".3rem", marginBottom: "1rem" }}>
                        {["#EF4444", "#F59E0B", "#10B981"].map(c => (
                            <div key={c} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />
                        ))}
                    </div>
                    {[
                        { q: "What is the time complexity of binary search?", a: "O(log n)" },
                        { q: "Which data structure uses LIFO?", a: "Stack" },
                    ].map((item, i) => (
                        <div key={i} style={{ marginBottom: ".75rem", padding: ".875rem", background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: ".75rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: ".5rem" }}>{item.q}</div>
                            <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                                {["O(n)", item.a, "O(n²)", "O(1)"].map((opt, j) => (
                                    <div key={j} style={{
                                        padding: ".25rem .7rem", borderRadius: "6px", fontSize: ".68rem", fontWeight: 600,
                                        background: opt === item.a ? "var(--success-bg)" : "var(--border)",
                                        color: opt === item.a ? "var(--success)" : "var(--text-muted)",
                                        border: `1px solid ${opt === item.a ? "rgba(16,185,129,.3)" : "transparent"}`,
                                    }}>{opt}</div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── STATS CARDS ────────────────────── */}
            <section className="stats-section">
                <div className="stats-cards-grid">
                    {STATS_CONFIG.map(stat => (
                        <StatItem key={stat.label} {...stat} />
                    ))}
                </div>
            </section>

            {/* ── HOW IT WORKS ─────────────────────── */}
            <section className="how-section">
                <h2 className="section-heading">How It Works</h2>
                <p className="section-subheading">
                    Master any subject in three simple steps using our advanced AI engine.
                </p>
                <div className="how-cards-grid">
                    {HOW_IT_WORKS.map(({ icon, num, desc }) => (
                        <div key={num} className="card how-card">
                            <div className="how-card-icon">{icon}</div>
                            <div className="how-card-title">{num}</div>
                            <div className="how-card-desc">{desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── DIFFICULTY LEVELS ─────────────────── */}
            <section className="difficulty-section">
                <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
                    <h2 className="section-heading">Choose Your Challenge</h2>
                    <p className="section-subheading">
                        Our AI tailors the complexity of questions to match your current learning stage.
                    </p>
                    <div className="difficulty-grid">
                        {DIFFICULTIES.map(({ tag, label, emoji, desc, bullets, color, bg }) => (
                            <div key={label} className="card difficulty-card"
                                onClick={() => navigate(token ? "/generate" : "/login")}>
                                <div style={{
                                    display: "inline-block", padding: ".2rem .6rem",
                                    background: bg, color, borderRadius: "999px",
                                    fontSize: ".62rem", fontWeight: 700, letterSpacing: ".08em",
                                    textTransform: "uppercase", marginBottom: "1rem",
                                }}>{tag}</div>
                                <div style={{ fontSize: "1.75rem", marginBottom: ".5rem" }}>{emoji}</div>
                                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--navy)", marginBottom: ".5rem" }}>{label}</div>
                                <p style={{ fontSize: ".83rem", color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "1rem" }}>{desc}</p>
                                {bullets.map(b => (
                                    <div key={b} style={{ fontSize: ".78rem", color, fontWeight: 600, marginBottom: ".25rem" }}>✦ {b}</div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA BANNER ────────────────────────── */}
            {isGuest && (
                <section style={{ background: "var(--navy)", padding: "3rem 2rem", textAlign: "center" }}>
                    <h3 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 800, marginBottom: ".5rem" }}>Ready to level up?</h3>
                    <p style={{ color: "rgba(255,255,255,.65)", fontSize: ".9rem", marginBottom: "1.5rem" }}>Create a free account to save your progress and unlock full features.</p>
                    <button className="btn" style={{ background: "#fff", color: "var(--navy)", padding: ".75rem 2rem" }}
                        onClick={() => navigate("/register")}>
                        Sign Up Free →
                    </button>
                </section>
            )}

            {/* ── FOOTER ────────────────────────────── */}
            <footer className="site-footer">
                <div className="footer-grid">
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".75rem" }}>
                            <div style={{ width: "28px", height: "28px", background: "rgba(255,255,255,.15)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: ".8rem" }}>Q</div>
                            <span style={{ fontWeight: 700, color: "#fff", fontSize: ".95rem" }}>QuizGenius AI</span>
                        </div>
                        <div className="footer-brand">
                            The world's most advanced AI study partner. Elevate your learning experience through precision MCQ generation and adaptive testing.
                        </div>
                    </div>
                    {Object.entries(FOOTER_LINKS).map(([col, links]) => (
                        <div key={col}>
                            <div className="footer-col-title">{col}</div>
                            {links.map(l => <span key={l} className="footer-link">{l}</span>)}
                        </div>
                    ))}
                </div>
                <div className="footer-bottom">
                    <span>© 2024 QuizGenius AI. All rights reserved.</span>
                    <span>Design by Vishwas Patel</span>
                </div>
            </footer>
        </div>
    );
}
