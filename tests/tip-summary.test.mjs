import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeTip } from '../src/lib/tip-summary.js';
import { toTip } from '../src/lib/ai-tip.js';

test('summarizes a real catalog guide, including the final your-turn instructions', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/sidepanel/dev-catalog.json', import.meta.url), 'utf8'));
  const tip = catalog.tips.find((item) => item.title === 'Create an assignment');
  const result = summarizeTip(tip);
  assert.equal(result.overview, 'Post homework, projects, and classwork.');
  assert.deepEqual(result.actions, [
    'Open Classwork for this class.',
    'Choose Create to start a classwork post.',
    'Add the assignment title, instructions, attachments, and due date, then choose Assign, Schedule, or Save draft.'
  ]);
});

test('prefers summary, normalizes whitespace, and falls back through description and title', () => {
  assert.equal(summarizeTip({ summary: '  Share\n  a resource. ', description: 'Other text' }).overview, 'Share a resource.');
  assert.equal(summarizeTip({ summary: '\n', description: '  Send\tfeedback. ' }).overview, 'Send feedback.');
  assert.equal(summarizeTip({ summary: {}, description: 4, title: 'Make a worksheet' }).overview, 'Make a worksheet');
  assert.equal(summarizeTip({ tip_steps: [{ step_description: 'Open your document. Then edit it.' }] }).overview, 'Open your document.');
});

test('orders database steps numerically without changing the original tip', () => {
  const tip = { summary: 'Post work.', tip_steps: [
    { step_order: 3, step_type: 'your_turn', step_description: '  Publish\n  the assignment. Check the class stream.' },
    { step_order: '1', step_type: 'guided', step_description: 'Open Classwork. It is on top.' },
    { step_order: 2, step_type: 'guided', step_description: 'Choose Create. Then choose Assignment.' }
  ] };
  const original = structuredClone(tip);
  assert.deepEqual(summarizeTip(tip).actions, ['Open Classwork.', 'Choose Create.', 'Publish the assignment.']);
  assert.deepEqual(tip, original);
});

test('includes every your-turn step, including all steps of an AI tip', () => {
  const instructions = Array.from({ length: 9 }, (_, index) => `Complete task ${index + 1}. Extra explanation.`);
  const tip = toTip({ title: 'Prepare materials', summary: 'Prepare a lesson.', minutes: 3, caution: '', steps: instructions });
  assert.ok(tip.tip_steps.every((step) => step.step_type === 'your_turn'));
  assert.deepEqual(summarizeTip(tip).actions, instructions.map((value) => value.split('. ')[0] + '.'));
  assert.equal(summarizeTip(tip).overview, 'Prepare a lesson.');
});

test('summarizes raw AI step arrays as well as normalized guide steps', () => {
  assert.deepEqual(summarizeTip({ summary: 'Make a quiz.', steps: ['Open Forms. It opens in a new tab.', 'Add a question.'] }), {
    overview: 'Make a quiz.', actions: ['Open Forms.', 'Add a question.']
  });
});

test('skips malformed instructions and deduplicates repeated actions', () => {
  const result = summarizeTip({ tip_steps: [null, 4, {}, { step_description: false },
    { step_description: '  Click  Share. It is highlighted.' },
    { step_description: 'Click Share.' }, { step_description: 'CLICK SHARE' },
    { step_description: 'Copy the link.' }
  ] });
  assert.deepEqual(result.actions, ['Click Share.', 'Copy the link.']);
});

test('handles absent or malformed optional fields without throwing', () => {
  for (const tip of [undefined, null, false, 4, 'tip', {}, { summary: [], tip_steps: {} }]) {
    assert.deepEqual(summarizeTip(tip), { overview: 'This tip has no summary yet.', actions: [] });
  }
  const result = summarizeTip({ tip_steps: [
    { step_order: 'invalid', step_description: 'Open a file.' },
    { step_order: null, step_description: 'Edit the file.' },
    { step_order: -2, step_description: 'Save the file.' }
  ] });
  assert.deepEqual(result.actions, ['Open a file.', 'Edit the file.', 'Save the file.']);
});

test('keeps acronyms, quoted labels, and literal text intact for the view to escape', () => {
  const literal = 'Choose "U.S. History" & <Templates>. It is highlighted.';
  const result = summarizeTip({ summary: '<b>PDF & HTML</b>', tip_steps: [
    { step_description: literal },
    { step_description: 'Ask Dr. Smith to open the PDF. Then share it.' }
  ] });
  assert.equal(result.overview, '<b>PDF & HTML</b>');
  assert.deepEqual(result.actions, ['Choose "U.S. History" & <Templates>.', 'Ask Dr. Smith to open the PDF.']);
});

test('keeps unusually verbose summaries and instructions bounded at word boundaries', () => {
  const result = summarizeTip({ summary: 'Useful context '.repeat(80), tip_steps: [{ step_description: 'Complete the assignment '.repeat(80) }] });
  assert.ok(result.overview.length <= 320);
  assert.ok(result.actions[0].length <= 240);
  assert.match(result.overview, /…$/);
  assert.match(result.actions[0], /…$/);
  assert.doesNotMatch(result.overview, /\s…$/);
});
