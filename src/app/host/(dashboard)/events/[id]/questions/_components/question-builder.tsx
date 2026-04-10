"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { RoundCard } from "./round-card";
import { JsonImportModal } from "./json-import-modal";
import { MindScanModal } from "./mindscan-modal";
import Link from "next/link";

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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [duplicating, setDuplicating] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastAddedRoundId, setLastAddedRoundId] = useState<string | null>(null);
  const [roundAddedFlash, setRoundAddedFlash] = useState(false);
  const roundRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isEnded = eventStatus === "ended";
  const isActive = eventStatus === "active" || eventStatus === "lobby" || eventStatus === "paused";

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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
    }
  }

  async function updateRound(roundId: string, updates: Partial<Round>) {
    markSaving();
    const { error } = await supabase
      .from("rounds")
      .update(updates)
      .eq("id", roundId);

    if (!error) {
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
      }
    }
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
        options: ["", "", "", ""],
        correct_answer: 0,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (!error && data) {
      setQuestions([...questions, data]);
      markSaved();
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
        <div className="space-y-6">
          {rounds
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((round) => (
              <div
                key={round.id}
                ref={(el) => {
                  if (el) roundRefs.current.set(round.id, el);
                  else roundRefs.current.delete(round.id);
                }}
              >
              <RoundCard
                round={round}
                questions={questionsForRound(round.id)}
                onUpdateRound={updateRound}
                onDeleteRound={deleteRound}
                onAddQuestion={addQuestion}
                onUpdateQuestion={updateQuestion}
                onDeleteQuestion={deleteQuestion}
                onMoveQuestion={moveQuestion}
                onSetModifier={setModifier}
              />
              </div>
            ))}
        </div>
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
        <div className="w-full px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground h-4">
            {isEnded && <span className="text-muted-foreground">Read-only · game ended</span>}
            {!isEnded && saveStatus === "saving" && "Saving..."}
            {!isEnded && saveStatus === "saved" && "✓ Saved"}
          </span>
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
