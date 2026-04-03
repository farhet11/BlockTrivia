import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { DemoView } from "./_components/demo-view";

export const metadata = {
  title: "Demo Game | BlockTrivia",
  description: "Try a live Web3 trivia demo — no host needed.",
};

export default async function DemoPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/demo");
  }

  // Pull display name from profile so the demo pre-fills it
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return <DemoView initialDisplayName={profile?.display_name ?? ""} />;
}
