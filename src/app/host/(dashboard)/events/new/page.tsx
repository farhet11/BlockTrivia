import { CreateEventForm } from "./_components/create-event-form";

export default function CreateEventPage() {
  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Create Event
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set up the basics. You'll add rounds and questions next.
        </p>
      </div>
      <CreateEventForm />
    </div>
  );
}
