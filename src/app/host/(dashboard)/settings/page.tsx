import { redirect } from "next/navigation";

// Settings lives on the unified /profile page.
// This route exists so the sidebar link doesn't 404.
export default function SettingsPage() {
  redirect("/profile");
}
