/**
 * QuestionCard — renders a single quiz/study question with its options.
 *
 * Props:
 *   question:   Question object { id, question, options[], correct, topic, difficulty, type }
 *   index:      number (0-based)
 *   selected:   string letter ("A" | "B" | "C" | "D") or undefined
 *   showAnswer: boolean — show correct/wrong highlighting (study mode)
 *   onClick:    (letter) => void
 */
import React from "react";
import { parseOptions } from "../../utils/textAnalysis";

export default function QuestionCard({
    question,
    index = 0,
    selected,
    showAnswer = false,
    onClick,
}) {
    const q = question;
    const opts = parseOptions(q.options);

    return (
        <div className={`quiz-question-card${selected ? " answered" : ""}`}>
            {/* Meta row */}
            <div className="question-meta">
                <span className="badge badge-navy">Q{index + 1}</span>
                {q.topic && <span className="badge badge-accent">{q.topic}</span>}
                {q.difficulty && <span className={`badge badge-${(q.difficulty || "").toLowerCase()}`}>{q.difficulty}</span>}
                {q.type && <span className="badge badge-navy">{q.type}</span>}
            </div>

            {/* Question text */}
            <p className="question-text">{q.question}</p>

            {/* Options */}
            <div className="options-list">
                {opts.map((opt) => {
                    const letter = opt.charAt(0);
                    const isSelected = selected === letter;
                    const isCorrect = q.correct === letter;

                    let cls = "option-item";
                    if (showAnswer) { cls += isCorrect ? " correct" : isSelected ? " wrong" : ""; }
                    else { cls += isSelected ? " selected" : ""; }

                    return (
                        <div
                            key={letter}
                            className={cls}
                            onClick={() => onClick && onClick(letter)}
                            style={{ cursor: onClick ? "pointer" : "default" }}
                        >
                            <div
                                style={{
                                    width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                                    background: isSelected ? "var(--navy)" : "var(--surface)",
                                    color: isSelected ? "#fff" : "var(--text-muted)",
                                    border: `1.5px solid ${isSelected ? "var(--navy)" : "var(--border)"}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: ".65rem", fontWeight: 800,
                                }}
                            >
                                {letter}
                            </div>
                            {opt.slice(2).trim()}
                            {showAnswer && isCorrect && (
                                <span style={{ marginLeft: "auto", fontSize: ".72rem", fontWeight: 700, color: "var(--success)" }}>✓ Correct</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
