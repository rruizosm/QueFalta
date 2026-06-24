-- apple_credentials — guarda el refresh_token de "Iniciar sesión con Apple" de
-- cada usuario para poder REVOCARLO al borrar la cuenta (App Store 5.1.1(v):
-- borrar cuenta debe revocar los tokens del proveedor).
--
-- En el flujo NATIVO no tenemos refresh_token directamente: la Edge Function
-- `apple-link` canjea el `authorizationCode` que entrega la app por un
-- refresh_token y lo guarda aquí. `delete-account` lo lee y lo revoca.
--
-- Sensible: NUNCA debe ser legible por el cliente. Tabla con RLS habilitada y
-- SIN policies → anon/authenticated no pueden ni leer ni escribir; solo el
-- service_role (que salta RLS) la toca desde las Edge Functions.
--
-- Ejecutar en: Supabase → SQL Editor.

create table if not exists public.apple_credentials (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at   timestamptz not null default now()
);

alter table public.apple_credentials enable row level security;

-- Cinturón y tirantes: además de no crear policies, retiramos los grants por
-- defecto a los roles del cliente.
revoke all on public.apple_credentials from anon, authenticated;
