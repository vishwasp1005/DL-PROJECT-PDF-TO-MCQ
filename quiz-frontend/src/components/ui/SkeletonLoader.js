/**
 * SkeletonLoader — shimmer loading placeholder.
 *
 * Props:
 *   width:  string CSS value (default "100%")
 *   height: string CSS value (default "1rem")
 *   radius: string CSS value (default "6px")
 *   count:  number of stacked rows  (default 1)
 *   gap:    gap between rows         (default ".5rem")
 */
import React from "react";

const shimmerStyle = {
    background: "linear-gradient(90deg, var(--surface) 25%, var(--border) 50%, var(--surface) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
    borderRadius: "6px",
};

export default function SkeletonLoader({
    width = "100%",
    height = "1rem",
    radius = "6px",
    count = 1,
    gap = ".5rem",
}) {
    const rows = Array.from({ length: count });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap }}>
            {rows.map((_, i) => (
                <div
                    key={i}
                    style={{
                        ...shimmerStyle,
                        width,
                        height,
                        borderRadius: radius,
                        // Last row slightly shorter for a natural look when count > 1
                        ...(count > 1 && i === rows.length - 1 ? { width: "70%" } : {}),
                    }}
                />
            ))}
        </div>
    );
}

/**
 * SkeletonCard — a full card-shaped skeleton placeholder.
 */
export function SkeletonCard({ lines = 3 }) {
    return (
        <div className="card" style={{ marginBottom: ".875rem" }}>
            <SkeletonLoader height="1.1rem" width="60%" radius="4px" />
            <div style={{ marginTop: ".75rem" }}>
                <SkeletonLoader count={lines} height=".85rem" gap=".4rem" />
            </div>
        </div>
    );
}
