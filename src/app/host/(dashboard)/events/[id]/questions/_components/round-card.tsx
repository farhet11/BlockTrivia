"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuestionRow } from "./question-row";
import type { Round, Question } from "./question-builder";

const ROUND_TYPES: { value: Round["round_type"]; label: string }[] = [
  { value: "mcq", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  { value: "wipeout", label: "WipeOut (Leverage)" },
];

const TIME_OPTIONS = [10, 15, 20, 30];

export function RoundCard({
  round,
  questions,
  onUpdateRound,
  onDeleteRound,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onMoveQuestion,
}: {
  round: Round;
  questions: Question[];
  onUpdateRound: (id: string, updates: Partial<Round>) => Promise<void>;
  onDeleteRound: (id: string) => Promise<void>;
  onAddQuestion: (roundId: string) => Promise<void>;
  onUpdateQuestion: (id: string, updates: Partial<Question>) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
  onMoveQuestion: (id: string, direction: "up" | "down") => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(round.title ?? "");
  const [interstitialText, setInterstitialText] = useState(round.interstitial_text ?? "");
  const [showInterstitial, setShowInterstitial] = useState(false);

  function handleTitleBlur() {
    setEditingTitle(false);
    if (title !== round.title) {
      onUpdateRound(round.id, { title });
    }
  }

  return (
    <div className="border border-border bg-surface">
      {/* Round header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <svg
              className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {editingTitle ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
              autoFocus
              className="font-semibold text-foreground bg-transparent border-b border-primary outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="font-semibold text-foreground hover:text-primary transition-colors text-left truncate"
            >
              {round.title || "Untitled Round"}
            </button>
          )}

          <span className="text-xs text-muted-foreground shrink-0">
            {questions.length} {questions.length === 1 ? "question" : "questions"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Round type */}
          <select
            value={round.round_type}
            onChange={(e) =>
              onUpdateRound(round.id, {
                round_type: e.target.value as Round["round_type"],
              })
            }
            className="text-xs bg-surface border border-border px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            {ROUND_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Timer */}
          <select
            value={round.time_limit_seconds}
            onChange={(e) =>
              onUpdateRound(round.id, {
                time_limit_seconds: Number(e.target.value),
              })
            }
            className="text-xs bg-surface border border-border px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}s
              </option>
            ))}
          </select>

          {/* Delete round */}
          <button
            onClick={() => {
              if (confirm("Delete this round and all its questions?")) {
                onDeleteRound(round.id);
              }
            }}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Questions list */}
      {expanded && (
        <div className="p-4 space-y-3">
          {/* Interstitial message */}
          <div className="border border-border/50 bg-background/40 p-3 space-y-2">
            <button
              onClick={() => setShowInterstitial(!showInterstitial)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              <svg
                className={`size-3 transition-transform ${showInterstitial ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Interstitial message
              {interstitialText && <span className="ml-1 text-primary">•</span>}
            </button>
            {showInterstitial && (
              <textarea
                rows={2}
                value={interstitialText}
                onChange={(e) => setInterstitialText(e.target.value)}
                onBlur={() => onUpdateRound(round.id, { interstitial_text: interstitialText || null })}
                placeholder="Optional message shown to players before this round starts..."
                className="w-full text-sm bg-background border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            )}
          </div>

          {questions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No questions in this round yet.
            </p>
          ) : (
            questions.map((q, idx) => (
              <QuestionRow
                key={q.id}
                question={q}
                index={idx}
                total={questions.length}
                roundType={round.round_type}
                onUpdate={onUpdateQuestion}
                onDelete={onDeleteQuestion}
                onMove={onMoveQuestion}
              />
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddQuestion(round.id)}
            className="w-full"
          >
            + Add Question
          </Button>
        </div>
      )}
    </div>
  );
}
