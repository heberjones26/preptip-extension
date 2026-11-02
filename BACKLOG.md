# PrepTip — Backlog (deferred from Sprint 1 build)

Items scoped but intentionally not built yet. Copy into Trello as cards when planning the next Sprint.

## 1. AI workflow automation (Sprint-required automation card)
Classify incoming **tip requests and resource requests** (the `feedback` rows with no `tip_id`, and
`Resource request:` rows) by **site + grade level**, and have an AI step **draft the tip steps** into a
new `tip_drafts` table for the team to review and approve.

- **Why it fits the rubric:** connects the app to an external service (an LLM) and the AI step makes a
  real decision (classify + route + generate structured steps), not a pass-through.
- **Shape:** a Supabase **Edge Function** (deploys with the Supabase work) triggered on new request rows,
  calling an LLM. Provider undecided — **Gemini Flash (free tier)** is the cheapest fit for a class project;
  Claude or OpenAI also work (paid key).
- **Plugs into what we built:** reuses the `feedback` request flow and the grade tags in
  `src/data/segments.js`. Output is a review queue, so nothing auto-publishes.

## 2. Apply the Supabase migrations (makes today's work live)
Run, in order, in the Supabase SQL editor (or `supabase db push`):
`20261101000000_usage_events.sql` → `20261101010000_seed_youtube_m365_padlet.sql` →
`20261101020000_seed_quizlet_khan_desmos.sql`. This turns on OKR 2 (completions), resource-open tracking,
and the 6 new sites × 10 tips (60 tips). Validated against Postgres; idempotent and additive.

## 3. Deploy the OKR dashboard
`dashboard/` is a static site — deploy free on Vercel or GitHub Pages so the team has a live URL
(it reads aggregates from Supabase with the publishable key). See `dashboard/README.md`.

## 4. Objective B tracking (Carlos)
Add `okr_app_usage()` (KR3: days-open) and `okr_tip_engagement()` (KR4: ≥10s tip views) as
security-definer functions on the shared `events` table, and log `app_open` + `tip_dwell_success` from the
extension. The dashboard cards for KR3/KR4 light up automatically once these exist.

## 5. Per-tip grade tagging
Today recommendations are tagged at the **site** level (`SITE_GRADES`). Tagging individual **tips** by grade
(e.g. a Sheets gradebook tip leans high-school) would sharpen it — but needs real per-tip grade data from
the team, so it was deferred rather than guessed.

## 6. Store teacher grade in the database (optional)
Grade currently lives only in the browser (`pt.teacher.gradeLevel`). Adding `users.grade_level` + a
`register_teacher` param would let the OKR dashboard break metrics down **by grade segment** later.
