import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CreateEventForm } from "./_components/create-event-form";

export default async function CreateEventPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  const isAuthorized = profile?.role === "host" || profile?.role === "super_admin";

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Create Event
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAuthorized
            ? "Set up the basics. You'll add rounds and questions next."
            : "Host access required to create events."}
        </p>
      </div>

      {isAuthorized ? (
        <CreateEventForm />
      ) : (
        <div className="border border-border bg-surface p-6 space-y-4">
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              Want to run a BlockTrivia game?
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Host access is invite-only for now. Reach out and we&apos;ll get
              you set up — usually within 24 hours.
            </p>
          </div>
          <a
            href="https://t.me/elfarouq"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-11 px-5 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Request Host Access →
          </a>
        </div>
      )}
    </div>
  );
}
