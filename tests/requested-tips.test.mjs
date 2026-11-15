// Run: npm test
// The hub's "Requested tips" panel reads feedback rows through requested_tips() (see the migration).
// These checks keep the extension's request format, the SQL that parses it, and the privacy rules in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261115000000_requested_tips.sql', import.meta.url), 'utf8');
const supabaseJs = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
const dashboardJs = readFileSync(new URL('../dashboard/dashboard.js', import.meta.url), 'utf8');

test('the SQL parses exactly the text the extension writes for tip and resource requests', () => {
  assert.match(supabaseJs, /`Tip request\$\{where\}: \$\{text\}`/, 'requestTip format: "Tip request (<site>): <text>"');
  assert.match(supabaseJs, /`Resource request: \$\{text\}`/, 'requestResource format');
  assert.match(sql, /\^\(\?:Tip\|Resource\) request\(\?: \\\(\(\[\^\)\]\*\)\\\)\)\?:/, 'regex handles the optional "(site)"');
  assert.match(sql, /f\.tip_id is null/, 'ratings and comments on tips are never treated as requests');
});

test('only a scrubbed, anonymous view leaves the database', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.requested_tips'));
  assert.match(fn, /security definer/);
  assert.match(fn, /scrub_public_text\(parts\[2\], 300\)/, 'the wording is scrubbed on read, so old unscrubbed rows are covered');
  assert.match(fn, /scrub_public_text\(parts\[1\], 60\)/, 'the site name is scrubbed too');
  const returns = fn.slice(fn.indexOf('returns table'), fn.indexOf('language sql'));
  assert.ok(!/user_id|feedback_id|username/.test(returns), 'no identifier of a teacher is returned');
  assert.match(sql, /revoke all on function public\.scrub_public_text\(text, int\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.requested_tips\(int\) to anon, authenticated/);
});

test('the scrubber removes the same kinds of things as the extension scrub()', () => {
  for (const [what, marker] of [['web addresses', "'[url]'"], ['www links', 'www'], ['emails', "'[email]'"], ['keys', "'[key]'"], ['long tokens', "'[token]'"], ['phone-like numbers', "'[number]'"]]) {
    assert.ok(sql.includes(marker), `scrub_public_text handles ${what}`);
  }
});

test('the hub asks for the window it shows and escapes what it prints', () => {
  assert.match(dashboardJs, /requested_tips\?p_days=\$\{days\}/);
  assert.match(dashboardJs, /esc\(r\.wording\)/);
  assert.match(dashboardJs, /esc\(r\.site \|\| '—'\)/);
});
