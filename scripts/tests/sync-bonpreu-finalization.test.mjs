import test from 'node:test';
import assert from 'node:assert/strict';
import { planPublication, publishWindow } from '../lib/bonpreu-publication.mjs';
import { buildCatalogRows } from '../sync-bonpreu.mjs';

const productRows = (...ids) => ids.map((id) => ({ id, display_name: `Producto ${id}` }));

test('publica una ventana por ejecución y reanuda después del cursor confirmado', async () => {
  const rows = productRows('a', 'b', 'c', 'd', 'e');
  const written = [];
  const events = [];
  const state = { cursor: null, published: 0, total: rows.length };

  const run = () => publishWindow(rows, state, {
    limit: 2,
    batchSize: 1,
    upsertBatch: async (batch) => {
      events.push(`upsert:${batch[0].id}`);
      written.push(...batch.map((row) => row.id));
    },
    checkpointBatch: async (checkpoint) => {
      events.push(`checkpoint:${checkpoint.cursor}`);
      assert.equal(checkpoint.previousCursor, state.cursor);
      assert.equal(checkpoint.previousPublished, state.published);
      state.cursor = checkpoint.cursor;
      state.published = checkpoint.published;
    },
  });

  const first = await run();
  assert.deepEqual(first, {
    cursor: 'b', published: 2, total: 5, written: 2, complete: false,
  });
  const second = await run();
  assert.deepEqual(second, {
    cursor: 'd', published: 4, total: 5, written: 2, complete: false,
  });
  const third = await run();
  assert.deepEqual(third, {
    cursor: 'e', published: 5, total: 5, written: 1, complete: true,
  });
  assert.deepEqual(written, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(events.slice(0, 4), [
    'upsert:a', 'checkpoint:a', 'upsert:b', 'checkpoint:b',
  ]);
});

test('un fallo de upsert no avanza el checkpoint', async () => {
  let checkpoints = 0;
  await assert.rejects(
    publishWindow(productRows('a'), { cursor: null, published: 0, total: 1 }, {
      limit: 1,
      batchSize: 1,
      upsertBatch: async () => { throw new Error('522'); },
      checkpointBatch: async () => { checkpoints++; },
    }),
    /522/,
  );
  assert.equal(checkpoints, 0);
});

test('si se pierde la respuesta del checkpoint, el siguiente intento repite el upsert', async () => {
  const rows = productRows('a', 'b');
  const state = { cursor: null, published: 0, total: rows.length };
  const written = [];
  let loseCheckpointResponse = true;
  const run = () => publishWindow(rows, state, {
    limit: 1,
    batchSize: 1,
    upsertBatch: async (batch) => written.push(batch[0].id),
    checkpointBatch: async (checkpoint) => {
      if (loseCheckpointResponse) {
        loseCheckpointResponse = false;
        throw new Error('respuesta perdida');
      }
      state.cursor = checkpoint.cursor;
      state.published = checkpoint.published;
    },
  });

  await assert.rejects(run(), /respuesta perdida/);
  assert.deepEqual(state, { cursor: null, published: 0, total: 2 });
  const retry = await run();
  assert.equal(retry.cursor, 'a');
  assert.deepEqual(written, ['a', 'a']);
});

test('un plan ya confirmado por completo no vuelve a escribir productos', async () => {
  let upserts = 0;
  let checkpoints = 0;
  const result = await publishWindow(
    productRows('a', 'b'),
    { cursor: 'b', published: 2, total: 2 },
    {
      limit: 1,
      batchSize: 1,
      upsertBatch: async () => { upserts++; },
      checkpointBatch: async () => { checkpoints++; },
    },
  );

  assert.deepEqual(result, {
    cursor: 'b', published: 2, total: 2, written: 0, complete: true,
  });
  assert.equal(upserts, 0);
  assert.equal(checkpoints, 0);
});

test('rechaza cursores, contadores y totales que no describen el mismo plan', () => {
  const rows = productRows('a', 'b', 'c');
  assert.throws(
    () => planPublication(rows, { cursor: 'x', published: 1, total: 3, limit: 1 }),
    /cursor x ausente/,
  );
  assert.throws(
    () => planPublication(rows, { cursor: 'a', published: 2, total: 3, limit: 1 }),
    /cursor y contador no coinciden/,
  );
  assert.throws(
    () => planPublication(rows, { cursor: null, published: 0, total: 4, limit: 1 }),
    /total del ciclo cambió/,
  );
  assert.throws(
    () => planPublication(productRows('a', 'a'), {
      cursor: null, published: 0, total: 2, limit: 1,
    }),
    /IDs duplicados/,
  );
});

test('usa el timestamp inmutable del ciclo en productos y categorías', () => {
  const publicationStartedAt = '2026-07-29T17:47:41.583Z';
  const treeEs = {
    catRows: [{ id: 'cat', name: 'Frescos', parent_id: null, product_count: 1 }],
    n2s: [{ id: 'cat', name: 'Frescos' }],
    offerIds: new Set(),
    offerNames: new Map(),
  };
  const treeCa = {
    catRows: [{ id: 'cat', name: 'Frescos', parent_id: null, product_count: 1 }],
    n2s: [{ id: 'cat', name: 'Frescos' }],
    offerIds: new Set(),
    offerNames: new Map(),
  };
  const products = new Map([[
    'product',
    {
      id: 'product',
      retailer_product_id: null,
      display_name: 'Producto',
      raw: {},
      synced_at: 'otro-runStart',
    },
  ]]);
  const membership = new Map([['product', new Set(['cat'])]]);

  const result = buildCatalogRows(
    treeEs,
    treeCa,
    products,
    membership,
    new Map([['product', 'Producte']]),
    publicationStartedAt,
  );

  assert.equal(result.rows[0].synced_at, publicationStartedAt);
  assert.equal(result.catRows[0].synced_at, publicationStartedAt);
});
