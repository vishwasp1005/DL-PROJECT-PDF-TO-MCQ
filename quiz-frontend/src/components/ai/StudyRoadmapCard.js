/** StudyRoadmapCard — personalised study path stub (future feature). */
import React from "react";

export default function StudyRoadmapCard({ topics = [] }) {
    return (
        <div className="card">
            <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: ".75rem" }}>📍 Study Roadmap</div>
            {topics.length ? (
                <ol style={{ paddingLeft: "1.25rem", fontSize: ".85rem", color: "var(--text-muted)", lineHeight: 2 }}>
                    {topics.map((t) => <li key={t}>{t}</li>)}
                </ol>
            ) : (
                <div style={{ fontSize: ".85rem", color: "var(--text-muted)" }}>Generate a quiz to see your personalised roadmap.</div>
            )}
        </div>
    );
}
