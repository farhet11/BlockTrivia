"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { RoundCard } from "./round-card";
import { JsonImportModal } from "./json-import-modal";
import Link from "next/link";

export type Round = {
  id: string;
  event_id: string;
  round_type: "mcq" | "true_false" | "wipeout";
  title: string | null;
  sort_order: number;
  time_limit_seconds: number;
  base_points: number;
  time_bonus_enabled: boolean;
  wipeout_min_leverage: number | null;
  wipeout_max_leverage: number | null;
  interstitial_text?: string | null;
};

export type Question = {
  id: string;
  round_id: string;
  body: string;
  options: string[];
  correct_answer: number;
  sort_order: number;
  explanation?: string | null;
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [duplicating, setDuplicating] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          wipeout_min_leverage: round.wipeout_min_leverage,
          wipeout_max_leverage: round.wipeout_max_leverage,
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
      markSaved();
    }
  }

  async function deleteRound(roundId: string) {
    markSaving();
    const { error } = await supabase
      .from("rounds")
      .delete()
      .eq("id", roundId);

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

  return (
    <div className="space-y-6 pb-20">
      {/* Actions bar */}
      <div className="flex gap-3">
        <Button
          onClick={addRound}
          className="bg-primary text-primary-foreground hover:bg-primary-hover font-medium"
        >
          Add Round
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowJsonImport(true)}
        >
          Import JSON
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
              <RoundCard
                key={round.id}
                round={round}
                questions={questionsForRound(round.id)}
                onUpdateRound={updateRound}
                onDeleteRound={deleteRound}
                onAddQuestion={addQuestion}
                onUpdateQuestion={updateQuestion}
                onDeleteQuestion={deleteQuestion}
                onMoveQuestion={moveQuestion}
              />
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
          onClose={() => setShowJsonImport(false)}
        />
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
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
