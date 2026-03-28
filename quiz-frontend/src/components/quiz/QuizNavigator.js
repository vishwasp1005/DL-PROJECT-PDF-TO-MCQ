/**
 * QuizNavigator — progress bar + answered count header strip.
 *
 * Props:
 *   answered: number
 *   total:    number
 *   elapsed:  number (seconds)
 */
import React from "react";

function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function QuizNavigator({ answered = 0, total = 0, elapsed = 0 }) {
    const pct = total ? (answered / total) * 100 : 0;

    return (
        <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                {/* Timer */}
                <div style={{
                    display: "flex", alignItems: "center", gap: ".4rem",
                    background: "var(--surface)", padding: ".4rem .875rem",
                    borderRadius: "999px", border: "1px solid var(--border)",
                }}>
                    <span style={{ fontSize: ".8rem" }}>🕐</span>
                    <span style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(elapsed)}
                    </span>
                </div>
                {/* Count */}
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: "1.25rem" }}>{answered}/{total}</div>
                    <div style={{ fontSize: ".7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Answered</div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="progress-bar-wrapper" style={{ marginBottom: "1.75rem" }}>
                <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
        </>
    );
}
