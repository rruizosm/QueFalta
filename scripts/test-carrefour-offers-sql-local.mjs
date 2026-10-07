#!/usr/bin/env node
// Disposable PostgreSQL regression suite. Pass an absolute PGlite module path.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20261006200559_carrefour_offer_pages.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../src/lib/carrefourOffers.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { resolveCarrefourOffers } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const day = '2026-10-06';
const promo = (name = '3x2', kind = 'multibuy', start = null, end = null) => ({ name, kind, start, end });
const v1 = (promotions, extras = {}) => ({ version: 1, promotions, ...extras });
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const page = async (options = {}) => (await query(`select public.carrefour_offer_page_v1(
  p_community => $1, p_today => $2, p_limit => $3, p_cursor => $4,
  p_tokens => $5, p_categories => $6, p_price_min => $7, p_price_max => $8,
  p_sort => $9, p_types => $10, p_categories_only => $11) data`, [
  options.community ?? null, day, options.limit ?? 2, options.cursor ?? null,
  options.tokens ?? [], options.categories ?? [], options.min ?? null, options.max ?? null,
  options.sort ?? 'name', options.types ?? [], options.categoriesOnly ?? false,
]))[0].data;

try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.carrefour_products (
      id text primary key, display_name text, display_name_norm text, thumbnail text,
      category_name text, unit_price numeric, price_format text, price_per_unit numeric,
      price_per_unit_unit text, promo_name text, promo_text text, promo_start date,
      promo_end date, strikethrough_price numeric, raw jsonb, regional_prices jsonb,
      regions text[], published boolean default true);
    alter table public.carrefour_products enable row level security;
    grant select on public.carrefour_products to anon, authenticated;
    create policy visible on public.carrefour_products for select to anon, authenticated
      using (published and category_name <> 'Hidden');`);
  await db.exec(migration);
  await db.exec(migration); // Idempotent; no data changes.

  const fixtures = [
    { unit_price: 2, promo_name: '3x2' },
    { unit_price: 2, promo_name: '2ª unidad -70%' },
    { unit_price: 2, promo_name: 'Cupón Club' },
    { unit_price: 2, promo_name: 'Envío gratis' },
    { unit_price: 2, strikethrough_price: 3 },
    { unit_price: 2, strikethrough_price: 1 },
    { unit_price: 2, strikethrough_price: 3, promo_end: '2026-10-05' },
    { unit_price: 2, promo_name: '3x2', quefalta_offers: v1([]) },
    { unit_price: 2, quefalta_offers: v1([promo(), promo('Envío gratis', 'shipping')]) },
    { unit_price: 2, quefalta_offers: v1([promo('Hoy', 'discount', day, day)], { strikethrough_price: 3 }) },
    { unit_price: 2, quefalta_offers: v1([promo('Ayer', 'discount', null, '2026-10-05'), promo('Mañana', 'club', '2026-10-07')]) },
    { unit_price: 2, quefalta_offers: { version: 1, promo_name: 'Precio rebajado', strikethrough_price: 3 } },
    { unit_price: 2, promo_name: '3x2', regional_prices: { Cataluña: { p: 2 } } },
    { unit_price: 2, quefalta_offers: v1([promo()]), regional_prices: { Cataluña: { p: 2, offers: v1([]) } } },
    { unit_price: 2, quefalta_offers: v1([promo()]), regional_prices: { Cataluña: { p: 3, offers: v1([promo('2x1')]) } } },
    ...['Air Fryer', 'Innovación', 'Novedad'].flatMap((name) => [
      { unit_price: 2, promo_name: name, strikethrough_price: 3 },
      { unit_price: 2, quefalta_offers: v1([promo(name, 'discount')]) },
    ]),
    { unit_price: 2, quefalta_offers: v1([null, {}, { name: 123, kind: 'club' }, promo('Odd', 'unknown')]) },
    { unit_price: 2, quefalta_offers: v1([promo('ISO', 'multibuy', `${day}T00:00:00Z`, `${day}T12:00:00Z`)]) },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    await query(`insert into public.carrefour_products
      (id, display_name, display_name_norm, category_name, unit_price, raw, regional_prices,
       promo_name, promo_start, promo_end, strikethrough_price)
      values ($1,$1,$1,'Test',$2,$3,$4,$5,$6,$7,$8)`, [
      `fixture-${index}`, fixture.unit_price, { quefalta_offers: fixture.quefalta_offers },
      fixture.regional_prices ?? null, fixture.promo_name ?? null, fixture.promo_start ?? null,
      fixture.promo_end ?? null, fixture.strikethrough_price ?? null,
    ]);
  }
  for (const community of [null, 'Cataluña', 'Madrid']) {
    const actual = await page({ community, limit: 200 });
    for (const [index, fixture] of fixtures.entries()) {
      const expected = resolveCarrefourOffers(fixture, community, day);
      const row = actual.rows.find((r) => r.id === `fixture-${index}`);
      assert.equal(Boolean(row), expected.promotions.length > 0, `membership fixture ${index} ${community}`);
      if (row) assert.deepEqual(resolveCarrefourOffers(row, null, day), expected, `resolution fixture ${index} ${community}`);
    }
  }
  await db.exec('truncate public.carrefour_products');
  const rows = [
    { id: 'a', unit_price: 1, price_per_unit: 4, regional_prices: { Cataluña: { p: 9, ppu: 8, ppuu: 'kg', offers: v1([promo()]) } } },
    { id: 'b', unit_price: 2, price_per_unit: 2 },
    { id: 'c', unit_price: 2, price_per_unit: 2 },
    { id: 'd', unit_price: 3, price_per_unit: null },
    { id: 'e', unit_price: null, price_per_unit: null },
    { id: 'not-in-region', unit_price: 0.5, regions: ['Canarias'] },
    { id: 'empty', unit_price: 1, offers: v1([]) },
    { id: 'expired', unit_price: 1, offers: v1([promo('Expired', 'club', null, '2026-10-05')]) },
    { id: 'future', unit_price: 1, offers: v1([promo('Future', 'club', '2026-10-07')]) },
    { id: 'shipping', unit_price: 4, category: 'Other', offers: v1([promo(), promo('Envío gratis', 'shipping')]) },
    { id: 'hidden', unit_price: 1, category: 'Hidden' },
    { id: 'unpublished', unit_price: 1, published: false },
  ];
  for (const row of rows) await query(`insert into public.carrefour_products
    (id,display_name,display_name_norm,category_name,unit_price,price_per_unit,price_per_unit_unit,raw,regional_prices,regions,published)
    values ($1,$1,$1,$2,$3,$4,'kg',$5,$6,$7,$8)`, [row.id, row.category ?? 'Food',
    row.unit_price, row.price_per_unit ?? null, { quefalta_offers: row.offers ?? v1([promo()]) },
    row.regional_prices ?? null, row.regions ?? null, row.published ?? true]);
  await db.exec('set role anon');
  for (const [sort, expected] of [
    ['name', ['a','b','c','d','e','shipping']],
    ['price_asc', ['b','c','d','shipping','a','e']],
    ['price_desc', ['a','shipping','d','b','c','e']],
    ['unit_asc', ['b','c','a','d','e','shipping']],
    ['unit_desc', ['a','b','c','d','e','shipping']],
  ]) {
    const ids = [];
    let cursor = null;
    do {
      const result = await page({ community: 'Cataluña', sort, cursor });
      ids.push(...result.rows.map((row) => row.id));
      cursor = result.nextCursor;
    } while (cursor);
    assert.deepEqual(ids, expected, sort);
  }
  assert.deepEqual((await page({ community: 'Cataluña', min: 2, max: 4, sort: 'price_asc', limit: 200 })).rows.map((r) => r.id), ['d','shipping']);
  assert.deepEqual((await page({ community: 'Cataluña', types: ['shipping'] })).rows.map((r) => r.id), ['shipping']);
  assert.deepEqual((await page({ community: 'Cataluña', categories: ['Other'], tokens: ['ship','ping'] })).rows.map((r) => r.id), ['shipping']);
  assert.deepEqual((await page({ community: 'Cataluña', categoriesOnly: true })).categories, ['Food','Other']);
  assert.equal((await page({ community: 'Cataluña', categories: ['Missing'] })).nextCursor, null);
  await db.exec('reset role; set role authenticated');
  assert.deepEqual((await page({ community: 'Cataluña', categoriesOnly: true })).categories, ['Food','Other']);
  await db.exec('reset role');
  const functions = await query("select proname, prosecdef, proconfig from pg_proc where proname like 'carrefour_offer_%_v1'");
  assert(functions.every((f) => !f.prosecdef && f.proconfig.includes('search_path=""')));
  console.log(`PASS: ${fixtures.length * 3} resolver comparisons, regional prices, all sort modes, ties/nulls, pagination, dates, filters, categories, anon/authenticated RLS, idempotence`);
} finally { await db.close(); }
