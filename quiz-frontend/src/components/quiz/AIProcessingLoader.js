/**
 * AIProcessingLoader — animated card shown while PDF is being analyzed/generated.
 *
 * Props:
 *   progress: number 0-100
 *   message:  string (optional)
 */
import React from "react";

export default function AIProcessingLoader({ progress = 0, message = "Analyzing content..." }) {
    return (
        <div style={{ marginBottom: "1.5rem" }}>
            <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted)",
                marginBottom: ".4rem", textTransform: "uppercase", letterSpacing: ".08em",
            }}>
                <span>🔄 {message.toUpperCase()}</span>
                <span>{progress}%</span>
            </div>
            <div className="progress-bar-wrapper">
                <div className="progress-bar-fill" style={{ width: `${progress}%`, background: "var(--navy)" }} />
            </div>
            <p style={{ fontSize: ".75rem", color: "var(--text-light)", textAlign: "center", marginTop: ".5rem" }}>
                This usually takes less than 60 seconds depending on document length.
            </p>
        </div>
    );
}
