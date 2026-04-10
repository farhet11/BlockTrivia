"use client";

import { useState, useEffect } from "react";
import type { Question } from "./question-builder";

export function QuestionRow({
  question,
  index,
  total,
  roundType,
  onUpdate,
  onDelete,
  onMove,
}: {
  question: Question;
  index: number;
  total: number;
  /** text, not a union — validated by round registry */
  roundType: string;
  onUpdate: (id: string, updates: Partial<Question>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, direction: "up" | "down") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(!question.body);
  const isTrueFalse = roundType === "true_false";
  const optionLabels = isTrueFalse ? ["True", "False"] : ["A", "B", "C", "D"];

  // Local state — avoids Supabase round-trip on every keystroke
  const [localBody, setLocalBody] = useState(question.body);
  const [localOptions, setLocalOptions] = useState<string[]>(
    isTrueFalse ? ["True", "False"] : (question.options as string[])
  );
  const [localExplanation, setLocalExplanation] = useState(question.explanation ?? "");

  // Sync if question is replaced externally (e.g. JSON import)
  useEffect(() => {
    setLocalBody(question.body);
    setLocalExplanation(question.explanation ?? "");
    if (!isTrueFalse) setLocalOptions(question.options as string[]);
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`border p-3 space-y-3 transition-colors ${expanded ? "border-primary/30 bg-accent-light" : "border-border/50 bg-background/40"}`}>
      {/* Question header */}
      <div className="flex items-start gap-2">
        {/* Q-number doubles as expand/collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-muted-foreground hover:text-primary mt-1 shrink-0 text-left transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          Q{index + 1}
        </button>
        {question.ai_generated && (
          <span className="mt-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1 py-px bg-primary/10 text-primary leading-none">
            AI
          </span>
        )}

        <div className="flex-1 min-w-0">
          {expanded ? (
            <textarea
              value={localBody}
              onChange={(e) => setLocalBody(e.target.value)}
              onBlur={() => onUpdate(question.id, { body: localBody })}
              placeholder="Type your question..."
              rows={2}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none resize-none text-sm"
            />
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="text-sm text-foreground text-left truncate w-full"
            >
              {localBody || "Untitled question"}
            </button>
          )}
        </div>

        {/* Reorder + delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onMove(question.id, "up")}
            disabled={index === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => onMove(question.id, "down")}
            disabled={index === total - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(question.id)}
            className="text-muted-foreground hover:text-destructive p-0.5"
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Options (expanded) */}
      {expanded && (
        <div className="pl-8 space-y-2">
          {optionLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => onUpdate(question.id, { correct_answer: i })}
                className={`shrink-0 size-6 flex items-center justify-center text-xs font-medium transition-colors ${
                  question.correct_answer === i
                    ? "bg-correct text-white"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {label}
              </button>
              {isTrueFalse ? (
                <span className="text-sm text-foreground">{label}</span>
              ) : (
                <input
                  value={localOptions[i] ?? ""}
                  onChange={(e) => {
                    const updated = [...localOptions];
                    updated[i] = e.target.value;
                    setLocalOptions(updated);
                  }}
                  onBlur={() => onUpdate(question.id, { options: localOptions })}
                  placeholder={`Option ${label}`}
                  className="flex-1 text-sm bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary py-1"
                />
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-1">
            Click a letter to mark the correct answer.
          </p>

          {/* Explanation (optional) */}
          <div className="pt-1 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Explanation <span className="normal-case">(optional — shown after answer reveal)</span>
            </p>
            <textarea
              value={localExplanation}
              onChange={(e) => setLocalExplanation(e.target.value)}
              onBlur={() => onUpdate(question.id, { explanation: localExplanation || null })}
              placeholder="Why is this the correct answer?"
              rows={2}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none resize-none text-sm border-b border-border focus:border-primary py-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
