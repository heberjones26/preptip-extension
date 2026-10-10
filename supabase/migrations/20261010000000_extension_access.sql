-- PrepTip extension access.
-- The extension talks to Supabase with the public publishable key (the `anon` role),
-- so everything it can do is defined here.

-- 1. Anyone can read the tip catalog.
create policy "Public can read websites"
  on public.websites for select to anon, authenticated using (true);

create policy "Public can read tips"
  on public.tips for select to anon, authenticated using (true);

create policy "Public can read tip steps"
  on public.tip_steps for select to anon, authenticated using (true);

-- 2. Anyone can submit feedback, but nobody can read, edit or delete it with the public key.
--    A row with tip_id = null is a "request a tip" submission.
create policy "Public can submit feedback"
  on public.feedback for insert to anon, authenticated
  with check (is_helpful is not null or nullif(trim(feedback_text), '') is not null);

-- 3. Teachers identify themselves on first run with name + email (no passwords in the prototype).
--    The users table stays closed; this function finds or creates the row and returns only the id.
create or replace function public.register_teacher(p_first_name text, p_last_name text, p_email text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id bigint;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required';
  end if;

  select user_id into v_id from public.users where lower(email) = v_email limit 1;

  if v_id is null then
    insert into public.users (first_name, last_name, email)
    values (nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''), v_email)
    returning user_id into v_id;
  else
    update public.users
       set first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
           last_name  = coalesce(nullif(trim(p_last_name), ''), last_name)
     where user_id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.register_teacher(text, text, text) from public;
grant execute on function public.register_teacher(text, text, text) to anon, authenticated;
