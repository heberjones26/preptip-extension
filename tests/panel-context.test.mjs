import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeTabQuery, sourceWindowId } from '../src/sidepanel/panel-context.js';
import { createPanelEngagement } from '../src/sidepanel/engagement-tracking.js';
import { metricsHarness } from './helpers/metrics-harness.mjs';

test('native sidebars follow their own browser window and detached guides follow the source window', () => {
  assert.deepEqual(activeTabQuery('moz-extension://test/src/sidepanel/sidepanel.html'), { active: true, currentWindow: true });
  assert.deepEqual(activeTabQuery('safari-web-extension://test/src/sidepanel/sidepanel.html?windowId=10'), { active: true, windowId: 10 });
  for (const value of ['', '-1', 'wrong', '1.5', 'Infinity', '9007199254740993']) {
    assert.equal(sourceWindowId(`chrome-extension://test/panel.html?windowId=${value}`), null);
  }
});

test('Firefox and Safari guide documents record usage with a stable document identity', async () => {
  for (const scheme of ['moz-extension', 'safari-web-extension']) {
    const h = metricsHarness({ modern: false });
    const base = `${scheme}://test/src/sidepanel/sidepanel.html`;
    h.env.chrome.runtime.getURL = (path) => `${scheme}://test/${path}`;
    h.env.document.location.href = scheme === 'safari-web-extension' ? `${base}?windowId=10` : base;
    const tracker = createPanelEngagement({ ...h.env, uuid: () => 'panel-instance-123' });
    tracker.open(1);
    tracker.click(8);
    await tracker.flush();
    assert.deepEqual(h.sent.map((event) => event.kind), ['open', 'click']);
    assert.ok(h.sent.every((event) => event.panelDocumentId === 'panel-instance-123'));
    assert.equal(h.sent[0].sessionId, h.sent[1].sessionId);
  }
});

test('unrelated extension pages and malformed helper URLs cannot record panel usage', async () => {
  for (const path of ['other.html', 'src/sidepanel/sidepanel.html?windowId=wrong', 'src/sidepanel/sidepanel.html?other=10']) {
    const h = metricsHarness();
    h.env.document.location.href = `chrome-extension://test/${path}`;
    const tracker = createPanelEngagement(h.env);
    tracker.open(1);
    await tracker.flush();
    assert.equal(h.sent.length, 0);
  }
});
