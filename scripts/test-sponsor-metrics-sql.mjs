import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite }=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('00000000-0000-4000-8000-000000000001');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create schema storage; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const file of ['supabase/migrations/20261001103011_sponsor_campaigns.sql','supabase/migrations/20261001200803_sponsor_banner_metrics.sql','supabase/tests/sponsor_banner_metrics.sql']) {
    await db.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));
  }
  console.log('SQL OK: ACL, dedup, active campaigns, rate limit and daily CTR. Test transaction rolled back.');
} finally { await db.close(); }
