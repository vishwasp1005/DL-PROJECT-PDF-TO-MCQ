import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../api";
import { parseOptions } from "../utils/textAnalysis";

function formatTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function QuizPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { questions: passedQs, quizSessionId, pdfName } = location.state || {};

    const questions = passedQs || JSON.parse(localStorage.getItem("qg_questions") || "[]");
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // Start timer
    useEffect(() => {
        if (!questions.length) return;
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
    }, [questions.length]);

    if (!questions.length) return (
        <div className="page" style={{ background: "var(--bg)" }}>
            <div className="empty-state">
                <span className="emoji">📭</span>
                <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".5rem" }}>No questions loaded</div>
                <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => navigate("/generate")}>Generate Quiz</button>
            </div>
        </div>
    );

    const handleAnswer = (qId, letter) => setAnswers(prev => ({ ...prev, [qId]: letter }));

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const answersPayload = questions.map(q => ({
                question_id: q.id,
                selected_option: answers[q.id] || "",
            }));
            const sid = quizSessionId || localStorage.getItem("qg_session_id");
            await API.post("/quiz/attempt", { quiz_session_id: Number(sid), answers: answersPayload });
        } catch { }

        const correct = questions.filter(q => answers[q.id] === q.correct).length;
        const total = questions.length;
        navigate("/result", { state: { questions, answers, correct, total, pdfName, timeTaken: elapsed } });
        setLoading(false);
    };

    const answered = Object.keys(answers).length;
    const pct = (answered / questions.length) * 100;

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "2rem 1.5rem" }}>
            <div style={{ maxWidth: "760px", margin: "0 auto" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                    <div>
                        <h1 className="page-title" style={{ fontSize: "1.5rem", marginBottom: ".125rem" }}>📝 Quiz</h1>
                        <div style={{ fontSize: ".8rem", color: "var(--text-muted)" }}>{pdfName}</div>
                    </div>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                        {/* Timer */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: ".4rem",
                            background: "var(--surface)", padding: ".4rem .875rem",
                            borderRadius: "999px", border: "1px solid var(--border)",
                        }}>
                            <span style={{ fontSize: ".8rem" }}>🕐</span>
                            <span style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                                {formatTime(elapsed)}
                            </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: "1.25rem" }}>{answered}/{questions.length}</div>
                            <div style={{ fontSize: ".7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Answered</div>
                        </div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="progress-bar-wrapper" style={{ marginBottom: "1.75rem" }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>

                {questions.map((q, idx) => {
                    const opts = parseOptions(q.options);
                    return (
                        <div key={q.id} className={`quiz-question-card${answers[q.id] ? " answered" : ""}`}>
                            <div className="question-meta">
                                <span className="badge badge-navy">Q{idx + 1}</span>
                                {q.topic && <span className="badge badge-accent">{q.topic}</span>}
                                {q.difficulty && <span className={`badge badge-${(q.difficulty || "").toLowerCase()}`}>{q.difficulty}</span>}
                            </div>
                            <p className="question-text">{q.question}</p>
                            <div className="options-list">
                                {opts.map((opt, i) => {
                                    const letter = opt.charAt(0);
                                    return (
                                        <div key={i} className={`option-item${answers[q.id] === letter ? " selected" : ""}`}
                                            onClick={() => handleAnswer(q.id, letter)}>
                                            <div style={{
                                                width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                                                background: answers[q.id] === letter ? "var(--navy)" : "var(--surface)",
                                                color: answers[q.id] === letter ? "#fff" : "var(--text-muted)",
                                                border: `1.5px solid ${answers[q.id] === letter ? "var(--navy)" : "var(--border)"}`,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                fontSize: ".65rem", fontWeight: 800,
                                            }}>{letter}</div>
                                            {opt.slice(2).trim()}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                    {answered < questions.length && (
                        <p style={{ color: "var(--text-muted)", fontSize: ".8rem", marginBottom: ".75rem" }}>
                            {questions.length - answered} question(s) remaining
                        </p>
                    )}
                    <button className="btn btn-primary" style={{ minWidth: "200px", padding: ".75rem 2rem" }}
                        disabled={answered < questions.length || loading} onClick={handleSubmit}>
                        {loading ? "Submitting..." : "✅ Submit Quiz"}
                    </button>
                    <div style={{ marginTop: ".75rem", fontSize: ".75rem", color: "var(--text-muted)" }}>
                        Time: {formatTime(elapsed)}
                    </div>
                </div>
            </div>
        </div>
    );
}
