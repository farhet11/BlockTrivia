import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { QuestionBuilder } from "./_components/question-builder";
import { SponsorsPanel } from "./_components/sponsors-panel";
import { SocialPanel } from "./_components/social-panel";
import { EventLogoPanel } from "./_components/event-logo-panel";
import { JoinCodeCopy } from "./_components/join-code-copy";
import { ShareButton } from "./_components/share-button";

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
    .select("id, title, join_code, status, created_by, description, twitter_handle, hashtags, logo_url")
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
  const [{ data: questions }, { data: sponsors }] = await Promise.all([
    roundIds.length
      ? supabase.from("questions").select("*").in("round_id", roundIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from("event_sponsors").select("id, name, logo_url, sort_order").eq("event_id", eventId).order("sort_order"),
  ]);

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
          <div className="flex flex-col items-end gap-0.5">
            <JoinCodeCopy joinCode={event.join_code} />
            <ShareButton joinCode={event.join_code} />
          </div>
        </div>
      </div>

      <EventLogoPanel eventId={eventId} initialLogoUrl={event.logo_url ?? null} />

      <SponsorsPanel eventId={eventId} initialSponsors={sponsors ?? []} />

      <SocialPanel
        eventId={eventId}
        eventTitle={event.title}
        initialTwitterHandle={event.twitter_handle ?? null}
        initialHashtags={event.hashtags ?? null}
      />

      <QuestionBuilder
        eventId={eventId}
        joinCode={event.join_code}
        eventStatus={event.status}
        eventTitle={event.title}
        eventDescription={event.description ?? ""}
        initialRounds={rounds ?? []}
        initialQuestions={questions ?? []}
      />
    </div>
  );
}
