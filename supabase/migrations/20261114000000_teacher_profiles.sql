-- Store each teacher's grade band and subjects with their account so class recommendations
-- follow them across browsers and devices. The users table remains closed to the public key.

alter table public.users
  add column grade_level text,
  add column subjects text[] not null default '{}';

alter table public.users
  add constraint users_grade_level_check
    check (grade_level is null or grade_level in ('preschool', 'k3', 'g46', 'middle', 'high', 'college', 'special')),
  add constraint users_subjects_check
    check (subjects <@ array['math', 'physics', 'chemistry', 'biology', 'science', 'ela', 'languages', 'social', 'art', 'music', 'pe', 'cs', 'other']::text[]);

create or replace function public.get_teacher_profile(p_user_id bigint)
returns table (grade_level text, subjects text[])
language sql
stable
security definer
set search_path = ''
as $$
  select u.grade_level, u.subjects
    from public.users u
   where u.user_id = p_user_id;
$$;

create or replace function public.save_teacher_profile(
  p_user_id bigint,
  p_grade_level text,
  p_subjects text[] default '{}'
)
returns table (grade_level text, subjects text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_grade_level is not null and p_grade_level not in ('preschool', 'k3', 'g46', 'middle', 'high', 'college', 'special') then
    raise exception 'Choose a valid grade band' using errcode = '22023';
  end if;
  if not (coalesce(p_subjects, '{}') <@ array['math', 'physics', 'chemistry', 'biology', 'science', 'ela', 'languages', 'social', 'art', 'music', 'pe', 'cs', 'other']::text[]) then
    raise exception 'Choose valid subjects' using errcode = '22023';
  end if;

  return query
    update public.users u
       set grade_level = p_grade_level,
           subjects = coalesce(p_subjects, '{}')
     where u.user_id = p_user_id
     returning u.grade_level, u.subjects;
end;
$$;

revoke all on function public.get_teacher_profile(bigint) from public;
revoke all on function public.save_teacher_profile(bigint, text, text[]) from public;
grant execute on function public.get_teacher_profile(bigint) to anon, authenticated;
grant execute on function public.save_teacher_profile(bigint, text, text[]) to anon, authenticated;
