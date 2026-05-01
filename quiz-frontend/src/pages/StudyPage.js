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
    const wrongIds  = JSON.parse(localStorage.getItem("qg_wrong_answers") || "[]").map(q => q.id);

    const [filter,     setFilter]     = useState("all");   // all | bookmarked | wrong
    const [bookmarks,  setBookmarks]  = useState(getBookmarks());
    const [expanded,   setExpanded]   = useState({});
    const [activeTab,  setActiveTab]  = useState("study"); // study | flashcard
    const [search,     setSearch]     = useState("");
    const [activeQIdx, setActiveQIdx] = useState(0);       // AI tutor context
    const [showTutor,  setShowTutor]  = useState(false);
    const [flashIdx,   setFlashIdx]   = useState(0);
    const [flipped,    setFlipped]    = useState(false);

    const filtered = questions
        .filter(q => {
            if (filter === "bookmarked") return bookmarks.includes(q.id);
            if (filter === "wrong")      return wrongIds.includes(q.id);
            return true;
        })
        .filter(q => !search.trim() || q.question.toLowerCase().includes(search.toLowerCase()));

    const handleBookmark = (id) => {
        toggleBookmark(id);
        setBookmarks(getBookmarks());
    };

    // Keyboard shortcuts — active only in study tab, not when search is focused
    useKeyboardShortcuts({
        n: () => setActiveQIdx(i => Math.min(i + 1, filtered.length - 1)),
        p: () => setActiveQIdx(i => Math.max(i - 1, 0)),
        b: () => filtered[activeQIdx] && handleBookmark(filtered[activeQIdx].id),
        t: () => setShowTutor(v => !v),
    }, activeTab === "study");

    // ── Empty state ──────────────────────────────────────────────────────────
    if (!questions.length) return (
        <div className="page page-fade" style={{ background: "var(--bg)" }}>
            <div style={{
                maxWidth: "420px", width: "100%", textAlign: "center",
                animation: "fadeInUp .4s ease",
            }}>
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
                <h2 style={{
                    fontSize: "1.4rem", fontWeight: 800, color: "var(--navy)",
                    marginBottom: ".5rem", letterSpacing: "-.02em",
                }}>
                    No Questions Yet
                </h2>
                <p style={{
                    fontSize: ".88rem", color: "var(--text-muted)", lineHeight: 1.7,
                    maxWidth: "320px", margin: "0 auto 1.75rem",
                }}>
                    Generate your first quiz from a PDF to unlock Study Mode with flashcards, AI Tutor, and more.
                </p>

                {/* Feature pills */}
                <div style={{ display: "flex", gap: ".5rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.75rem" }}>
                    {["✓ Flashcards", "✓ AI Tutor", "✓ Bookmarks", "✓ Export"].map(f => (
                        <span key={f} style={{
                            padding: ".25rem .75rem", borderRadius: "999px",
                            fontSize: ".72rem", fontWeight: 600,
                            background: "rgba(99,102,241,.09)", color: "var(--accent)",
                            border: "1px solid rgba(99,102,241,.18)",
                        }}>{f}</span>
                    ))}
                </div>

                <button
                    className="btn btn-primary"
                    style={{ padding: ".75rem 2rem", fontSize: ".95rem", minHeight: "48px" }}
                    onClick={() => navigate("/generate")}
                >
                    ⚡ Generate Quiz Now
                </button>
            </div>
        </div>
    );

    // ── Main render ──────────────────────────────────────────────────────────
    return (
        <div className="study-page-wrapper" style={{
            background: "var(--bg)",
            minHeight: "calc(100vh - 60px)",
            padding: "1.25rem 1rem",          // mobile-first: 1rem side padding
        }}>
            <div style={{ maxWidth: "760px", margin: "0 auto" }}>

                {/*
                 * ── Tab bar ──────────────────────────────────────────────────
                 * FIX: "tab-bar-scroll" forces overflow-x:auto + flex-nowrap
                 * so tabs NEVER wrap to a second line or overflow the viewport.
                 * Each button has flex-shrink:0 (set in CSS) to prevent squishing.
                 */}
                <div className="tab-bar tab-bar-scroll" style={{ marginBottom: "2rem" }}>
                    <button
                        className={`tab-btn${activeTab === "study" ? " active" : ""}`}
                        onClick={() => setActiveTab("study")}
                    >
                        📚 Study Mode
                    </button>
                    <button
                        className={`tab-btn${activeTab === "flashcard" ? " active" : ""}`}
                        onClick={() => { setActiveTab("flashcard"); setFlashIdx(0); setFlipped(false); }}
                    >
                        🃏 Flashcards
                    </button>
                    <button
                        className="tab-btn"
                        onClick={() => navigate("/test", { state: { questions, pdfName } })}
                    >
                        ✏️ Test Mode
                    </button>
                </div>

                {/* ── FLASHCARD TAB ─────────────────────────────────────────── */}
                {activeTab === "flashcard" && (
                    <div style={{ padding: "1rem 0 2rem" }}>
                        {/* Progress label */}
                        <div style={{
                            fontSize: ".72rem", fontWeight: 700, color: "var(--text-light)",
                            textTransform: "uppercase", letterSpacing: ".1em",
                            textAlign: "center", marginBottom: "1.25rem",
                        }}>
                            Card {flashIdx + 1} of {questions.length}
                        </div>

                        {/* Flip card */}
                        <div
                            onClick={() => setFlipped(f => !f)}
                            style={{
                                cursor: "pointer", minHeight: "220px", borderRadius: "16px",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: "2rem 1.5rem",
                                background: flipped ? "#1B2B4B" : "var(--card)",
                                border: "1.5px solid var(--border)",
                                boxShadow: "0 4px 24px rgba(0,0,0,.08)",
                                transition: "background .3s, color .3s",
                                marginBottom: "1.25rem",
                                textAlign: "center",
                            }}
                        >
                            <div>
                                {!flipped ? (
                                    <>
                                        <div style={{
                                            fontSize: ".68rem", fontWeight: 700, color: "var(--text-light)",
                                            textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".875rem",
                                        }}>
                                            Tap to reveal answer
                                        </div>
                                        <div style={{
                                            fontSize: "1rem", fontWeight: 600,
                                            color: "var(--navy)", lineHeight: 1.65,
                                        }}>
                                            {questions[flashIdx]?.question}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{
                                            fontSize: ".68rem", fontWeight: 700,
                                            color: "rgba(255,255,255,.5)",
                                            textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".875rem",
                                        }}>
                                            ✓ Answer
                                        </div>
                                        <div style={{
                                            fontSize: "1.05rem", fontWeight: 700,
                                            color: "#fff", lineHeight: 1.6,
                                        }}>
                                            {questions[flashIdx]?.options?.find(
                                                o => o.startsWith(questions[flashIdx]?.correct)
                                            ) || questions[flashIdx]?.correct}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/*
                         * Navigation buttons
                         * FIX: "flashcard-nav" — CSS sets this to a 3-column grid on mobile
                         * so all three buttons are equal width and comfortably tappable,
                         * instead of the old isMobile ternary that caused a flash on resize.
                         */}
                        <div className="flashcard-nav">
                            <button
                                className="btn btn-outline"
                                disabled={flashIdx === 0}
                                onClick={() => { setFlashIdx(i => i - 1); setFlipped(false); }}
                            >
                                ← Prev
                            </button>
                            <button
                                className="btn btn-outline"
                                onClick={() => { setFlashIdx(Math.floor(Math.random() * questions.length)); setFlipped(false); }}
                            >
                                🔀 Shuffle
                            </button>
                            <button
                                className="btn btn-primary"
                                disabled={flashIdx === questions.length - 1}
                                onClick={() => { setFlashIdx(i => i + 1); setFlipped(false); }}
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STUDY TAB ──────────────────────────────────────────────── */}
                {activeTab === "study" && (<>

                    {/*
                     * Header row
                     * FIX: "study-header-row" CSS class stacks title + filter chips
                     * into two separate rows on mobile via flex-direction:column,
                     * then switches back to flex-row on tablet+ so they sit side-by-side.
                     * This eliminates the cramped overlap on small screens.
                     */}
                    <div className="study-header-row" style={{ marginBottom: "1.125rem" }}>
                        {/* Left: title + hint */}
                        <div>
                            <h1 className="page-title" style={{
                                fontSize: "1.35rem", marginBottom: ".2rem", lineHeight: 1.25,
                            }}>
                                Recent MCQs
                            </h1>
                            <div style={{
                                fontSize: ".68rem", color: "var(--text-light)",
                                fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em",
                            }}>
                                {filtered.length} Questions
                                <span style={{ color: "var(--navy)", marginLeft: ".4rem" }}>
                                    · N/P nav · T tutor · B bookmark
                                </span>
                            </div>
                        </div>

                        {/* Right: filter chips + tutor toggle */}
                        <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                            {[
                                { key: "all",        label: "All"       },
                                { key: "bookmarked", label: "⭐ Saved"  },
                                { key: "wrong",      label: "❌ Wrong"  },
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setFilter(key)}
                                    className={filter === key ? "btn btn-primary" : "btn btn-outline"}
                                    style={{ fontSize: ".73rem", padding: ".35rem .75rem", minHeight: "36px" }}
                                >
                                    {label}
                                </button>
                            ))}
                            <button
                                className={showTutor ? "btn btn-primary" : "btn btn-outline"}
                                style={{ fontSize: ".73rem", padding: ".35rem .75rem", minHeight: "36px" }}
                                onClick={() => setShowTutor(v => !v)}
                            >
                                🤖 Tutor
                            </button>
                        </div>
                    </div>

                    {/* Search */}
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

                    {/*
                     * Export button row
                     * FIX: "export-row" CSS class switches from a flex row (desktop)
                     * to a 3-column grid (mobile) so each button gets equal space
                     * and nothing overflows off the right edge of the screen.
                     */}
                    <div className="export-row" style={{ marginBottom: "1.25rem" }}>
                        <button
                            className="btn btn-outline"
                            style={{ fontSize: ".78rem" }}
                            onClick={() => exportHTML(filtered, pdfName)}
                        >
                            ⬇ Export HTML
                        </button>
                        <button
                            className="btn btn-outline"
                            style={{ fontSize: ".78rem" }}
                            onClick={() => exportPDF(filtered, pdfName || "QuizGenius Export")}
                        >
                            🖨 Export PDF
                        </button>
                        <button
                            className="btn btn-outline"
                            style={{ fontSize: ".78rem" }}
                            onClick={() =>
                                navigator.clipboard.writeText(
                                    filtered.map((q, i) => `Q${i + 1}: ${q.question}\nAnswer: ${q.correct}`).join("\n\n")
                                )
                            }
                        >
                            📋 Copy All
                        </button>
                    </div>

                    {/* ── Question cards ────────────────────────────────────── */}
                    {filtered.length === 0 ? (
                        <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
                            <span style={{ fontSize: "2rem", display: "block", marginBottom: ".75rem" }}>🔍</span>
                            <div style={{ fontWeight: 600, color: "var(--navy)" }}>No questions match this filter</div>
                        </div>
                    ) : filtered.map((q, idx) => {
                        const opts        = parseOptions(q.options);
                        const isBookmarked = bookmarks.includes(q.id);
                        const isExpanded  = expanded[q.id];
                        const rawCorrect  = String(q.correct || "").trim();
                        const correctLtr  = rawCorrect.charAt(0).toUpperCase();

                        return (
                            <div
                                key={q.id}
                                className="card"
                                style={{ marginBottom: "1.5rem" }}
                                // highlight card when it is the active AI tutor target
                                onClick={() => setActiveQIdx(idx)}
                            >
                                {/* ── Meta row ── */}
                                <div style={{
                                    display: "flex", justifyContent: "space-between",
                                    alignItems: "flex-start", marginBottom: ".75rem", gap: ".5rem",
                                }}>
                                    <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap", flex: 1 }}>
                                        {q.topic && (
                                            <span className="badge badge-accent">{q.topic}</span>
                                        )}
                                        {q.difficulty && (
                                            <span className={`badge badge-${(q.difficulty || "").toLowerCase()}`}>
                                                {q.difficulty}
                                            </span>
                                        )}
                                        {q.type && (
                                            <span className="badge badge-navy">{q.type}</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleBookmark(q.id); }}
                                        style={{
                                            border: "none", background: "transparent",
                                            cursor: "pointer", fontSize: "1.1rem",
                                            padding: ".2rem", flexShrink: 0,
                                            minWidth: "36px", minHeight: "36px",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}
                                        title={isBookmarked ? "Remove bookmark" : "Bookmark"}
                                    >
                                        {isBookmarked ? "⭐" : "☆"}
                                    </button>
                                </div>

                                {/* ── Question text ── */}
                                <p style={{
                                    fontWeight: 600, fontSize: ".95rem",
                                    color: "var(--text-primary)",
                                    marginBottom: "1.25rem", lineHeight: 1.7,
                                }}>
                                    <span style={{
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        width: "24px", height: "24px", borderRadius: "6px",
                                        background: "var(--navy-muted)", color: "var(--navy)",
                                        fontSize: ".7rem", fontWeight: 800,
                                        marginRight: ".5rem", flexShrink: 0,
                                        verticalAlign: "middle",
                                    }}>{idx + 1}</span>
                                    {q.question}
                                </p>

                                {/*
                                 * ── Answer options ──
                                 * Correct answer always highlighted in green with a checkmark badge.
                                 * option-item.correct is defined in index.css with green border + bg.
                                 * Improved padding from .65rem → .75rem for better touch tap area.
                                 */}
                                <div className="options-list">
                                    {opts.map((opt, i) => {
                                        const optLetter  = String(opt).charAt(0).toUpperCase();
                                        const isCorrect  = optLetter === correctLtr;
                                        const displayTxt = String(opt).replace(/^[A-Da-d][).\s]+/, "").trim();
                                        return (
                                            <div
                                                key={i}
                                                className={`option-item${isCorrect ? " correct" : ""}`}
                                                style={{ cursor: "default", padding: "1rem 1.125rem" }}
                                            >
                                                {/* Letter circle */}
                                                <div style={{
                                                    width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                                                    background: isCorrect ? "var(--success)" : "var(--surface)",
                                                    color: isCorrect ? "#fff" : "var(--text-muted)",
                                                    border: `2px solid ${isCorrect ? "var(--success)" : "var(--border)"}`,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: isCorrect ? ".68rem" : ".6rem",
                                                    fontWeight: 900,
                                                }}>
                                                    {isCorrect ? "✓" : optLetter}
                                                </div>

                                                <span style={{ flex: 1, fontSize: ".875rem", lineHeight: 1.5 }}>
                                                    {displayTxt}
                                                </span>

                                                {isCorrect && (
                                                    <span style={{
                                                        fontSize: ".68rem", fontWeight: 700,
                                                        color: "var(--success)", whiteSpace: "nowrap",
                                                        background: "rgba(16,185,129,.12)",
                                                        borderRadius: "999px", padding: ".15rem .55rem",
                                                        border: "1px solid rgba(16,185,129,.25)",
                                                    }}>
                                                        ✓ Answer
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* ── Source context expand ── */}
                                <div style={{
                                    marginTop: ".875rem", paddingTop: ".75rem",
                                    borderTop: "1px solid var(--border)",
                                }}>
                                    <button
                                        onClick={e => { e.stopPropagation(); setExpanded(prev => ({ ...prev, [q.id]: !prev[q.id] })); }}
                                        style={{
                                            display: "flex", alignItems: "center", gap: ".4rem",
                                            border: "none", background: "transparent", cursor: "pointer",
                                            fontSize: ".78rem", color: "var(--text-muted)",
                                            padding: ".25rem 0", minHeight: "36px",
                                        }}
                                    >
                                        <span>ℹ Source Context</span>
                                        <span style={{ fontSize: ".65rem" }}>{isExpanded ? "▲" : "▼"}</span>
                                    </button>

                                    {isExpanded && (
                                        <div style={{
                                            marginTop: ".5rem", padding: ".75rem",
                                            background: "var(--surface)", borderRadius: "var(--radius-sm)",
                                            fontSize: ".78rem", color: "var(--text-muted)", lineHeight: 1.65,
                                        }}>
                                            Answer: <strong style={{ color: "var(--navy)" }}>{q.correct}</strong>
                                            {q.topic && (
                                                <span> · Topic: <strong style={{ color: "var(--navy)" }}>{q.topic}</strong></span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </>)}
            </div>
        </div>
    );
}
