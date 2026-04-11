import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { CreateEventForm } from "../new/_components/create-event-form";
import type { EditEventData } from "../new/_components/create-event-form";

export default async function EditEventPage({
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

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, description, prizes, organizer_name, format, access_mode, logo_url, logo_dark_url, scheduled_at, source_url, source_provider, cover_image_url, project_id, created_by"
    )
    .eq("id", eventId)
    .single();

  if (!event || event.created_by !== user.id) notFound();

  // Load access list emails for whitelist/blacklist events
  const { data: accessList } = event.access_mode !== "open"
    ? await supabase
        .from("event_access_list")
        .select("email")
        .eq("event_id", eventId)
    : { data: [] };

  const editEvent: EditEventData = {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    prizes: event.prizes ?? null,
    organizer_name: event.organizer_name ?? null,
    format: event.format ?? "hybrid",
    access_mode: event.access_mode ?? "open",
    logo_url: event.logo_url ?? null,
    logo_dark_url: event.logo_dark_url ?? null,
    scheduled_at: event.scheduled_at ?? null,
    source_url: event.source_url ?? null,
    source_provider: event.source_provider ?? null,
    cover_image_url: event.cover_image_url ?? null,
    project_id: event.project_id ?? null,
    access_emails: (accessList ?? []).map((r) => r.email),
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">
          <a href="/host" className="hover:text-foreground transition-colors">
            Events
          </a>
          {" / "}
          <a
            href={`/host/events/${eventId}/questions`}
            className="hover:text-foreground transition-colors"
          >
            {event.title}
          </a>
          {" / "}
          <span className="text-foreground">Edit</span>
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight mt-2">
          Edit Event
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update your event details. Changes are saved when you hit Save.
        </p>
      </div>
      <CreateEventForm editEvent={editEvent} />
    </div>
  );
}
