/**
 * PageContainer — standard page layout wrapper.
 *
 * Provides consistent max-width, padding, and background for all pages.
 *
 * Props:
 *   maxWidth: CSS value  (default "780px")
 *   padding:  CSS value  (default "2.5rem 1.5rem")
 *   center:   boolean    (default true — centers content)
 *   children
 */
import React from "react";

export default function PageContainer({
    maxWidth = "780px",
    padding = "2.5rem 1.5rem",
    center = true,
    children,
    style = {},
}) {
    return (
        <div
            style={{
                background: "var(--bg)",
                minHeight: "calc(100vh - 60px)",
                paddingBottom: "4rem",
            }}
        >
            <div
                style={{
                    maxWidth,
                    margin: center ? "0 auto" : undefined,
                    padding,
                    ...style,
                }}
            >
                {children}
            </div>
        </div>
    );
}
