
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { generateQuiz, analyzePDF } from "../services/quizService";
import { useAuthContext } from "../context/AuthContext";

const PDF_META_KEY = "qf_last_pdf";

const Q_TYPES = [
    { id: "MCQ", label: "Multiple Choice", desc: "Generate 4-option questions" },
    { id: "TF",  label: "True / False",    desc: "Fact-based statements" },
    { id: "FIB", label: "Fill in Blank",   desc: "Complete the sentence" },
];

function savePdfMeta(meta) {
    try { localStorage.setItem(PDF_META_KEY, JSON.stringify(meta)); } catch { }
}
function loadPdfMeta() {
    try { return JSON.parse(localStorage.getItem(PDF_META_KEY) || "null"); } catch { return null; }
}
export function clearPdfMeta() { localStorage.removeItem(PDF_META_KEY); }

export default function GeneratePage() {
    const navigate     = useNavigate();
    const fileInputRef = useRef();
    const { isGuest, serverWaking } = useAuthContext();
    const saved = loadPdfMeta();

    const [file,          setFile]          = useState(null);
    const [pdfMeta,       setPdfMeta]       = useState(saved);
    const [dragging,      setDragging]      = useState(false);
    const [numQuestions,  setNumQuestions]  = useState(saved?.numQuestions || 10);
    const [maxQ,          setMaxQ]          = useState(saved?.maxQ || 50);
    const [wordCount,     setWordCount]     = useState(saved?.wordCount || null);
    const [charCount,     setCharCount]     = useState(saved?.charCount || null);
    const [qTypes,        setQTypes]        = useState(saved?.qTypes || ["MCQ"]);
    const [difficulty,    setDifficulty]    = useState(saved?.difficulty || "Medium");
    const [detectedDiff,  setDetectedDiff]  = useState(saved?.detectedDiff || null);
    const [topics,        setTopics]        = useState(saved?.topics || []);
    const [selectedTopic, setSelectedTopic] = useState(saved?.selectedTopic || "");
    const [loading,       setLoading]       = useState(false);
    const [extracting,    setExtracting]    = useState(false);
    const [uploadPct,     setUploadPct]     = useState(0);
    const [progress,      setProgress]      = useState(0);
    const [genPhase,      setGenPhase]      = useState(0);
    const [genPhaseLabel, setGenPhaseLabel] = useState("");   // NEW: real chunk progress text
    const [error,         setError]         = useState("");
    const [generated,     setGenerated]     = useState(null);
    const [detailedExp,   setDetailedExp]   = useState(saved?.detailedExp ?? true);
    const [toast,         setToast]         = useState("");

    const timerRefs = useRef(new Set());
    const clearAllTimers = useCallback(() => {
        timerRefs.current.forEach(id => { clearInterval(id); clearTimeout(id); });
        timerRefs.current.clear();
    }, []);
    useEffect(() => () => clearAllTimers(), [clearAllTimers]);

    useEffect(() => {
        if (!pdfMeta) return;
        savePdfMeta({ ...pdfMeta, numQuestions, qTypes, difficulty, detectedDiff, detailedExp, selectedTopic });
    }, [numQuestions, qTypes, difficulty, detectedDiff, detailedExp, selectedTopic, pdfMeta]);

    const toggleType = (id) => setQTypes(prev =>
        prev.includes(id) ? (prev.length > 1 ? prev.filter(t => t !== id) : prev) : [...prev, id]
    );

    /* ── File selection ── */
    const handleFileSelect = useCallback(async (selectedFile) => {
        if (!selectedFile || selectedFile.type !== "application/pdf") {
            setError("Please upload a valid PDF file."); return;
        }
        setFile(selectedFile); setError(""); setExtracting(true);
        setGenerated(null); setWordCount(null); setCharCount(null);
        setMaxQ(50); setNumQuestions(10);

        const baseMeta = { name: selectedFile.name, size: selectedFile.size };
        try {
            if (!isGuest) {
                let analyzeData = null;
                try { analyzeData = await analyzePDF(selectedFile); }
                catch (e) { console.warn("[Generate] Analyze (non-fatal):", e.message); }

                if (analyzeData) {
                    const { max_questions, detected_difficulty, word_count, char_count, topics: topicList } = analyzeData;
                    setMaxQ(max_questions); setNumQuestions(Math.min(10, max_questions));
                    setDetectedDiff(detected_difficulty); setDifficulty(detected_difficulty);
                    setWordCount(word_count); setCharCount(char_count);
                    setTopics(topicList || []); setSelectedTopic("");
                    const richMeta = {
                        name: selectedFile.name, size: selectedFile.size,
                        maxQ: max_questions, numQuestions: Math.min(10, max_questions),
                        wordCount: word_count, charCount: char_count,
                        detectedDiff: detected_difficulty, difficulty: detected_difficulty,
                        topics: topicList || [], qTypes: ["MCQ"], selectedTopic: "", detailedExp: true,
                    };
                    savePdfMeta(richMeta); setPdfMeta(richMeta);
                } else { savePdfMeta(baseMeta); setPdfMeta(baseMeta); }
            } else { savePdfMeta(baseMeta); setPdfMeta(baseMeta); }
        } catch (e) {
            savePdfMeta(baseMeta); setPdfMeta(baseMeta);
        } finally { setExtracting(false); }
    }, [isGuest]);

    const handleClearPdf = () => {
        setFile(null); setPdfMeta(null); localStorage.removeItem(PDF_META_KEY);
        setGenerated(null); setWordCount(null); setCharCount(null);
        setMaxQ(50); setNumQuestions(10); setTopics([]); setSelectedTopic("");
        setDetectedDiff(null); setDifficulty("Medium"); setError("");
    };

    const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0]); };

    /* ── Generate ── */
    const handleGenerate = async () => {
        if (!file)   { setError("Please select a PDF file first."); return; }
        if (isGuest) { setError("Guest mode: please sign up to use AI generation."); return; }

        setError(""); setLoading(true); setProgress(5); setGenPhase(1);
        setUploadPct(0); setGenPhaseLabel("");
        clearAllTimers();

        // ── Phase 1 + 2: fast phases (parse + chunk) — still timer-based ────
        // These complete in <2 seconds on the backend. We animate them locally.
        const runFastPhase = (from, to, phase, durationMs) => {
            setGenPhase(phase);
            const steps = Math.ceil((to - from) / 3);
            const interval = Math.max(50, Math.floor(durationMs / steps));
            let current = from;
            const id = setInterval(() => {
                current = Math.min(current + 3, to);
                setProgress(current);
                if (current >= to) { clearInterval(id); timerRefs.current.delete(id); }
            }, interval);
            timerRefs.current.add(id);
        };

        runFastPhase(5, 20, 1, 800);
        const t1 = setTimeout(() => runFastPhase(20, 35, 2, 600), 900);
        const t2 = setTimeout(() => {
            setGenPhase(3);
            setGenPhaseLabel("Waiting for first chunk…");
        }, 1600);
        timerRefs.current.add(t1); timerRefs.current.add(t2);

        // ── onChunk: called by quizService for each SSE chunk event ──────────
        // This is the key change from v4. Progress is now driven by real data.
        // Formula: 35% (after phases 1+2) + (done/of) * 55% = 35–90%
        // The final 10% (90→100%) is set in the success handler.
        const onChunk = ({ done, of, count, q_type }) => {
            const realProgress = Math.round(35 + (done / of) * 55);
            setProgress(Math.min(realProgress, 90));
            setGenPhaseLabel(`Chunk ${done}/${of} complete — ${count} ${q_type} questions`);
        };

        try {
            const data = await generateQuiz({
                file, numQuestions, qType: qTypes.join(","), difficulty,
                topic: selectedTopic || undefined,
                onUploadProgress: ({ loaded, total }) => {
                    if (total) setUploadPct(Math.round((loaded / total) * 100));
                },
                onChunk,   // NEW: real SSE progress callback
            });

            clearAllTimers(); setProgress(100); setGenPhase(4); setGenPhaseLabel("");

            const questions     = data.questions || [];
            const quizSessionId = data.quiz_session_id;
            localStorage.setItem("qg_questions",  JSON.stringify(questions));
            localStorage.setItem("qg_session_id", String(quizSessionId));
            localStorage.setItem("qg_pdf_name",   file.name);
            setGenerated({ questions, quizSessionId, pdfName: file.name });
            setToast(`✅ ${questions.length} questions generated! Head to Study Mode to begin.`);
            timerRefs.current.add(setTimeout(() => setToast(""), 5000));

        } catch (e) {
            clearAllTimers();
            const status = e.response?.status;
            if (status === 401) return;
            const userMsg = e.userMessage;
            const detail  = e.response?.data?.detail;
            setError(
                userMsg                              ? userMsg :
                detail && detail !== "Invalid token" ? detail :
                status === 422 ? "Invalid request — check your file or settings." :
                status === 413 ? "PDF too large. Try a smaller file (max 20 MB)." :
                status === 429 ? "AI rate limit reached. Please wait 30 seconds and retry." :
                status === 503 ? "AI service temporarily unavailable. Please retry in a moment." :
                status === 504 ? "Generation timed out. Try fewer questions or a smaller PDF." :
                                 "Generation failed. Please try again."
            );
        } finally {
            setUploadPct(0);
            timerRefs.current.add(setTimeout(() => { setLoading(false); setProgress(0); setGenPhase(0); setGenPhaseLabel(""); }, 600));
        }
    };

    const goTo = (path) => {
        if (!generated) return;
        navigate(path, { state: { questions: generated.questions, quizSessionId: generated.quizSessionId, pdfName: generated.pdfName } });
    };

    const GEN_STEPS = [
        { id: 1, label: "Parsing PDF" }, { id: 2, label: "Chunking" },
        { id: 3, label: "AI Generating" }, { id: 4, label: "Saving" },
    ];

    return (
        <div style={{ background: "var(--bg)", minHeight: "calc(100vh - 60px)", paddingBottom: "4rem" }}>
            <div className="generate-page-inner">
                <div className="breadcrumb" style={{ marginBottom: ".75rem" }}>WORKSPACE <span>›</span> CREATION ENGINE</div>
                <h1 className="page-title" style={{ marginBottom: ".35rem" }}>Generate Study Material</h1>
                <p className="page-subtitle" style={{ marginBottom: "2rem" }}>
                    Upload your lecture notes or textbooks to create AI-powered practice quizzes and flashcards.
                </p>

                {error && <div className="alert alert-error">{error}</div>}

                <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
                    onChange={(e) => handleFileSelect(e.target.files[0])} />

                {!file && !pdfMeta ? (
                    <div className={`upload-zone${dragging ? " dragging" : ""}`} style={{ marginBottom: "1.5rem" }}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
                        <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--navy-muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto .875rem", fontSize: "1.5rem" }}>📤</div>
                        <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--navy)", marginBottom: ".5rem" }}>Upload your PDF</div>
                        <p style={{ fontSize: ".85rem", color: "var(--text-muted)", maxWidth: "320px", margin: "0 auto .875rem", lineHeight: 1.65 }}>
                            Drag and drop your study material here, or click to browse. Supports PDFs up to 25MB.
                        </p>
                        <button className="btn btn-primary" style={{ margin: "0 auto", pointerEvents: "none" }}>📎 Select Document</button>
                    </div>
                ) : (
                    <div className="card" style={{ marginBottom: "1.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <div style={{ fontSize: "1.5rem" }}>📄</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {file ? file.name : pdfMeta?.name}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem", marginTop: ".4rem" }}>
                                    <span style={{ fontSize: ".68rem", fontWeight: 600, background: "var(--surface)", color: "var(--text-muted)", padding: ".15rem .5rem", borderRadius: "999px", border: "1px solid var(--border)" }}>
                                        {((file?.size || pdfMeta?.size || 0) / 1024).toFixed(0)} KB
                                    </span>
                                    {(wordCount || pdfMeta?.wordCount) && (
                                        <span style={{ fontSize: ".68rem", fontWeight: 600, background: "var(--surface)", color: "var(--text-muted)", padding: ".15rem .5rem", borderRadius: "999px", border: "1px solid var(--border)" }}>
                                            {(wordCount || pdfMeta.wordCount).toLocaleString()} words
                                        </span>
                                    )}
                                    {(detectedDiff || pdfMeta?.detectedDiff) && (
                                        <span style={{
                                            fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: "999px",
                                            background: (detectedDiff || pdfMeta.detectedDiff) === "Easy" ? "var(--success-bg)" : (detectedDiff || pdfMeta.detectedDiff) === "Hard" ? "var(--danger-bg)" : "var(--warning-bg)",
                                            color: (detectedDiff || pdfMeta.detectedDiff) === "Easy" ? "var(--success)" : (detectedDiff || pdfMeta.detectedDiff) === "Hard" ? "var(--danger)" : "var(--warning)",
                                        }}>AI: {detectedDiff || pdfMeta.detectedDiff}</span>
                                    )}
                                    {extracting && <span style={{ fontSize: ".68rem", fontWeight: 600, color: "var(--accent)" }}>Analysing…</span>}
                                </div>
                                {!file && pdfMeta && (
                                    <div style={{ marginTop: ".4rem", fontSize: ".7rem", color: "var(--warning)", fontWeight: 600 }}>
                                        ⚠️ PDF not loaded — <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => fileInputRef.current?.click()}>Upload again</span> or Change.
                                    </div>
                                )}
                            </div>
                            <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={handleClearPdf}>Change</button>
                        </div>
                    </div>
                )}

                {file && !extracting && wordCount && (
                    <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
                            <div style={{ fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--text-light)" }}>📋 DOCUMENT ANALYSIS</div>
                            <div style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--success)" }}>✓ Successfully Parsed</div>
                        </div>
                        <div className="doc-stats-row" style={{ marginBottom: topics.length ? ".875rem" : "1.5rem" }}>
                            <div className="doc-stat-cell"><div className="doc-stat-label">Word Count</div><div className="doc-stat-value">{wordCount?.toLocaleString()}</div></div>
                            <div className="doc-stat-cell"><div className="doc-stat-label">Characters</div><div className="doc-stat-value">{charCount?.toLocaleString() ?? "—"}</div></div>
                            <div className="doc-stat-cell"><div className="doc-stat-label">File Size</div><div className="doc-stat-value">{(file.size / 1024 / 1024).toFixed(1)} MB</div></div>
                            <div className="doc-stat-cell"><div className="doc-stat-label">Max Questions</div><div className="doc-stat-value">{maxQ}</div></div>
                        </div>
                        {topics.length > 0 && (
                            <div style={{ marginBottom: "1.5rem" }}>
                                <div style={{ fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--text-light)", marginBottom: ".5rem" }}>
                                    📌 FOCUS TOPIC <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
                                    {["All Topics", ...topics].map(t => (
                                        <button key={t} onClick={() => setSelectedTopic(t === "All Topics" ? "" : t)} style={{
                                            padding: ".3rem .75rem", borderRadius: "999px", fontSize: ".72rem", fontWeight: 600,
                                            border: `1.5px solid ${(t === "All Topics" ? "" : t) === selectedTopic ? "var(--navy)" : "var(--border)"}`,
                                            background: (t === "All Topics" ? "" : t) === selectedTopic ? "var(--navy-muted)" : "var(--surface)",
                                            color: (t === "All Topics" ? "" : t) === selectedTopic ? "var(--navy)" : "var(--text-muted)",
                                            cursor: "pointer", transition: "all .12s",
                                        }}>{t}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {file && (
                    <div className="card" style={{ marginBottom: "1.5rem" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--navy)", marginBottom: ".25rem" }}>Question Configuration</div>
                                <div style={{ fontSize: ".8rem", color: "var(--text-muted)" }}>How many questions to generate.</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: ".3rem", background: "var(--navy)", color: "#fff", padding: ".4rem .875rem", borderRadius: "8px" }}>
                                <span style={{ fontSize: "1.375rem", fontWeight: 800 }}>{numQuestions}</span>
                                <span style={{ fontSize: ".65rem", fontWeight: 700, opacity: .7, textTransform: "uppercase", letterSpacing: ".08em" }}>QUESTIONS</span>
                            </div>
                        </div>
                        <input type="range" className="form-range" min={1} max={maxQ} value={numQuestions}
                            onChange={(e) => setNumQuestions(+e.target.value)}
                            style={{ width: "100%", marginBottom: ".5rem", accentColor: "var(--navy)" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".65rem", color: "var(--text-light)", fontWeight: 600, marginBottom: "1.25rem" }}>
                            <span>5</span>
                            {[15, 25, 35, 45].filter(t => t < maxQ).map(t => <span key={t}>{t}</span>)}
                            <span>{maxQ}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".875rem" }}>
                            {Q_TYPES.map(({ id, label, desc }) => (
                                <label key={id} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".7rem .875rem", borderRadius: "var(--radius-sm)", border: `1.5px solid ${qTypes.includes(id) ? "var(--navy)" : "var(--border)"}`, background: qTypes.includes(id) ? "var(--navy-muted)" : "var(--card)", cursor: "pointer", transition: "all .15s", minHeight: "48px" }}>
                                    <input type="checkbox" checked={qTypes.includes(id)} onChange={() => toggleType(id)} style={{ accentColor: "var(--navy)", width: "15px", height: "15px", flexShrink: 0 }} />
                                    <div><div style={{ fontWeight: 600, fontSize: ".85rem", color: "var(--navy)" }}>{label}</div><div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>{desc}</div></div>
                                </label>
                            ))}
                            <label style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".7rem .875rem", borderRadius: "var(--radius-sm)", border: `1.5px solid ${detailedExp ? "var(--navy)" : "var(--border)"}`, background: detailedExp ? "var(--navy-muted)" : "var(--card)", cursor: "pointer", transition: "all .15s", minHeight: "48px" }}>
                                <input type="checkbox" checked={detailedExp} onChange={() => setDetailedExp(p => !p)} style={{ accentColor: "var(--navy)", width: "15px", height: "15px", flexShrink: 0 }} />
                                <div><div style={{ fontWeight: 600, fontSize: ".85rem", color: "var(--navy)" }}>Detailed Explanations</div><div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>Include reasoning for each answer</div></div>
                            </label>
                        </div>
                    </div>
                )}

                {file && (
                    <div className="card" style={{ marginBottom: "1.5rem" }}>
                        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--navy)", marginBottom: ".875rem" }}>
                            Difficulty Level
                            {detectedDiff && <span style={{ marginLeft: ".5rem", fontSize: ".72rem", fontWeight: 500, color: "var(--text-muted)" }}>· AI detected: <strong style={{ color: detectedDiff === "Easy" ? "var(--success)" : detectedDiff === "Hard" ? "var(--danger)" : "var(--warning)" }}>{detectedDiff}</strong></span>}
                        </div>
                        <div style={{ display: "flex", gap: ".5rem" }}>
                            {["Easy", "Medium", "Hard"].map(d => (
                                <button key={d} onClick={() => setDifficulty(d)} style={{
                                    flex: 1, padding: ".55rem", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: ".82rem",
                                    border: `1.5px solid ${difficulty === d ? (d === "Easy" ? "var(--success)" : d === "Hard" ? "var(--danger)" : "var(--warning)") : "var(--border)"}`,
                                    background: difficulty === d ? (d === "Easy" ? "var(--success-bg)" : d === "Hard" ? "var(--danger-bg)" : "var(--warning-bg)") : "var(--card)",
                                    color: difficulty === d ? (d === "Easy" ? "var(--success)" : d === "Hard" ? "var(--danger)" : "var(--warning)") : "var(--text-muted)",
                                    cursor: "pointer", transition: "all .15s",
                                }}>{d === "Easy" ? "🟢" : d === "Hard" ? "🔴" : "🟡"} {d}</button>
                            ))}
                        </div>
                    </div>
                )}

                {serverWaking && (
                    <div style={{ background: "rgba(251,191,36,.12)", border: "1px solid rgba(251,191,36,.4)", borderRadius: "10px", padding: ".75rem 1rem", marginBottom: "1rem", fontSize: ".82rem", color: "#92400E", display: "flex", alignItems: "center", gap: ".625rem" }}>
                        <span style={{ fontSize: "1.1rem", animation: "spin .8s linear infinite", display: "inline-block" }}>⚙</span>
                        <div><strong>Server is waking up…</strong><div style={{ opacity: .8, marginTop: ".1rem" }}>Render free-tier servers sleep after inactivity. Your request will proceed automatically.</div></div>
                    </div>
                )}

                {file && (
                    <button className="btn btn-primary btn-full" style={{ fontSize: ".95rem", marginBottom: "1.25rem", minHeight: "52px" }}
                        disabled={loading || extracting || isGuest} onClick={handleGenerate}>
                        {loading ? "✦ Generating…" : "✦ Generate Study Questions"}
                    </button>
                )}

                {loading && (
                    <div className="gen-progress-wrap">
                        {uploadPct > 0 && uploadPct < 100 && (
                            <div style={{ marginBottom: ".75rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: ".35rem" }}>
                                    <span>⬆ Uploading PDF…</span><span>{uploadPct}%</span>
                                </div>
                                <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px" }}>
                                    <div style={{ height: "100%", width: `${uploadPct}%`, background: "var(--accent)", borderRadius: "2px", transition: "width .2s" }} />
                                </div>
                            </div>
                        )}
                        <div className="gen-progress-header">
                            <div className="gen-progress-title">
                                <span style={{ animation: "spin .8s linear infinite", display: "inline-block", fontSize: "1rem" }}>⚙</span>
                                {genPhase === 1 && "Parsing PDF content…"}
                                {genPhase === 2 && "Splitting into chunks…"}
                                {/* Phase 3: show real chunk progress label when available */}
                                {genPhase === 3 && (genPhaseLabel || "AI generating questions…")}
                                {genPhase === 4 && "Saving to your library…"}
                                {genPhase === 0 && "Initialising…"}
                            </div>
                            <div className="gen-progress-pct">{progress}%</div>
                        </div>
                        <div className="gen-progress-track">
                            <div className="gen-progress-fill" style={{ width: `${progress}%`, transition: "width .4s ease" }} />
                        </div>
                        <div className="gen-steps">
                            {GEN_STEPS.map(step => {
                                const state = genPhase > step.id ? "done" : genPhase === step.id ? "active" : "";
                                return (
                                    <div key={step.id} className={`gen-step${state ? " " + state : ""}`}>
                                        <div className="gen-step-dot" />{state === "done" ? "✓ " : ""}{step.label}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="gen-eta">
                            {genPhase <= 2 ? "Analysing document structure…"
                                : genPhase === 3 ? "Progress updates as each chunk completes — large PDFs take 1–3 minutes"
                                : "Almost done!"}
                        </div>
                    </div>
                )}

                {isGuest && file && (
                    <div className="alert alert-info">
                        🔒 AI generation requires an account.{" "}
                        <span style={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("/register")}>Sign up free →</span>
                    </div>
                )}

                {toast && (
                    <div style={{ position: "fixed", bottom: "2rem", left: "50%", transform: "translateX(-50%)", background: "#1B2B4B", color: "#fff", padding: ".875rem 1.75rem", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,.25)", fontSize: ".875rem", fontWeight: 600, zIndex: 9999, display: "flex", alignItems: "center", gap: ".75rem", animation: "scaleIn .25s ease" }}>
                        <span>{toast}</span>
                        <button onClick={() => setToast("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", cursor: "pointer", fontSize: "1rem", padding: 0 }}>✕</button>
                    </div>
                )}

                {generated && (
                    <div className="card" style={{ marginTop: "1.5rem", border: "1.5px solid var(--success)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                            <div>
                                <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: "1rem" }}>✅ {generated.questions.length} Questions Generated</div>
                                <div style={{ fontSize: ".8rem", color: "var(--text-muted)", marginTop: ".125rem" }}>Ready — head to Study Mode to begin!</div>
                            </div>
                            <div className="badge badge-success">Ready</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".625rem" }}>
                            <button className="btn btn-primary" onClick={() => goTo("/study")}>📚 Study Mode</button>
                            <button className="btn btn-outline" onClick={() => { setGenerated(null); setFile(null); setWordCount(null); setCharCount(null); setDetectedDiff(null); setTopics([]); }}>🔄 Regenerate</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
