-- Username + password accounts. Replaces the emailed-code sign-in from 20261031000000.
-- Every account is just a unique username and a password. No email, no Supabase Auth,
-- nothing to set up in the dashboard. Passwords are hashed with bcrypt (pgcrypto) inside
-- the database, and the users table stays closed to the public key.

-- 1. Remove the emailed-code sign-in.
drop function if exists public.sign_in_teacher(text, text);
drop function if exists public.teacher_email_exists(text);
delete from auth.users; -- accounts created while trying the emailed code

-- 2. Start the users table from scratch. Feedback rows need a user, so they go too.
delete from public.feedback;
delete from public.users;
alter sequence public.users_user_id_seq restart with 1;

drop index if exists public.users_email_key;
alter table public.users
  drop column first_name,
  drop column last_name,
  drop column email,
  add column username text not null,
  add column password_hash text not null,
  add constraint users_username_format check (username ~ '^[A-Za-z0-9._-]{3,30}$');

-- One account per username, ignoring case ("Jane" and "jane" are the same).
create unique index users_username_key on public.users (lower(username));

-- 3. Create an account. Fails with code 23505 when the username is taken.
create or replace function public.create_teacher_account(p_username text, p_password text)
returns table (user_id bigint, username text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_username text := trim(p_username);
begin
  if v_username is null or v_username !~ '^[A-Za-z0-9._-]{3,30}$' then
    raise exception 'Usernames are 3 to 30 letters, numbers, dots, dashes or underscores' using errcode = '22023';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Passwords need at least 8 characters' using errcode = '22023';
  end if;

  return query
    insert into public.users (username, password_hash)
    values (v_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
    returning users.user_id, users.username;
exception when unique_violation then
  raise exception 'That username is taken' using errcode = '23505';
end;
$$;

-- 4. Sign in. Returns the account, or no rows when the username or password is wrong.
create or replace function public.sign_in_teacher(p_username text, p_password text)
returns table (user_id bigint, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.user_id, u.username
    from public.users u
   where lower(u.username) = lower(trim(p_username))
     and u.password_hash = extensions.crypt(p_password, u.password_hash);
$$;

revoke all on function public.create_teacher_account(text, text) from public;
revoke all on function public.sign_in_teacher(text, text) from public;
grant execute on function public.create_teacher_account(text, text) to anon, authenticated;
grant execute on function public.sign_in_teacher(text, text) to anon, authenticated;
