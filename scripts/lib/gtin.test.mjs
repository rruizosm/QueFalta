import assert from 'node:assert/strict';
import test from 'node:test';
import { validGlobalGtin, validGtin } from './gtin.mjs';

test('accepts valid GTIN-8, UPC-A, EAN-13 and GTIN-14 values', () => {
  for (const value of ['96385074', '036000291452', '3608144282497', '10012345678902']) {
    assert.equal(validGtin(value), value);
  }
});

test('rejects invalid checksums, unsupported lengths and multiple identifiers', () => {
  for (const value of ['3608144282498', '12345678901', '8723400871590,8723400871576', '', null]) {
    assert.equal(validGtin(value), null);
  }
});

test('rejects restricted-circulation numbers for cross-retailer matching', () => {
  assert.equal(validGtin('2991951000004'), '2991951000004');
  assert.equal(validGlobalGtin('2991951000004'), null);
  assert.equal(validGlobalGtin('3608144282497'), '3608144282497');
});
