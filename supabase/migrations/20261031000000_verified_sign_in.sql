-- Verified sign-in.
-- Teachers now prove they own their email with a 6-digit code from Supabase Auth (email OTP)
-- before an account is created, and one email can only ever belong to one account.
--
-- Supabase dashboard setup this depends on (not expressible in SQL):
--   * Authentication > Email Templates > "Magic link": include {{ .Token }} so the email carries a code.
--   * Authentication > SMTP: a custom SMTP server. The built-in one only emails the project's team.

-- 1. One account per email, enforced by the database (case-insensitive).
create unique index if not exists users_email_key on public.users (lower(email));

-- 2. Lets the setup form say "this email already has an account" before it sends a code.
--    Returns only true/false; the users table stays closed.
create or replace function public.teacher_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users where lower(email) = lower(trim(p_email)));
$$;

revoke all on function public.teacher_email_exists(text) from public;
grant execute on function public.teacher_email_exists(text) to anon, authenticated;

-- 3. Called right after the code is verified, with the teacher's Auth access token.
--    The email comes from the verified Auth user, never from the request.
--    Existing account: returned as it is (the name is not overwritten), is_new = false.
--    No account yet: created with the given name, is_new = true.
create or replace function public.sign_in_teacher(p_first_name text default null, p_last_name text default null)
returns table (user_id bigint, first_name text, last_name text, email text, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_email text;
  v_id bigint;
  v_new boolean := false;
begin
  select lower(a.email) into v_email
    from auth.users a
   where a.id = auth.uid() and a.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Verify your email first' using errcode = '28000';
  end if;

  select u.user_id into v_id from public.users u where lower(u.email) = v_email;

  if v_id is null then
    if nullif(trim(p_first_name), '') is null then
      raise exception 'A first name is required to create an account' using errcode = '22023';
    end if;
    insert into public.users (first_name, last_name, email)
    values (trim(p_first_name), nullif(trim(p_last_name), ''), v_email)
    returning users.user_id into v_id;
    v_new := true;
  end if;

  return query
    select u.user_id, u.first_name, u.last_name, u.email, v_new
      from public.users u
     where u.user_id = v_id;
end;
$$;

-- Supabase grants new functions to anon directly, so revoking from public alone isn't enough.
revoke all on function public.sign_in_teacher(text, text) from public, anon;
grant execute on function public.sign_in_teacher(text, text) to authenticated;

-- 4. The old function let anyone register (or rename) any email without proving they own it.
drop function if exists public.register_teacher(text, text, text);
