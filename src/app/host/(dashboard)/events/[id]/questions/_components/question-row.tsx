"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import type { Question, Round } from "./question-builder";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function QuestionRow({
  question,
  index,
  roundType,
  rounds,
  onUpdate,
  onDelete,
  onMoveToRound,
}: {
  question: Question;
  index: number;
  /** text, not a union — validated by round registry */
  roundType: string;
  /** All rounds — used for "Move to" submenu */
  rounds: Round[];
  onUpdate: (id: string, updates: Partial<Question>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMoveToRound: (questionId: string, targetRoundId: string) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const [expanded, setExpanded] = useState(!question.body);
  const isTrueFalse = roundType === "true_false";
  const optionLabels = isTrueFalse ? ["True", "False"] : ["A", "B", "C", "D"];

  // 3-dot menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveSubmenuOpen, setMoveSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setMoveSubmenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const isClosestWins = roundType === "closest_wins";
  const isPixelReveal = roundType === "pixel_reveal";

  // Local state — avoids Supabase round-trip on every keystroke
  const [localBody, setLocalBody] = useState(question.body);
  const [localOptions, setLocalOptions] = useState<string[]>(
    isTrueFalse ? ["True", "False"] : (question.options as string[])
  );
  const [localExplanation, setLocalExplanation] = useState(question.explanation ?? "");
  const [localImageUrl, setLocalImageUrl] = useState(question.image_url ?? "");
  const [localNumericAnswer, setLocalNumericAnswer] = useState(
    question.correct_answer_numeric != null ? String(question.correct_answer_numeric) : ""
  );

  // Sync if question is replaced externally (e.g. JSON import)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLocalBody(question.body);
    setLocalExplanation(question.explanation ?? "");
    setLocalImageUrl(question.image_url ?? "");
    setLocalNumericAnswer(question.correct_answer_numeric != null ? String(question.correct_answer_numeric) : "");
    if (!isTrueFalse) setLocalOptions(question.options as string[]);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [question.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rounds this question can move to (exclude current round)
  const moveTargets = rounds
    .filter((r) => r.id !== question.round_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border p-3 space-y-3 transition-colors ${expanded ? "border-primary/30 bg-accent-light" : "border-border/50 bg-background/40"}`}
    >
      {/* Question header */}
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
          title="Drag to reorder"
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
          </svg>
        </button>

        {/* Q-number doubles as expand/collapse toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-muted-foreground hover:text-primary shrink-0 text-left transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          Q{index + 1}
        </button>
        {question.ai_generated && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1 py-px bg-primary/10 text-primary leading-none">
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

        {/* 3-dot menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => { setMenuOpen(!menuOpen); setMoveSubmenuOpen(false); }}
            className="text-muted-foreground hover:text-foreground p-1 transition-colors"
            title="More options"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-48 border border-border bg-surface shadow-lg py-1">
              {/* Move to round */}
              <div
                className="relative"
                onMouseEnter={() => setMoveSubmenuOpen(true)}
                onMouseLeave={() => setMoveSubmenuOpen(false)}
              >
                <button
                  onClick={() => setMoveSubmenuOpen(!moveSubmenuOpen)}
                  disabled={moveTargets.length === 0}
                  className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Move to...
                  </span>
                  <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {moveSubmenuOpen && moveTargets.length > 0 && (
                  <div className="absolute right-full top-0 mr-0.5 w-52 border border-border bg-surface shadow-lg py-1 max-h-60 overflow-y-auto">
                    {moveTargets.map((r) => {
                      const targetIsTF = r.round_type === "true_false";
                      const sourceIsTF = isTrueFalse;
                      const incompatible = targetIsTF !== sourceIsTF;

                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            if (incompatible) return;
                            onMoveToRound(question.id, r.id);
                            setMenuOpen(false);
                            setMoveSubmenuOpen(false);
                          }}
                          disabled={incompatible}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                          title={incompatible ? "Incompatible round type" : undefined}
                        >
                          <span className="text-foreground">{r.title || "Untitled Round"}</span>
                          <span className="text-muted-foreground text-xs ml-1.5">
                            ({r.round_type.replace("_", "/")})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="border-t border-border my-1" />

              {/* Add to Question Bank (planned) */}
              <button
                disabled
                className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground cursor-not-allowed flex items-center gap-2"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>Question Bank</span>
                <span className="text-[10px] uppercase tracking-wide bg-muted px-1 py-px">Soon</span>
              </button>

              {/* Separator */}
              <div className="border-t border-border my-1" />

              {/* Delete */}
              <button
                onClick={() => {
                  onDelete(question.id);
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete question
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Options (expanded) */}
      {expanded && (
        <div className="pl-8 space-y-2">
          {/* Pixel Reveal: image URL */}
          {isPixelReveal && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Image URL <span className="normal-case">(progressively revealed to players)</span>
              </p>
              <input
                value={localImageUrl}
                onChange={(e) => setLocalImageUrl(e.target.value)}
                onBlur={() => onUpdate(question.id, { image_url: localImageUrl || null })}
                placeholder="https://example.com/image.jpg"
                className="w-full text-sm bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary py-1"
              />
              {localImageUrl && (
                <div className="relative mt-1 w-32 h-20 border border-border overflow-hidden bg-muted">
                  <Image src={localImageUrl} alt="Preview" fill unoptimized className="object-cover" />
                </div>
              )}
            </div>
          )}

          {/* Closest Wins: numeric answer */}
          {isClosestWins && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Correct Numeric Answer <span className="normal-case">(players guess closest to this value)</span>
              </p>
              <input
                type="number"
                inputMode="decimal"
                value={localNumericAnswer}
                onChange={(e) => setLocalNumericAnswer(e.target.value)}
                onBlur={() => {
                  const parsed = parseFloat(localNumericAnswer);
                  onUpdate(question.id, {
                    correct_answer_numeric: isNaN(parsed) ? null : parsed,
                  });
                }}
                placeholder="Enter the correct number..."
                className="w-full max-w-xs text-sm bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary py-1"
              />
            </div>
          )}

          {/* MCQ-style options (hidden for Closest Wins) */}
          {!isClosestWins && (
            <>
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
            </>
          )}

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
