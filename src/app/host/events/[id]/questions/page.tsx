import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { QuestionBuilder } from "./_components/question-builder";

export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch event
  const { data: event } = await supabase
    .from("events")
    .select("id, title, join_code, status, created_by")
    .eq("id", eventId)
    .single();

  if (!event || event.created_by !== user.id) notFound();

  // Fetch rounds with their questions
  const { data: rounds } = await supabase
    .from("rounds")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: questions } = roundIds.length
    ? await supabase
        .from("questions")
        .select("*")
        .in("round_id", roundIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href="/host" className="hover:text-foreground transition-colors">
            Events
          </a>
          {" / "}
          <span>{event.title}</span>
        </p>
        <div className="flex items-center justify-between mt-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Build Questions
          </h1>
          <a
            href={`/host/events/${eventId}/share`}
            className="text-sm text-primary font-medium hover:underline underline-offset-4"
          >
            Share & QR
          </a>
        </div>
      </div>

      <QuestionBuilder
        eventId={eventId}
        initialRounds={rounds ?? []}
        initialQuestions={questions ?? []}
      />
    </div>
  );
}
