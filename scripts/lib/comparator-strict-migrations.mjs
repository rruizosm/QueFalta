// CE-103: correlación de evidencias, nunca reparación ni aplicación de SQL.
import { createHash } from 'node:crypto';

// Igual que la consulta remota: solo CRLF y delimitadores EXTERIORES. No quitar
// comentarios ni colapsar espacios dentro del SQL (cambiaría literales/cuerpos).
export const migrationTextBoundaryForm = (sql) => sql.replace(/\r\n/g, '\n').replace(/^[ \t\r\n;]+|[ \t\r\n;]+$/g, '');
const digest = (algorithm, text) => createHash(algorithm).update(text).digest('hex');

export function reconcileStrictMigrations(localFiles, capture) {
  if (!Array.isArray(localFiles) || !Array.isArray(capture?.rows)
    || !Number.isSafeInteger(capture.total_rows) || capture.total_rows !== capture.rows.length) throw new Error('ce1_incomplete_migration_capture');
  const locals = localFiles.map(({ file, sql }) => {
    if (typeof file !== 'string' || !/^[a-zA-Z0-9_-]+\.sql$/.test(file) || typeof sql !== 'string') throw new Error('ce1_invalid_local_migration');
    const parsed = /^(\d{14})_(.+)\.sql$/.exec(file);
    return { file, version: parsed?.[1] ?? null, name: parsed?.[2] ?? file.slice(0, -4),
      sha256: digest('sha256', sql), boundary_md5: digest('md5', migrationTextBoundaryForm(sql)) };
  });
  if (new Set(locals.map((item) => item.file)).size !== locals.length) throw new Error('ce1_duplicate_local_file');
  const versions = new Set();
  for (const row of capture.rows) {
    if (typeof row.version !== 'string' || !/^\d{14}$/.test(row.version) || versions.has(row.version)
      || !(row.name === null || typeof row.name === 'string')) throw new Error('ce1_invalid_remote_migration');
    versions.add(row.version);
    for (const hash of [row.joined_lf_md5, row.joined_semicolon_lf_md5]) {
      if (hash !== null && !/^[a-f0-9]{32}$/.test(hash)) throw new Error('ce1_invalid_remote_fingerprint');
    }
  }
  const matchedFiles = new Set();
  const claims = new Map();
  const rows = capture.rows.map((remote) => {
    const exact = locals.filter((local) => local.version === remote.version);
    const candidates = exact.length ? exact : locals.filter((local) => remote.name !== null && local.name === remote.name);
    for (const candidate of candidates) {
      matchedFiles.add(candidate.file);
      claims.set(candidate.file, [...(claims.get(candidate.file) ?? []), remote.version]);
    }
    const hashes = [remote.joined_lf_md5, remote.joined_semicolon_lf_md5].filter(Boolean);
    const textMatch = candidates.length === 1 && hashes.includes(candidates[0].boundary_md5);
    const association = candidates.length === 0 ? 'remote_only' : candidates.length > 1
      ? 'ambiguous_local_candidates' : exact.length ? 'same_version' : 'name_only';
    return {
      remote_version: remote.version, remote_name: remote.name, association,
      text_evidence: !candidates.length ? 'no_candidate' : !hashes.length ? 'remote_text_unavailable'
        : textMatch ? 'boundary_text_match' : 'text_equivalence_not_established',
      local_candidates: candidates.map((candidate) => ({ ...candidate, name_matches: candidate.name === remote.name })),
      remote_statement_count: remote.statement_count,
      apply_authorized: false,
    };
  });
  const countBy = (key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, rows.filter((row) => row[key] === value).length]));
  return {
    method: 'Exact version first, then exact name; MD5 used only for text correlation after CRLF/outer-delimiter normalization, not authorization or semantic equivalence.',
    remote_capture_at: capture.captured_at,
    counts: { local: locals.length, local_timestamped: locals.filter((row) => row.version).length,
      remote: rows.length, associations: countBy('association'), text_evidence: countBy('text_evidence') },
    rows,
    local_without_history_match: locals.filter((row) => !matchedFiles.has(row.file)),
    multiply_claimed_local_files: [...claims].filter(([, remoteVersions]) => remoteVersions.length > 1).map(([file, remoteVersions]) => ({ file, remote_versions: remoteVersions })),
    automatic_actions: [],
    warning: 'Unmatched local does not mean unapplied; matching history does not prove current schema. Do not db push, migration repair, delete or rename files from this report.',
  };
}
