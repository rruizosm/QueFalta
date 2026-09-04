#!/usr/bin/env node
// Lectura LOCAL exclusivamente. Entrada: evidencia de CE-103 ya capturada.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reconcileStrictMigrations } from './lib/comparator-strict-migrations.mjs';

const root = new URL('../', import.meta.url);
const evidenceUrl = new URL('docs/comparator-strict/CE-103-evidence.json', root);
if (process.argv.length > 2) throw new Error('ce1_no_arguments_expected');
if (statSync(evidenceUrl).size > 5 * 1024 * 1024) throw new Error('ce1_evidence_too_large');
const evidence = JSON.parse(readFileSync(evidenceUrl, 'utf8'));
const capture = evidence.captures.find((item) => item.id === 'ce103q2')?.result;
const directory = new URL('supabase/migrations/', root);
const files = readdirSync(directory, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith('.sql'))
  .sort((a, b) => a.name.localeCompare(b.name)).map((item) => ({
    file: item.name, sql: readFileSync(new URL(item.name, directory), 'utf8'),
  }));
console.log(JSON.stringify({ directory: fileURLToPath(directory), ...reconcileStrictMigrations(files, capture) }, null, 2));
