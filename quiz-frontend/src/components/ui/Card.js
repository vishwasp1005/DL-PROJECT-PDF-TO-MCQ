/**
 * Card — standard white card wrapper.
 *
 * Props:
 *   sm: boolean — smaller padding (card-sm)
 *   highlight: boolean — adds a colored left-border accent
 *   className, style, children
 */
import React from "react";

export default function Card({ sm = false, highlight = false, className = "", style = {}, children }) {
    const cls = ["card", sm ? "card-sm" : "", className].filter(Boolean).join(" ");

    return (
        <div
            className={cls}
            style={{
                ...(highlight ? { borderLeft: "3px solid var(--navy)" } : {}),
                ...style,
            }}
        >
            {children}
        </div>
    );
}
