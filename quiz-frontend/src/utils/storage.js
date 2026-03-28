// localStorage utilities for bookmarks, score history, wrong answers

const KEYS = {
    bookmarks: "qg_bookmarks",
    scoreHistory: "qg_score_history",
    wrongAnswers: "qg_wrong_answers",
};

// ── Bookmarks ─────────────────────────────────────────────────────
export function getBookmarks() {
    try { return JSON.parse(localStorage.getItem(KEYS.bookmarks) || "[]"); }
    catch { return []; }
}

export function toggleBookmark(questionKey) {
    const bms = getBookmarks();
    const idx = bms.indexOf(questionKey);
    if (idx === -1) bms.push(questionKey);
    else bms.splice(idx, 1);
    localStorage.setItem(KEYS.bookmarks, JSON.stringify(bms));
    return bms;
}

export function isBookmarked(questionKey) {
    return getBookmarks().includes(questionKey);
}

export function clearBookmarks() {
    localStorage.removeItem(KEYS.bookmarks);
}

// ── Score History ─────────────────────────────────────────────────
export function getScoreHistory() {
    try { return JSON.parse(localStorage.getItem(KEYS.scoreHistory) || "[]"); }
    catch { return []; }
}

export function addScore({ difficulty, score, total, pdfName }) {
    const history = getScoreHistory();
    const pct = total ? Math.round((score / total) * 100 * 10) / 10 : 0;
    history.push({
        date: new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        difficulty,
        score,
        total,
        pct,
        pdf: pdfName || "Unknown",
    });
    localStorage.setItem(KEYS.scoreHistory, JSON.stringify(history));
    return history;
}

export function clearScoreHistory() {
    localStorage.removeItem(KEYS.scoreHistory);
}

// ── Wrong Answers ─────────────────────────────────────────────────
export function getWrongAnswers() {
    try { return JSON.parse(localStorage.getItem(KEYS.wrongAnswers) || "[]"); }
    catch { return []; }
}

export function saveWrongAnswers(questions, userAnswers) {
    // questions: array of {question, options[], correct}
    // userAnswers: { questionId: selectedLetter }
    const wrong = questions.filter(
        (q) => userAnswers[q.id] !== q.correct
    );
    localStorage.setItem(KEYS.wrongAnswers, JSON.stringify(wrong));
    return wrong;
}

export function clearWrongAnswers() {
    localStorage.removeItem(KEYS.wrongAnswers);
}
