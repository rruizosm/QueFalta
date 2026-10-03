create table public.sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  placement text not null default 'home_banner' check (placement = 'home_banner'),
  sponsor_name text not null check (length(trim(sponsor_name)) between 1 and 120),
  image_path text not null check (image_path ~ '^[a-zA-Z0-9_-]+/[a-zA-Z0-9._/-]+[.](jpg|jpeg|png|webp)$' and image_path not like '%..%'),
  destination_ios text check (destination_ios ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  destination_android text check (destination_android ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  destination_web text check (destination_web ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
  accessibility_label_es text not null check (length(trim(accessibility_label_es)) between 1 and 2000),
  accessibility_label_ca text not null check (length(trim(accessibility_label_ca)) between 1 and 2000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  enabled boolean not null default false,
  priority integer not null default 0,
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (coalesce(destination_ios, destination_android, destination_web) is not null)
);
alter table public.sponsor_campaigns enable row level security;
revoke all on public.sponsor_campaigns from public, anon, authenticated;
grant select on public.sponsor_campaigns to authenticated;
grant all on public.sponsor_campaigns to service_role;
create policy "Read active sponsor campaigns" on public.sponsor_campaigns
  for select to authenticated
  using (enabled and starts_at <= now() and (ends_at is null or ends_at > now()));

create function public.touch_sponsor_campaign() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_sponsor_campaign() from public, anon, authenticated;
create trigger sponsor_campaign_updated before update on public.sponsor_campaigns
  for each row execute function public.touch_sponsor_campaign();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promotions', 'promotions', true, 2097152, array['image/jpeg','image/png','image/webp']);
-- No client upload/update/delete policies: administration only via Dashboard/server.
