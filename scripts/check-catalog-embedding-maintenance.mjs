import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPECTED_VACUUM_SCALE_FACTOR = 0.05;
const EXPECTED_ANALYZE_SCALE_FACTOR = 0.02;
const DEAD_TUPLE_ALERT_THRESHOLD = 0.05;

function finiteNumber(value) {
  if (
    value === null
    || value === undefined
    || typeof value === 'boolean'
    || (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateCatalogEmbeddingMaintenance(status) {
  const issues = [];
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    return {
      ok: false,
      issues: ['Respuesta de mantenimiento ausente o invalida'],
      summary: null,
    };
  }

  const deadRatio = finiteNumber(status.table?.deadTupleRatio);
  const vacuumScaleFactor = finiteNumber(status.autovacuum?.vacuumScaleFactor);
  const analyzeScaleFactor = finiteNumber(status.autovacuum?.analyzeScaleFactor);

  if (deadRatio === null) {
    issues.push('Falta table.deadTupleRatio');
  } else if (deadRatio >= DEAD_TUPLE_ALERT_THRESHOLD || status.table?.deadTupleAlert === true) {
    issues.push(`Tuplas muertas al ${(deadRatio * 100).toFixed(3)}% (limite 5%)`);
  }

  if (vacuumScaleFactor !== EXPECTED_VACUUM_SCALE_FACTOR) {
    issues.push(`autovacuum_vacuum_scale_factor=${vacuumScaleFactor ?? 'missing'}; esperado 0.05`);
  }
  if (analyzeScaleFactor !== EXPECTED_ANALYZE_SCALE_FACTOR) {
    issues.push(`autovacuum_analyze_scale_factor=${analyzeScaleFactor ?? 'missing'}; esperado 0.02`);
  }
  if (status.hnsw?.valid !== true || status.hnsw?.ready !== true || status.hnsw?.live !== true) {
    issues.push('El indice HNSW no esta valido, listo y vivo');
  }
  if (status.requiresAttention === true && issues.length === 0) {
    issues.push('El backend marca requiresAttention sin una causa reconocida');
  }

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      observedAt: status.observedAt ?? null,
      deadTuplePercent: finiteNumber(status.table?.deadTuplePercent),
      liveTuples: finiteNumber(status.table?.liveTuples),
      deadTuples: finiteNumber(status.table?.deadTuples),
      modifiedSinceAnalyze: finiteNumber(status.table?.modifiedSinceAnalyze),
      vacuumScaleFactor,
      analyzeScaleFactor,
      vacuumInProgress: finiteNumber(status.maintenance?.vacuumInProgress),
      indexMaintenanceInProgress: finiteNumber(status.maintenance?.indexMaintenanceInProgress),
      hnswValid: status.hnsw?.valid === true,
      hnswReady: status.hnsw?.ready === true,
      hnswBytes: finiteNumber(status.hnsw?.indexBytes),
    },
  };
}

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE || '';
  if (!supabaseUrl || !serviceRole) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/catalog_embedding_maintenance_status`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    const body = (await response.text()).slice(0, 1_000);
    throw new Error(`RPC de mantenimiento fallo (${response.status}): ${body}`);
  }

  const status = await response.json();
  const evaluation = evaluateCatalogEmbeddingMaintenance(status);
  console.log(JSON.stringify(evaluation.summary, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '## Catalog embedding maintenance',
      '',
      `- Estado: ${evaluation.ok ? 'OK' : 'ATENCION'}`,
      `- Tuplas muertas: ${evaluation.summary?.deadTuplePercent ?? 'n/a'}%`,
      `- HNSW valido/listo: ${evaluation.summary?.hnswValid}/${evaluation.summary?.hnswReady}`,
      `- Vacuum/indice en progreso: ${evaluation.summary?.vacuumInProgress ?? 'n/a'}/${evaluation.summary?.indexMaintenanceInProgress ?? 'n/a'}`,
      ...evaluation.issues.map((issue) => `- ${issue}`),
      '',
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }

  if (!evaluation.ok) {
    throw new Error(`Mantenimiento de embeddings requiere atencion: ${evaluation.issues.join('; ')}`);
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
