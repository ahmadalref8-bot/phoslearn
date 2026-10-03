-- ملفات مستخدمي فوس وصورهم
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 2 and 40)
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create or replace function public.create_phos_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'مستخدم فوس'
  );
  if char_length(v_name) < 2 then
    v_name := 'مستخدم فوس';
  end if;
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, left(v_name, 40), nullif(new.raw_user_meta_data ->> 'avatar_url', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_phos_profile_after_signup on auth.users;
create trigger create_phos_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_phos_profile();

insert into public.profiles (id, display_name, avatar_url)
select
  id,
  left(
    case
      when char_length(coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(email, ''), '@', 1), '')) >= 2
        then coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), split_part(email, '@', 1))
      else 'مستخدم فوس'
    end,
    40
  ),
  nullif(raw_user_meta_data ->> 'avatar_url', '')
from auth.users
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
