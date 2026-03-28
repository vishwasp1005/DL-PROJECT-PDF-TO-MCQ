/** ChartCard — chart wrapper stub (future feature). */
import React from "react";

export default function ChartCard({ title, children }) {
    return (
        <div className="card">
            {title && (
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", marginBottom: "1rem" }}>{title}</div>
            )}
            {children || (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: ".85rem" }}>
                    📊 Chart coming soon
                </div>
            )}
        </div>
    );
}
