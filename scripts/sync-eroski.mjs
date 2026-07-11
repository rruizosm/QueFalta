#!/usr/bin/env node
// Sincroniza el catálogo de Eroski → Supabase (catálogo + búsqueda), 1×/semana.
// Eroski y Caprabo comparten backend (Apache Tapestry): toda la lógica vive en
// scripts/lib/eroski-tapestry.mjs; aquí solo se fija la tienda y las tablas.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, CONCURRENCY, DRY_RUN, MAX_LEAVES.
// Ver scripts/README-eroski-caprabo-sync.md.
import { runSync } from './lib/eroski-tapestry.mjs';

runSync({
  base: 'https://supermercado.eroski.es',
  store: 'eroski',
  table: 'eroski_products',
  catTable: 'eroski_categories',
}).catch((e) => { console.error('[eroski] ERROR', e); process.exit(1); });
