"use client";

import { useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { RoundCard } from "./round-card";
import { JsonImportModal } from "./json-import-modal";

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
  initialRounds,
  initialQuestions,
}: {
  eventId: string;
  initialRounds: Round[];
  initialQuestions: Question[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rounds, setRounds] = useState<Round[]>(initialRounds);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [showJsonImport, setShowJsonImport] = useState(false);

  const questionsForRound = useCallback(
    (roundId: string) =>
      questions
        .filter((q) => q.round_id === roundId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [questions]
  );

  async function addRound() {
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
    }
  }

  async function deleteRound(roundId: string) {
    const { error } = await supabase
      .from("rounds")
      .delete()
      .eq("id", roundId);

    if (!error) {
      setRounds(rounds.filter((r) => r.id !== roundId));
      setQuestions(questions.filter((q) => q.round_id !== roundId));
    }
  }

  async function updateRound(roundId: string, updates: Partial<Round>) {
    const { error } = await supabase
      .from("rounds")
      .update(updates)
      .eq("id", roundId);

    if (!error) {
      setRounds(rounds.map((r) => (r.id === roundId ? { ...r, ...updates } : r)));
    }
  }

  async function addQuestion(roundId: string) {
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
    }
  }

  async function updateQuestion(questionId: string, updates: Partial<Question>) {
    const { error } = await supabase
      .from("questions")
      .update(updates)
      .eq("id", questionId);

    if (!error) {
      setQuestions(
        questions.map((q) => (q.id === questionId ? { ...q, ...updates } : q))
      );
    }
  }

  async function deleteQuestion(questionId: string) {
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);

    if (!error) {
      setQuestions(questions.filter((q) => q.id !== questionId));
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
  }

  function handleJsonImported(newQuestions: Question[]) {
    setQuestions([...questions, ...newQuestions]);
    setShowJsonImport(false);
  }

  return (
    <div className="space-y-6">
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
    </div>
  );
}
