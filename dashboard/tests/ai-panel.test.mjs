// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiPanelModel } from '../ai-panel.js';

test('only Gemini builds and teachers are headline tiles', () => {
  const m = aiPanelModel({ prompts_copied: 0, built_from_paste: 0, built_with_gemini: 4, teachers: 3 });
  assert.deepEqual(m.tiles.map((t) => [t.label, t.value]), [['Tips built with Gemini', 4], ['Teachers using it', 3]]);
  assert.equal(m.none, false);
  assert.equal(m.legacy, '');
});

test('copy/paste counts from older versions are kept as a note, not dropped', () => {
  const m = aiPanelModel({ prompts_copied: 12, built_from_paste: 1, built_with_gemini: 0, teachers: 5 });
  assert.equal(m.none, false);
  assert.match(m.legacy, /12 prompts copied and 1 tip built from a pasted answer/);
  assert.equal(aiPanelModel({ prompts_copied: 1, built_from_paste: 0 }).legacy, 'Earlier versions also offered copy and paste: 1 prompt copied in this period.');
});

test('no data, missing row and junk values are all "none yet" with zeros', () => {
  for (const row of [undefined, null, {}, { built_with_gemini: 'x', teachers: -3 }]) {
    const m = aiPanelModel(row);
    assert.equal(m.none, true);
    assert.deepEqual(m.tiles.map((t) => t.value), [0, 0]);
    assert.equal(m.legacy, '');
  }
});
