import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestHostAccess } from '../src/lib/host-access.js';

test('requests the exact service origin synchronously to preserve the user gesture', async () => {
  const requests = [];
  const api = { runtime: { id: 'preptip' }, permissions: { request(details) { requests.push(details); return Promise.resolve(true); } } };
  const pending = requestHostAccess('https://example.supabase.co/rest/v1/tips', 'the tip service', api);
  assert.deepEqual(requests, [{ origins: ['https://example.supabase.co/*'] }]);
  await pending;
});

test('permission denial and API failure provide a recoverable message', async () => {
  for (const request of [() => Promise.resolve(false), () => Promise.reject(Error('Denied')), () => { throw Error('Denied'); }]) {
    const api = { runtime: { id: 'preptip' }, permissions: { request } };
    await assert.rejects(requestHostAccess('https://generativelanguage.googleapis.com', 'Gemini', api), {
      name: 'HostAccessError', message: 'Allow PrepTip to connect to Gemini, then try again.'
    });
  }
});

test('previews and browsers without optional permission APIs keep the normal flow', async () => {
  await requestHostAccess('https://example.com', 'the tip service', {});
  await requestHostAccess('https://example.com', 'the tip service', { runtime: { id: 'preptip' } });
});
