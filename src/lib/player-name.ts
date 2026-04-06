/**
 * Resolves a player's display name with the correct priority chain:
 *   game_alias (plain) → @username → display_name → "Player"
 *
 * The "@" prefix is added only for permanent usernames so viewers can
 * instantly distinguish a real identity from a per-game alias.
 * Never store the "@" in the DB — it is purely a render concern.
 */
export function resolvePlayerName(
  gameAlias: string | null | undefined,
  username: string | null | undefined,
  displayName: string | null | undefined
): string {
  if (gameAlias?.trim()) return gameAlias.trim();
  if (username?.trim()) return `@${username.trim()}`;
  return displayName?.trim() || "Player";
}
