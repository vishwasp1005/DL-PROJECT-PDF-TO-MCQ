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
    { num: 10000, suffix: "K+", divisor: 1000, label: "Questions Generated" },
    { num: 500,   suffix: "+",  divisor: 1,    label: "Active Daily Users"  },
    { num: 95,    suffix: "%",  divisor: 1,    label: "Accuracy Rate"       },
];

function StatItem({ num, suffix, divisor, label, borderRight }) {
    const { count, ref } = useCountUp(num);
    const display = divisor > 1 ? Math.floor(count / divisor) + suffix : count + suffix;
    return (
        <div ref={ref} style={{
            textAlign: "center", padding: "0 2rem",
            borderRight: borderRight ? "1px solid var(--border)" : "none",
        }}>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--navy)", letterSpacing: "-.04em", lineHeight: 1 }}>
                {display}
            </div>
            <div style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--text-light)", marginTop: ".35rem" }}>
                {label}
            </div>
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
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const isGuest = localStorage.getItem("isGuest") === "true";

    return (
        <div className="page-fade" style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)" }}>

            {/* ── HERO ──────────────────────────────── */}
            <section style={{
                maxWidth: "1100px", margin: "0 auto",
                padding: "5rem 2rem 4rem",
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", alignItems: "center",
            }}>
                <div>
                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: ".4rem",
                        background: "var(--navy-muted)", color: "var(--navy)",
                        padding: ".25rem .75rem", borderRadius: "999px",
                        fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em",
                        marginBottom: "1.25rem",
                    }}>
                        ✦ NEXT-GEN LEARNING
                    </div>
                    <h1 style={{
                        fontSize: "3.1rem", fontWeight: 900, lineHeight: 1.12,
                        color: "var(--navy)", letterSpacing: "-.04em", marginBottom: "1rem",
                    }}>
                        Transform PDFs into{" "}
                        <span className="text-gradient" style={{ display: "inline-block" }}>
                            Smart MCQs
                        </span>
                    </h1>
                    <p style={{ fontSize: ".95rem", color: "var(--text-muted)", lineHeight: 1.75, marginBottom: "2rem", maxWidth: "420px" }}>
                        AI-powered adaptive learning that turns your study materials into interactive quizzes in seconds. Boost your retention with precision-engineered questions.
                    </p>
                    <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
                        <button className="btn btn-primary" style={{ padding: ".75rem 1.875rem", fontSize: ".95rem" }}
                            onClick={() => navigate(token ? "/generate" : "/login")}>
                            ⚡ Start Generating
                        </button>
                        <button className="btn btn-outline" style={{ padding: ".75rem 1.5rem", fontSize: ".95rem" }}
                            onClick={() => navigate("/about")}>
                            Learn More →
                        </button>
                    </div>
                </div>

                {/* Mockup card */}
                <div style={{
                    background: "#fff", borderRadius: "16px", border: "1px solid var(--border)",
                    boxShadow: "0 16px 48px rgba(27,43,75,.12)", padding: "1.25rem", position: "relative",
                }}>
                    <div style={{ display: "flex", gap: ".3rem", marginBottom: "1rem" }}>
                        {["#EF4444", "#F59E0B", "#10B981"].map(c => (
                            <div key={c} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />
                        ))}
                    </div>
                    {/* Fake question preview */}
                    {[
                        { q: "What is the time complexity of binary search?", a: "O(log n)" },
                        { q: "Which data structure uses LIFO?", a: "Stack" },
                    ].map((item, i) => (
                        <div key={i} style={{ marginBottom: ".75rem", padding: ".875rem", background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: ".75rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: ".5rem" }}>{item.q}</div>
                            <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                                {["O(n)", item.a, "O(n²)", "O(1)"].sort(() => Math.random() - .5).map((opt, j) => (
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

            {/* ── STATS BAR ──────────────────────────── */}
            <section style={{ background: "#fff", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ maxWidth: "820px", margin: "0 auto", padding: "2.5rem 2rem", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0" }}>
                    {STATS_CONFIG.map((stat, i) => (
                        <StatItem key={stat.label} {...stat} borderRight={i < STATS_CONFIG.length - 1} />
                    ))}
                </div>
            </section>

            {/* ── HOW IT WORKS ─────────────────────── */}
            <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "5rem 2rem" }}>
                <h2 style={{ fontSize: "1.75rem", fontWeight: 800, textAlign: "center", color: "var(--navy)", letterSpacing: "-.03em", marginBottom: ".5rem" }}>How It Works</h2>
                <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: ".9rem", marginBottom: "3rem" }}>
                    Master any subject in three simple steps using our advanced AI engine.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.25rem" }}>
                    {HOW_IT_WORKS.map(({ icon, num, desc }) => (
                        <div key={num} className="card" style={{ padding: "2rem", textAlign: "center" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>{icon}</div>
                            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--navy)", marginBottom: ".5rem" }}>{num}</div>
                            <div style={{ fontSize: ".85rem", color: "var(--text-muted)", lineHeight: 1.7 }}>{desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── DIFFICULTY LEVELS ─────────────────── */}
            <section style={{ background: "#fff", padding: "5rem 2rem" }}>
                <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
                    <h2 style={{ fontSize: "1.75rem", fontWeight: 800, textAlign: "center", color: "var(--navy)", letterSpacing: "-.03em", marginBottom: ".5rem" }}>Choose Your Challenge</h2>
                    <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: ".9rem", marginBottom: "3rem" }}>
                        Our AI tailors the complexity of questions to match your current learning stage.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1.25rem" }}>
                        {DIFFICULTIES.map(({ tag, label, emoji, desc, bullets, color, bg }) => (
                            <div key={label} className="card" style={{ padding: "2rem", cursor: "pointer" }}
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
