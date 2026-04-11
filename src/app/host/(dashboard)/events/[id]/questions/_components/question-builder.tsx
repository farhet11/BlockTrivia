"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { RoundCard } from "./round-card";
import { JsonImportModal } from "./json-import-modal";
import { MindScanModal } from "./mindscan-modal";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

export type Round = {
  id: string;
  event_id: string;
  /** text, not a union — validated by round registry */
  round_type: string;
  title: string | null;
  sort_order: number;
  time_limit_seconds: number;
  base_points: number;
  time_bonus_enabled: boolean;
  /** Round-specific config JSONB (e.g. minWagerPct/maxWagerPct for WipeOut). */
  config: Record<string, unknown>;
  interstitial_text?: string | null;
  /** Active modifier on this round, or null. Populated from round_modifiers join. */
  modifier_type: string | null;
  /** Modifier config JSONB — multiplier, etc. */
  modifier_config: Record<string, unknown>;
};

export type Question = {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  correct_answer: number;
  sort_order: number;
  explanation?: string | null;
  ai_generated?: boolean;
};

export function QuestionBuilder({
  eventId,
  joinCode,
  eventStatus,
  eventTitle,
  eventDescription,
  initialRounds,
  initialQuestions,
}: {
  eventId: string;
  joinCode: string;
  eventStatus: string;
  eventTitle: string;
  eventDescription: string;
  initialRounds: Round[];
  initialQuestions: Question[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rounds, setRounds] = useState<Round[]>(initialRounds);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [showMindScan, setShowMindScan] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastAddedRoundId, setLastAddedRoundId] = useState<string | null>(null);
  const [roundAddedFlash, setRoundAddedFlash] = useState(false);
  const roundRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isEnded = eventStatus === "ended";
  const isActive = eventStatus === "active" || eventStatus === "lobby" || eventStatus === "paused";

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"round" | "question" | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.sort_order - b.sort_order),
    [rounds]
  );
  const roundIds = useMemo(() => sortedRounds.map((r) => r.id), [sortedRounds]);

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    setActiveId(id);
    // Determine if dragging a round or question
    if (rounds.some((r) => r.id === id)) {
      setDragType("round");
    } else {
      setDragType("question");
    }
  }

  /** Extract round ID from a droppable ID (could be "drop:uuid" or just "uuid") */
  function resolveRoundId(id: string): string | null {
    if (id.startsWith("drop:")) return id.slice(5);
    if (rounds.some((r) => r.id === id)) return id;
    return null;
  }

  function handleDragOver(event: DragOverEvent) {
    if (dragType !== "question") return;
    const { active, over } = event;
    if (!over) return;

    const activeQ = questions.find((q) => q.id === active.id);
    if (!activeQ) return;

    // Determine the target round: over could be a question, a round sortable, or a round droppable
    let overRoundId: string | null = null;
    const overQ = questions.find((q) => q.id === over.id);
    if (overQ) {
      overRoundId = overQ.round_id;
    } else {
      overRoundId = resolveRoundId(over.id as string);
    }

    if (!overRoundId || activeQ.round_id === overRoundId) return;

    // Check round type compatibility before allowing cross-round move
    const fromRound = rounds.find((r) => r.id === activeQ.round_id);
    const toRound = rounds.find((r) => r.id === overRoundId);
    if (!fromRound || !toRound) return;

    const isTF = (t: string) => t === "true_false";
    if (isTF(fromRound.round_type) !== isTF(toRound.round_type)) {
      // Incompatible — don't move during drag, will show feedback on drop
      return;
    }

    // Move question to the new round optimistically (local state only)
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === activeQ.id ? { ...q, round_id: overRoundId! } : q
      )
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setDragType(null);
    if (!over) return;

    if (dragType === "round") {
      // ── Round reorder ──
      const oldIndex = sortedRounds.findIndex((r) => r.id === active.id);
      const newIndex = sortedRounds.findIndex((r) => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(sortedRounds, oldIndex, newIndex);
      // Update sort_order values
      const updatedRounds = reordered.map((r, i) => ({ ...r, sort_order: i }));
      setRounds(updatedRounds);

      // Persist to DB
      markSaving();
      await Promise.all(
        updatedRounds
          .filter((r, i) => sortedRounds[i]?.id !== r.id)
          .map((r) =>
            supabase.from("rounds").update({ sort_order: r.sort_order }).eq("id", r.id)
          )
      );
      markSaved();
    } else if (dragType === "question") {
      // ── Question reorder / cross-round move ──
      const activeQ = questions.find((q) => q.id === active.id);
      if (!activeQ) return;

      // Determine target round
      let overRoundId: string;
      const overQ = questions.find((q) => q.id === over.id);
      if (overQ) {
        overRoundId = overQ.round_id;
      } else {
        const resolved = resolveRoundId(over.id as string);
        if (!resolved) return;
        overRoundId = resolved;
      }

      // Check compatibility
      const fromRound = rounds.find((r) => r.id === activeQ.round_id);
      const toRound = rounds.find((r) => r.id === overRoundId);
      if (!fromRound || !toRound) return;

      const isTF = (t: string) => t === "true_false";
      if (isTF(fromRound.round_type) !== isTF(toRound.round_type)) {
        // Revert the optimistic move from handleDragOver
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === activeQ.id ? { ...q, round_id: fromRound.id } : q
          )
        );
        markError(
          `Can't move ${isTF(fromRound.round_type) ? "True/False" : "4-option"} questions into a ${isTF(toRound.round_type) ? "True/False" : "4-option"} round`
        );
        return;
      }

      const roundQuestions = questions
        .filter((q) => q.round_id === overRoundId)
        .sort((a, b) => a.sort_order - b.sort_order);

      const oldIndex = roundQuestions.findIndex((q) => q.id === active.id);
      const newIndex = overQ
        ? roundQuestions.findIndex((q) => q.id === over.id)
        : roundQuestions.length;

      if (activeQ.round_id === overRoundId && oldIndex === newIndex) return;

      // Reorder within the target round
      let reordered: Question[];
      if (oldIndex !== -1) {
        // Same-round reorder
        reordered = arrayMove(roundQuestions, oldIndex, newIndex === -1 ? roundQuestions.length - 1 : newIndex);
      } else {
        // Cross-round: insert at position
        const insertIdx = newIndex === -1 ? roundQuestions.length : newIndex;
        reordered = [...roundQuestions];
        reordered.splice(insertIdx, 0, { ...activeQ, round_id: overRoundId });
      }

      // Assign new sort_order values
      const updates = reordered.map((q, i) => ({
        ...q,
        round_id: overRoundId,
        sort_order: i,
      }));

      setQuestions((prev) => {
        const rest = prev.filter(
          (q) => !updates.some((u) => u.id === q.id) && q.id !== activeQ.id
        );
        return [...rest, ...updates];
      });

      // Persist
      markSaving();
      await Promise.all(
        updates.map((q) =>
          supabase
            .from("questions")
            .update({ round_id: q.round_id, sort_order: q.sort_order })
            .eq("id", q.id)
        )
      );
      markSaved();
    }
  }

  const activeQuestion = activeId
    ? questions.find((q) => q.id === activeId)
    : null;
  const activeRound = activeId
    ? rounds.find((r) => r.id === activeId)
    : null;

  async function duplicateEvent() {
    setDuplicating(true);
    // Create new draft event
    const { data: newEvent, error } = await supabase
      .from("events")
      .insert({ title: `${eventTitle} (Copy)`, description: eventDescription || null, created_by: (await supabase.auth.getUser()).data.user!.id })
      .select("id, join_code")
      .single();

    if (error || !newEvent) { setDuplicating(false); return; }

    // Copy rounds in order
    const sortedRounds = [...rounds].sort((a, b) => a.sort_order - b.sort_order);
    for (const round of sortedRounds) {
      const { data: newRound } = await supabase
        .from("rounds")
        .insert({
          event_id: newEvent.id,
          title: round.title,
          round_type: round.round_type,
          sort_order: round.sort_order,
          time_limit_seconds: round.time_limit_seconds,
          base_points: round.base_points,
          time_bonus_enabled: round.time_bonus_enabled,
          config: round.config ?? {},
          interstitial_text: round.interstitial_text ?? null,
        })
        .select("id")
        .single();

      if (!newRound) continue;

      // Copy questions for this round
      const roundQuestions = questions
        .filter((q) => q.round_id === round.id)
        .sort((a, b) => a.sort_order - b.sort_order);

      if (roundQuestions.length > 0) {
        await supabase.from("questions").insert(
          roundQuestions.map((q) => ({
            round_id: newRound.id,
            body: q.body,
            options: q.options,
            correct_answer: q.correct_answer,
            sort_order: q.sort_order,
            explanation: q.explanation ?? null,
          }))
        );
      }
    }

    window.location.href = `/host/events/${newEvent.id}/questions`;
  }

  function markSaving() {
    setSaveStatus("saving");
    setSaveError(null);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }

  function markError(msg: string) {
    setSaveStatus("error");
    setSaveError(msg);
    saveTimerRef.current = setTimeout(() => { setSaveStatus("idle"); setSaveError(null); }, 5000);
  }
  // Scroll to newly added round once it mounts
  useEffect(() => {
    if (!lastAddedRoundId) return;
    const el = roundRefs.current.get(lastAddedRoundId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [lastAddedRoundId, rounds]);

  function markSaved() {
    setSaveStatus("saved");
    saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
  }

  const questionsForRound = useCallback(
    (roundId: string) =>
      questions
        .filter((q) => q.round_id === roundId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [questions]
  );

  async function addRound() {
    markSaving();
    const sortOrder = rounds.length;
    const { data, error } = await supabase
      .from("rounds")
      .insert({
        event_id: eventId,
        title: `Round ${sortOrder + 1}`,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (!error && data) {
      setRounds([...rounds, data]);
      setLastAddedRoundId(data.id);
      setRoundAddedFlash(true);
      setTimeout(() => setRoundAddedFlash(false), 1800);
      markSaved();
    } else {
      markError("Failed to add round");
    }
  }

  async function deleteRound(roundId: string) {
    markSaving();
    // game_state.current_question_id / current_round_id reference questions / rounds
    // WITHOUT CASCADE — clear them first so FK doesn't block the delete.
    await supabase
      .from("game_state")
      .update({ current_question_id: null, current_round_id: null })
      .eq("event_id", eventId)
      .or(`current_round_id.eq.${roundId}`);
    // Delete questions (cascades to responses), then modifier, then round
    await supabase.from("questions").delete().eq("round_id", roundId);
    await supabase.from("round_modifiers").delete().eq("round_id", roundId);
    const { error } = await supabase.from("rounds").delete().eq("id", roundId);

    if (!error) {
      setRounds(rounds.filter((r) => r.id !== roundId));
      setQuestions(questions.filter((q) => q.round_id !== roundId));
      markSaved();
    } else {
      markError("Failed to delete round");
    }
  }

  async function updateRound(roundId: string, updates: Partial<Round>) {
    // ── Round type change: validate + adapt questions ──────────────────────
    if (updates.round_type) {
      const oldRound = rounds.find((r) => r.id === roundId);
      const newType = updates.round_type;
      const oldType = oldRound?.round_type ?? "mcq";

      if (newType !== oldType) {
        const roundQs = questions.filter((q) => q.round_id === roundId);
        const isTrueFalse = (t: string) => t === "true_false";
        const is4Option = (t: string) => !isTrueFalse(t);

        // 4-option → True/False: lose options C/D, correct_answer > 1 becomes invalid
        if (is4Option(oldType) && isTrueFalse(newType) && roundQs.length > 0) {
          const invalidQs = roundQs.filter((q) => q.correct_answer > 1);
          const msg = invalidQs.length > 0
            ? `${roundQs.length} question${roundQs.length > 1 ? "s" : ""} will be trimmed to 2 options. ${invalidQs.length} question${invalidQs.length > 1 ? "s have" : " has"} the correct answer set to option C or D — ${invalidQs.length > 1 ? "these" : "this"} will be reset to A. Continue?`
            : `${roundQs.length} question${roundQs.length > 1 ? "s" : ""} will be trimmed to 2 options (C and D removed). Continue?`;
          if (!window.confirm(msg)) return;

          // Adapt: trim options to 2, reset correct_answer if > 1
          markSaving();
          for (const q of roundQs) {
            const trimmedOptions = [
              q.options[0] || "True",
              q.options[1] || "False",
            ];
            const newCorrect = q.correct_answer > 1 ? 0 : q.correct_answer;
            await supabase
              .from("questions")
              .update({ options: trimmedOptions, correct_answer: newCorrect })
              .eq("id", q.id);
            // Update local state
            setQuestions((prev) =>
              prev.map((pq) =>
                pq.id === q.id
                  ? { ...pq, options: trimmedOptions, correct_answer: newCorrect }
                  : pq
              )
            );
          }
        }

        // True/False → 4-option: pad options C/D
        if (isTrueFalse(oldType) && is4Option(newType) && roundQs.length > 0) {
          markSaving();
          for (const q of roundQs) {
            if (q.options.length < 4) {
              const padded = [...q.options];
              while (padded.length < 4) padded.push("");
              await supabase
                .from("questions")
                .update({ options: padded })
                .eq("id", q.id);
              setQuestions((prev) =>
                prev.map((pq) =>
                  pq.id === q.id ? { ...pq, options: padded } : pq
                )
              );
            }
          }
        }
      }
    }

    markSaving();
    const { error } = await supabase
      .from("rounds")
      .update(updates)
      .eq("id", roundId);

    if (error) {
      markError(error.message.includes("round_type") ? `Round type not supported — run migration 052` : `Failed to update round`);
    } else {
      setRounds(rounds.map((r) => (r.id === roundId ? { ...r, ...updates } : r)));
      markSaved();
    }
  }

  /**
   * Set or clear the scoring modifier on a round.
   * - modifierType = null   → removes any existing modifier (DELETE from round_modifiers)
   * - modifierType = string → upserts a row with default config
   */
  async function setModifier(roundId: string, modifierType: string | null) {
    markSaving();
    if (modifierType === null) {
      // Clear modifier
      const { error } = await supabase
        .from("round_modifiers")
        .delete()
        .eq("round_id", roundId);

      if (!error) {
        setRounds(
          rounds.map((r) =>
            r.id === roundId
              ? { ...r, modifier_type: null, modifier_config: {} }
              : r
          )
        );
        markSaved();
      } else {
        markError("Failed to clear modifier");
      }
    } else {
      // Upsert modifier — rely on UNIQUE(round_id) constraint with ON CONFLICT
      const defaultConfig: Record<string, unknown> =
        modifierType === "jackpot" ? { multiplier: 5 } : {};

      const { error } = await supabase
        .from("round_modifiers")
        .upsert(
          { round_id: roundId, modifier_type: modifierType, config: defaultConfig },
          { onConflict: "round_id" }
        );

      if (!error) {
        setRounds(
          rounds.map((r) =>
            r.id === roundId
              ? { ...r, modifier_type: modifierType, modifier_config: defaultConfig }
              : r
          )
        );
        markSaved();
      } else {
        markError("Failed to set modifier");
      }
    }
  }

  /** Returns the correct default options array for a given round type. */
  function defaultOptionsForRound(roundId: string): string[] {
    const round = rounds.find((r) => r.id === roundId);
    return round?.round_type === "true_false" ? ["True", "False"] : ["", "", "", ""];
  }

  async function addQuestion(roundId: string) {
    markSaving();
    const existing = questionsForRound(roundId);
    const sortOrder = existing.length;
    const { data, error } = await supabase
      .from("questions")
      .insert({
        round_id: roundId,
        body: "",
        options: defaultOptionsForRound(roundId),
        correct_answer: 0,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (!error && data) {
      setQuestions([...questions, data]);
      markSaved();
    } else {
      markError("Failed to add question");
    }
  }

  async function updateQuestion(questionId: string, updates: Partial<Question>) {
    markSaving();
    const { error } = await supabase
      .from("questions")
      .update(updates)
      .eq("id", questionId);

    if (!error) {
      setQuestions(
        questions.map((q) => (q.id === questionId ? { ...q, ...updates } : q))
      );
      markSaved();
    } else {
      markError("Failed to update question");
    }
  }

  async function deleteQuestion(questionId: string) {
    markSaving();
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);

    if (!error) {
      setQuestions(questions.filter((q) => q.id !== questionId));
      markSaved();
    } else {
      markError("Failed to delete question");
    }
  }

  async function moveQuestion(questionId: string, direction: "up" | "down") {
    const q = questions.find((q) => q.id === questionId);
    if (!q) return;

    const siblings = questionsForRound(q.round_id);
    const idx = siblings.findIndex((s) => s.id === questionId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const other = siblings[swapIdx];

    markSaving();
    // Swap sort_order values
    await Promise.all([
      supabase
        .from("questions")
        .update({ sort_order: other.sort_order })
        .eq("id", q.id),
      supabase
        .from("questions")
        .update({ sort_order: q.sort_order })
        .eq("id", other.id),
    ]);

    setQuestions(
      questions.map((item) => {
        if (item.id === q.id) return { ...item, sort_order: other.sort_order };
        if (item.id === other.id) return { ...item, sort_order: q.sort_order };
        return item;
      })
    );
    markSaved();
  }

  async function moveQuestionToRound(questionId: string, targetRoundId: string) {
    const q = questions.find((q) => q.id === questionId);
    if (!q || q.round_id === targetRoundId) return;

    // Check round type compatibility
    const fromRound = rounds.find((r) => r.id === q.round_id);
    const toRound = rounds.find((r) => r.id === targetRoundId);
    if (!fromRound || !toRound) return;

    const isTF = (t: string) => t === "true_false";
    if (isTF(fromRound.round_type) !== isTF(toRound.round_type)) {
      markError(
        `Can't move ${isTF(fromRound.round_type) ? "True/False" : "4-option"} questions into a ${isTF(toRound.round_type) ? "True/False" : "4-option"} round`
      );
      return;
    }

    // Append to end of target round
    const targetQuestions = questionsForRound(targetRoundId);
    const newSortOrder = targetQuestions.length;

    markSaving();
    const { error } = await supabase
      .from("questions")
      .update({ round_id: targetRoundId, sort_order: newSortOrder })
      .eq("id", questionId);

    if (!error) {
      setQuestions(
        questions.map((item) =>
          item.id === questionId
            ? { ...item, round_id: targetRoundId, sort_order: newSortOrder }
            : item
        )
      );
      markSaved();
    } else {
      markError("Failed to move question");
    }
  }

  function handleJsonImported(newQuestions: Question[]) {
    setQuestions([...questions, ...newQuestions]);
    setShowJsonImport(false);
  }

  function handleMindScanImported(newQuestions: Question[]) {
    setQuestions([...questions, ...newQuestions]);
    setShowMindScan(false);
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Actions bar */}
      <div className="flex gap-3">
        <Button
          onClick={addRound}
          className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
        >
          {roundAddedFlash ? "Round added ✓" : "Add Round"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowJsonImport(true)}
        >
          Import JSON
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowMindScan(true)}
          disabled={rounds.length === 0}
          title={rounds.length === 0 ? "Add a round first" : undefined}
        >
          Generate questions
        </Button>
      </div>

      {/* Rounds */}
      {rounds.length === 0 ? (
        <div className="border border-border bg-surface py-12 text-center space-y-2">
          <p className="text-muted-foreground">No rounds yet</p>
          <p className="text-sm text-muted-foreground">
            Add a round to start building your question set.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={roundIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {sortedRounds.map((round) => (
                <div
                  key={round.id}
                  ref={(el) => {
                    if (el) roundRefs.current.set(round.id, el);
                    else roundRefs.current.delete(round.id);
                  }}
                >
                  <RoundCard
                    round={round}
                    rounds={sortedRounds}
                    questions={questionsForRound(round.id)}
                    onUpdateRound={updateRound}
                    onDeleteRound={deleteRound}
                    onAddQuestion={addQuestion}
                    onUpdateQuestion={updateQuestion}
                    onDeleteQuestion={deleteQuestion}
                    onMoveToRound={moveQuestionToRound}
                    onSetModifier={setModifier}
                  />
                </div>
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeQuestion && (
              <div className="border border-primary bg-surface p-3 shadow-lg opacity-90">
                <p className="text-sm font-medium text-foreground truncate">
                  {activeQuestion.body || "Untitled question"}
                </p>
              </div>
            )}
            {activeRound && (
              <div className="border border-primary bg-surface p-4 shadow-lg opacity-90">
                <p className="font-semibold text-foreground">
                  {activeRound.title || "Untitled Round"}
                </p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* JSON Import Modal */}
      {showJsonImport && (
        <JsonImportModal
          eventId={eventId}
          rounds={rounds}
          onImported={handleJsonImported}
          onRoundsCreated={(newRounds) => setRounds([...rounds, ...newRounds])}
          onRoundsReplaced={(newRounds, newQuestions) => { setRounds(newRounds); setQuestions(newQuestions); }}
          onClose={() => setShowJsonImport(false)}
        />
      )}

      {/* MindScan Generate Modal */}
      {showMindScan && (
        <MindScanModal
          rounds={rounds}
          onImported={handleMindScanImported}
          onClose={() => setShowMindScan(false)}
        />
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="w-full pl-20 pr-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/host/events/${eventId}`}>
              <Button variant="outline" className="font-semibold gap-1.5">
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Edit Event
              </Button>
            </Link>
            <span className="text-xs text-muted-foreground h-4">
              {isEnded && <span className="text-muted-foreground">Read-only · game ended</span>}
              {!isEnded && saveStatus === "saving" && "Saving..."}
              {!isEnded && saveStatus === "saved" && "✓ Saved"}
              {!isEnded && saveStatus === "error" && <span className="text-wrong">{saveError ?? "Save failed"}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isEnded ? (
              <>
                <Button
                  variant="outline"
                  onClick={duplicateEvent}
                  disabled={duplicating}
                  className="font-semibold"
                >
                  {duplicating ? "Duplicating..." : "Duplicate as Template"}
                </Button>
                <Link href={`/host/game/${joinCode}/summary`}>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary-hover font-semibold">
                    View Summary
                  </Button>
                </Link>
              </>
            ) : (
              <Link href={`/host/game/${joinCode}/control`}>
                <Button className="bg-primary text-primary-foreground hover:bg-primary-hover font-semibold">
                  {isActive ? "Resume Game" : "Launch Game"}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
