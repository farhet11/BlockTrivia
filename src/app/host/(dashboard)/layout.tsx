import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { HostNav } from "../_components/host-nav";
import { GlobalFooter } from "@/app/_components/global-footer";

export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <HostNav user={user} />
      <main className="mx-auto w-full max-w-[1600px] px-8 py-8 flex-1">{children}</main>
      <GlobalFooter />
    </div>
  );
}
