#!/usr/bin/env node
// Ejecuta el SQL real en PostgreSQL embebido con catálogos y perfiles ficticios.
// Requiere una instalación temporal de PGlite; no usa red ni credenciales.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath || !isAbsolute(modulePath)) throw new Error('Indica el módulo PGlite temporal con ruta absoluta');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20260905175806_lidl_comparator_multistore.sql', import.meta.url), 'utf8');
const stores = ['mercadona','bonpreu','carrefour','bonarea','consum','dia','sorli','eroski',
  'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc','gadis','froiz','ahorramas'];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema comparator_internal;
    create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table public.profiles(id uuid primary key,lidl_store_id text,premium_until timestamptz);
    create function public.is_premium(p_id uuid) returns boolean language sql as
      $$select coalesce((select premium_until>now() from public.profiles where id=p_id),false)$$;
    create table public.lidl_product_master(id text primary key,display_name text,brand text,packaging text,ean text,thumbnail text,published boolean);
    create table public.lidl_store_products(store_id text,product_id text,category_name text,unit_price numeric,
      price_per_unit numeric,price_per_unit_unit text,promo_name text,promo_text text,promo_price numeric,
      promo_start date,promo_end date,published boolean,available boolean,primary key(store_id,product_id));
    create table public.catalog_product_embeddings(store text,product_id text,display_name text,category text,
      content_hash text,embedding_input_hash text,embedded_content_hash text,embedding text,embedded_at timestamptz,published boolean,
      constraint catalog_product_embeddings_store_check check(store<>'lidl'));
    create table public.catalog_product_match_cache_status(source_store text,source_product_id text,target_store text,
      match_version text,source_content_hash text,source_embedded_at timestamptz,target_generation bigint,
      constraint catalog_product_match_cache_status_target_store_check check(target_store<>'lidl'));
    create table comparator_internal.catalog_match_store_versions(store text primary key,generation bigint,updated_at timestamptz);
    create table public.catalog_product_matches(source_store text,source_product_id text,target_store text,target_product_id text,
      match_version text,relation text,review_decision text,confidence real,vector_score real,lexical_score real,evidence jsonb);
    create function comparator_internal.catalog_reference_price_v1(text,text,numeric,text)
      returns table(price_per_unit numeric,canonical_unit text) language sql as $$select $3,$4$$;
    create function comparator_internal.refresh_catalog_match_cache_pair_v3(text,text,text)
      returns void language sql as $$select null::void$$;
    create function public.catalog_product_identity_compatible_v1(text,text,text,text)
      returns boolean language sql as $$select true$$;
  `);
  for (const store of stores) await db.exec(`create table public.${store}_products(
    id text,display_name text,thumbnail text,unit_price numeric,price_per_unit numeric,price_per_unit_unit text,packaging text,published boolean)`);
  await db.exec(migration);
  await db.exec(`
    insert into profiles values ('00000000-0000-0000-0000-000000000001','A',now()+interval '1 day');
    set test.uid='00000000-0000-0000-0000-000000000001';
    insert into lidl_product_master values ('milk','Leche entera','Milbona','1 l',null,null,true);
    insert into lidl_store_products(store_id,product_id,category_name,unit_price,price_per_unit,price_per_unit_unit,published,available)
      values ('A','milk','Leche',1,1,'l',true,true),('B','milk','Leche',2,2,'l',true,true);
    insert into mercadona_products values ('milk','Leche entera',null,1.5,1.5,'l','1 l',true);
    insert into catalog_product_embeddings values
      ('mercadona','milk','Leche entera','Leche','h','h','h','vector',now(),true),
      ('lidl','milk','Leche entera','Leche','h','h','h','vector',now(),true);
    insert into catalog_product_matches values
      ('mercadona','milk','lidl','milk','embedding_hybrid_v3_0_60','comparable',null,0.9,0.9,0.9,'{"quantity_ratio":1}'),
      ('lidl','milk','mercadona','milk','embedding_hybrid_v3_0_60','comparable',null,0.9,0.9,0.9,'{"quantity_ratio":1}');
  `);
  const query = async (sql) => (await db.query(sql)).rows;
  const compare = (source, target) => query(`select * from comparator_internal.catalog_cheaper_products_v5('${source}','milk',array['${target}'])`);
  const price = async () => (await query("select * from public.catalog_public_product_v1('lidl','milk')"))[0];
  assert.equal((await query('select * from public.lidl_comparator_products')).length,1);
  assert.equal(Number((await price()).price_total),1);
  assert.equal((await compare('mercadona','lidl'))[0].is_cheaper,true);
  assert.equal((await compare('lidl','mercadona'))[0].is_cheaper,false);
  await db.exec("update lidl_store_products set price_per_unit=null where store_id='A'");
  assert.equal((await compare('lidl','mercadona')).length,0);
  assert.equal((await compare('mercadona','lidl')).length,0);
  await db.exec("update lidl_store_products set price_per_unit=1 where store_id='A'");
  await db.exec("update profiles set lidl_store_id='B'");
  assert.equal(Number((await price()).price_total),2);
  assert.equal((await compare('mercadona','lidl'))[0].is_cheaper,false);
  assert.equal((await compare('lidl','mercadona'))[0].is_cheaper,true);
  await db.exec("update lidl_store_products set available=false where store_id='B'");
  assert.equal(await price(),undefined);
  assert.equal((await compare('mercadona','lidl')).length,0);
  assert.equal((await compare('lidl','mercadona')).length,0);
  await db.exec("update profiles set lidl_store_id='missing'");
  assert.equal(await price(),undefined);
  await db.exec("update profiles set lidl_store_id='A',premium_until=now()-interval '1 day'");
  assert.equal(await price(),undefined);
  await db.exec("update profiles set premium_until=now()+interval '1 day'; set test.uid=''");
  assert.equal(await price(),undefined);
  await db.exec("set test.uid='00000000-0000-0000-0000-000000000001'");
  await db.exec("update lidl_store_products set promo_name='Oferta',promo_price=0.8,promo_start=current_date-1,promo_end=current_date+1 where store_id='A'");
  assert.equal(Number((await price()).price_total),0.8);
  assert.equal(Number((await price()).price_per_unit),0.8);
  await db.exec("update lidl_store_products set promo_end=current_date-1 where store_id='A'");
  assert.equal(Number((await price()).price_total),1);
  await db.exec("update lidl_store_products set promo_end=current_date+1,promo_name='3x0,80€' where store_id='A'");
  assert.equal(Number((await price()).price_total),1);
  await db.exec("update lidl_store_products set promo_name='Oferta',promo_text='Compra mín. 3 uds.' where store_id='A'");
  assert.equal(Number((await price()).price_total),1);
  await db.exec("update catalog_product_embeddings set embedded_content_hash='old' where store='lidl'");
  assert.equal((await compare('mercadona','lidl')).length,0);
  assert.equal((await compare('lidl','mercadona')).length,0);
  await db.exec('update lidl_store_products set published=false');
  assert.equal((await query('select * from public.lidl_comparator_products')).length,0);
  for (const role of ['anon','authenticated']) {
    assert.equal((await query(`select has_table_privilege('${role}','public.lidl_comparator_products','select') as allowed`))[0].allowed,false);
  }
  console.log('PASS: SQL Lidl origen/destino, precio por tienda y unidad conocida, bajas, Plus, autenticación, promociones, hashes, deduplicación y permisos.');
} finally {
  await db.close();
}
