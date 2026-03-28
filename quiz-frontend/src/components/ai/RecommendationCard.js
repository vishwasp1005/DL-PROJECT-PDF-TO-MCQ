/**
 * RecommendationCard — AI-powered study recommendation panel.
 *
 * Props:
 *   weakTopics:   [{ topic, accuracy, total }]
 *   strongTopics: [{ topic, accuracy, total }]
 *   onPractice:   (topics: string[]) => void — callback for "Practice" button
 */
import React from "react";

const STUDY_TIPS = {
    default: [
        "Re-read the relevant chapter section",
        "Try solving 5 practice problems",
        "Create a summary note with key facts",
    ],
};

export default function RecommendationCard({ weakTopics = [], strongTopics = [], onPractice }) {
    if (!weakTopics.length && !strongTopics.length) return null;

    const topWeak = weakTopics.slice(0, 3);
    const topStrong = strongTopics.slice(-3).reverse();

    return (
        <div style={{ marginBottom: "1.75rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "var(--navy)", marginBottom: "1rem" }}>
                🤖 AI Recommendations
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {/* Weak topics */}
                {topWeak.length > 0 && (
                    <div className="card" style={{ borderLeft: "3px solid var(--danger)" }}>
                        <div style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--danger)", marginBottom: ".75rem" }}>
                            ⚠️ Areas to Improve
                        </div>
                        {topWeak.map((t) => (
                            <div key={t.topic} style={{ marginBottom: ".5rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".2rem" }}>
                                    <span style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--text-primary)" }}>{t.topic}</span>
                                    <span style={{ fontSize: ".75rem", fontWeight: 700, color: "var(--danger)" }}>{t.accuracy}%</span>
                                </div>
                                <div style={{ height: "4px", background: "var(--border)", borderRadius: "999px" }}>
                                    <div style={{ width: `${t.accuracy}%`, height: "100%", background: "var(--danger)", borderRadius: "999px" }} />
                                </div>
                            </div>
                        ))}
                        <div style={{ marginTop: ".875rem", paddingTop: ".875rem", borderTop: "1px solid var(--border)" }}>
                            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".5rem" }}>
                                Recommended Actions
                            </div>
                            <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: ".75rem", color: "var(--text-muted)", lineHeight: 1.9 }}>
                                {(STUDY_TIPS[topWeak[0]?.topic] || STUDY_TIPS.default).map((tip, i) => (
                                    <li key={i}>{tip}</li>
                                ))}
                            </ul>
                        </div>
                        {onPractice && topWeak.length > 0 && (
                            <button
                                className="btn btn-primary"
                                style={{ width: "100%", marginTop: ".875rem", fontSize: ".78rem" }}
                                onClick={() => onPractice(topWeak.map(t => t.topic))}
                            >
                                🎯 Practice Weak Topics
                            </button>
                        )}
                    </div>
                )}

                {/* Strong topics */}
                {topStrong.length > 0 && (
                    <div className="card" style={{ borderLeft: "3px solid var(--success)" }}>
                        <div style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--success)", marginBottom: ".75rem" }}>
                            ✅ Strong Areas
                        </div>
                        {topStrong.map((t) => (
                            <div key={t.topic} style={{ marginBottom: ".5rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".2rem" }}>
                                    <span style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--text-primary)" }}>{t.topic}</span>
                                    <span style={{ fontSize: ".75rem", fontWeight: 700, color: "var(--success)" }}>{t.accuracy}%</span>
                                </div>
                                <div style={{ height: "4px", background: "var(--border)", borderRadius: "999px" }}>
                                    <div style={{ width: `${t.accuracy}%`, height: "100%", background: "var(--success)", borderRadius: "999px" }} />
                                </div>
                            </div>
                        ))}
                        <div style={{
                            marginTop: ".875rem", paddingTop: ".875rem",
                            borderTop: "1px solid var(--border)",
                            fontSize: ".75rem", color: "var(--text-muted)", lineHeight: 1.7,
                        }}>
                            💪 Keep it up! These topics are under control. Focus your energy on the weaker areas.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
