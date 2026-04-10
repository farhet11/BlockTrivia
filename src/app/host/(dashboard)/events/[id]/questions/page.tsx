import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { QuestionBuilder } from "./_components/question-builder";
import { SponsorsPanel } from "./_components/sponsors-panel";
import { SocialPanel } from "./_components/social-panel";
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
    .select("id, title, join_code, status, created_by, description, twitter_handle, hashtags")
    .eq("id", eventId)
    .single();

  if (!event || event.created_by !== user.id) notFound();

  // Fetch rounds with their questions and any active modifier
  const { data: rawRounds } = await supabase
    .from("rounds")
    .select("*, round_modifiers(modifier_type, config)")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  // Flatten round_modifiers array (max 1 per round by UNIQUE constraint)
  type RawMod = { modifier_type: string; config: Record<string, unknown> };
  const rounds = (rawRounds ?? []).map((r) => {
    const mods = r.round_modifiers as RawMod[] | null;
    const mod = Array.isArray(mods) && mods.length > 0 ? mods[0] : null;
    return {
      ...r,
      config: (r.config as Record<string, unknown>) ?? {},
      modifier_type: mod?.modifier_type ?? null,
      modifier_config: mod?.config ?? {},
      round_modifiers: undefined,
    };
  });

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
