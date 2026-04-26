import React, { useState, useEffect, useRef } from "react";
import useConfetti from "../hooks/useConfetti";
import useIsMobile from "../hooks/useIsMobile";
import { useLocation, useNavigate } from "react-router-dom";
import { parseOptions, analyzeTopicPerformance } from "../utils/textAnalysis";

function formatTime(s) {
    if (!s) return null;
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Animated SVG progress ring
function ProgressRing({ pct }) {
    const radius = 52;
    const stroke = 7;
    const circumference = 2 * Math.PI * radius;
    const [displayPct, setDisplayPct] = useState(0);
    const [offset, setOffset] = useState(circumference);
    const raf = useRef(null);

    const ringColor = pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";

    useEffect(() => {
        const duration = 1200;
        const start = performance.now();
        const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * pct);
            setDisplayPct(current);
            setOffset(circumference - (eased * pct / 100) * circumference);
            if (progress < 1) raf.current = requestAnimationFrame(animate);
        };
        raf.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf.current);
    }, [pct, circumference]);

    const size = (radius + stroke) * 2;
    return (
        <div style={{ position: "relative", width: size, height: size, margin: "0 auto 1.25rem" }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                {/* Track */}
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="rgba(255,255,255,.15)" strokeWidth={stroke} />
                {/* Progress */}
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke .3s", filter: `drop-shadow(0 0 6px ${ringColor}88)` }}
                />
            </svg>
            {/* Centered text */}
            <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
            }}>
                <span style={{ fontSize: "1.75rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                    {displayPct}%
                </span>
                <span style={{ fontSize: ".6rem", fontWeight: 700, color: "rgba(255,255,255,.6)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: ".1rem" }}>
                    score
                </span>
            </div>
        </div>
    );
}

export default function ResultPage() {
    const location  = useLocation();
    const navigate  = useNavigate();
    const isMobile  = useIsMobile();
    const { questions = [], answers = {}, correct = 0, total = 0, pdfName, timeTaken, difficulty } = location.state || {};
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const msg = pct >= 80 ? "Excellent Work!" : pct >= 50 ? "Good Effort!" : "Keep Practicing!";
    const emoji = pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "📚";
    const [copied, setCopied] = useState(false);

    // Analyse topic performance
    const { weakTopics, strongTopics, allTopics } = analyzeTopicPerformance(questions, answers);
    const hasTopicData = allTopics.length > 0;

    const handleShare = () => {
        const data = btoa(JSON.stringify({
            score: correct, total, pct,
            difficulty: difficulty || "—",
            pdfName,
            date: new Date().toLocaleDateString(),
            username: localStorage.getItem("username") || "",
        }));
        const url = `${window.location.origin}/share/${data}`;
        navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
    };

    const fireConfetti = useConfetti();
    useEffect(() => { if (pct === 100) fireConfetti(); }, []); // eslint-disable-line

    if (!questions.length) return (
        <div className="page" style={{ background: "var(--bg)" }}>
            <div className="empty-state">
                <span className="emoji">📭</span>
                <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".5rem" }}>No result data</div>
                <button className="btn btn-primary" onClick={() => navigate("/generate")}>Generate Quiz</button>
            </div>
        </div>
    );

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "2rem 1.5rem" }}>
            <div style={{ maxWidth: "680px", margin: "0 auto" }}>

                {/* Score card with animated ring */}
                <div className="card" style={{ textAlign: "center", padding: isMobile ? "1.75rem 1.25rem" : "2.5rem", background: "var(--navy)", border: "none", marginBottom: "1.25rem" }}>
                    <ProgressRing pct={pct} />
                    <h2 style={{ color: "#fff", fontSize: isMobile ? "1.2rem" : "1.5rem", fontWeight: 800, marginBottom: ".4rem" }}>{emoji} {msg}</h2>
                    <p style={{ color: "rgba(255,255,255,.65)", fontSize: isMobile ? ".82rem" : ".875rem", lineHeight: 1.65 }}>
                        You scored {correct} out of {total} — {pct >= 80 ? "Outstanding!" : pct >= 50 ? "Keep it up!" : "Review the material and try again."}
                        {formatTime(timeTaken) && (
                            <span style={{ display: "block", marginTop: ".375rem", fontSize: ".78rem", opacity: .75 }}>⏱ Time taken: {formatTime(timeTaken)}</span>
                        )}
                    </p>
                    <button onClick={handleShare}
                        style={{ marginTop: "1rem", background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", padding: ".5rem 1.25rem", borderRadius: "999px", cursor: "pointer", fontSize: ".8rem", fontWeight: 600, minHeight: "44px" }}>
                        {copied ? "✅ Link Copied!" : "🔗 Share Results"}
                    </button>
                </div>

                {/* Stats bar */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: ".75rem", marginBottom: "1.25rem" }}>
                    {[
                        { label: "Correct", val: correct, col: "var(--success)" },
                        { label: "Incorrect", val: total - correct, col: "var(--danger)" },
                        { label: "Score", val: `${pct}%`, col: "var(--navy)" },
                    ].map(({ label, val, col }) => (
                        <div key={label} className="stat-card">
                            <div className="stat-value" style={{ color: col }}>{val}</div>
                            <div className="stat-label">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Topic Performance Panel */}
                {hasTopicData && (
                    <div className="card" style={{ marginBottom: "1.25rem" }}>
                        <h2 className="section-title" style={{ marginBottom: "1rem" }}>📊 Topic Performance</h2>
                        <div style={{ display: "grid", gridTemplateColumns: (weakTopics.length && strongTopics.length && !isMobile) ? "1fr 1fr" : "1fr", gap: "1rem" }}>
                            {weakTopics.length > 0 && (
                                <div>
                                    <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".625rem" }}>
                                        ⚠️ Weak Topics (below 60%)
                                    </div>
                                    {weakTopics.map(t => (
                                        <div key={t.topic} style={{ marginBottom: ".5rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", marginBottom: ".2rem" }}>
                                                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.topic}</span>
                                                <span style={{ fontWeight: 700, color: "var(--danger)" }}>{t.accuracy}%</span>
                                            </div>
                                            <div style={{ height: "5px", background: "var(--border)", borderRadius: "999px" }}>
                                                <div style={{ width: `${t.accuracy}%`, height: "100%", background: "var(--danger)", borderRadius: "999px", transition: "width .5s" }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {strongTopics.length > 0 && (
                                <div>
                                    <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".625rem" }}>
                                        ✅ Strong Topics
                                    </div>
                                    {strongTopics.map(t => (
                                        <div key={t.topic} style={{ marginBottom: ".5rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", marginBottom: ".2rem" }}>
                                                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.topic}</span>
                                                <span style={{ fontWeight: 700, color: "var(--success)" }}>{t.accuracy}%</span>
                                            </div>
                                            <div style={{ height: "5px", background: "var(--border)", borderRadius: "999px" }}>
                                                <div style={{ width: `${t.accuracy}%`, height: "100%", background: "var(--success)", borderRadius: "999px", transition: "width .5s" }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {weakTopics.length > 0 && (
                            <button
                                className="btn btn-primary"
                                style={{ width: "100%", marginTop: "1rem" }}
                                onClick={() => navigate("/generate", { state: { suggestedTopics: weakTopics.map(t => t.topic) } })}
                            >
                                🎯 Practice Weak Topics
                            </button>
                        )}
                    </div>
                )}

                {/* Detailed review */}
                <div className="card" style={{ marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Detailed Review</h2>
                        <div style={{ display: "flex", gap: ".5rem" }}>
                            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--success)" }}>✓ {correct} Correct</span>
                            <span style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>·</span>
                            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--danger)" }}>✗ {total - correct} Incorrect</span>
                        </div>
                    </div>
                    {questions.map((q) => {
                        const ua = answers[q.id];
                        const ok = ua === q.correct;
                        const opts = parseOptions(q.options);
                        const correctLabel = opts.find(o => o.charAt(0) === q.correct) || q.correct;
                        const userLabel = opts.find(o => o.charAt(0) === ua) || ua || "—";
                        return (
                            <div key={q.id} style={{
                                display: "flex", gap: ".75rem", padding: ".75rem .875rem",
                                borderRadius: "var(--radius-sm)", marginBottom: ".375rem",
                                background: ok ? "var(--success-bg)" : "var(--danger-bg)",
                                borderLeft: `3px solid ${ok ? "var(--success)" : "var(--danger)"}`,
                            }}>
                                <div style={{
                                    flexShrink: 0, width: "20px", height: "20px", borderRadius: "50%",
                                    background: ok ? "var(--success)" : "var(--danger)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: ".65rem", color: "#fff", fontWeight: 800,
                                }}>{ok ? "✓" : "✗"}</div>
                                <div>
                                    <div style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: ".2rem" }}>
                                        {q.question}
                                    </div>
                                    <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                                        Your answer: <span style={{ fontWeight: 700, color: ok ? "var(--success)" : "var(--danger)" }}>
                                            {String(userLabel).length > 2 ? String(userLabel).slice(2).trim() : userLabel}
                                        </span>
                                        {!ok && <> · Correct: <span style={{ fontWeight: 700, color: "var(--success)" }}>
                                            {String(correctLabel).length > 2 ? String(correctLabel).slice(2).trim() : correctLabel}
                                        </span></>}
                                    </div>
                                    {q.topic && (
                                        <span className="badge badge-accent" style={{ marginTop: ".3rem", display: "inline-block" }}>{q.topic}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: ".625rem" }}>
                    <button className="btn btn-outline" onClick={() => navigate("/generate")}>⚡ New Quiz</button>
                    <button className="btn btn-primary" onClick={() => navigate("/study", { state: { questions, pdfName } })}>📚 Study</button>
                    <button className="btn btn-outline" onClick={() => navigate("/leaderboard")}>🏆 Board</button>
                    <button className="btn btn-outline" onClick={() => navigate("/dashboard")}>📊 Dashboard</button>
                </div>
            </div>
        </div>
    );
}
