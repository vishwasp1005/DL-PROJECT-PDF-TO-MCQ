import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import Loader from "../components/Loader";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
    const navigate = useNavigate();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const myUsername = localStorage.getItem("username") || "";
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);

    useEffect(() => {
        const fn = () => setIsMobile(window.innerWidth <= 640);
        window.addEventListener("resize", fn);
        return () => window.removeEventListener("resize", fn);
    }, []);

    useEffect(() => {
        API.get("/quiz/leaderboard")
            .then(res => setEntries(res.data.leaderboard || []))
            .catch(() => setError("Could not load leaderboard."))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="page" style={{ background: "var(--bg)" }}><Loader text="Loading leaderboard..." /></div>;

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: isMobile ? "1.5rem 1rem" : "2rem 1.5rem" }}>
            <div style={{ maxWidth: "700px", margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: ".5rem" }}>🏆</div>
                    <h1 className="page-title" style={{ textAlign: "center" }}>Leaderboard</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: ".875rem" }}>Top performers across all quizzes</p>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                {entries.length === 0 && !error ? (
                    <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                        <span style={{ fontSize: "2rem", display: "block", marginBottom: ".75rem" }}>📭</span>
                        <div style={{ fontWeight: 600, color: "var(--navy)" }}>No scores recorded yet</div>
                        <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={() => navigate("/generate")}>
                            ⚡ Be the first!
                        </button>
                    </div>
                ) : (
                    <div>
                        {/* Top 3 podium */}
                        {entries.length >= 3 && (
                            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "1rem", marginBottom: "2rem", alignItems: isMobile ? "stretch" : "flex-end" }}>
                                {(isMobile ? [entries[0], entries[1], entries[2]] : [entries[1], entries[0], entries[2]]).map((e, i) => {
                                    const heights = isMobile ? ["auto", "auto", "auto"] : ["75px", "100px", "60px"];
                                    const rank = isMobile ? i + 1 : (i === 1 ? 1 : i === 0 ? 2 : 3);
                                    const col = rank === 1 ? "#F59E0B" : rank === 2 ? "#9CA3AF" : "#CD7C2F";
                                    return e ? (
                                        <div key={e.username} className="card" style={{
                                            textAlign: "center", padding: isMobile ? ".875rem" : "1rem .75rem",
                                            borderTop: `3px solid ${col}`,
                                            display: "flex", flexDirection: isMobile ? "row" : "column",
                                            justifyContent: isMobile ? "space-between" : "flex-end",
                                            alignItems: isMobile ? "center" : undefined,
                                            minHeight: heights[i],
                                            gap: isMobile ? ".5rem" : 0,
                                        }}>
                                            <div style={{ fontSize: "1.25rem" }}>{MEDALS[rank - 1]}</div>
                                            <div style={{ fontWeight: 800, fontSize: isMobile ? ".9rem" : ".85rem", color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: isMobile ? 1 : undefined, textAlign: isMobile ? "left" : "center", padding: isMobile ? "0 .5rem" : 0 }}>
                                                {e.username === myUsername ? "You 👈" : e.username}
                                            </div>
                                            <div style={{ fontWeight: 900, fontSize: "1.1rem", color: col }}>{e.percentage}%</div>
                                        </div>
                                    ) : <div key={i} />;
                                })}
                            </div>
                        )}

                        {/* Full table */}
                        <div className="card">
                            <div style={{ display: "flex", padding: ".5rem 1rem", borderBottom: "1px solid var(--border)", marginBottom: ".25rem" }}>
                                <span style={{ width: "36px", fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-light)" }}>#</span>
                                <span style={{ flex: 1, fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-light)" }}>Player</span>
                                <span style={{ width: "60px", textAlign: "right", fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-light)" }}>Score</span>
                                <span style={{ width: "80px", textAlign: "right", fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-light)" }}>Questions</span>
                            </div>
                            {entries.map((e, i) => {
                                const isMe = e.username === myUsername;
                                const col = e.percentage >= 80 ? "var(--success)" : e.percentage >= 50 ? "var(--warning)" : "var(--danger)";
                                return (
                                    <div key={e.username + i} style={{
                                        display: "flex", alignItems: "center", padding: ".625rem 1rem",
                                        borderRadius: "var(--radius-sm)", marginBottom: ".25rem",
                                        background: isMe ? "var(--navy-muted)" : "transparent",
                                        border: isMe ? "1.5px solid var(--border)" : "1.5px solid transparent",
                                    }}>
                                        <span style={{ width: "36px", fontWeight: 800, fontSize: ".85rem", color: i < 3 ? col : "var(--text-muted)" }}>
                                            {i < 3 ? MEDALS[i] : `#${i + 1}`}
                                        </span>
                                        <span style={{ flex: 1, fontWeight: isMe ? 700 : 500, color: "var(--text-primary)", fontSize: ".875rem" }}>
                                            {e.username} {isMe && <span style={{ fontSize: ".65rem", color: "var(--accent)" }}>you</span>}
                                        </span>
                                        <span style={{ width: "60px", textAlign: "right", fontWeight: 800, color: col, fontSize: ".9rem" }}>
                                            {e.percentage}%
                                        </span>
                                        <span style={{ width: "80px", textAlign: "right", fontSize: ".78rem", color: "var(--text-muted)" }}>
                                            {e.questions} Qs
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                            <button className="btn btn-primary" onClick={() => navigate("/generate")}>
                                ⚡ Generate a Quiz to Compete
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
