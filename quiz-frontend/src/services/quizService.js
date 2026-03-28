/**
 * quizService — all /quiz/* API calls.
 * Pages import these helpers instead of calling apiClient directly,
 * which makes mocking/testing and endpoint changes trivial.
 */
import apiClient from "./apiClient";

// ── PDF Analysis ──────────────────────────────────────────────────────────────
export async function analyzePDF(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiClient.post("/quiz/analyze", form);
    return res.data; // { word_count, char_count, max_questions, difficulty, topics }
}

// ── Quiz Generation ───────────────────────────────────────────────────────────
export async function generateQuiz({ file, numQuestions, qType, difficulty, topic }) {
    const form = new FormData();
    form.append("file", file);
    form.append("num_questions", numQuestions);
    form.append("q_type", qType);
    form.append("difficulty", difficulty);

    const topicParam = topic ? `&topic=${encodeURIComponent(topic)}` : "";
    const res = await apiClient.post(
        `/quiz/generate?num_questions=${numQuestions}&q_type=${qType}&difficulty=${difficulty}${topicParam}`,
        form
    );
    return res.data; // { questions, quiz_session_id }
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
