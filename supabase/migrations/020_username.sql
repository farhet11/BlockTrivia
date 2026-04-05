-- Add unique username to profiles as the public identity handle.
-- Username is the default game display name; game_alias overrides per-game.
-- Limits: 5-16 chars, alphanumeric + underscores only.
-- Admin/super_admin roles are exempt from length constraints.
-- Username can only be changed once every 14 days (enforced client-side + DB trigger).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

-- Unique index (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles (lower(username));

-- Enforce format: 5-16 chars, [a-zA-Z0-9_], exempt admin roles
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (
  username IS NULL
  OR role IN ('super_admin')
  OR (
    char_length(username) BETWEEN 5 AND 16
    AND username ~ '^[a-zA-Z0-9_]+$'
  )
);

-- Prevent username changes within 14 days (except first-time set and admins)
CREATE OR REPLACE FUNCTION enforce_username_cooldown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Skip if username didn't change
  IF OLD.username IS NOT DISTINCT FROM NEW.username THEN
    RETURN NEW;
  END IF;
  -- Allow first-time set (OLD.username IS NULL)
  IF OLD.username IS NULL THEN
    NEW.username_changed_at := now();
    RETURN NEW;
  END IF;
  -- Exempt admins
  IF NEW.role IN ('super_admin') THEN
    NEW.username_changed_at := now();
    RETURN NEW;
  END IF;
  -- Enforce 14-day cooldown
  IF OLD.username_changed_at IS NOT NULL
     AND OLD.username_changed_at > now() - interval '14 days' THEN
    RAISE EXCEPTION 'Username can only be changed once every 14 days. Next change available after %',
      (OLD.username_changed_at + interval '14 days')::date;
  END IF;
  NEW.username_changed_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER username_cooldown_check
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_username_cooldown();

-- Enforce game_alias limits: 2-20 chars
ALTER TABLE event_players ADD CONSTRAINT game_alias_length CHECK (
  game_alias IS NULL
  OR char_length(game_alias) BETWEEN 2 AND 20
);

-- Unique game_alias per event (NULL aliases don't conflict)
CREATE UNIQUE INDEX IF NOT EXISTS event_players_alias_unique
  ON event_players (event_id, lower(game_alias))
  WHERE game_alias IS NOT NULL;

-- Backfill: generate usernames from display_name for existing users.
-- Strip non-alphanumeric, truncate to 16. Skip if result < 5 chars.
UPDATE profiles
SET username = lower(regexp_replace(display_name, '[^a-zA-Z0-9_]', '', 'g'))
WHERE username IS NULL
  AND display_name IS NOT NULL
  AND char_length(regexp_replace(display_name, '[^a-zA-Z0-9_]', '', 'g')) >= 5;

-- Update handle_new_user() to also set username from OAuth metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_display_name text;
  v_full_name text;
  v_username text;
  v_base text;
  v_suffix int;
BEGIN
  -- Full name from auth metadata (private, for host comms)
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(
      concat_ws(' ',
        nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'last_name'), '')
      )
    ), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), '')
  );

  -- Display name: real name → @username → email prefix
  v_display_name := coalesce(
    nullif(trim(
      concat_ws(' ',
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), '')
      )
    ), ''),
    CASE
      WHEN nullif(new.raw_user_meta_data ->> 'telegram_username', '') IS NOT NULL
      THEN '@' || (new.raw_user_meta_data ->> 'telegram_username')
      WHEN nullif(new.raw_user_meta_data ->> 'username', '') IS NOT NULL
        AND new.raw_user_meta_data ->> 'telegram_id' IS NOT NULL
      THEN '@' || (new.raw_user_meta_data ->> 'username')
    END,
    split_part(new.email, '@', 1)
  );

  -- Username: derive from Telegram username, email prefix, or random
  v_base := coalesce(
    nullif(lower(regexp_replace(new.raw_user_meta_data ->> 'telegram_username', '[^a-zA-Z0-9_]', '', 'g')), ''),
    nullif(lower(regexp_replace(new.raw_user_meta_data ->> 'username', '[^a-zA-Z0-9_]', '', 'g')), ''),
    nullif(lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')), ''),
    'user'
  );
  -- Truncate base to 12 chars to leave room for suffix
  v_base := left(v_base, 12);
  -- Ensure minimum 5 chars
  IF char_length(v_base) < 5 THEN
    v_base := v_base || repeat('x', 5 - char_length(v_base));
  END IF;

  v_username := v_base;
  v_suffix := 0;
  -- Loop until unique
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(username) = v_username
    );
    v_suffix := v_suffix + 1;
    v_username := left(v_base, 16 - char_length(v_suffix::text)) || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, email, display_name, full_name, username, username_changed_at, avatar_url)
  VALUES (
    new.id,
    new.email,
    v_display_name,
    v_full_name,
    v_username,
    now(),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  RETURN new;
END;
$$;
