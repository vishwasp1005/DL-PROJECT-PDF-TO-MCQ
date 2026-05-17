/**
 * quizService.js — all /quiz/* API calls (v5 — save-stable)
 */
import apiClient from "./apiClient";

const BASE_URL = "https://dl-project-pdf-to-mcq.onrender.com";

// ── PDF Analysis ──────────────────────────────────────────────────────────────
export async function analyzePDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post("/quiz/analyze", form, { timeout: 30_000 });
    return res.data;
}

 */
export async function generateQuiz({
    file,
    numQuestions,
    qType,
    difficulty,
    topic,
    onUploadProgress,
    onChunk,
}) {
    const topicParam = topic ? `&topic=${encodeURIComponent(topic)}` : "";
    const url = `${BASE_URL}/quiz/generate?num_questions=${numQuestions}&q_type=${encodeURIComponent(qType)}&difficulty=${difficulty}${topicParam}`;

    const token = localStorage.getItem("qf_access_token");
    const form  = new FormData();
    form.append("file", file);

    // Simulate upload progress
    let uploadDone = false;
    if (onUploadProgress) {
        let pct = 0;
        const iv = setInterval(() => {
            pct = Math.min(pct + 10, 95);
            onUploadProgress({ loaded: pct, total: 100 });
            if (pct >= 95 || uploadDone) clearInterval(iv);
        }, 200);
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 360_000);

    let response;
    try {
        response = await fetch(url, {
            method:      "POST",
            headers:     { "Authorization": `Bearer ${token}` },
            body:        form,
            signal:      controller.signal,
            credentials: "include",
        });
    } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === "AbortError") {
            const err = new Error("Generation timed out after 6 minutes. Try fewer questions.");
            err.userMessage = err.message;
            throw err;
        }
        const err = new Error("Network error during upload. Check your connection.");
        err.userMessage = err.message;
        throw err;
    } finally {
        uploadDone = true;
        if (onUploadProgress) onUploadProgress({ loaded: 100, total: 100 });
    }

    if (!response.ok) {
        clearTimeout(timeoutId);
        let detail = "";
        try { detail = (await response.json()).detail || ""; } catch { }
        const err = new Error(detail || `Server error ${response.status}`);
        err.response = { status: response.status, data: { detail } };
        err.userMessage =
            response.status === 413 ? "PDF too large (max 25MB). Try compressing it." :
            response.status === 401 ? "Session expired. Please log in again." :
            response.status === 422 ? "Invalid request parameters." :
            response.status === 504 ? "Generation timed out. Try fewer questions." :
            detail || `Server error ${response.status}`;
        throw err;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";
    let result    = null;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                if (!result) {
                    const err = new Error("Generation ended unexpectedly. Please try again.");
                    err.userMessage = err.message;
                    throw err;
                }
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop();

            for (const rawEvent of events) {
                if (rawEvent.trim().startsWith(":")) continue;   // heartbeat

                const dataLine = rawEvent.split("\n").find(l => l.startsWith("data: "));
                if (!dataLine) continue;

                let data;
                try { data = JSON.parse(dataLine.slice(6)); }
                catch { continue; }

                if (data.event === "start")  continue;

                if (data.event === "chunk") {
                    if (onChunk) onChunk({
                        done:   data.done,
                        of:     data.of,
                        count:  data.count,
                        q_type: data.q_type,
                    });
                    continue;
                }

                if (data.event === "done") {
                    result = {
                        questions:       data.questions,
                        quiz_session_id: data.quiz_session_id,
                        total:           data.total,
                        skipped:         data.skipped || 0,   // NEW: validation skips
                        word_count:      data.word_count,
                        max_questions:   data.max_questions,
                    };
                    continue;
                }

                if (data.event === "error") {
                    // Pass the server's message through verbatim so the user
                    // sees the real error instead of a generic message.
                    const err = new Error(data.message || "Generation failed.");
                    err.userMessage = err.message;
                    throw err;
                }
            }
        }
    } finally {
        clearTimeout(timeoutId);
        try { reader.cancel(); } catch { }
    }

    if (!result) {
        const err = new Error("No questions received. Please try again.");
        err.userMessage = err.message;
        throw err;
    }

    return result;
}

// ── Submit Attempt ────────────────────────────────────────────────────────────
export async function submitAttempt(quizSessionId, questions, answers) {
    const answersPayload = questions.map((q) => ({
        question_id: q.id,
        selected:    answers[q.id] || "",
    }));
    await apiClient.post("/quiz/attempt", {
        quiz_session_id: Number(quizSessionId),
        answers:         answersPayload,
    });
}

// ── History & Leaderboard ─────────────────────────────────────────────────────
export async function getQuizHistory() {
    const res = await apiClient.get("/quiz/history");
    return res.data;
}

export async function getLeaderboard() {
    const res = await apiClient.get("/quiz/leaderboard");
    return res.data;
}
