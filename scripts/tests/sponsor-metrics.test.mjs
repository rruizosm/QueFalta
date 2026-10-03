import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText }=ts.transpileModule(readFileSync(new URL('../../src/lib/sponsorMetrics.ts',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
});
const { visibleBannerFraction,createBannerDwell,sponsorEventId }=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('visible area excludes header, tabbar, outside viewport and zero-sized images',()=>{
  assert.equal(visibleBannerFraction(0,50,300,100,300,100,700),0.5);
  assert.equal(visibleBannerFraction(0,680,300,100,300,100,700),0.2);
  assert.equal(visibleBannerFraction(-150,150,300,100,300,100,700),0.5);
  assert.equal(visibleBannerFraction(0,800,300,100,300,100,700),0);
  assert.equal(visibleBannerFraction(0,100,0,100,300,100,700),0);
});
test('one second continuously at least half visible, not merely mounted',()=>{
  const d=createBannerDwell();
  for(let t=0;t<1000;t+=200) assert.equal(d.sample(0.5,t),false);
  assert.equal(d.sample(0.5,1000),true);
  d.sample(0.49,1100); assert.equal(d.sample(1,1200),false);
});
test('background, blur, scroll and JS suspension restart dwell',()=>{
  const d=createBannerDwell();
  d.sample(1,0);d.sample(1,200);d.sample(1,400); d.reset();
  assert.equal(d.sample(1,1000),false);
  assert.equal(d.sample(1,10000),false);
});
test('event/visit IDs have valid UUID format and no reused device identifier',()=>{
  const ids=Array.from({length:1000},sponsorEventId);
  assert.equal(new Set(ids).size,1000);
  for(const id of ids) assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
