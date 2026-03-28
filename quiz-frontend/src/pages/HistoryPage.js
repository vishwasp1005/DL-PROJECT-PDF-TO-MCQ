import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import Loader from "../components/Loader";

export default function HistoryPage() {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await API.get("/quiz/history");
                setSessions(res.data.sessions || []);
            } catch {
                setError("Failed to load history. Please try again.");
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    if (loading) return <div className="page"><Loader text="Loading your quiz history..." /></div>;

    // Safely parse options — backend may return array or JSON string
    const parseOptions = (opts) => {
        if (Array.isArray(opts)) return opts;
        try { return JSON.parse(opts); } catch { return []; }
    };

    return (
        <div className="page-full" style={{ paddingTop: "2rem" }}>
            <h1 className="page-title">Quiz History 📜</h1>
            <p className="page-subtitle">All your past quiz sessions and results.</p>

            {error && <div className="alert alert-error">{error}</div>}

            {sessions.length === 0 ? (
                <div className="empty-state">
                    <span className="emoji">📭</span>
                    <p>No quiz sessions yet. Generate your first quiz!</p>
                    <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => navigate("/generate")}>
                        ✨ Generate a Quiz
                    </button>
                </div>
            ) : (
                sessions.map((session) => {
                    const pct = session.percentage != null ? session.percentage.toFixed(0) : null;
                    const isOpen = expanded === session.quiz_session_id;
                    const scoreColor = pct == null ? "var(--text-muted)"
                        : pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";

                    return (
                        <div key={session.quiz_session_id}>
                            <div
                                className="history-card"
                                onClick={() => setExpanded(isOpen ? null : session.quiz_session_id)}
                            >
                                <div>
                                    <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                                        Session #{session.quiz_session_id}
                                        <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>
                                            {new Date(session.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="text-muted">
                                        {session.total_questions} questions
                                        {session.score != null && (
                                            <span> · {session.score}/{session.total_questions} correct</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <div className="history-score" style={{ color: scoreColor }}>
                                        {pct != null ? `${pct}%` : "Not attempted"}
                                    </div>
                                    <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>
                                        {isOpen ? "▲" : "▼"}
                                    </span>
                                </div>
                            </div>

                            {/* Expanded questions */}
                            {isOpen && (
                                <div style={{ marginBottom: "1rem", paddingLeft: "1rem" }}>
                                    {session.questions.map((q, idx) => (
                                        <div key={q.id} className="quiz-question-card" style={{ marginBottom: "0.75rem" }}>
                                            <div className="question-meta">
                                                <span className="badge badge-topic">{q.topic || "General"}</span>
                                                <span className={`badge badge-${q.difficulty?.toLowerCase() || "medium"}`}>
                                                    {q.difficulty || "Medium"}
                                                </span>
                                            </div>
                                            <p className="question-text">
                                                <strong style={{ color: "var(--text-muted)", marginRight: "0.5rem" }}>Q{idx + 1}.</strong>
                                                {q.question}
                                            </p>
                                            <div className="options-list">
                                                {parseOptions(q.options).map((opt, i) => {
                                                    const letter = opt.charAt(0);
                                                    const isCorrect = letter === q.correct;
                                                    return (
                                                        <div key={i} className={`option-item ${isCorrect ? "correct" : ""}`}>
                                                            {opt}
                                                            {isCorrect && <span style={{ marginLeft: "auto", fontSize: "0.8rem" }}>✓ Answer</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
