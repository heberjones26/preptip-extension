// Run: npm test
// The hub's OKR 3/4 history reads three functions from the okr_trends migration. Keep the names, the
// grants and the "no user ids leave the database" rule in step with what dashboard.js calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261116000000_okr_trends.sql', import.meta.url), 'utf8');
const dashboardJs = readFileSync(new URL('../dashboard/dashboard.js', import.meta.url), 'utf8');

test('every function the hub calls for OKR history exists in the migration and is public-callable', () => {
  for (const [name, sig] of [['okr_app_usage_weekly', 'int'], ['okr_app_usage_distribution', ''], ['okr_tip_engagement_weekly', 'int']]) {
    assert.ok(sql.includes(`create or replace function public.${name}(`), `${name} is defined`);
    // the spread (distribution) is still in the database but the redesigned hub no longer draws it
    if (name !== 'okr_app_usage_distribution') assert.ok(dashboardJs.includes(name), `dashboard.js calls ${name}`);
    assert.ok(sql.includes(`grant execute on function public.${name}(${sig}) to anon, authenticated`), `${name} is granted`);
  }
});

test('the history functions return aggregates only', () => {
  for (const m of sql.matchAll(/returns table \(([^)]*)\)/g)) {
    assert.ok(!/user_id|session_id|username/.test(m[1]), `no identifier in: ${m[1]}`);
  }
  assert.equal((sql.match(/security definer/g) || []).length, 3);
});

test('the number of weeks is bounded so a request can not scan the whole table', () => {
  assert.equal((sql.match(/least\(greatest\(p_weeks, 1\), 26\)/g) || []).length, 2);
});
