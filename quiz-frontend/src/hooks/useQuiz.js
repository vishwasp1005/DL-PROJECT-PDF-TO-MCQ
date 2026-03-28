/**
 * useQuiz — encapsulates all quiz page state.
 *
 * Usage in QuizPage (optional — QuizPage still uses its own state for now):
 *   const { answers, elapsed, handleAnswer, handleSubmit } = useQuiz(questions, ...);
 *
 * This hook is intentionally decoupled from navigation so pages
 * can adopt it gradually without rewrites.
 */
import { useState, useEffect, useCallback } from "react";

function formatTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function useQuiz(questions = []) {
    const [answers, setAnswers] = useState({});
    const [elapsed, setElapsed] = useState(0);
    const [submitted, setSubmitted] = useState(false);

    // Count-up timer — starts when questions are loaded, stops on submit
    useEffect(() => {
        if (!questions.length || submitted) return;
        const t = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => clearInterval(t);
    }, [questions.length, submitted]);

    const handleAnswer = useCallback((questionId, letter) => {
        setAnswers((prev) => ({ ...prev, [questionId]: letter }));
    }, []);

    const resetQuiz = useCallback(() => {
        setAnswers({});
        setElapsed(0);
        setSubmitted(false);
    }, []);

    const answered = Object.keys(answers).length;
    const total = questions.length;
    const progress = total ? (answered / total) * 100 : 0;

    const isComplete = answered === total && total > 0;

    const score = questions.filter((q) => answers[q.id] === q.correct).length;

    return {
        answers,
        elapsed,
        elapsedFormatted: formatTime(elapsed),
        answered,
        total,
        progress,
        isComplete,
        score,
        submitted,
        setSubmitted,
        handleAnswer,
        resetQuiz,
    };
}
