import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/sponsorCampaign.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { selectCampaign, parseCampaign, isHttpsUrl, CAMPAIGN_CACHE_TTL } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const now = Date.parse('2026-10-01T12:00:00Z');
const row = { id: 'a', sponsor_name: 'Respira', image_path: 'respira/banner-v1.jpg', destination_ios: 'https://apps.apple.com/us/app/respira/id6759206565', destination_android: null, destination_web: null, accessibility_label_es: 'Anuncio', accessibility_label_ca: 'Anunci', starts_at: '2026-10-01T11:00:00Z', ends_at: '2026-10-01T13:00:00Z', enabled: true, priority: 0, updated_at: '2026-10-01T11:00:00Z' };
const snapshot = campaigns => ({ fetchedAt: now, campaigns });
test('only eligible platforms display the campaign', () => {
  assert.equal(selectCampaign(snapshot([row]), 'ios', now)?.id, 'a');
  assert.equal(selectCampaign(snapshot([row]), 'android', now), null);
  assert.equal(selectCampaign(snapshot([row]), 'web', now), null);
});
test('expiry, disabled status, empty response and cache age remove sponsors', () => {
  assert.equal(selectCampaign(snapshot([{ ...row, enabled: false }]), 'ios', now), null);
  assert.equal(selectCampaign(snapshot([{ ...row, starts_at: '2026-10-02T00:00:00Z', ends_at: null }]), 'ios', now), null);
  assert.equal(selectCampaign(snapshot([{ ...row, ends_at: new Date(now).toISOString() }]), 'ios', now), null);
  assert.equal(selectCampaign(snapshot([]), 'ios', now), null);
  assert.equal(selectCampaign({ fetchedAt: now - CAMPAIGN_CACHE_TTL, campaigns: [{ ...row, ends_at: null }] }, 'ios', now), null);
  assert.equal(selectCampaign(snapshot([row]), 'ios', now - 1), null);
});
test('priority uses eligible campaigns and deterministic ties', () => {
  const campaigns = [row, { ...row, id: 'b', priority: 2 }, { ...row, id: 'c', priority: 10, destination_ios: null }];
  assert.equal(selectCampaign(snapshot(campaigns), 'ios', now)?.id, 'b');
  assert.equal(selectCampaign(snapshot([{ ...row, id: 'b' }, row]), 'ios', now)?.id, 'a');
});
test('malformed cache, paths and unsafe destinations are rejected', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'not a url']) assert.equal(isHttpsUrl(url), false);
  for (const value of [null, {}, { ...row, image_path: '../secret.jpg' }, { ...row, ends_at: 'invalid' }, { ...row, destination_ios: 'javascript:alert(1)' }]) assert.equal(parseCampaign(value), null);
  for (const value of [null, {}, { fetchedAt: now, campaigns: 'bad' }]) assert.equal(selectCampaign(value, 'ios', now), null);
});
