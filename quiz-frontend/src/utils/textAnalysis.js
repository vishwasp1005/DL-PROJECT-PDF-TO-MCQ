/**
 * Auto-detect difficulty from text (mirrors the Streamlit app logic)
 */
export function detectDifficulty(text) {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return "Medium";
    const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const complexWords = words.filter((w) => w.length > 9).length / words.length * 100;
    const score = avgWordLen * 1.5 + (words.length / Math.max(sentences.length, 1)) * 0.15 + complexWords * 0.4;
    return score < 12 ? "Easy" : score > 20 ? "Hard" : "Medium";
}

/**
 * Max questions allowed based on word count
 */
export function calcMaxQuestions(text) {
    const wc = text.split(/\s+/).filter(Boolean).length;
    if (wc < 500) return 10;
    if (wc < 1000) return 25;
    if (wc < 2000) return 50;
    if (wc < 5000) return 100;
    return 150;
}

/**
 * Extract topic headers from text
 */
export function extractTopics(text) {
    const topics = [];
    const seen = new Set();
    for (const line of text.split("\n")) {
        const l = line.trim();
        if (l.length < 4 || l.length > 90) continue;
        if (/^(chapter|section|unit|topic|part|module)\s+\d+/i.test(l)) {
            if (!seen.has(l)) { topics.push(l); seen.add(l); }
        } else if (/^\d+[\.\)]\s+[A-Z]/.test(l)) {
            if (!seen.has(l)) { topics.push(l); seen.add(l); }
        } else if (l === l.toUpperCase() && l.split(/\s+/).length > 1 && l.split(/\s+/).length <= 8) {
            if (!seen.has(l)) { topics.push(l); seen.add(l); }
        }
        if (topics.length >= 25) break;
    }
    return topics;
}

/**
 * Simple parse of options that handles both array and JSON string
 */
export function parseOptions(opts) {
    if (Array.isArray(opts)) return opts;
    try { return JSON.parse(opts); } catch { return []; }
}

/**
 * analyzeTopicPerformance — given questions[] and answers{}, returns per-topic stats.
 *
 * @param {Array}  questions  — array of { id, question, topic, correct, ... }
 * @param {Object} answers    — { [questionId]: selectedLetter }
 * @param {number} weakThreshold — % below which a topic is "weak" (default 60)
 *
 * @returns {Object} {
 *   byTopic:    { [topic]: { total, correct, accuracy } },
 *   weakTopics: [{ topic, accuracy, total }],  // accuracy < threshold
 *   strongTopics: [{ topic, accuracy, total }],
 *   allTopics:  [{ topic, accuracy, total }],
 * }
 */
export function analyzeTopicPerformance(questions = [], answers = {}, weakThreshold = 60) {
    const byTopic = {};

    for (const q of questions) {
        const topic = q.topic || "General";
        if (!byTopic[topic]) byTopic[topic] = { total: 0, correct: 0 };
        byTopic[topic].total += 1;
        if (answers[q.id] === q.correct) byTopic[topic].correct += 1;
    }

    const allTopics = Object.entries(byTopic)
        .map(([topic, { total, correct }]) => ({
            topic,
            total,
            correct,
            accuracy: total ? Math.round((correct / total) * 100) : 0,
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    const weakTopics = allTopics.filter((t) => t.accuracy < weakThreshold);
    const strongTopics = allTopics.filter((t) => t.accuracy >= weakThreshold);

    return { byTopic, weakTopics, strongTopics, allTopics };
}
