import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useThemeContext } from "../context/ThemeContext";

function useIsMobile(bp = 768) {
    const [m, setM] = useState(() => window.innerWidth <= bp);
    useEffect(() => {
        const fn = () => setM(window.innerWidth <= bp);
        window.addEventListener("resize", fn);
        return () => window.removeEventListener("resize", fn);
    }, [bp]);
    return m;
}

export default function Navbar() {
    const navigate  = useNavigate();
    const location  = useLocation();
    const token     = localStorage.getItem("token");
    const isGuest   = localStorage.getItem("isGuest") === "true";
    const username  = localStorage.getItem("username") || "";
    const { theme, toggleTheme } = useThemeContext();
    const isMobile  = useIsMobile(768);
    const [open, setOpen]   = useState(false);

    // Close menu on route change
    useEffect(() => setOpen(false), [location.pathname]);
    // Prevent body scroll when menu open
    useEffect(() => {
        document.body.style.overflow = (isMobile && open) ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [isMobile, open]);

    const authPages = ["/login", "/register", "/"];
    if (!token || authPages.includes(location.pathname)) return null;

    const isActive = (p) => location.pathname === p;
    const isDark   = theme === "dark";

    const handleLogout = () => {
        ["token","username","isGuest","qf_last_pdf"].forEach(k => localStorage.removeItem(k));
        setOpen(false);
        navigate("/login");
    };

    const navLinks = [
        { label: "Home",      path: "/home",      icon: "🏠" },
        { label: "Generate",  path: "/generate",  icon: "✦"  },
        { label: "Study",     path: "/study",      icon: "📚" },
        { label: "Test",      path: "/test",       icon: "✏️" },
        { label: "Dashboard", path: "/dashboard", icon: "📊" },
        { label: "About",     path: "/about",      icon: "ℹ️" },
    ];

    const navBg  = isDark ? "#0F172A" : "#ffffff";
    const border = isDark ? "rgba(255,255,255,.08)" : "#E5E7EB";
    const muted  = isDark ? "#94A3B8" : "#6B7280";
    const hoverBg  = isDark ? "rgba(255,255,255,.07)" : "#F9FAFB";
    const activeBg = isDark ? "#1E293B" : "#FFFFFF";
    const ACCENT   = "#4F6AF5";

    return (
        <>
        {/* ── Sticky top bar ── */}
        <nav style={{
            height: "60px", position: "sticky", top: 0, zIndex: 300,
            background: navBg,
            borderBottom: `1px solid ${border}`,
            boxShadow: "0 1px 6px rgba(0,0,0,.06)",
        }}>
            <div style={{
                maxWidth: "1200px", margin: "0 auto",
                height: "100%", display: "flex", alignItems: "center",
                padding: "0 1.25rem", gap: ".75rem",
            }}>

                {/* Brand */}
                <div onClick={() => navigate("/home")} style={{
                    display: "flex", alignItems: "center", gap: ".55rem",
                    cursor: "pointer", flexShrink: 0,
                }}>
                    <div style={{
                        width: "34px", height: "34px", borderRadius: "10px",
                        background: "linear-gradient(135deg,#1B2B4B,#4F6AF5)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: ".95rem", fontWeight: 900,
                    }}>Q</div>
                    <div style={{ lineHeight: 1.2 }}>
                        <div style={{
                            fontWeight: 800, fontSize: ".85rem",
                            color: isDark ? "#F1F5F9" : "#1B2B4B",
                            letterSpacing: "-.01em", whiteSpace: "nowrap",
                        }}>
                            QuizGenius <span style={{ color: ACCENT }}>AI</span>
                        </div>
                        {!isMobile && (
                            <div style={{ fontSize: ".52rem", fontWeight: 600, color: muted, textTransform: "uppercase", letterSpacing: ".1em" }}>
                                AI Study Platform
                            </div>
                        )}
                    </div>
                </div>

                {/* Desktop center nav */}
                {!isMobile && (
                    <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: ".2rem" }}>
                        {navLinks.map(({ label, path }) => (
                            <button key={path} onClick={() => navigate(path)} style={{
                                padding: ".32rem .8rem", borderRadius: "999px", border: "none",
                                cursor: "pointer", fontSize: ".8rem",
                                fontWeight: isActive(path) ? 700 : 500,
                                background: isActive(path) ? "#1B2B4B" : "transparent",
                                color: isActive(path) ? "#fff" : muted, transition: "all .15s",
                            }}
                                onMouseEnter={e => { if (!isActive(path)) { e.target.style.background = hoverBg; e.target.style.color = isDark ? "#F1F5F9" : "#1B2B4B"; } }}
                                onMouseLeave={e => { if (!isActive(path)) { e.target.style.background = "transparent"; e.target.style.color = muted; } }}
                            >{label}</button>
                        ))}
                    </div>
                )}

                {/* Right controls */}
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginLeft: "auto", flexShrink: 0 }}>

                    {!isMobile && (
                        <kbd onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }))}
                            style={{
                                padding: ".18rem .5rem", borderRadius: "6px", cursor: "pointer",
                                background: isDark ? "rgba(255,255,255,.08)" : "#F3F4F6",
                                border: `1px solid ${isDark ? "rgba(255,255,255,.12)" : "#E5E7EB"}`,
                                fontSize: ".62rem", fontWeight: 700, color: muted, fontFamily: "monospace",
                            }}>?</kbd>
                    )}

                    {/* Dark mode toggle */}
                    <button onClick={toggleTheme} style={{
                        width: "34px", height: "19px", borderRadius: "999px",
                        background: isDark ? "#6366F1" : "#E5E7EB",
                        border: "none", cursor: "pointer", position: "relative",
                        padding: 0, flexShrink: 0, transition: "background .25s",
                    }}>
                        <div style={{
                            position: "absolute", top: "1.5px",
                            left: isDark ? "16px" : "1.5px",
                            width: "16px", height: "16px", borderRadius: "50%",
                            background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)",
                            transition: "left .25s", display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: ".55rem",
                        }}>{isDark ? "🌙" : "☀️"}</div>
                    </button>

                    {!isMobile && !isGuest && (
                        <span style={{ fontSize: ".7rem", fontWeight: 600, color: muted }}>
                            {username}
                        </span>
                    )}

                    {/* Avatar */}
                    <div onClick={() => { navigate("/dashboard"); setOpen(false); }} title={username} style={{
                        width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: ".72rem", cursor: "pointer",
                        border: `2px solid ${isDark ? "rgba(255,255,255,.15)" : "#E5E7EB"}`,
                    }}>{username ? username.charAt(0).toUpperCase() : "G"}</div>

                    {!isMobile && (
                        <button onClick={handleLogout} title="Sign out" style={{
                            width: "30px", height: "30px", borderRadius: "50%",
                            border: `1px solid ${isDark ? "rgba(255,255,255,.12)" : "#E5E7EB"}`,
                            background: isDark ? "rgba(255,255,255,.06)" : "#F9FAFB",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", fontSize: ".85rem", color: muted,
                        }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#EF4444"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,.06)" : "#F9FAFB"; e.currentTarget.style.color = muted; }}
                        >↪</button>
                    )}

                    {/* Hamburger / X toggle (mobile only) */}
                    {isMobile && (
                        <button
                            onClick={() => setOpen(o => !o)}
                            aria-label={open ? "Close menu" : "Open menu"}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: "36px", height: "36px", borderRadius: "50%",
                                border: `1.5px solid ${open ? ACCENT : border}`,
                                background: open ? `${ACCENT}18` : "transparent",
                                cursor: "pointer", flexShrink: 0, transition: "all .2s",
                                fontSize: open ? "1.1rem" : "0",
                                // when closed render 3 bars via box-shadow trick
                                position: "relative",
                            }}
                        >
                            {open ? (
                                /* ✕ icon */
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M2 2l12 12M14 2L2 14" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                            ) : (
                                /* ☰ icon */
                                <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                                    <rect y="0"  width="18" height="2" rx="1" fill={isDark ? "#94A3B8" : "#374151"} />
                                    <rect y="6"  width="13" height="2" rx="1" fill={isDark ? "#94A3B8" : "#374151"} />
                                    <rect y="12" width="18" height="2" rx="1" fill={isDark ? "#94A3B8" : "#374151"} />
                                </svg>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </nav>

        {/* ── Mobile dropdown panel ── */}
        {isMobile && open && (
            <>
                {/* Backdrop */}
                <div onClick={() => setOpen(false)} style={{
                    position: "fixed", inset: 0, zIndex: 298,
                    background: "rgba(0,0,0,.35)",
                    backdropFilter: "blur(2px)",
                    animation: "pageFade .2s ease",
                }} />

                {/* Panel */}
                <div style={{
                    position: "fixed", top: "60px", left: 0, right: 0, zIndex: 299,
                    background: navBg,
                    borderRadius: "0 0 20px 20px",
                    boxShadow: "0 20px 60px rgba(0,0,0,.18)",
                    overflow: "hidden",
                    animation: "menuSlide .25s cubic-bezier(.22,.61,.36,1)",
                    transformOrigin: "top center",
                }}>
                    {/* Panel header row */}
                    <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "1rem 1.25rem",
                        borderBottom: `1px solid ${border}`,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                            <div style={{
                                width: "28px", height: "28px", borderRadius: "8px",
                                background: "linear-gradient(135deg,#1B2B4B,#4F6AF5)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#fff", fontWeight: 900, fontSize: ".8rem",
                            }}>Q</div>
                            <span style={{ fontWeight: 800, fontSize: ".9rem", color: isDark ? "#F1F5F9" : "#1B2B4B" }}>
                                QuizGenius <span style={{ color: ACCENT }}>AI</span>
                            </span>
                        </div>
                        <button onClick={() => setOpen(false)} style={{
                            width: "32px", height: "32px", borderRadius: "50%",
                            border: `1.5px solid ${ACCENT}`,
                            background: `${ACCENT}18`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                        }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M2 2l12 12M14 2L2 14" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>

                    {/* Nav links */}
                    <div style={{ padding: ".75rem .75rem 0" }}>
                        {navLinks.map(({ label, path, icon }) => (
                            <button
                                key={path}
                                onClick={() => navigate(path)}
                                style={{
                                    display: "flex", alignItems: "center", gap: ".875rem",
                                    width: "100%", padding: ".875rem 1rem",
                                    marginBottom: ".25rem", borderRadius: "12px", border: "none",
                                    cursor: "pointer", textAlign: "left",
                                    background: isActive(path) ? activeBg : "transparent",
                                    boxShadow: isActive(path) ? "0 2px 8px rgba(0,0,0,.06)" : "none",
                                    position: "relative", transition: "background .15s",
                                }}
                                onMouseEnter={e => { if (!isActive(path)) e.currentTarget.style.background = hoverBg; }}
                                onMouseLeave={e => { if (!isActive(path)) e.currentTarget.style.background = "transparent"; }}
                            >
                                {/* Active left bar */}
                                {isActive(path) && (
                                    <div style={{
                                        position: "absolute", left: 0, top: "20%", bottom: "20%",
                                        width: "3px", borderRadius: "0 3px 3px 0",
                                        background: ACCENT,
                                    }} />
                                )}
                                <span style={{ fontSize: "1rem", flexShrink: 0, width: "22px", textAlign: "center" }}>{icon}</span>
                                <span style={{
                                    fontSize: ".95rem",
                                    fontWeight: isActive(path) ? 700 : 500,
                                    color: isActive(path) ? (isDark ? "#F1F5F9" : "#1B2B4B") : muted,
                                    letterSpacing: "-.01em",
                                }}>{label}</span>
                                {/* Active underline dot */}
                                {isActive(path) && (
                                    <div style={{
                                        marginLeft: "auto",
                                        width: "6px", height: "6px", borderRadius: "50%",
                                        background: ACCENT,
                                    }} />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: "1rem 1.25rem 1.25rem",
                        borderTop: `1px solid ${border}`,
                        marginTop: ".5rem",
                        display: "flex", flexDirection: "column", gap: ".625rem",
                    }}>
                        {/* User info */}
                        <div style={{ display: "flex", alignItems: "center", gap: ".625rem", padding: ".5rem 0" }}>
                            <div style={{
                                width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                                background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 700, fontSize: ".78rem",
                            }}>{username ? username.charAt(0).toUpperCase() : "G"}</div>
                            <div>
                                <div style={{ fontSize: ".82rem", fontWeight: 700, color: isDark ? "#F1F5F9" : "#1B2B4B" }}>
                                    {username || "Guest"}
                                </div>
                                <div style={{ fontSize: ".68rem", color: muted }}>
                                    {isGuest ? "⚡ Guest mode" : "Logged in"}
                                </div>
                            </div>
                        </div>

                        {/* Sign out button */}
                        <button onClick={handleLogout} style={{
                            width: "100%", padding: ".75rem 1rem",
                            borderRadius: "12px",
                            border: "none", cursor: "pointer",
                            background: "linear-gradient(135deg,#EF4444,#DC2626)",
                            color: "#fff", fontWeight: 700, fontSize: ".88rem",
                            letterSpacing: ".01em",
                            boxShadow: "0 4px 12px rgba(239,68,68,.3)",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: ".5rem",
                            transition: "opacity .15s",
                        }}
                            onMouseEnter={e => e.currentTarget.style.opacity = ".9"}
                            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                        >
                            Sign Out →
                        </button>
                    </div>
                </div>

                {/* Slide in animation */}
                <style>{`
                    @keyframes menuSlide {
                        from { opacity: 0; transform: translateY(-12px) scaleY(.96); }
                        to   { opacity: 1; transform: translateY(0)       scaleY(1); }
                    }
                `}</style>
            </>
        )}
        </>
    );
}
