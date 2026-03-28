import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parseOptions } from "../utils/textAnalysis";
import { getBookmarks, toggleBookmark } from "../utils/storage";
import { exportHTML, exportPDF } from "../utils/export";
import AITutorChat from "../components/ai/AITutorChat";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";

export default function StudyPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { questions: passedQs, pdfName } = location.state || {};

    const questions = passedQs || JSON.parse(localStorage.getItem("qg_questions") || "[]");
    const wrongIds = JSON.parse(localStorage.getItem("qg_wrong_answers") || "[]").map(q => q.id);

    const [filter, setFilter] = useState("all"); // all | bookmarked | wrong
    const [bookmarks, setBookmarks] = useState(getBookmarks());
    const [expanded, setExpanded] = useState({});
    const [activeTab, setActiveTab] = useState("study");
    const [search, setSearch] = useState("");
    const [activeQIdx, setActiveQIdx] = useState(0); // for AI tutor context
    const [showTutor, setShowTutor] = useState(false);

    const filtered = questions.filter(q => {
        if (filter === "bookmarked") return bookmarks.includes(q.id);
        if (filter === "wrong") return wrongIds.includes(q.id);
        return true;
    }).filter(q => !search.trim() || q.question.toLowerCase().includes(search.toLowerCase()));

    const handleBookmark = (id) => {
        toggleBookmark(id);
        setBookmarks(getBookmarks());
    };

    // Keyboard shortcuts (only in study tab, not when typing in search)
    useKeyboardShortcuts({
        n: () => setActiveQIdx(i => Math.min(i + 1, filtered.length - 1)),
        p: () => setActiveQIdx(i => Math.max(i - 1, 0)),
        b: () => filtered[activeQIdx] && handleBookmark(filtered[activeQIdx].id),
        t: () => setShowTutor(v => !v),
    }, activeTab === "study");

    const [flashIdx, setFlashIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);

    if (!questions.length) return (
        <div className="page page-fade" style={{ background: "var(--bg)" }}>
            <div style={{
                maxWidth: "420px", width: "100%", textAlign: "center",
                animation: "fadeInUp .4s ease",
            }}>
                {/* Animated icon */}
                <div style={{
                    width: "96px", height: "96px", margin: "0 auto 1.75rem",
                    borderRadius: "28px",
                    background: "linear-gradient(135deg, rgba(99,102,241,.12), rgba(139,92,246,.12))",
                    border: "1.5px solid rgba(99,102,241,.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "2.75rem",
                    animation: "float 3s ease-in-out infinite",
                }}>
                    📚
                </div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--navy)", marginBottom: ".5rem", letterSpacing: "-.02em" }}>
                    No Questions Yet
                </h2>
                <p style={{ fontSize: ".88rem", color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "1.75rem", maxWidth: "320px", margin: "0 auto 1.75rem" }}>
                    Generate your first quiz from a PDF to unlock Study Mode with flashcards, AI Tutor, and more.
                </p>
                {/* Feature pills */}
                <div style={{ display: "flex", gap: ".5rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.75rem" }}>
                    {["✓ Flashcards", "✓ AI Tutor", "✓ Bookmarks", "✓ Export"].map(f => (
                        <span key={f} style={{
                            padding: ".25rem .75rem", borderRadius: "999px", fontSize: ".72rem", fontWeight: 600,
                            background: "rgba(99,102,241,.09)", color: "var(--accent)",
                            border: "1px solid rgba(99,102,241,.18)",
                        }}>{f}</span>
                    ))}
                </div>
                <button className="btn btn-primary" style={{ padding: ".75rem 2rem", fontSize: ".95rem" }}
                    onClick={() => navigate("/generate")}>
                    ⚡ Generate Quiz Now
                </button>
            </div>
        </div>
    );

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "2rem 1.5rem" }}>
            <div style={{ maxWidth: "760px", margin: "0 auto" }}>

                {/* Tab bar */}
                <div className="tab-bar">
                    <button className={`tab-btn${activeTab === "study" ? " active" : ""}`}
                        onClick={() => setActiveTab("study")}>📚 Study Mode</button>
                    <button className={`tab-btn${activeTab === "flashcard" ? " active" : ""}`}
                        onClick={() => { setActiveTab("flashcard"); setFlashIdx(0); setFlipped(false); }}>
                        🃏 Flashcards
                    </button>
                    <button className="tab-btn" onClick={() => navigate("/test", { state: { questions, pdfName } })}>
                        ✏️ Test Mode
                    </button>
                </div>

                {/* ── FLASHCARD TAB ── */}
                {activeTab === "flashcard" && (
                    <div style={{ textAlign: "center", padding: "2rem 0" }}>
                        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: "1.25rem" }}>
                            Card {flashIdx + 1} of {questions.length}
                        </div>
                        {/* Flip card */}
                        <div onClick={() => setFlipped(f => !f)} style={{
                            cursor: "pointer", minHeight: "200px", borderRadius: "16px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: "2rem",
                            background: flipped ? "#1B2B4B" : "var(--card)",
                            border: "1.5px solid var(--border)",
                            boxShadow: "0 4px 24px rgba(0,0,0,.08)",
                            transition: "background .25s, color .25s",
                            marginBottom: "1.25rem",
                        }}>
                            <div>
                                {!flipped ? (
                                    <>
                                        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".75rem" }}>Question (tap to reveal answer)</div>
                                        <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--navy)", lineHeight: 1.6 }}>{questions[flashIdx]?.question}</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".75rem" }}>Answer</div>
                                        <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", lineHeight: 1.6 }}>
                                            {questions[flashIdx]?.options?.find(o => o.startsWith(questions[flashIdx]?.correct)) || questions[flashIdx]?.correct}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Navigation */}
                        <div style={{ display: "flex", justifyContent: "center", gap: ".75rem" }}>
                            <button className="btn btn-outline" disabled={flashIdx === 0}
                                onClick={() => { setFlashIdx(i => i - 1); setFlipped(false); }}>← Prev</button>
                            <button className="btn btn-outline"
                                onClick={() => { setFlashIdx(Math.floor(Math.random() * questions.length)); setFlipped(false); }}>🔀 Shuffle</button>
                            <button className="btn btn-primary" disabled={flashIdx === questions.length - 1}
                                onClick={() => { setFlashIdx(i => i + 1); setFlipped(false); }}>Next →</button>
                        </div>
                    </div>
                )}

                {/* ── STUDY TAB content (shown only when activeTab === 'study') ── */}
                {activeTab === "study" && (<>
                    {/* Header row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                        <div>
                            <h1 className="page-title" style={{ fontSize: "1.4rem", marginBottom: ".125rem" }}>Recent MCQs</h1>
                            <div style={{ fontSize: ".72rem", color: "var(--text-light)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>
                                {filtered.length} QUESTIONS · <span style={{ color: "var(--navy)" }}>N next · P prev · T tutor · B bookmark</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: ".5rem" }}>
                            {[
                                { key: "all", label: "All" },
                                { key: "bookmarked", label: "⭐ Saved" },
                                { key: "wrong", label: "❌ Wrong" },
                            ].map(({ key, label }) => (
                                <button key={key} onClick={() => setFilter(key)}
                                    className={filter === key ? "btn btn-primary" : "btn btn-outline"}
                                    style={{ fontSize: ".75rem", padding: ".35rem .8rem" }}>
                                    {label}
                                </button>
                            ))}
                            <button
                                className={showTutor ? "btn btn-primary" : "btn btn-outline"}
                                style={{ fontSize: ".75rem", padding: ".35rem .8rem" }}
                                onClick={() => setShowTutor(v => !v)}
                            >🤖 Tutor</button>
                        </div>
                    </div>

                    {/* Search bar */}
                    <div style={{ marginBottom: "1rem" }}>
                        <input
                            type="text"
                            placeholder="🔍 Search questions..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="form-input"
                            style={{ width: "100%", fontSize: ".875rem" }}
                        />
                    </div>

                    {/* AI Tutor Panel */}
                    {showTutor && (
                        <div style={{ marginBottom: "1.25rem" }}>
                            <AITutorChat
                                question={filtered[activeQIdx] || null}
                                context={pdfName ? `Quiz from: ${pdfName}` : ""}
                                collapsed={false}
                            />
                        </div>
                    )}

                    {/* Export */}
                    <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginBottom: "1.25rem" }}>
                        <button className="btn btn-outline" style={{ fontSize: ".78rem" }}
                            onClick={() => exportHTML(filtered, pdfName)}>
                            ⬇ Export HTML
                        </button>
                        <button className="btn btn-outline" style={{ fontSize: ".78rem" }}
                            onClick={() => exportPDF(filtered, pdfName || "QuizGenius Export")}>
                            🖨 Export PDF
                        </button>
                        <button className="btn btn-outline" style={{ fontSize: ".78rem" }}
                            onClick={() => navigator.clipboard.writeText(filtered.map((q, i) => `Q${i + 1}: ${q.question}\nAnswer: ${q.correct}`).join("\n\n"))}>
                            📋 Copy All
                        </button>
                    </div>

                    {/* Question cards */}
                    {filtered.length === 0 ? (
                        <div className="card" style={{ textAlign: "center", padding: "2.5rem" }}>
                            <span style={{ fontSize: "2rem", display: "block", marginBottom: ".75rem" }}>🔍</span>
                            <div style={{ fontWeight: 600, color: "var(--navy)" }}>No questions match this filter</div>
                        </div>
                    ) : filtered.map((q, idx) => {
                        const opts = parseOptions(q.options);
                        const isBookmarked = bookmarks.includes(q.id);
                        const isExpanded = expanded[q.id];

                        return (
                            <div key={q.id} className="card" style={{ marginBottom: ".875rem" }}>
                                {/* Meta row */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".75rem" }}>
                                    <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                                        {q.topic && <span className="badge badge-accent">{q.topic}</span>}
                                        {q.difficulty && <span className={`badge badge-${(q.difficulty || "").toLowerCase()}`}>{q.difficulty}</span>}
                                        {q.type && <span className="badge badge-navy">{q.type}</span>}
                                    </div>
                                    <button onClick={() => handleBookmark(q.id)}
                                        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1rem" }}
                                        title={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                                        {isBookmarked ? "⭐" : "☆"}
                                    </button>
                                </div>

                                {/* Question */}
                                <p style={{ fontWeight: 600, fontSize: ".9rem", color: "var(--text-primary)", marginBottom: ".875rem", lineHeight: 1.65 }}>
                                    {idx + 1}. {q.question}
                                </p>

                                {/* Options */}
                                {(() => {
                                    const rawCorrect = String(q.correct || "").trim();
                                    const correctLetter = rawCorrect.charAt(0).toUpperCase();
                                    const correctOpt = opts.find(o => String(o).charAt(0).toUpperCase() === correctLetter);
                                    // correctOpt used for letter matching above
                                    void correctOpt;

                                    return (
                                        <div className="options-list">
                                            {opts.map((opt, i) => {
                                                const optLetter = String(opt).charAt(0).toUpperCase();
                                                const isCorrect = optLetter === correctLetter;
                                                const displayText = String(opt).replace(/^[A-Da-d][).\s]+/, "").trim();
                                                return (
                                                    <div key={i}
                                                        className={`option-item${isCorrect ? " correct" : ""}`}
                                                        style={{ cursor: "default" }}>
                                                        <div style={{
                                                            width: "24px", height: "24px", borderRadius: "50%",
                                                            background: isCorrect ? "var(--success)" : "var(--surface)",
                                                            color: isCorrect ? "#fff" : "var(--text-muted)",
                                                            border: `2px solid ${isCorrect ? "var(--success)" : "var(--border)"}`,
                                                            display: "flex", alignItems: "center", justifyContent: "center",
                                                            fontSize: isCorrect ? ".7rem" : ".62rem",
                                                            fontWeight: 900, flexShrink: 0,
                                                        }}>
                                                            {isCorrect ? "✓" : optLetter}
                                                        </div>
                                                        <span style={{ flex: 1 }}>{displayText}</span>
                                                        {isCorrect && (
                                                            <span style={{
                                                                fontSize: ".72rem", fontWeight: 700,
                                                                color: "var(--success)", whiteSpace: "nowrap",
                                                                background: "rgba(16,185,129,.12)",
                                                                borderRadius: "999px", padding: ".1rem .5rem",
                                                            }}>✓ Correct</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* Source expand */}
                                <div style={{
                                    marginTop: ".875rem", paddingTop: ".75rem", borderTop: "1px solid var(--border)",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}>
                                    <button onClick={() => setExpanded(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                                        style={{ display: "flex", alignItems: "center", gap: ".4rem", border: "none", background: "transparent", cursor: "pointer", fontSize: ".78rem", color: "var(--text-muted)" }}>
                                        <span>ℹ Source Context</span>
                                        <span>{isExpanded ? "▲" : "▼"}</span>
                                    </button>
                                </div>
                                {isExpanded && (
                                    <div style={{ marginTop: ".625rem", padding: ".75rem", background: "var(--surface)", borderRadius: "var(--radius-sm)", fontSize: ".78rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                                        Answer: <strong style={{ color: "var(--navy)" }}>{q.correct}</strong>
                                        {q.topic && <span> · Topic: <strong style={{ color: "var(--navy)" }}>{q.topic}</strong></span>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>)}
            </div>
        </div>
    );
}
