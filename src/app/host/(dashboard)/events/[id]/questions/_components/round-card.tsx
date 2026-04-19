"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { QuestionRow } from "./question-row";
import type { Round, Question } from "./question-builder";
import { getRegisteredRoundTypes } from "@/lib/game/round-registry";
import { getRegisteredModifiers } from "@/lib/game/modifier-registry";
import { useSortable } from "@dnd-kit/sortable";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { RoundTypeBadge, type RoundType } from "@/app/_components/round-type-badge";

const TIME_OPTIONS = [10, 15, 20, 30];

export function RoundCard({
  round,
  rounds,
  questions,
  onUpdateRound,
  onDeleteRound,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onMoveToRound,
  onSetModifier,
}: {
  round: Round;
  rounds: Round[];
  questions: Question[];
  onUpdateRound: (id: string, updates: Partial<Round>) => Promise<void>;
  onDeleteRound: (id: string) => Promise<void>;
  onAddQuestion: (roundId: string) => Promise<void>;
  onUpdateQuestion: (id: string, updates: Partial<Question>) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
  onMoveToRound: (questionId: string, targetRoundId: string) => Promise<void>;
  onSetModifier: (roundId: string, modifierType: string | null) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(round.title ?? "");
  const [interstitialText, setInterstitialText] = useState(round.interstitial_text ?? "");
  const [showInterstitial, setShowInterstitial] = useState(false);

  const roundTypes = getRegisteredRoundTypes();
  const modifiers = getRegisteredModifiers();

  // Sortable for round reorder
  const {
    attributes: roundAttributes,
    listeners: roundListeners,
    setNodeRef: setRoundNodeRef,
    transform: roundTransform,
    transition: roundTransition,
    isDragging: isRoundDragging,
  } = useSortable({ id: round.id });

  const roundStyle = {
    transform: CSS.Transform.toString(roundTransform),
    transition: roundTransition,
    opacity: isRoundDragging ? 0.4 : undefined,
  };

  // Droppable zone for receiving questions from other rounds
  // Uses a prefixed ID to avoid conflict with the round's useSortable ID
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop:${round.id}` });

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);

  function handleTitleBlur() {
    setEditingTitle(false);
    if (title !== round.title) {
      onUpdateRound(round.id, { title });
    }
  }

  return (
    <div
      ref={setRoundNodeRef}
      style={roundStyle}
      className={`border bg-surface transition-colors ${isOver ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
    >
      {/* Round header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Drag handle for round reorder */}
          <button
            {...roundAttributes}
            {...roundListeners}
            className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
            title="Drag to reorder round"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <svg
              className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <RoundTypeBadge type={round.round_type as RoundType} size={24} />

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

          {/* Modifier badge */}
          {round.modifier_type && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 shrink-0">
              <RoundTypeBadge type={round.modifier_type} size={16} />
              {modifiers.find((m) => m.type === round.modifier_type)?.displayName ?? round.modifier_type}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Round type */}
          <select
            value={round.round_type}
            onChange={(e) =>
              onUpdateRound(round.id, { round_type: e.target.value })
            }
            className="text-xs bg-surface border border-border px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
          >
            {roundTypes.map((t) => (
              <option key={t.type} value={t.type}>
                {t.displayName}
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
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Questions list */}
      {expanded && (
        <div ref={setDropRef} className="p-4 space-y-3">
          {/* Interstitial message */}
          <div className="border border-border/50 bg-background/40 p-3 space-y-2">
            <button
              onClick={() => setShowInterstitial(!showInterstitial)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              <svg
                className={`size-3 transition-transform ${showInterstitial ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
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

          {/* Modifier picker */}
          <div className="border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Scoring modifier</span>
                {round.modifier_type && (
                  <span className="text-xs text-amber-400">active</span>
                )}
              </div>
              <select
                value={round.modifier_type ?? ""}
                onChange={(e) =>
                  onSetModifier(round.id, e.target.value === "" ? null : e.target.value)
                }
                className="text-xs bg-surface border border-border px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">None</option>
                {modifiers.map((m) => (
                  <option key={m.type} value={m.type}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            {round.modifier_type === "jackpot" && (
              <p className="text-xs text-muted-foreground mt-2">
                First correct answer wins {(round.modifier_config?.multiplier as number) ?? 5}× points. All others score 0.
              </p>
            )}
          </div>

          <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No questions in this round yet. Drag questions here or add one below.
              </p>
            ) : (
              questions.map((q, idx) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  index={idx}
                  roundType={round.round_type}
                  rounds={rounds}
                  onUpdate={onUpdateQuestion}
                  onDelete={onDeleteQuestion}
                  onMoveToRound={onMoveToRound}
                />
              ))
            )}
          </SortableContext>
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
