/**
 * quizService — all /quiz/* API calls.
 *
 * v2 changes (large-PDF support):
 *   - generateQuiz accepts an onUploadProgress callback for real-time upload %
 *   - Explicit per-call timeout overrides (analyze=30s, generate=360s)
 *   - userMessage from apiClient interceptor is surfaced to callers
 */
import apiClient from "./apiClient";

// ── PDF Analysis ──────────────────────────────────────────────────────────────
export async function analyzePDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post("/quiz/analyze", form, {
        timeout: 30_000,   // /analyze is fast — 30s is plenty
    });
    return res.data; // { word_count, char_count, max_questions, difficulty, topics, page_count, size_mb }
}

// ── Quiz Generation ───────────────────────────────────────────────────────────
/**
 * @param {Object}   params
 * @param {File}     params.file
 * @param {number}   params.numQuestions
 * @param {string}   params.qType        e.g. "MCQ" | "TF" | "FIB" | "MCQ,TF"
 * @param {string}   params.difficulty   "Easy" | "Medium" | "Hard"
 * @param {string}   [params.topic]
 * @param {Function} [params.onUploadProgress]  called with { loaded, total }
 */
export async function generateQuiz({
    file,
    numQuestions,
    qType,
    difficulty,
    topic,
    onUploadProgress,
}) {
    const form = new FormData();
    form.append("file", file);
    form.append("num_questions", numQuestions);
    form.append("q_type", qType);
    form.append("difficulty", difficulty);

    const topicParam = topic ? `&topic=${encodeURIComponent(topic)}` : "";
    const res = await apiClient.post(
        `/quiz/generate?num_questions=${numQuestions}&q_type=${qType}&difficulty=${difficulty}${topicParam}`,
        form,
        {
            timeout: 360_000,   // 6-minute hard cap for large PDFs
            onUploadProgress: onUploadProgress
                ? (evt) => onUploadProgress({ loaded: evt.loaded, total: evt.total })
                : undefined,
        }
    );
    return res.data; // { questions, quiz_session_id, chunk_count, word_count, max_questions }
}

// ── Submit Attempt ────────────────────────────────────────────────────────────
export async function submitAttempt(quizSessionId, questions, answers) {
    const answersPayload = questions.map((q) => ({
        question_id: q.id,
        selected_option: answers[q.id] || "",
    }));
    await apiClient.post("/quiz/attempt", {
        quiz_session_id: Number(quizSessionId),
        answers: answersPayload,
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
