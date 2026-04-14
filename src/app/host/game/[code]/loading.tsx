import Image from "next/image";

export default function HostGameLoading() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5 gap-4">
      <Image src="/logo-light.svg" alt="BlockTrivia" width={140} height={32} className="h-8 w-auto dark:hidden" />
      <Image src="/logo-dark.svg" alt="BlockTrivia" width={140} height={32} className="h-8 w-auto hidden dark:block" />
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading control panel...</p>
      </div>
    </div>
  );
}
