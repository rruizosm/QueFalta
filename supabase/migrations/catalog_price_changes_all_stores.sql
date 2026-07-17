-- Extiende el historial semanal de precios a todos los espejos del catálogo.
-- Ejecutar después de catalog_price_changes.sql (es idempotente).

create or replace function public.catalog_track_price_change()
returns trigger
language plpgsql
as $$
begin
  if new.unit_price is distinct from old.unit_price then
    new.prev_unit_price := old.unit_price;
    new.price_changed_at := now();
    if new.unit_price is null or old.unit_price is null or old.unit_price <= 0 then
      new.price_delta_pct := null;
    else
      new.price_delta_pct := round((new.unit_price - old.unit_price) / old.unit_price * 100, 1);
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'mercadona_products', 'bonpreu_products', 'carrefour_products', 'bonarea_products',
    'consum_products', 'dia_products', 'sorli_products', 'eroski_products', 'caprabo_products',
    'condis_products', 'ametller_products', 'aldi_products', 'hiperdino_products',
    'alcampo_products', 'plusfresc_products'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I add column if not exists prev_unit_price numeric', tbl);
      execute format('alter table public.%I add column if not exists price_changed_at timestamptz', tbl);
      execute format('alter table public.%I add column if not exists price_delta_pct numeric', tbl);
      execute format('drop trigger if exists track_price_change on public.%I', tbl);
      execute format(
        'create trigger track_price_change before update of unit_price on public.%I for each row execute function public.catalog_track_price_change()',
        tbl
      );
    end if;
  end loop;
end;
$$;
