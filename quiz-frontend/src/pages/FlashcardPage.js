import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getBookmarks, toggleBookmark } from "../utils/storage";
import { parseOptions } from "../utils/textAnalysis";

export default function FlashcardPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { questions = [] } = location.state || {};
    const allQs = questions.length ? questions : JSON.parse(localStorage.getItem("qg_questions") || "[]");

    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [filter, setFilter] = useState("All");
    const [bookmarks, setBookmarks] = useState(getBookmarks());
    const [search, setSearch] = useState("");

    const wrongKeys = (() => {
        try { return JSON.parse(localStorage.getItem("qg_wrong_answers") || "[]").map(q => String(q.id)); }
        catch { return []; }
    })();

    let fcQs = allQs;
    if (filter === "Bookmarked") fcQs = allQs.filter(q => bookmarks.includes(String(q.id)));
    if (filter === "Wrong") fcQs = allQs.filter(q => wrongKeys.includes(String(q.id)));
    if (search.trim()) fcQs = fcQs.filter(q => q.question.toLowerCase().includes(search.toLowerCase()));

    const total = fcQs.length;
    const safeIdx = Math.min(idx, Math.max(total - 1, 0));
    const q = total > 0 ? fcQs[safeIdx] : null;
    const isBm = q ? bookmarks.includes(String(q.id)) : false;
    const pct = total > 0 ? Math.round((safeIdx / total) * 100) : 0;

    const opts = q ? parseOptions(q.options) : [];
    const answer = opts.find(o => o.charAt(0) === q?.correct) || q?.correct || "";

    const handleToggleBm = () => {
        if (!q) return;
        const bms = toggleBookmark(String(q.id));
        setBookmarks([...bms]);
    };

    const step = (dir) => {
        setFlipped(false);
        setTimeout(() => setIdx(i => (i + dir + total) % total), 150);
    };
    const handleRandom = () => {
        setFlipped(false);
        setTimeout(() => setIdx(Math.floor(Math.random() * total)), 150);
    };

    if (!allQs.length) return (
        <div className="page" style={{ background: "var(--bg)" }}>
            <div className="empty-state">
                <span className="emoji">🃏</span>
                <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".5rem" }}>No questions loaded</div>
                <div style={{ marginBottom: "1.5rem" }}>Generate a quiz first to use Flashcards.</div>
                <button className="btn btn-primary" onClick={() => navigate("/generate")}>⚡ Generate Quiz</button>
            </div>
        </div>
    );

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: "2rem 1.5rem" }}>
            <div style={{ maxWidth: "640px", margin: "0 auto" }}>
                <h1 className="page-title" style={{ textAlign: "center", marginBottom: ".25rem" }}>🃏 Flashcards</h1>
                <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: ".85rem", marginBottom: "1.5rem" }}>
                    Click the card to reveal the answer
                </p>

                {/* Filter + search row */}
                <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
                    {[
                        { key: "All", label: `All (${allQs.length})` },
                        { key: "Bookmarked", label: `⭐ Saved (${bookmarks.length})` },
                        { key: "Wrong", label: `❌ Wrong (${wrongKeys.length})` },
                    ].map(({ key, label }) => (
                        <button key={key}
                            className={filter === key ? "btn btn-primary" : "btn btn-outline"}
                            style={{ fontSize: ".75rem", padding: ".35rem .8rem" }}
                            onClick={() => { setFilter(key); setIdx(0); setFlipped(false); }}>
                            {label}
                        </button>
                    ))}
                    <input
                        type="text"
                        placeholder="Search cards..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setIdx(0); setFlipped(false); }}
                        className="form-input"
                        style={{ flex: 1, minWidth: "140px", fontSize: ".8rem", padding: ".45rem .75rem" }}
                    />
                </div>

                {!q ? (
                    <div className="card" style={{ textAlign: "center", padding: "2.5rem" }}>
                        <span style={{ fontSize: "2rem", display: "block", marginBottom: ".75rem" }}>🔍</span>
                        <div style={{ fontWeight: 600, color: "var(--navy)" }}>No cards match this filter</div>
                    </div>
                ) : (
                    <>
                        {/* Progress */}
                        <div style={{ marginBottom: "1rem" }}>
                            <div className="progress-bar-wrapper">
                                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".35rem", alignItems: "center" }}>
                                <span style={{ fontSize: ".65rem", color: "var(--text-muted)", fontWeight: 600 }}>
                                    Card {safeIdx + 1} / {total}
                                </span>
                                <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                                    {q.topic && <span className="badge badge-accent" style={{ fontSize: ".58rem" }}>{q.topic}</span>}
                                    {q.difficulty && <span className={`badge badge-${(q.difficulty || "").toLowerCase()}`} style={{ fontSize: ".58rem" }}>{q.difficulty}</span>}
                                    <button onClick={handleToggleBm}
                                        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "1rem" }}>
                                        {isBm ? "⭐" : "☆"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 3D Flip Card */}
                        <div onClick={() => setFlipped(f => !f)}
                            style={{ cursor: "pointer", height: "240px", perspective: "1200px", marginBottom: "1.25rem" }}>
                            <div style={{
                                width: "100%", height: "100%", position: "relative",
                                transformStyle: "preserve-3d",
                                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                                transition: "transform .5s cubic-bezier(.175,.885,.32,1.1)",
                            }}>
                                {/* Front */}
                                <div style={{
                                    position: "absolute", inset: 0, backfaceVisibility: "hidden",
                                    background: "var(--card)", border: "1.5px solid var(--border)",
                                    borderRadius: "var(--radius)", boxShadow: "var(--shadow-md)",
                                    display: "flex", flexDirection: "column",
                                    alignItems: "center", justifyContent: "center", padding: "2rem",
                                }}>
                                    <div style={{ fontSize: ".55rem", fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: ".75rem" }}>QUESTION</div>
                                    <div style={{ fontSize: ".95rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.6, textAlign: "center" }}>{q.question}</div>
                                    <div style={{ position: "absolute", bottom: "14px", fontSize: ".6rem", color: "var(--text-muted)", fontStyle: "italic" }}>click to flip →</div>
                                </div>
                                {/* Back */}
                                <div style={{
                                    position: "absolute", inset: 0, backfaceVisibility: "hidden",
                                    transform: "rotateY(180deg)",
                                    background: "var(--navy)", borderRadius: "var(--radius)",
                                    boxShadow: "var(--shadow-md)",
                                    display: "flex", flexDirection: "column",
                                    alignItems: "center", justifyContent: "center", padding: "2rem",
                                }}>
                                    <div style={{
                                        background: "rgba(255,255,255,.15)", color: "#fff",
                                        fontSize: ".58rem", fontWeight: 700,
                                        padding: "3px 12px", borderRadius: "999px",
                                        marginBottom: ".875rem", textTransform: "uppercase", letterSpacing: ".08em",
                                    }}>ANSWER</div>
                                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", lineHeight: 1.6, textAlign: "center" }}>
                                        {answer.length > 2 ? answer.slice(2).trim() : answer}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Navigation */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: ".5rem" }}>
                            <button className="btn btn-outline" onClick={() => step(-1)} disabled={total <= 1}>← Prev</button>
                            <button className="btn btn-outline" onClick={handleRandom}>🔀</button>
                            <button className="btn btn-outline" onClick={() => step(1)} disabled={total <= 1}>Next →</button>
                            <button className="btn btn-outline" onClick={handleToggleBm}>{isBm ? "⭐" : "☆"}</button>
                        </div>

                        {/* Bottom nav */}
                        <div style={{ display: "flex", gap: ".5rem", marginTop: ".75rem", justifyContent: "center" }}>
                            <button className="btn btn-ghost" style={{ fontSize: ".78rem" }} onClick={() => navigate("/study", { state: { questions: allQs } })}>
                                📚 Study Mode
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: ".78rem" }} onClick={() => navigate("/test", { state: { questions: allQs } })}>
                                ✏️ Test Mode
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
