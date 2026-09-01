import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCatalogEmbeddingMaintenance,
} from '../check-catalog-embedding-maintenance.mjs';

function healthyStatus() {
  return {
    observedAt: '2026-09-01T12:00:00Z',
    requiresAttention: false,
    table: {
      liveTuples: 194_143,
      deadTuples: 1_171,
      deadTupleRatio: 0.005995,
      deadTuplePercent: 0.6,
      deadTupleAlert: false,
      modifiedSinceAnalyze: 5_930,
    },
    autovacuum: {
      vacuumScaleFactor: 0.05,
      analyzeScaleFactor: 0.02,
    },
    hnsw: {
      valid: true,
      ready: true,
      live: true,
      indexBytes: 597_745_664,
    },
    maintenance: {
      vacuumInProgress: 0,
      indexMaintenanceInProgress: 0,
    },
  };
}

test('acepta un estado sano de Fase 5', () => {
  const result = evaluateCatalogEmbeddingMaintenance(healthyStatus());
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.summary.deadTuplePercent, 0.6);
});

test('alerta al alcanzar el cinco por ciento de tuplas muertas', () => {
  const status = healthyStatus();
  status.table.deadTupleRatio = 0.05;
  status.table.deadTuplePercent = 5;
  status.table.deadTupleAlert = true;
  status.requiresAttention = true;

  const result = evaluateCatalogEmbeddingMaintenance(status);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /Tuplas muertas.*5\.000%/);
});

test('detecta deriva de reloptions y un HNSW no listo', () => {
  const status = healthyStatus();
  status.autovacuum.vacuumScaleFactor = 0.2;
  status.hnsw.ready = false;
  status.requiresAttention = true;

  const result = evaluateCatalogEmbeddingMaintenance(status);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /vacuum_scale_factor=0\.2/);
  assert.match(result.issues.join(' '), /HNSW/);
});

test('falla cerrada ante una respuesta invalida', () => {
  const result = evaluateCatalogEmbeddingMaintenance(null);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /invalida/);
});

test('falla cerrada si el backend no informa del ratio de tuplas muertas', () => {
  const status = healthyStatus();
  status.table.deadTupleRatio = null;

  const result = evaluateCatalogEmbeddingMaintenance(status);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /Falta table\.deadTupleRatio/);
});
