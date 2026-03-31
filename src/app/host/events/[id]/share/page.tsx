import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { SharePanel } from "./_components/share-panel";

export default async function SharePage({
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
    .select("id, title, join_code, created_by")
    .eq("id", eventId)
    .single();

  if (!event || event.created_by !== user.id) notFound();

  return (
    <div className="space-y-6">
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
          {" / Share"}
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight mt-2">
          Share & QR Code
        </h1>
      </div>

      <SharePanel joinCode={event.join_code} eventTitle={event.title} />
    </div>
  );
}
