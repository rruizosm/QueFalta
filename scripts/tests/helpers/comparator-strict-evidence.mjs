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
    via: '03dde3d04ea1388cc960df256bf35b5edb5a4ffac5391c5d44919f7e5b385098',
    beforeBm: '130f0490a3d0384d5267a2f011f664c9009731f643db90c58f22cfc1428e6096',
    beforeEljamon: '5cf5a21d391021ae85253b174f7a8d1fa439d612f4bc084b58f94552493e48f6',
    to: '6bd92a866449ea87b4cb52d90e078cffa688c200bf1496dea49f2b1bbc2ce46b',
    reason: 'Lidl catalog integration in 97fe3b8, explicit exclusion of unsupported BM multizone comparison on 2026-09-20, then exclusion of El Jamón during the owner-requested full-branch merge on 2026-09-28',
  },
  'src/components/StoreProductModal.tsx': {
    from: 'f467d6a7604f797e7b944a543310f1c30bfe3bafc40e3f8fa5cf7d4e696a45c4',
    via: '19ed4cedd54f3f675dda4b5865a098ecf9a4e9c523397b1eb614a0d1499e3c16',
    beforePerformance: '078695507db8cc52d318a93cfd5a09b033a4f300e95aff7256f66efe13b6e5fa',
    beforeBm: 'c23ec155765095c0bf03fa2f7e34da418bf35fbe7b2268e491bdebfcb0b8cc29',
    beforeEljamon: '6dbf7453cff4b4453b99cb9cbe1e9873c51179f306f4d1571a1fa57b0b45db84',
    to: '8a2744301b69145b7050d48e293c238b36c1e928d97e8c19e24d3db8ca0692db',
    reason: 'Lidl-specific detail resolution, session caching, BM location-specific detail support on 2026-09-20, then El Jamón detail routing in the owner-requested full-branch merge on 2026-09-28',
  },
  'src/api/catalog.ts': {
    from: 'bd35cdc8820661b52993a652ebc3a06b41963981df11183a9ba0880a4058bb05',
    via: '91dae040d5b3dce6c34370fa5622e718a69a73aeb4de7d28c3c84c8ae081e201',
    offers: '7833f3014f445f35d03ec00432e6ef9f64a865292afa16d1129243309e34531a',
    storeSpecific: 'c6c257b1896e08e470f1eb38bacde097418daf1103db58fd1a0cad5624befa11',
    beforePerformance: '4769092070d0222b02103a43af96e4420fdff53cf1af53591a4eb7d02b149633',
    beforeLidlPlusRequirement: '82881cc60a232c8c37a7386a06d048b7657dfa40e8a29b6db7f92eeb0ae761af',
    beforeSearchRoutingAndBm: '0e053059b73bef41e531b1ab669f84546ab01bf69f3a151e513745caa89adca7',
    beforeBmProvinceCoverage: '7a39686f481c69bdf76c7264fb397b5eacbdfe55838ac1b01179381c83f63a72',
    beforeEljamon: '5235e20af5c2ddc940ec75036f600a478eb5a57175ac84f031b2621260982769',
    to: '73a34f066bec549986e54623f6f36007edc306cf13c371037834a76d73cc1d2d',
    reason: 'Lidl catalog and offers integration, isolated search routing, BM multizone and province-wide postal support, then El Jamón and BM offer fields in the owner-requested full-branch merge on 2026-09-28',
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
