import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../api";
import Loader from "../components/Loader";
import { addScore } from "../utils/storage";
import { parseOptions } from "../utils/textAnalysis";
import useIsMobile from "../hooks/useIsMobile";

const DIFFICULTY_CONFIG = {
    Easy: { num: 5, label: "Beginner", icon: "🟢", tag: "FOUNDATIONAL", desc: "Foundational concepts and basic recall.", tagColor: "var(--success)" },
    Medium: { num: 7, label: "Standard", icon: "⭐", tag: "POPULAR", desc: "Applied comprehension scenarios. 7 questions.", tagColor: "var(--accent)" },
    Hard: { num: 10, label: "Expert", icon: "🔴", tag: "ADVANCED", desc: "Complex synthesis and critical analysis.", tagColor: "var(--danger)" },
};

function formatTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function TestPage() {
    const location  = useLocation();
    const navigate  = useNavigate();
    const isMobile  = useIsMobile();
    const { quizSessionId, pdfName, questions: passedQs } = location.state || {};

    const [phase, setPhase] = useState("pick"); // pick | taking | result
    const [difficulty, setDifficulty] = useState(null);
    const [timedMode, setTimedMode] = useState(false);
    const [perQTime, setPerQTime] = useState(45);
    const [questions, setQuestions] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [answers, setAnswers] = useState({});
    const [elapsed, setElapsed] = useState(0);
    const [error, setError] = useState("");
    const [timeLeft, setTimeLeft] = useState(null);

    /* ── Timer ── */
    useEffect(() => {
        if (phase !== "taking") return;
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
    }, [phase]);

    /* ── Per-Q timer ── */
    useEffect(() => {
        if (phase !== "taking" || !timedMode) return;
        setTimeLeft(perQTime);
        const t = setInterval(() => setTimeLeft(tl => {
            if (tl <= 1) { handleNext(); return perQTime; }
            return tl - 1;
        }), 1000);
        return () => clearInterval(t);
    }, [phase, currentIdx, timedMode, perQTime]);

    const startTest = useCallback(async (diff) => {
        setDifficulty(diff);
        setPhase("taking");
        setAnswers({});
        setElapsed(0);
        setCurrentIdx(0);

        const cfg = DIFFICULTY_CONFIG[diff];
        // Use passed questions or fetch from API
        let pool = passedQs || JSON.parse(localStorage.getItem("qg_questions") || "[]");

        if (!pool.length && quizSessionId) {
            try {
                const res = await API.get("/quiz/history");
                const session = (res.data.sessions || []).find(s => s.quiz_session_id === quizSessionId);
                pool = session?.questions || [];
            } catch { }
        }

        if (!pool.length) {
            setError("No questions found. Please generate a quiz first.");
            setPhase("pick");
            return;
        }

        setQuestions([...pool].sort(() => Math.random() - .5).slice(0, cfg.num));
    }, [quizSessionId, passedQs]);

    const handleAnswer = (qId, letter) => setAnswers(prev => ({ ...prev, [qId]: letter }));

    const handleNext = () => {
        if (currentIdx < questions.length - 1) setCurrentIdx(i => i + 1);
    };
    const handlePrev = () => {
        if (currentIdx > 0) setCurrentIdx(i => i - 1);
    };

    const handleSubmit = () => {
        const correct = questions.filter(q => answers[q.id] === q.correct).length;
        addScore({ difficulty, score: correct, total: questions.length, pdfName });
        const wrong = questions.filter(q => answers[q.id] !== q.correct);
        localStorage.setItem("qg_wrong_answers", JSON.stringify(wrong));
        setPhase("result");
    };

    /* ─── PHASE: PICK ─────────────────────────────────────────── */
    if (phase === "pick") {
        return (
            <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "3rem 1.5rem" }}>
                <div style={{ maxWidth: "720px", margin: "0 auto" }}>
                    <h1 className="page-title" style={{ textAlign: "center", marginBottom: ".375rem" }}>Ready for a Test?</h1>
                    <p className="page-subtitle" style={{ textAlign: "center", marginBottom: "2.5rem" }}>Select your challenge level to begin a new session.</p>

                    {error && <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>{error}</div>}

                    {!passedQs && !quizSessionId && !JSON.parse(localStorage.getItem("qg_questions") || "[]").length && (
                        <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
                            No quiz loaded. <span style={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/generate")}>Generate one first →</span>
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: "1rem", marginBottom: "2rem" }}>
                        {Object.entries(DIFFICULTY_CONFIG).map(([diff, cfg]) => (
                            <div key={diff} className="card"
                                style={{ textAlign: "center", padding: "1.75rem", cursor: "pointer", transition: "all .15s", position: "relative" }}
                                onClick={() => startTest(diff)}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow-md)"}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = "var(--shadow)"}>
                                {diff === "Medium" && (
                                    <div style={{
                                        position: "absolute", top: "-10px", left: "50%", transform: "translateX(-50%)",
                                        background: "var(--navy)", color: "#fff",
                                        fontSize: ".6rem", fontWeight: 700, padding: "3px 12px",
                                        borderRadius: "999px", letterSpacing: ".08em",
                                    }}>POPULAR</div>
                                )}
                                <div style={{ fontSize: "1.5rem", marginBottom: ".75rem" }}>{cfg.icon}</div>
                                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--navy)", marginBottom: ".375rem" }}>{cfg.label}</div>
                                <div style={{ fontSize: ".78rem", color: "var(--text-muted)", lineHeight: 1.6, marginBottom: "1.25rem" }}>{cfg.desc}</div>
                                <button className="btn btn-primary" style={{ width: "100%", padding: ".55rem" }}>
                                    Start {cfg.label}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Timer toggle */}
                    <div className="card">
                        <label style={{ display: "flex", alignItems: "center", gap: ".75rem", cursor: "pointer" }}>
                            <input type="checkbox" checked={timedMode} onChange={e => setTimedMode(e.target.checked)}
                                style={{ width: "16px", height: "16px", accentColor: "var(--navy)" }} />
                            <div>
                                <div style={{ fontWeight: 600, fontSize: ".88rem", color: "var(--navy)" }}>⏱ Enable Timer</div>
                                <div style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>Auto-advance to next question when time runs out</div>
                            </div>
                        </label>
                        {timedMode && (
                            <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                                <span style={{ fontSize: ".8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Seconds per question:</span>
                                <input type="range" min={15} max={120} step={5} value={perQTime}
                                    onChange={e => setPerQTime(+e.target.value)} style={{ flex: 1, accentColor: "var(--navy)" }} />
                                <span style={{ fontWeight: 800, color: "var(--navy)", minWidth: "36px", textAlign: "right" }}>{perQTime}s</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ─── PHASE: TAKING ─────────────────────────────────────── */
    if (phase === "taking") {
        const q = questions[currentIdx];
        const opts = parseOptions(q?.options);
        const answered = Object.keys(answers).length;
        const cfg = DIFFICULTY_CONFIG[difficulty];

        return (
            <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: isMobile ? "1.25rem .875rem" : "2rem 1.5rem" }}>
                <div style={{ maxWidth: "680px", margin: "0 auto" }}>
                    {/* Progress header */}
                    <div className="card" style={{ marginBottom: "1.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".625rem" }}>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                                QUESTION {currentIdx + 1} / {questions.length}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                                {timedMode && timeLeft && (
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: ".3rem",
                                        background: timeLeft < 10 ? "var(--danger-bg)" : "var(--navy-muted)",
                                        color: timeLeft < 10 ? "var(--danger)" : "var(--navy)",
                                        padding: ".25rem .7rem", borderRadius: "999px",
                                        fontSize: ".75rem", fontWeight: 700,
                                    }}>
                                        ⏱ {timeLeft}s
                                    </div>
                                )}
                                <div style={{ fontSize: ".75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                                    🕐 {formatTime(elapsed)}
                                </div>
                            </div>
                        </div>
                        <div className="progress-bar-wrapper">
                            <div className="progress-bar-fill" style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".65rem", color: "var(--text-light)", marginTop: ".35rem" }}>
                            <span>{answered} answered</span>
                            <span>{questions.length - answered} remaining</span>
                        </div>
                    </div>

                    {/* Question card */}
                    <div className="card" style={{ marginBottom: "1.25rem" }}>
                        <div style={{ display: "flex", gap: ".5rem", marginBottom: ".875rem", alignItems: "center" }}>
                            <div className="badge badge-navy">Q{currentIdx + 1}</div>
                            <div className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)", fontSize: ".62rem", fontWeight: 700 }}>
                                {q?.type || "MCQ"} · {difficulty}
                            </div>
                        </div>
                        <p style={{ fontSize: ".975rem", fontWeight: 600, lineHeight: 1.65, color: "var(--text-primary)", marginBottom: "1.125rem" }}>
                            {q?.question}
                        </p>
                        <div className="options-list">
                            {opts.map((opt, i) => {
                                const letter = opt.charAt(0);
                                const isSelected = answers[q.id] === letter;
                                return (
                                    <div key={i} className={`option-item${isSelected ? " selected" : ""}`}
                                        onClick={() => handleAnswer(q.id, letter)}>
                                        <div style={{
                                            width: "28px", height: "28px", borderRadius: "50%", display: "flex",
                                            alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".7rem",
                                            flexShrink: 0,
                                            background: isSelected ? "var(--navy)" : "var(--surface)",
                                            color: isSelected ? "#fff" : "var(--text-muted)",
                                            border: `1.5px solid ${isSelected ? "var(--navy)" : "var(--border)"}`,
                                        }}>{letter}</div>
                                        {opt.slice(2).trim()}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: isMobile ? ".5rem" : ".625rem", justifyContent: "space-between" }}>
                        <button className="btn btn-outline"
                            style={{ width: isMobile ? "100%" : undefined }}
                            onClick={handlePrev} disabled={currentIdx === 0}>
                            ← Previous
                        </button>
                        <div style={{ display: "flex", gap: ".5rem", width: isMobile ? "100%" : undefined }}>
                            {currentIdx < questions.length - 1 ? (
                                <button className="btn btn-primary"
                                    style={{ flex: isMobile ? 1 : undefined }}
                                    onClick={handleNext}>Next Question →</button>
                            ) : (
                                <button className="btn btn-primary"
                                    style={{ flex: isMobile ? 1 : undefined }}
                                    disabled={answered < questions.length} onClick={handleSubmit}>
                                    Submit Test
                                </button>
                            )}
                        </div>
                    </div>
                    {answered < questions.length && currentIdx === questions.length - 1 && (
                        <p style={{ textAlign: "center", fontSize: ".78rem", color: "var(--text-muted)", marginTop: ".75rem" }}>
                            Answer all {questions.length} questions to submit ({questions.length - answered} remaining)
                        </p>
                    )}
                </div>
            </div>
        );
    }

    /* ─── PHASE: RESULT ─────────────────────────────────────── */
    const correct = questions.filter(q => answers[q.id] === q.correct).length;
    const total = questions.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const msg = pct >= 80 ? "Excellent Work!" : pct >= 50 ? "Good Effort!" : "Keep Practicing!";
    const emoji = pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "📚";

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "2rem 1.5rem" }}>
            <div style={{ maxWidth: "680px", margin: "0 auto" }}>

                {/* Score header panel */}
                <div className="card" style={{
                    background: "var(--navy)", border: "none",
                    textAlign: "center", padding: "2.5rem 2rem", marginBottom: "1.25rem",
                }}>
                    <div style={{
                        width: "110px", height: "110px", borderRadius: "50%",
                        border: "3px solid rgba(255,255,255,.25)",
                        background: "rgba(255,255,255,.1)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 1.25rem", animation: "scaleIn .4s ease",
                    }}>
                        <span style={{ fontSize: "2rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{pct}%</span>
                    </div>
                    <h2 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 800, marginBottom: ".4rem" }}>{emoji} {msg}</h2>
                    <p style={{ color: "rgba(255,255,255,.65)", fontSize: ".88rem" }}>
                        You've mastered the core concepts of this module. Your speed and accuracy are above average.
                    </p>
                </div>

                {/* Detailed Review */}
                <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--navy)" }}>Detailed Review</div>
                        <div style={{ display: "flex", gap: ".5rem" }}>
                            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--success)" }}>✓ {correct} Correct</span>
                            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--text-muted)" }}>·</span>
                            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--danger)" }}>✗ {total - correct} Incorrect</span>
                        </div>
                    </div>
                    {questions.map((q, i) => {
                        const ua = answers[q.id];
                        const ok = ua === q.correct;
                        const opts = parseOptions(q.options);
                        const correctOpt = opts.find(o => o.charAt(0) === q.correct) || q.correct;
                        const userOpt = opts.find(o => o.charAt(0) === ua) || ua || "—";
                        return (
                            <div key={q.id} style={{
                                display: "flex", gap: ".75rem", alignItems: "flex-start",
                                padding: ".75rem .875rem", borderRadius: "var(--radius-sm)",
                                background: ok ? "var(--success-bg)" : "var(--danger-bg)",
                                borderLeft: `3px solid ${ok ? "var(--success)" : "var(--danger)"}`,
                                marginBottom: ".375rem",
                            }}>
                                <div style={{ flexShrink: 0, width: "20px", height: "20px", borderRadius: "50%", background: ok ? "var(--success)" : "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", color: "#fff", fontWeight: 800 }}>
                                    {ok ? "✓" : "✗"}
                                </div>
                                <div>
                                    <div style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: ".2rem" }}>
                                        {q.question}
                                    </div>
                                    <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                                        Your answer: <span style={{ fontWeight: 600, color: ok ? "var(--success)" : "var(--danger)" }}>
                                            {String(userOpt).slice(2).trim() || userOpt}
                                        </span>
                                        {!ok && <span> · Correct: <span style={{ fontWeight: 600, color: "var(--success)" }}>{String(correctOpt).slice(2).trim()}</span></span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: ".5rem", marginTop: "1.25rem" }}>
                        <button className="btn btn-outline" onClick={() => { setPhase("taking"); setAnswers({}); setCurrentIdx(0); }}>🔄 Retake</button>
                        <button className="btn btn-primary" onClick={() => { setPhase("pick"); setDifficulty(null); setQuestions([]); }}>⬆️ New Level</button>
                        <button className="btn btn-outline" onClick={() => navigate("/dashboard")}>📊 Dashboard</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
