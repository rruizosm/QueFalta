import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20260907111958_allow_lidl_cart_items.sql', import.meta.url),
  'utf8',
);

for (const constraint of [
  'list_items_store_key_allowed',
  'purchase_items_store_key_allowed',
  'list_items_note_product_shape',
  'purchase_items_note_product_shape',
]) {
  test(`${constraint} permite Lidl`, () => {
    const definition = migration.match(
      new RegExp(`add constraint ${constraint} check \\(([\\s\\S]*?)\\n  \\);`, 'i'),
    )?.[1] ?? '';

    assert.match(definition, /'lidl'/i);
  });
}
