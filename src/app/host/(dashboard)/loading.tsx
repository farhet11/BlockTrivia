export default function DashboardLoading() {
  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="border-b border-border h-14" />
      <div className="max-w-4xl mx-auto w-full px-6 py-10 space-y-6">
        <div className="h-8 w-48 bg-muted/50 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/30 animate-pulse border border-border" />
          ))}
        </div>
      </div>
    </div>
  );
}
