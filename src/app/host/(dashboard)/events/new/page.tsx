import { CreateEventForm } from "./_components/create-event-form";

export default async function CreateEventPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {from ? "Duplicate Event" : "Create Event"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {from
            ? "All details are pre-filled from the original. Edit anything before saving."
            : "Set up the basics. You'll add rounds and questions next."}
        </p>
      </div>
      <CreateEventForm fromEventId={from} />
    </div>
  );
}
