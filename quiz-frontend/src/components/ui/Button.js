/**
 * Button — reusable button primitive.
 *
 * Props:
 *   variant: "primary" | "outline" | "danger" | "ghost"  (default: "primary")
 *   size:    "sm" | "md" | "lg"                           (default: "md")
 *   full:    boolean — stretch to full width
 *   loading: boolean — shows spinner and disables
 *   disabled, onClick, children, className, style ...all forwarded
 */
import React from "react";

const variantClass = {
    primary: "btn btn-primary",
    outline: "btn btn-outline",
    danger: "btn btn-danger",
    ghost: "btn btn-ghost",
};

const sizeStyle = {
    sm: { fontSize: ".78rem", padding: ".35rem .8rem" },
    md: {},
    lg: { fontSize: "1rem", padding: ".875rem 2rem" },
};

export default function Button({
    variant = "primary",
    size = "md",
    full = false,
    loading = false,
    disabled = false,
    children,
    className = "",
    style = {},
    ...rest
}) {
    const cls = [
        variantClass[variant] || variantClass.primary,
        full ? "btn-full" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <button
            className={cls}
            disabled={disabled || loading}
            style={{ ...sizeStyle[size], ...style }}
            {...rest}
        >
            {loading ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: ".5rem" }}>
                    <span
                        style={{
                            width: "14px", height: "14px", border: "2px solid currentColor",
                            borderTopColor: "transparent", borderRadius: "50%",
                            animation: "spin 0.7s linear infinite", display: "inline-block",
                        }}
                    />
                    {children}
                </span>
            ) : children}
        </button>
    );
}
