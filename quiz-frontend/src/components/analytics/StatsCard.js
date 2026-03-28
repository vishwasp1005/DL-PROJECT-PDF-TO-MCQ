/** StatsCard — reusable statistic display card. */
import React from "react";

export default function StatsCard({ label, value, icon, color = "var(--navy)", animated = false }) {
    return (
        <div className="card" style={{ textAlign: "center", padding: "1.25rem .875rem" }}>
            {icon && <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>{icon}</div>}
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: ".72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", marginTop: ".375rem" }}>
                {label}
            </div>
        </div>
    );
}
