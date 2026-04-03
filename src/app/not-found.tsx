import { FallingBlocksError } from "@/app/_components/falling-blocks-error";

export default function NotFound() {
  return (
    <FallingBlocksError
      heading="Page not found"
      body="The page you're looking for doesn't exist. If you have a game code, head back to join."
      actions={[
        { label: "Join a game", href: "/join" },
        { label: "Go home", href: "/", variant: "secondary" },
      ]}
    />
  );
}
