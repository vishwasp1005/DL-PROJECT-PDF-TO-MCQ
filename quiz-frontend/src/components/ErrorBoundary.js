import React from "react";

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error("ErrorBoundary caught:", error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div style={{
                minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)",
                padding: "2rem", fontFamily: "Inter, system-ui, sans-serif",
            }}>
                <div style={{ maxWidth: "480px", textAlign: "center" }}>
                    {/* Icon */}
                    <div style={{
                        width: "80px", height: "80px", margin: "0 auto 1.5rem",
                        borderRadius: "24px",
                        background: "linear-gradient(135deg, rgba(239,68,68,.1), rgba(239,68,68,.05))",
                        border: "1.5px solid rgba(239,68,68,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "2.2rem",
                    }}>⚠️</div>

                    <h1 style={{ fontSize: "1.75rem", fontWeight: 900, color: "#1B2B4B", marginBottom: ".5rem", letterSpacing: "-.03em" }}>
                        Oops! Something broke
                    </h1>
                    <p style={{ color: "#6B7280", fontSize: ".9rem", lineHeight: 1.7, marginBottom: "1.75rem" }}>
                        An unexpected error occurred. Your quiz data is safe — just reload to continue.
                    </p>

                    {/* Error detail (dev only) */}
                    {process.env.NODE_ENV === "development" && this.state.error && (
                        <details style={{
                            textAlign: "left", background: "#FEF2F2", border: "1px solid #FECACA",
                            borderRadius: "10px", padding: "1rem", marginBottom: "1.5rem",
                            fontSize: ".75rem", color: "#7F1D1D", fontFamily: "monospace",
                        }}>
                            <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: ".5rem" }}>
                                Error details
                            </summary>
                            {this.state.error.toString()}
                        </details>
                    )}

                    <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap" }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: ".75rem 1.75rem", borderRadius: "999px",
                                background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                                border: "none", color: "#fff", fontWeight: 700,
                                fontSize: ".88rem", cursor: "pointer",
                                boxShadow: "0 4px 16px rgba(99,102,241,.4)",
                            }}>
                            🔄 Reload Page
                        </button>
                        <button
                            onClick={() => { window.location.href = "/home"; }}
                            style={{
                                padding: ".75rem 1.75rem", borderRadius: "999px",
                                background: "#fff", border: "1.5px solid #E5E7EB",
                                color: "#374151", fontWeight: 600,
                                fontSize: ".88rem", cursor: "pointer",
                            }}>
                            🏠 Go Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
