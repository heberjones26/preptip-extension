import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharePrepTip, SHARE_MESSAGE, PREPTIP_URL } from '../src/lib/share.js';

test('sharing opens a native share sheet with the public installation link', async () => {
  let payload;
  assert.equal(await sharePrepTip({ share: async (data) => { payload = data; } }), 'shared');
  assert.equal(payload.url, PREPTIP_URL);
  assert.equal(payload.title, 'PrepTip');
  assert.ok(payload.text.includes('teacher'));
});

test('sharing copies an invitation when native sharing is absent or fails', async () => {
  for (const share of [undefined, async () => { throw new Error('Unavailable'); }]) {
    let copied;
    const phase = await sharePrepTip({ share, clipboard: { writeText: async (text) => { copied = text; } } });
    assert.equal(phase, 'copied');
    assert.equal(copied, SHARE_MESSAGE);
    assert.ok(copied.includes(PREPTIP_URL));
  }
});

test('cancelling a share sheet does not copy anything', async () => {
  const phase = await sharePrepTip({
    share: async () => { throw new DOMException('Cancelled', 'AbortError'); },
    clipboard: { writeText: () => assert.fail('A cancelled share must not touch the clipboard') }
  });
  assert.equal(phase, 'idle');
});

test('sharing leaves a manual copy path when clipboard access is unavailable', async () => {
  assert.equal(await sharePrepTip({}), 'manual');
  assert.equal(await sharePrepTip({ clipboard: { writeText: async () => { throw new Error('Denied'); } } }), 'manual');
});
