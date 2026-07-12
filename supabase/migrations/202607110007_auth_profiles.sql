create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  generated_code text;
  requested_name text;
begin
  requested_name := trim(coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1), 'Player'));
  if requested_name = '' then requested_name := 'Player'; end if;

  loop
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where player_code = generated_code);
  end loop;

  insert into public.profiles(id, display_name, player_code, avatar_url)
  values (new.id, left(requested_name, 30), generated_code, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_auth_signup on auth.users;
create trigger create_profile_after_auth_signup
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

insert into public.profiles(id, display_name, player_code, avatar_url)
select u.id,
       left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Player'), 30),
       upper(substr(replace(u.id::text, '-', ''), 1, 6)),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;
