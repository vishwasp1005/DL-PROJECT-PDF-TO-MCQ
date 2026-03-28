import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useThemeContext } from "../context/ThemeContext";

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const token = localStorage.getItem("token");
    const isGuest = localStorage.getItem("isGuest") === "true";
    const username = localStorage.getItem("username") || "";
    const { theme, toggleTheme } = useThemeContext();

    // Never show navbar on auth pages
    const authPages = ["/login", "/register", "/"];
    if (!token || authPages.includes(location.pathname)) return null;

    const isActive = (path) => location.pathname === path;

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        localStorage.removeItem("isGuest");
        localStorage.removeItem("qf_last_pdf");
        navigate("/login");
    };

    const navLinks = [
        { label: "Home",      path: "/home" },
        { label: "Generate",  path: "/generate" },
        { label: "Study",     path: "/study" },
        { label: "Test",      path: "/test" },
        { label: "Dashboard", path: "/dashboard" },
        { label: "About",     path: "/about" },
    ];

    const initials = username ? username.charAt(0).toUpperCase() : "G";
    const isDark = theme === "dark";

    return (
        <nav style={{
            display: "flex", alignItems: "center",
            padding: "0 1.5rem", height: "60px",
            background: isDark ? "#0F172A" : "#fff",
            borderBottom: `1px solid ${isDark ? "rgba(255,255,255,.08)" : "#E5E7EB"}`,
            boxShadow: isDark ? "0 1px 4px rgba(0,0,0,.3)" : "0 1px 4px rgba(0,0,0,.06)",
            position: "sticky", top: 0, zIndex: 100,
            transition: "background .25s, border-color .25s",
        }}>

            {/* ── Brand ── */}
            <div onClick={() => navigate("/home")} style={{ display: "flex", alignItems: "center", gap: ".625rem", cursor: "pointer", flexShrink: 0 }}>
                <div style={{
                    width: "36px", height: "36px", borderRadius: "10px",
                    background: "linear-gradient(135deg, #1B2B4B, #4F6AF5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: "1rem", fontWeight: 900,
                }}>Q</div>
                <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontWeight: 800, fontSize: ".9rem", color: isDark ? "#F1F5F9" : "#1B2B4B", letterSpacing: "-.01em" }}>
                        QuizGenius <span style={{ color: "#4F6AF5" }}>AI</span>
                    </div>
                    <div style={{ fontSize: ".58rem", fontWeight: 600, color: isDark ? "#64748B" : "#9CA3AF", textTransform: "uppercase", letterSpacing: ".1em" }}>
                        AI Study Platform
                    </div>
                </div>
            </div>

            {/* ── Nav links — centred ── */}
            <div style={{
                position: "absolute", left: "50%", transform: "translateX(-50%)",
                display: "flex", alignItems: "center", gap: ".25rem",
            }}>
                {navLinks.map(({ label, path }) => (
                    <button key={path} onClick={() => navigate(path)} style={{
                        padding: ".35rem .875rem",
                        borderRadius: "999px",
                        border: "none",
                        cursor: "pointer",
                        fontSize: ".82rem",
                        fontWeight: isActive(path) ? 700 : 500,
                        background: isActive(path)
                            ? (isDark ? "#4F6AF5" : "#1B2B4B")
                            : "transparent",
                        color: isActive(path) ? "#fff" : (isDark ? "#94A3B8" : "#6B7280"),
                        transition: "all .15s",
                        whiteSpace: "nowrap",
                    }}
                        onMouseEnter={e => { if (!isActive(path)) { e.target.style.background = isDark ? "rgba(255,255,255,.08)" : "#F3F4F6"; e.target.style.color = isDark ? "#F1F5F9" : "#1B2B4B"; } }}
                        onMouseLeave={e => { if (!isActive(path)) { e.target.style.background = "transparent"; e.target.style.color = isDark ? "#94A3B8" : "#6B7280"; } }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Right side ── */}
            <div style={{ display: "flex", alignItems: "center", gap: ".625rem", marginLeft: "auto" }}>

                {/* Shortcut hint */}
                <kbd onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }))}
                    style={{
                        padding: ".2rem .55rem", borderRadius: "6px", cursor: "pointer",
                        background: isDark ? "rgba(255,255,255,.08)" : "#F3F4F6",
                        border: `1px solid ${isDark ? "rgba(255,255,255,.12)" : "#E5E7EB"}`,
                        fontSize: ".65rem", fontWeight: 700, color: isDark ? "#94A3B8" : "#9CA3AF",
                        fontFamily: "monospace",
                    }} title="Keyboard shortcuts (?)">?</kbd>

                {/* Dark mode toggle */}
                <button onClick={toggleTheme} title={isDark ? "Switch to light mode" : "Switch to dark mode"} style={{
                    width: "36px", height: "20px", borderRadius: "999px",
                    background: isDark ? "#6366F1" : "#E5E7EB",
                    border: "none", cursor: "pointer", position: "relative",
                    transition: "background .25s", padding: 0, flexShrink: 0,
                }}>
                    <div style={{
                        position: "absolute", top: "2px",
                        left: isDark ? "18px" : "2px",
                        width: "16px", height: "16px", borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,.25)",
                        transition: "left .25s ease",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: ".6rem",
                    }}>
                        {isDark ? "🌙" : "☀️"}
                    </div>
                </button>

                {isGuest && (
                    <span style={{
                        fontSize: ".65rem", fontWeight: 700, background: "#FEF3C7",
                        color: "#92400E", padding: ".2rem .6rem", borderRadius: "999px",
                        border: "1px solid #FDE68A",
                    }}>⚡ Guest</span>
                )}

                {/* Avatar circle */}
                <div title={username} onClick={() => navigate("/dashboard")} style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: ".75rem", cursor: "pointer",
                    border: `2px solid ${isDark ? "rgba(255,255,255,.15)" : "#E5E7EB"}`,
                }}>{initials}</div>

                {/* Sign out */}
                <button onClick={handleLogout} title="Sign out" style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    border: `1px solid ${isDark ? "rgba(255,255,255,.12)" : "#E5E7EB"}`,
                    background: isDark ? "rgba(255,255,255,.06)" : "#F9FAFB",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", fontSize: ".9rem",
                    color: isDark ? "#94A3B8" : "#6B7280",
                    transition: "all .15s",
                }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.color = "#EF4444"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,.06)" : "#F9FAFB"; e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,.12)" : "#E5E7EB"; e.currentTarget.style.color = isDark ? "#94A3B8" : "#6B7280"; }}
                >
                    ↪
                </button>
            </div>
        </nav>
    );
}
