-- ─────────────────────────────────────────────────────────────
-- Anti-spam: límite de solicitudes de amistad por usuario y hora.
-- ─────────────────────────────────────────────────────────────
-- La RLS ya impide enviar solicitudes en nombre de otro (requester_id =
-- auth.uid()) y el UNIQUE(requester_id, addressee_id) impide duplicar la misma.
-- Pero un cliente que use la anon key directamente podría enviar solicitudes en
-- masa a muchos usuarios discoverable (spam/acoso). Este trigger pone un techo
-- generoso por ventana móvil de 1 hora.
--
-- Nota: cuenta filas EXISTENTES en la última hora; un bucle borrar+reenviar a la
-- misma persona no se frena así (haría falta un log de intentos o un bloqueo).
-- Para v1 es suficiente; si aparece acoso 1-a-1, añadir tabla de bloqueos.
--
-- El cliente (FriendsScreen → run()) ya captura el error y muestra un aviso
-- genérico; el nombre 'friend_request_rate_limit' permite afinar el mensaje.
--
-- Ejecutar en: Supabase → SQL Editor. Requiere friendships.sql.

create or replace function public.friendships_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent
  from public.friendships
  where requester_id = new.requester_id
    and created_at > now() - interval '1 hour';

  if recent >= 20 then
    raise exception 'friend_request_rate_limit'
      using hint = 'Demasiadas solicitudes de amistad en poco tiempo. Inténtalo más tarde.';
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_rate_limit on public.friendships;
create trigger friendships_rate_limit
  before insert on public.friendships
  for each row execute function public.friendships_rate_limit();
