-- Add full_name to profiles for organizer comms.
-- Auto-populated from auth metadata (Google full_name, Telegram first+last).
-- Private — only visible to event hosts, never shown publicly.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;

-- Backfill full_name from auth metadata for existing users
UPDATE public.profiles p
SET full_name = coalesce(
  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(trim(
    concat_ws(' ',
      nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'last_name'), '')
    )
  ), ''),
  nullif(trim(u.raw_user_meta_data ->> 'name'), '')
)
FROM auth.users u
WHERE p.id = u.id
  AND p.full_name IS NULL;

-- Update the new-user trigger to also populate full_name
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_display_name text;
  v_full_name text;
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

  INSERT INTO public.profiles (id, email, display_name, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    v_display_name,
    v_full_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  RETURN new;
END;
$$;
