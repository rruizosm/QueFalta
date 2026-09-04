import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The CE receipts are immutable historical snapshots. Later, independently
// reviewed product work may legitimately evolve files that those receipts
// recorded as unchanged at the time. Keep every such transition explicit so a
// different or accidental mutation still fails closed without rewriting history.
const AUTHORIZED_SUCCESSORS = {
  'src/components/SimilarProductsSection.tsx': {
    from: 'd2e594cfd4ba184e839e13c0fd5e049917a16900dfea4fa2f884992234a1127e',
    to: '03dde3d04ea1388cc960df256bf35b5edb5a4ffac5391c5d44919f7e5b385098',
    reason: 'Lidl catalog integration in 97fe3b8',
  },
  'src/components/StoreProductModal.tsx': {
    from: 'f467d6a7604f797e7b944a543310f1c30bfe3bafc40e3f8fa5cf7d4e696a45c4',
    via: '19ed4cedd54f3f675dda4b5865a098ecf9a4e9c523397b1eb614a0d1499e3c16',
    to: '078695507db8cc52d318a93cfd5a09b033a4f300e95aff7256f66efe13b6e5fa',
    reason: 'Lidl catalog integration in 97fe3b8 followed by store-specific Lidl detail resolution',
  },
  'src/api/catalog.ts': {
    from: 'bd35cdc8820661b52993a652ebc3a06b41963981df11183a9ba0880a4058bb05',
    via: '91dae040d5b3dce6c34370fa5622e718a69a73aeb4de7d28c3c84c8ae081e201',
    offers: '7833f3014f445f35d03ec00432e6ef9f64a865292afa16d1129243309e34531a',
    to: 'c6c257b1896e08e470f1eb38bacde097418daf1103db58fd1a0cad5624befa11',
    reason: 'Lidl catalog and offers integration followed by store-specific Lidl catalog reads',
  },
};

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

function assertCurrentOrAuthorized(file) {
  const actual = sha256(file.path);
  if (actual === file.sha256) return;
  const successor = AUTHORIZED_SUCCESSORS[file.path];
  assert.ok(successor, `${file.path}: unrecorded successor ${actual}`);
  assert.equal(file.sha256, successor.from, `${file.path}: unexpected historical hash`);
  assert.equal(actual, successor.to, `${file.path}: ${successor.reason}`);
}

export function assertEvidenceReferences(evidence) {
  for (const file of evidence.files ?? []) assertCurrentOrAuthorized(file);
  for (const file of evidence.protected_files ?? []) assertCurrentOrAuthorized(file);
  for (const file of asArray(evidence.previous_evidence_preserved)) assertCurrentOrAuthorized(file);
}
