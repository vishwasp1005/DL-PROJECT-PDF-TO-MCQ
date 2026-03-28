/**
 * AITutorChat — Premium Groq-powered AI tutor.
 * Full redesign: gradient mesh, per-color quick-action cards,
 * slide-in message bubbles, typing indicator, glassmorphism input.
 */
import React, { useState, useRef, useEffect } from "react";
import API from "../../api";

/* ── Quick prompts with individual accent colours ──────────────── */
const QUICK_PROMPTS = [
    {
        icon: "💡", label: "Explain this question",
        msg: "Can you explain this question and what concept it's testing?",
        color: "#F59E0B", glow: "rgba(245,158,11,.35)",
        bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.25)",
    },
    {
        icon: "✅", label: "Why is that the answer?",
        msg: "Why is that the correct answer? Can you explain the reasoning?",
        color: "#10B981", glow: "rgba(16,185,129,.35)",
        bg: "rgba(16,185,129,.12)", border: "rgba(16,185,129,.25)",
    },
    {
        icon: "📖", label: "Give me an example",
        msg: "Can you give me a real-world example that helps understand this concept?",
        color: "#60A5FA", glow: "rgba(96,165,250,.35)",
        bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.25)",
    },
    {
        icon: "🔑", label: "Key takeaway",
        msg: "What's the most important thing to remember about this topic?",
        color: "#A78BFA", glow: "rgba(167,139,250,.35)",
        bg: "rgba(167,139,250,.12)", border: "rgba(167,139,250,.25)",
    },
];

/* ── Typing indicator ──────────────────────────────────────────── */
function TypingDots() {
    return (
        <div style={{ display: "flex", gap: "5px", padding: ".5rem .25rem", alignItems: "center" }}>
            {[0, 1, 2].map(i => (
                <div key={i} style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: "rgba(255,255,255,.7)",
                    animation: `bounce 0.9s ${i * 0.18}s ease-in-out infinite alternate`,
                }} />
            ))}
        </div>
    );
}

/* ── Single chat bubble ────────────────────────────────────────── */
function ChatBubble({ role, content }) {
    const isUser = role === "user";
    return (
        <div style={{
            display: "flex",
            justifyContent: isUser ? "flex-end" : "flex-start",
            alignItems: "flex-end",
            gap: ".5rem",
            animation: "fadeInUp .25s ease",
        }}>
            {/* AI avatar */}
            {!isUser && (
                <div style={{
                    width: "28px", height: "28px", borderRadius: "10px", flexShrink: 0,
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    boxShadow: "0 0 10px rgba(99,102,241,.5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ".85rem",
                }}>🤖</div>
            )}

            {/* Bubble */}
            <div style={{
                maxWidth: "80%",
                padding: ".65rem 1rem",
                borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: isUser
                    ? "linear-gradient(135deg, #6366F1, #8B5CF6)"
                    : "rgba(255,255,255,.09)",
                backdropFilter: !isUser ? "blur(12px)" : "none",
                WebkitBackdropFilter: !isUser ? "blur(12px)" : "none",
                border: !isUser ? "1px solid rgba(255,255,255,.12)" : "none",
                boxShadow: isUser
                    ? "0 4px 16px rgba(99,102,241,.4)"
                    : "0 2px 8px rgba(0,0,0,.2)",
                color: "#fff",
                fontSize: ".83rem",
                lineHeight: 1.68,
                fontWeight: isUser ? 600 : 400,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
            }}>
                {content}
            </div>

            {/* User avatar */}
            {isUser && (
                <div style={{
                    width: "28px", height: "28px", borderRadius: "10px", flexShrink: 0,
                    background: "linear-gradient(135deg, #1B2B4B, #2D4270)",
                    border: "1.5px solid rgba(255,255,255,.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ".75rem", fontWeight: 800, color: "#fff",
                }}>
                    {(localStorage.getItem("username") || "U")[0].toUpperCase()}
                </div>
            )}
        </div>
    );
}

/* ── Main component ────────────────────────────────────────────── */
export default function AITutorChat({ question = null, context = "", collapsed = false }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput]       = useState("");
    const [loading, setLoading]   = useState(false);
    const [isOpen, setIsOpen]     = useState(!collapsed);
    const [hoveredPrompt, setHoveredPrompt] = useState(null);
    const bottomRef = useRef(null);
    const inputRef  = useRef(null);

    useEffect(() => {
        if (isOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isOpen]);

    const buildContext = () => {
        let ctx = context ? `Context: ${context}` : "";
        if (question) {
            ctx += `\nQuestion: "${question.question}"`;
            if (question.topic)      ctx += `\nTopic: ${question.topic}`;
            if (question.difficulty) ctx += `\nDifficulty: ${question.difficulty}`;
            if (question.options) {
                const opts = Array.isArray(question.options) ? question.options.join(", ") : question.options;
                ctx += `\nOptions: ${opts}`;
            }
            if (question.correct) ctx += `\nCorrect answer: Option ${question.correct}`;
        }
        return ctx;
    };

    const sendMessage = async (text) => {
        const msg = (text || input).trim();
        if (!msg || loading) return;

        setMessages(prev => [...prev, { role: "user", content: msg }]);
        setInput("");
        setLoading(true);

        try {
            const res = await API.post("/quiz/ask-tutor", {
                question: msg,
                context: buildContext(),
                history: messages.slice(-6),
            });
            const reply = res.data?.answer || "I couldn't generate a response. Please try again.";
            setMessages(prev => [...prev, { role: "assistant", content: reply }]);
        } catch {
            setMessages(prev => [...prev, { role: "assistant", content: generateFallback(msg, question) }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKey  = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
    const handleOpen = () => {
        setIsOpen(o => !o);
        if (!isOpen) setTimeout(() => inputRef.current?.focus(), 300);
    };

    const canSend = input.trim() && !loading;

    return (
        <div style={{
            borderRadius: "18px", overflow: "hidden",
            display: "flex", flexDirection: "column",
            boxShadow: "0 12px 40px rgba(99,102,241,.3), 0 0 0 1px rgba(99,102,241,.2)",
            height: isOpen ? "500px" : "auto",
            transition: "height .3s cubic-bezier(.4,0,.2,1)",
            position: "relative",
        }}>

            {/* ── Gradient mesh background ────────────────────────────── */}
            <div style={{
                position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
                background: "linear-gradient(160deg, #0F1938 0%, #1a1f3a 50%, #16213e 100%)",
                overflow: "hidden",
            }}>
                {/* Orb 1 */}
                <div style={{
                    position: "absolute", top: "-60px", left: "-40px",
                    width: "220px", height: "220px", borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(99,102,241,.25) 0%, transparent 70%)",
                    animation: "float 6s ease-in-out infinite",
                }} />
                {/* Orb 2 */}
                <div style={{
                    position: "absolute", bottom: "20px", right: "-30px",
                    width: "180px", height: "180px", borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(139,92,246,.2) 0%, transparent 70%)",
                    animation: "float 8s ease-in-out infinite reverse",
                }} />
            </div>

            {/* ── Header ──────────────────────────────────────────────── */}
            <button onClick={handleOpen} style={{
                position: "relative", zIndex: 1,
                display: "flex", alignItems: "center", gap: ".75rem",
                padding: "1rem 1.25rem",
                background: "rgba(255,255,255,.03)",
                borderBottom: isOpen ? "1px solid rgba(255,255,255,.07)" : "none",
                border: "none", cursor: "pointer", textAlign: "left",
                flexShrink: 0, width: "100%",
                backdropFilter: "blur(8px)",
            }}>
                {/* Glow avatar */}
                <div style={{
                    width: "42px", height: "42px", borderRadius: "14px",
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    boxShadow: "0 0 20px rgba(99,102,241,.7), inset 0 1px 0 rgba(255,255,255,.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.25rem", flexShrink: 0,
                    transition: "transform .2s, box-shadow .2s",
                }}>🤖</div>

                <div style={{ flex: 1 }}>
                    <div style={{
                        fontWeight: 800, color: "#fff", fontSize: ".92rem",
                        display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".15rem",
                    }}>
                        AI Tutor
                        {/* Gradient GROQ badge */}
                        <span style={{
                            fontSize: ".58rem", fontWeight: 700, letterSpacing: ".06em",
                            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                            color: "#fff", borderRadius: "999px",
                            padding: ".15rem .55rem",
                            boxShadow: "0 0 8px rgba(99,102,241,.5)",
                        }}>POWERED BY GROQ</span>
                    </div>
                    <div style={{ fontSize: ".68rem", letterSpacing: ".01em" }}>
                        <span className="text-gradient" style={{
                            background: "linear-gradient(90deg, #A78BFA, #60A5FA)",
                            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                            fontWeight: 600,
                        }}>
                            Ask anything — I explain, clarify &amp; teach
                        </span>
                    </div>
                </div>

                {/* Live dot + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexShrink: 0 }}>
                    <div style={{
                        width: "8px", height: "8px", borderRadius: "50%",
                        background: "#10B981",
                        boxShadow: "0 0 10px #10B981",
                        animation: "pulse-dot 2s ease-in-out infinite",
                    }} />
                    <span style={{ color: "rgba(255,255,255,.4)", fontSize: ".75rem" }}>
                        {isOpen ? "▲" : "▼"}
                    </span>
                </div>
            </button>

            {isOpen && (<>
                {/* ── Messages ──────────────────────────────────────────── */}
                <div style={{
                    position: "relative", zIndex: 1,
                    flex: 1, overflowY: "auto", padding: "1rem",
                    display: "flex", flexDirection: "column", gap: ".625rem",
                }}>
                    {messages.length === 0 && (
                        <div style={{ padding: ".25rem 0 .5rem", animation: "fadeInUp .35s ease" }}>
                            {/* Welcome hero */}
                            <div style={{ textAlign: "center", padding: ".75rem 0 1rem" }}>
                                <div style={{
                                    width: "68px", height: "68px", margin: "0 auto .875rem",
                                    borderRadius: "22px",
                                    background: "linear-gradient(135deg, rgba(99,102,241,.2), rgba(139,92,246,.2))",
                                    border: "1.5px solid rgba(167,139,250,.35)",
                                    boxShadow: "0 0 24px rgba(99,102,241,.3)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "2rem",
                                    animation: "float 3s ease-in-out infinite",
                                }}>🎓</div>
                                <div style={{ fontWeight: 800, color: "#fff", fontSize: "1rem", marginBottom: ".3rem" }}>
                                    Hi, I'm your AI Tutor!
                                </div>
                                <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.45)" }}>
                                    Ask me anything — I'll explain, teach, and guide you.
                                </div>
                            </div>

                            {/* Glowing quick-action cards */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
                                {QUICK_PROMPTS.map((p, i) => (
                                    <button key={i}
                                        onClick={() => sendMessage(p.msg)}
                                        onMouseEnter={() => setHoveredPrompt(i)}
                                        onMouseLeave={() => setHoveredPrompt(null)}
                                        style={{
                                            background: hoveredPrompt === i ? p.bg : "rgba(255,255,255,.05)",
                                            border: `1px solid ${hoveredPrompt === i ? p.border : "rgba(255,255,255,.1)"}`,
                                            borderRadius: "12px", padding: ".625rem .75rem",
                                            cursor: "pointer", textAlign: "left",
                                            display: "flex", alignItems: "center", gap: ".5rem",
                                            transition: "all .18s ease",
                                            boxShadow: hoveredPrompt === i ? `0 0 12px ${p.glow}` : "none",
                                            transform: hoveredPrompt === i ? "translateY(-1px)" : "none",
                                        }}>
                                        <span style={{
                                            fontSize: "1rem",
                                            filter: hoveredPrompt === i ? `drop-shadow(0 0 4px ${p.color})` : "none",
                                            transition: "filter .18s",
                                        }}>
                                            {p.icon}
                                        </span>
                                        <span style={{
                                            fontSize: ".72rem", fontWeight: 600, lineHeight: 1.35,
                                            color: hoveredPrompt === i ? p.color : "rgba(255,255,255,.75)",
                                            transition: "color .18s",
                                        }}>
                                            {p.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)}

                    {/* Typing indicator */}
                    {loading && (
                        <div style={{ display: "flex", alignItems: "flex-end", gap: ".5rem", animation: "fadeInUp .2s ease" }}>
                            <div style={{
                                width: "28px", height: "28px", borderRadius: "10px", flexShrink: 0,
                                background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                                boxShadow: "0 0 10px rgba(99,102,241,.5)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: ".85rem",
                            }}>🤖</div>
                            <div style={{
                                background: "rgba(255,255,255,.09)",
                                border: "1px solid rgba(255,255,255,.12)",
                                borderRadius: "18px 18px 18px 4px",
                                padding: ".45rem .875rem",
                                backdropFilter: "blur(12px)",
                            }}>
                                <TypingDots />
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* ── Input bar ─────────────────────────────────────────── */}
                <div style={{
                    position: "relative", zIndex: 1,
                    display: "flex", gap: ".6rem", padding: ".8rem 1rem",
                    borderTop: "1px solid rgba(255,255,255,.07)",
                    background: "rgba(0,0,0,.2)",
                    backdropFilter: "blur(12px)",
                    flexShrink: 0,
                }}>
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Ask anything about this topic..."
                        disabled={loading}
                        style={{
                            flex: 1, padding: ".65rem 1.1rem",
                            borderRadius: "999px",
                            border: "1.5px solid rgba(255,255,255,.15)",
                            background: "rgba(255,255,255,.07)",
                            backdropFilter: "blur(8px)",
                            fontSize: ".83rem", color: "#fff", outline: "none",
                            fontFamily: "inherit",
                            transition: "border-color .18s, box-shadow .18s",
                        }}
                        onFocus={e => {
                            e.target.style.borderColor = "rgba(99,102,241,.7)";
                            e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,.15)";
                        }}
                        onBlur={e => {
                            e.target.style.borderColor = "rgba(255,255,255,.15)";
                            e.target.style.boxShadow = "none";
                        }}
                    />
                    <button
                        onClick={() => sendMessage()}
                        disabled={!canSend}
                        style={{
                            background: canSend
                                ? "linear-gradient(135deg, #6366F1, #8B5CF6)"
                                : "rgba(255,255,255,.1)",
                            border: "none", borderRadius: "50%",
                            width: "40px", height: "40px", flexShrink: 0,
                            cursor: canSend ? "pointer" : "not-allowed",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all .2s ease",
                            boxShadow: canSend ? "0 4px 16px rgba(99,102,241,.6)" : "none",
                            transform: canSend ? "scale(1)" : "scale(.95)",
                        }}
                        onMouseEnter={e => { if (canSend) e.currentTarget.style.transform = "scale(1.08)"; }}
                        onMouseLeave={e => { if (canSend) e.currentTarget.style.transform = "scale(1)"; }}
                    >
                        <span style={{ color: "#fff", fontSize: "1.05rem", lineHeight: 1 }}>↑</span>
                    </button>
                </div>
            </>)}
        </div>
    );
}

/* ── Fallback when backend is unavailable ──────────────────────── */
function generateFallback(userText, question) {
    const lower = userText.toLowerCase();
    if (lower.includes("explain") || lower.includes("what") || lower.includes("how") || lower.includes("why")) {
        if (question?.topic) {
            return `Great question! This is about **${question.topic}**.\n\nThe correct answer is option **${question?.correct || "?"}**.\n\nI'd recommend reviewing \"${question.topic}\" in your study material. Focus on the *why* behind the answer — that's what sticks.`;
        }
        return "That's a great question! Break the concept down step by step. Focus on understanding the 'why' behind the answer rather than memorising it — that's what makes knowledge stick.";
    }
    if (lower.includes("answer") || lower.includes("correct")) {
        return question?.correct
            ? `The correct answer is option **${question.correct}**.\n\nTo truly understand it: think about *why* this option is right and how it connects to the broader concept being tested.`
            : "Check the highlighted green option in the question — it always shows the correct answer.";
    }
    if (lower.includes("example")) {
        return "Real-world examples are the best way to solidify abstract concepts! Think about how this topic appears in everyday situations — that mental connection makes it stick far better than pure memorisation. 🎯";
    }
    return "I'm here to help you master this topic! Ask me to explain the question, break down a concept, or give you a memory trick. 🎓";
}
