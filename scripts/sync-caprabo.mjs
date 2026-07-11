#!/usr/bin/env node
// Sincroniza el catálogo de Caprabo → Supabase (catálogo + búsqueda), 1×/semana.
// Caprabo es la enseña catalana de Eroski: MISMO backend (Apache Tapestry),
// mismos ids de categoría y markup. Toda la lógica vive en
// scripts/lib/eroski-tapestry.mjs; aquí solo se fija la tienda y las tablas.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, CONCURRENCY, DRY_RUN, MAX_LEAVES.
// Ver scripts/README-eroski-caprabo-sync.md.
import { runSync } from './lib/eroski-tapestry.mjs';

runSync({
  base: 'https://www.capraboacasa.com',
  store: 'caprabo',
  table: 'caprabo_products',
  catTable: 'caprabo_categories',
}).catch((e) => { console.error('[caprabo] ERROR', e); process.exit(1); });
