import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { getScoreHistory, getBookmarks, clearScoreHistory } from "../utils/storage";
import RecommendationCard from "../components/ai/RecommendationCard";
import { SkeletonCard } from "../components/ui/SkeletonLoader";
import { useToast } from "../components/ui/Toast";
import useIsMobile from "../hooks/useIsMobile";

// ── SVG Donut Chart ─────────────────────────────────────────────
function DonutChart({ data, size = 140 }) {
    // data: [{ label, value, color }]
    const cx = size / 2, cy = size / 2, r = size * 0.38, stroke = size * 0.12;
    const circumference = 2 * Math.PI * r;
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const [progress, setProgress] = useState(0);
    const raf = useRef(null);

    useEffect(() => {
        const start = performance.now();
        const animate = (now) => {
            const p = Math.min((now - start) / 900, 1);
            setProgress(1 - Math.pow(1 - p, 3));
            if (p < 1) raf.current = requestAnimationFrame(animate);
        };
        raf.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf.current);
    }, []);

    let offset = 0;
    const segments = data.map(d => {
        const pct = (d.value / total) * progress;
        const seg = { ...d, dashArray: pct * circumference, dashOffset: -offset * circumference };
        offset += pct;
        return seg;
    });

    const center = total > 0 ? Math.round((data[0]?.value / total) * 100) : 0;

    return (
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <svg width={size} height={size} style={{ flexShrink: 0 }}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
                {segments.map((s, i) => (
                    <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                        stroke={s.color} strokeWidth={stroke}
                        strokeDasharray={`${s.dashArray} ${circumference}`}
                        strokeDashoffset={s.dashOffset}
                        strokeLinecap="round"
                        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dasharray .05s" }}
                    />
                ))}
                <text x={cx} y={cy - 6} textAnchor="middle" fontSize={size * 0.18} fontWeight="800" fill="var(--navy)">{center}%</text>
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize={size * 0.09} fill="var(--text-muted)">ACCURACY</text>
            </svg>
            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {data.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: ".75rem", color: "var(--text-muted)", fontWeight: 500 }}>{d.label}</span>
                        <span style={{ fontSize: ".75rem", fontWeight: 800, color: "var(--navy)", marginLeft: "auto" }}>{d.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Animated Bar Chart ───────────────────────────────────────────
function BarChart({ data, height = 120 }) {
    // data: [{ label, pct, date }]
    const [heights, setHeights] = useState(data.map(() => 0));
    const [tooltip, setTooltip] = useState(null);
    const raf = useRef(null);

    useEffect(() => {
        const start = performance.now();
        const animate = (now) => {
            const p = Math.min((now - start) / 700, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setHeights(data.map(d => d.pct * eased));
            if (p < 1) raf.current = requestAnimationFrame(animate);
        };
        raf.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf.current);
    }, [data]);

    const maxH = height - 28; // reserve space for label on top

    return (
        <div style={{ position: "relative" }}>
            {/* Tooltip */}
            {tooltip && (
                <div style={{
                    position: "absolute", top: "-2.5rem", left: tooltip.x - 40, zIndex: 10,
                    background: "var(--navy)", color: "#fff", padding: ".25rem .625rem",
                    borderRadius: "8px", fontSize: ".72rem", fontWeight: 700, whiteSpace: "nowrap",
                    pointerEvents: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,.2)",
                }}>{tooltip.label}: {tooltip.pct}%</div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: `${height}px`, padding: "0 2px" }}>
                {data.map((d, i) => {
                    const col = d.pct >= 80 ? "#10B981" : d.pct >= 50 ? "#F59E0B" : "#EF4444";
                    const barH = (heights[i] / 100) * maxH;
                    return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}
                            onMouseEnter={e => { const rect = e.currentTarget.getBoundingClientRect(); const parentRect = e.currentTarget.parentElement.getBoundingClientRect(); setTooltip({ x: rect.left - parentRect.left + rect.width / 2, pct: Math.round(d.pct), label: d.date || `#${i + 1}` }); }}
                            onMouseLeave={() => setTooltip(null)}
                        >
                            {/* Score label */}
                            {data.length <= 10 && (
                                <div style={{ fontSize: ".58rem", color: col, fontWeight: 700, marginBottom: "2px", opacity: heights[i] > 10 ? 1 : 0, transition: "opacity .3s" }}>
                                    {Math.round(heights[i])}%
                                </div>
                            )}
                            <div style={{
                                width: "100%", height: `${barH}px`, minHeight: "3px",
                                background: `linear-gradient(to top, ${col}cc, ${col})`,
                                borderRadius: "4px 4px 0 0",
                                boxShadow: `0 0 8px ${col}44`,
                                transition: "opacity .15s",
                                cursor: "pointer",
                            }}
                                onMouseEnter={e => e.currentTarget.style.opacity = ".85"}
                                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                            />
                        </div>
                    );
                })}
            </div>
            {/* X axis labels */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: ".375rem", fontSize: ".6rem", color: "var(--text-light)" }}>
                <span>{data[0]?.date || "Oldest"}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Score History</span>
                <span>{data[data.length - 1]?.date || "Latest"}</span>
            </div>
        </div>
    );
}

// ── Count-up animation hook ──────────────────
function useCountUp(target, duration = 800) {
    const [val, setVal] = useState(0);
    const isNum = typeof target === "number" && !isNaN(target);
    useEffect(() => {
        if (!isNum || target === 0) { setVal(target); return; }
        const steps = 30;
        const step = target / steps;
        let cur = 0;
        const t = setInterval(() => {
            cur += step;
            if (cur >= target) { setVal(target); clearInterval(t); }
            else setVal(Math.round(cur));
        }, duration / steps);
        return () => clearInterval(t);
    }, [target, isNum, duration]);
    return isNum ? val : target;
}

function StatCard({ ico, val, lbl, numVal }) {
    const animated = useCountUp(numVal !== null ? numVal : 0);
    const display = numVal !== null
        ? (typeof val === "string" && val.endsWith("%") ? `${animated}%` : animated)
        : val;
    return (
        <div className="stat-card">
            <div style={{ fontSize: "1.25rem", marginBottom: ".375rem" }}>{ico}</div>
            <div className="stat-value">{display}</div>
            <div className="stat-label">{lbl}</div>
        </div>
    );
}

export default function DashboardPage() {
    const navigate   = useNavigate();
    const isMobile   = useIsMobile();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    const scoreHistory = getScoreHistory();
    const bookmarks = getBookmarks();
    const username = localStorage.getItem("username") || "User";
    const isGuest = localStorage.getItem("isGuest") === "true";

    const totalTests = scoreHistory.length;
    const avgScore = totalTests ? Math.round(scoreHistory.reduce((s, h) => s + h.pct, 0) / totalTests * 10) / 10 : 0;

    // Study streak — count consecutive distinct days with at least 1 quiz
    const studyStreak = useMemo(() => {
        if (!scoreHistory.length) return 0;
        const days = [...new Set(scoreHistory.map(h => h.date))].sort().reverse();
        if (!days.length) return 0;
        let streak = 1;
        for (let i = 1; i < days.length; i++) {
            const prev = new Date(days[i - 1]);
            const cur = new Date(days[i]);
            const diff = (prev - cur) / (1000 * 60 * 60 * 24);
            if (Math.round(diff) === 1) streak++;
            else break;
        }
        return streak;
    }, [scoreHistory]);

    // Total questions answered
    const questionsCompleted = useMemo(() =>
        scoreHistory.reduce((s, h) => s + (h.total || 0), 0),
        [scoreHistory]
    );

    // Weak topics aggregated from score history (uses stored topicStats if available)
    const weakTopicsFromHistory = useMemo(() => {
        try {
            const stored = JSON.parse(localStorage.getItem("qf_topic_stats") || "[]");
            return stored.filter(t => t.accuracy < 60);
        } catch { return []; }
    }, []);
    const strongTopicsFromHistory = useMemo(() => {
        try {
            const stored = JSON.parse(localStorage.getItem("qf_topic_stats") || "[]");
            return stored.filter(t => t.accuracy >= 60);
        } catch { return []; }
    }, []);

    useEffect(() => {
        if (isGuest) { setLoading(false); return; }
        API.get("/quiz/history")
            .then(res => setSessions(res.data.sessions || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [isGuest]);

    if (loading) return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: isMobile ? "1.25rem 1rem" : "2rem 1.5rem" }}>
            <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: "1rem", marginBottom: "1.75rem" }}>
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} lines={2} />)}
                </div>
            </div>
        </div>
    );

    const stats = [
        { ico: "📊", val: totalTests || sessions.length, lbl: "Tests Taken" },
        { ico: "🎯", val: avgScore ? `${avgScore}%` : "—", lbl: "Avg Score" },
        { ico: "🔥", val: studyStreak ? `${studyStreak}d` : "—", lbl: "Study Streak" },
        { ico: "✅", val: questionsCompleted || bookmarks.length, lbl: questionsCompleted ? "Questions Done" : "Bookmarks" },
    ];

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", padding: isMobile ? "1.25rem 1rem" : "2rem 1.5rem" }}>
            <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
                <div style={{ marginBottom: "2rem" }}>
                    <div className="breadcrumb">YOUR PROGRESS › DASHBOARD</div>
                    <h1 className="page-title">Learning Dashboard</h1>
                    <p className="page-subtitle">
                        {isGuest ? "Guest mode — create an account to save progress." : `Welcome back, ${username.charAt(0).toUpperCase() + username.slice(1)}!`}
                    </p>
                </div>

                {/* Stat cards */}
                <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: "1rem", marginBottom: "1.75rem" }}>
                    {stats.map(({ ico, val, lbl }) => {
                        const numVal = typeof val === "string" && val.endsWith("%") ? parseFloat(val) : typeof val === "number" ? val : null;
                        return (
                            <StatCard key={lbl} ico={ico} val={val} lbl={lbl} numVal={numVal} />
                        );
                    })}
                </div>

                {/* AI Recommendation Panel */}
                {(weakTopicsFromHistory.length > 0 || strongTopicsFromHistory.length > 0) && (
                    <RecommendationCard
                        weakTopics={weakTopicsFromHistory}
                        strongTopics={strongTopicsFromHistory}
                        onPractice={(topics) => {
                            toast(`🎯 Generating practice quiz for ${topics.length} weak topic${topics.length > 1 ? "s" : ""}…`);
                            navigate("/generate", { state: { suggestedTopics: topics } });
                        }}
                    />
                )}

                {/* Quick actions */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? ".625rem" : "1rem", marginBottom: "2rem" }}>
                    <button className="btn btn-primary" style={{ minHeight: "44px" }} onClick={() => navigate("/generate")}>⚡ Generate New Quiz</button>
                    <button className="btn btn-outline" style={{ minHeight: "44px" }} onClick={() => navigate("/study")}>📚 Study Mode</button>
                    <button className="btn btn-outline" style={{ minHeight: "44px" }} onClick={() => navigate("/test")}>✏️ Test Mode</button>
                </div>

                {/* ── Charts Row ────────────────────────────────────────── */}
                {scoreHistory.length >= 2 && (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "1.25rem", marginBottom: "1.75rem" }} className="charts-row">

                        {/* Animated bar chart */}
                        <div className="card" style={{ padding: "1.25rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--navy)" }}>📈 Score History</div>
                                    <div style={{ fontSize: ".68rem", color: "var(--text-muted)", marginTop: ".1rem" }}>Last {Math.min(scoreHistory.length, 12)} tests</div>
                                </div>
                                <button className="btn btn-ghost" style={{ fontSize: ".72rem", padding: ".25rem .6rem" }}
                                    onClick={() => { clearScoreHistory(); toast("Score history cleared", "info"); window.location.reload(); }}>
                                    Clear
                                </button>
                            </div>
                            <BarChart data={scoreHistory.slice(-12).map(s => ({ pct: s.pct, date: s.date }))} height={140} />
                        </div>

                        {/* Donut chart — topic breakdown */}
                        <div className="card" style={{ padding: "1.25rem" }}>
                            <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--navy)", marginBottom: ".25rem" }}>🎯 Topic Accuracy</div>
                            <div style={{ fontSize: ".68rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                                {strongTopicsFromHistory.length + weakTopicsFromHistory.length > 0
                                    ? `${strongTopicsFromHistory.length} strong · ${weakTopicsFromHistory.length} need work`
                                    : "Complete tests to see topic breakdown"}
                            </div>
                            {(strongTopicsFromHistory.length + weakTopicsFromHistory.length > 0) ? (
                                <DonutChart data={[
                                    { label: "Strong topics", value: strongTopicsFromHistory.length, color: "#10B981" },
                                    { label: "Need practice", value: weakTopicsFromHistory.length, color: "#EF4444" },
                                    { label: "Average",       value: Math.max(0, totalTests - strongTopicsFromHistory.length - weakTopicsFromHistory.length), color: "#F59E0B" },
                                ].filter(d => d.value > 0)} size={120} />
                            ) : (
                                <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-muted)", fontSize: ".8rem" }}>
                                    📊 Topic data appears after your first test
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Score list */}
                {scoreHistory.length > 0 && (
                    <div style={{ marginBottom: "2rem" }}>
                        {scoreHistory.slice().reverse().map((s, i) => {
                            const col = s.pct >= 80 ? "var(--success)" : s.pct >= 50 ? "var(--warning)" : "var(--danger)";
                            return (
                                <div key={i} className="history-card">
                                    <span className="badge" style={{ background: `${col}18`, color: col, border: `1px solid ${col}44`, whiteSpace: "nowrap" }}>{s.difficulty}</span>
                                    <div style={{ fontWeight: 800, fontSize: "1rem", minWidth: "48px", textAlign: "center", color: col }}>{s.pct}%</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: ".82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{s.pdf}</div>
                                        <div style={{ color: "var(--text-muted)", fontSize: ".7rem" }}>{s.date} · {s.score}/{s.total} correct</div>
                                    </div>
                                    <div style={{ width: "72px", height: "5px", background: "var(--border)", borderRadius: "999px", flexShrink: 0 }}>
                                        <div style={{ height: "100%", width: `${s.pct}%`, background: col, borderRadius: "999px" }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* API sessions */}
                {!isGuest && sessions.length > 0 && (
                    <div style={{ marginBottom: "2rem" }}>
                        <h2 className="section-title">📋 Quiz Sessions</h2>
                        {sessions.map(s => {
                            const pct = s.percentage != null ? s.percentage.toFixed(0) : null;
                            const col = pct == null ? "var(--text-muted)" : pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
                            return (
                                <div key={s.quiz_session_id} className="history-card">
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: ".85rem", color: "var(--navy)" }}>Session #{s.quiz_session_id}</div>
                                        <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                                            {new Date(s.created_at).toLocaleString()} · {s.total_questions || "?"} questions
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 800, color: col }}>{pct != null ? `${pct}%` : "—"}</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Guest notice */}
                {isGuest && (
                    <div className="card" style={{ background: "var(--warning-bg)", border: "1.5px solid rgba(245,158,11,.3)", marginTop: "1.5rem" }}>
                        <p style={{ fontSize: ".875rem", color: "#92400E" }}>
                            ℹ️ <strong>Guest mode</strong> — data resets on refresh. Create an account to save history.
                        </p>
                        <button className="btn btn-primary" style={{ marginTop: ".75rem" }} onClick={() => navigate("/register")}>
                            Create Account →
                        </button>
                    </div>
                )}

                {totalTests === 0 && sessions.length === 0 && (
                    <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                        <span style={{ fontSize: "2.5rem", display: "block", marginBottom: ".75rem" }}>📭</span>
                        <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".375rem" }}>No activity yet</div>
                        <div style={{ color: "var(--text-muted)", fontSize: ".85rem", marginBottom: "1.5rem" }}>Generate a quiz and take a test to see results here.</div>
                        <button className="btn btn-primary" onClick={() => navigate("/generate")}>⚡ Generate a Quiz</button>
                    </div>
                )}
            </div>
        </div>
    );
}
