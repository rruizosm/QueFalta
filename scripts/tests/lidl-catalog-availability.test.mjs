import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { probeLidlCatalog } from '../lib/lidl-store-coverage.mjs';
import { isLidlCatalogUnavailable } from '../lib/lidl-http.mjs';

const execFileAsync = promisify(execFile);
const roots = [
  { id: '1001', name: 'Fruta y verdura', hasSubcategories: true },
  { id: '1002', name: 'Carne fresca', hasSubcategories: true },
  { id: '1005', name: 'Panadería y pastelería', hasSubcategories: true },
];
const leaves = roots.flatMap((root) => ['1001', '1002'].map((id) => ({
  id: `${root.id}:${id}`, rootId: root.id,
})));

test('el árbol nuevo confirma todas las subcategorías antes de activar el respaldo', async () => {
  const visited = [];
  await assert.rejects(probeLidlCatalog({ storeId: 'ES0951', roots, leaves,
    fetchLeaf: async (leaf) => { visited.push(leaf.id); return []; },
  }), (error) => isLidlCatalogUnavailable(error.message));
  assert.deepEqual(new Set(visited), new Set(leaves.map((leaf) => leaf.id)));
});

test('tres primeras hojas vacías no ocultan productos en otra subcategoría', async () => {
  const product = { id: 'one-product' };
  const result = await probeLidlCatalog({ storeId: 'ES0951', roots, leaves,
    fetchLeaf: async (leaf) => leaf.id === '1002:1002' ? [product] : [],
  });
  assert.deepEqual(result.get('1002:1002'), [product]);
  assert.equal(result.get('1001:1001').length, 0);
});

test('el árbol antiguo sigue detectando ausencia total', async () => {
  const oldRoots = ['Pan', 'Fruta', 'Carne'].map((name, i) => ({ id: ['90', '10', '30'][i], name }));
  await assert.rejects(probeLidlCatalog({ storeId: 'ES0951', roots: oldRoots,
    leaves: oldRoots.map((root) => ({ id: root.id, rootId: root.id })),
    fetchLeaf: async () => [],
  }), /LIDL_CATALOG_EMPTY/);
});

test('árboles desconocidos o ramas sin hojas se reservan al barrido completo', async () => {
  for (const tree of [roots.slice(0, 2), roots.map((root) => ({ ...root, name: 'Desconocida' }))]) {
    const result = await probeLidlCatalog({ roots: tree, leaves,
      fetchLeaf: async () => assert.fail('no debe sondear un árbol desconocido'),
    });
    assert.equal(result.size, 0);
  }
  assert.equal((await probeLidlCatalog({ roots, leaves: [], fetchLeaf: async () => [] })).size, 0);
});

test('un error HTTP del sondeo nunca se interpreta como catálogo vacío', async () => {
  await assert.rejects(probeLidlCatalog({ roots, leaves,
    fetchLeaf: async () => { throw new Error('/categories: HTTP 403 denied'); },
  }), (error) => !isLidlCatalogUnavailable(error.message) && /HTTP 403/.test(error.message));
});

async function runSync({ unknownNames = false, partial = false, maxLeaves = '' } = {}) {
  const tree = [...roots.map((root) => ({ ...root, name: unknownNames ? 'Nueva familia' : root.name })),
    ...Array.from({ length: 35 }, (_, i) => ({ id: `extra${i}`, name: 'Otra', hasSubcategories: false }))];
  const bootstrap = `
    const roots = ${JSON.stringify(tree)};
    globalThis.fetch = async (input, init) => {
      if (init?.method && init.method !== 'GET') throw new Error('WRITE_FORBIDDEN');
      const url = new URL(input);
      if (url.hostname === 'supabase.invalid') return Response.json([{id:'ES0951',offer_region:'26'}]);
      const path = url.pathname;
      if (path.endsWith('/offers')) return Response.json({ offers: [], totalOffers: 0 });
      if (path.endsWith('/store/ES0951/categories')) return Response.json({ categories: roots });
      if (path.endsWith('/categories')) return Response.json({ categories: [
        {id:'1001',name:'Primera'}, {id:'1002',name:'Segunda'}
      ] });
      if (path.endsWith('/products')) {
        const products = ${partial} && path.includes('/1002/categories/1002/')
          ? [{id:'one',title:'Producto',price:{price:1},imageUrl:'https://example.invalid/product.jpg'}] : [];
        return Response.json({ products, totalProducts: products.length });
      }
      throw new Error('Unexpected URL: ' + url);
    };
    await import(${JSON.stringify(new URL('../sync-lidl.mjs', import.meta.url).href)});
  `;
  return execFileAsync(process.execPath, ['--input-type=module', '--eval', bootstrap], {
    env: { ...process.env, DRY_RUN: maxLeaves ? '1' : '0', MAX_LEAVES: maxLeaves,
      SUPABASE_URL: 'https://supabase.invalid', SUPABASE_SERVICE_ROLE: 'test',
      LIDL_STORE_ID: 'ES0951', LIDL_SOURCE_STORE_ID: 'ES0951', LIDL_CAMPAIGNS_DISABLED: '1',
      EMPTY_LEAF_RETRIES: '0', REQUEST_DELAY_MS: '0', MIN_LEAVES: '35', MIN_NONEMPTY_LEAVES: '40',
    }, timeout: 10000,
  });
}

test('el sync real activa el respaldo con categorías nuevas y con nombres desconocidos, sin escribir', async () => {
  for (const unknownNames of [false, true]) await assert.rejects(runSync({ unknownNames }),
    (error) => error.code === 1 && /LIDL_CATALOG_EMPTY/.test(error.stderr) && !/WRITE_FORBIDDEN/.test(error.stderr));
});

test('un catálogo parcial sigue bloqueado por cobertura y no activa el respaldo', async () => {
  await assert.rejects(runSync({ partial: true }),
    (error) => error.code === 1 && /solo 1 hojas con productos/.test(error.stderr)
      && !/LIDL_CATALOG_EMPTY|WRITE_FORBIDDEN/.test(error.stderr));
});

test('un DRY_RUN limitado no declara ausente una tienda entera', async () => {
  const { stdout, stderr } = await runSync({ maxLeaves: '1' });
  assert.match(stdout, /prueba limitada a 1/);
  assert.doesNotMatch(stderr, /LIDL_CATALOG_EMPTY/);
});
