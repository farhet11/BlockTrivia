-- Fix profiles where display_name was set to the tg_ email prefix
-- (happened when Telegram users had no first/last name at signup — trigger
--  fell back to split_part(email, '@', 1) = 'tg_<id>').
--
-- For affected users, prefer: real name → @username → keep existing (no good data)

update public.profiles p
set display_name = coalesce(
  -- Real name from metadata (first + last)
  nullif(
    trim(
      concat_ws(' ',
        nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
        nullif(trim(u.raw_user_meta_data ->> 'last_name'), '')
      )
    ),
    ''
  ),
  -- @username fallback
  case
    when nullif(u.raw_user_meta_data ->> 'telegram_username', '') is not null
    then '@' || (u.raw_user_meta_data ->> 'telegram_username')
    when nullif(u.raw_user_meta_data ->> 'username', '') is not null
    then '@' || (u.raw_user_meta_data ->> 'username')
  end,
  -- No better data — leave as-is (stays tg_… until user logs in again)
  p.display_name
)
from auth.users u
where p.id = u.id
  and p.display_name like 'tg\_%' escape '\'
  and u.raw_user_meta_data ->> 'telegram_id' is not null;

-- Also improve the new-user trigger to prefer telegram_username before
-- falling back to the email prefix
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_display_name text;
begin
  -- Build display name: real name → @username → email prefix
  v_display_name := coalesce(
    nullif(trim(
      concat_ws(' ',
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), '')
      )
    ), ''),
    case
      when nullif(new.raw_user_meta_data ->> 'telegram_username', '') is not null
      then '@' || (new.raw_user_meta_data ->> 'telegram_username')
      when nullif(new.raw_user_meta_data ->> 'username', '') is not null
        and new.raw_user_meta_data ->> 'telegram_id' is not null
      then '@' || (new.raw_user_meta_data ->> 'username')
    end,
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    v_display_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;
