/**
 * quizService.js — all /quiz/* API calls (v3)
 * ============================================
 *
 * BUG FIXED: `selected_option` vs `selected` field name mismatch
 * ──────────────────────────────────────────────────────────────────────────
 * LOCATION  : submitAttempt(), the answers payload construction
 *
 * OLD CODE  :
 *   answersPayload = questions.map((q) => ({
 *     question_id: q.id,
 *     selected_option: answers[q.id] || "",   ← WRONG FIELD NAME
 *   }));
 *
 * ROOT CAUSE:
 *   The backend Pydantic model (api/quiz.py AnswerItem) expects:
 *     class AnswerItem(BaseModel):
 *         question_id: int
 *         selected: str              ← backend field name
 *
 *   Pydantic v2 ignores unknown fields by default (extra="ignore" is the
 *   default). So `selected_option` was silently ignored and `selected` was
 *   treated as missing → Pydantic raised ValidationError → FastAPI returned
 *   HTTP 422 Unprocessable Entity on EVERY quiz attempt submission.
 *
 * IMPACT:
 *   • All quiz scores were NEVER saved to the database (every attempt = 422)
 *   • QuizSession.percentage always stayed NULL
 *   • The leaderboard was permanently empty for all users
 *   • The result page could not show a persisted score
 *
 * FIX: Changed `selected_option` → `selected` to match the backend field.
 */
import apiClient from "./apiClient";

// ── PDF Analysis ──────────────────────────────────────────────────────────────
export async function analyzePDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post("/quiz/analyze", form, {
        timeout: 30_000,   // /analyze is fast — 30s is plenty
    });
    return res.data;
}

// ── Quiz Generation ───────────────────────────────────────────────────────────
/**
 * @param {Object}   params
 * @param {File}     params.file
 * @param {number}   params.numQuestions
 * @param {string}   params.qType        e.g. "MCQ" | "TF" | "FIB" | "MCQ,TF"
 * @param {string}   params.difficulty   "Easy" | "Medium" | "Hard"
 * @param {string}   [params.topic]      optional focus topic
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
    return res.data;
}

// ── Submit Attempt ────────────────────────────────────────────────────────────
/**
 * FIX: `selected_option` renamed to `selected` to match backend AnswerItem model.
 * The old field name caused HTTP 422 on every submission — scores were never saved.
 */
export async function submitAttempt(quizSessionId, questions, answers) {
    const answersPayload = questions.map((q) => ({
        question_id: q.id,
        selected:    answers[q.id] || "",   // ← FIX: was `selected_option` (422 error)
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
