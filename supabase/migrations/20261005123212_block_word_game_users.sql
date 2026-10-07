-- Suspensión temporal de Palabra de hoy por cuenta.
-- NULL o una fecha pasada permite jugar; una fecha futura impide iniciar o
-- enviar jugadas hasta ese instante. Los rankings y estadísticas siguen siendo
-- legibles porque la sanción solo afecta a la participación.
-- Para bloquear un día X completo en Madrid, guardar el inicio de X+1:
--   update public.profiles
--   set word_game_blocked_until = (date '2026-10-11'::timestamp at time zone 'Europe/Madrid')
--   where id = '<uuid>'; -- bloquea hasta el final del 10/10/2026

set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.profiles
  add column if not exists word_game_blocked_until timestamptz;

comment on column public.profiles.word_game_blocked_until is
  'Fin de la suspensión de Palabra de hoy. NULL o pasado = acceso permitido.';

-- La policy de profiles permite editar la fila propia. Igual que premium_until,
-- esta fecha es exclusivamente administrativa y el cliente no puede cambiarla.
create or replace function public.protect_word_game_blocked_until()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.word_game_blocked_until is not null then
      raise exception 'word_game_blocked_until solo puede modificarse desde el servidor';
    elsif tg_op = 'UPDATE'
       and new.word_game_blocked_until is distinct from old.word_game_blocked_until then
      raise exception 'word_game_blocked_until solo puede modificarse desde el servidor';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_word_game_blocked_until()
  from public, anon, authenticated;

drop trigger if exists profiles_protect_word_game_blocked_until on public.profiles;
create trigger profiles_protect_word_game_blocked_until
  before insert or update of word_game_blocked_until on public.profiles
  for each row execute function public.protect_word_game_blocked_until();

-- Comprobación compartida por los RPC públicos. SECURITY DEFINER es necesario
-- porque una cuenta solo debe consultar su propia sanción y nunca elegir el uid.
create or replace function private.word_assert_game_allowed()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  blocked_until timestamptz;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then
    raise exception 'WORD_AUTH_REQUIRED';
  end if;

  select p.word_game_blocked_until
  into blocked_until
  from public.profiles p
  where p.id = uid;

  if blocked_until > now() then
    raise exception 'WORD_BLOCKED';
  end if;
end;
$$;

revoke all on function private.word_assert_game_allowed()
  from public, anon, authenticated;
grant execute on function private.word_assert_game_allowed()
  to authenticated;

-- Defensa en profundidad para las funciones privadas ya concedidas a
-- authenticated: cualquier INSERT/UPDATE de la partida queda igualmente
-- abortado. Las operaciones administrativas sin auth.uid() no se bloquean.
create or replace function private.enforce_word_game_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null
     and new.user_id = uid
     and exists (
       select 1
       from public.profiles p
       where p.id = uid
         and p.word_game_blocked_until > now()
     ) then
    raise exception 'WORD_BLOCKED';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_word_game_allowed()
  from public, anon, authenticated;

drop trigger if exists word_plays_enforce_allowed on private.word_plays;
create trigger word_plays_enforce_allowed
  before insert or update on private.word_plays
  for each row execute function private.enforce_word_game_allowed();

-- Comprobar antes de entrar en las funciones privilegiadas evita trabajo y
-- hace que clientes antiguos reciban un rechazo inequívoco. word_game_today,
-- rankings y estadísticas se conservan de solo lectura.
create or replace function public.word_game_start(p_game_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.word_assert_game_allowed();
  return private.word_start(p_game_id);
end;
$$;

create or replace function public.word_game_guess(
  p_game_id uuid,
  p_word text,
  p_expected_attempts integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.word_assert_game_allowed();
  return private.word_submit(p_game_id, p_word, p_expected_attempts);
end;
$$;

create or replace function public.word_game_guess_v2(
  p_game_id uuid,
  p_word text,
  p_expected_attempts integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  game jsonb;
begin
  perform private.word_assert_game_allowed();
  game := private.word_submit(p_game_id, p_word, p_expected_attempts);
  return jsonb_build_object('accepted', true, 'game', game);
exception
  when raise_exception then
    if sqlerrm in ('WORD_INVALID', 'WORD_REPEATED') then
      return jsonb_build_object('accepted', false, 'reason', sqlerrm);
    end if;
    raise;
end;
$$;

revoke all on function public.word_game_start(uuid),
  public.word_game_guess(uuid,text,integer),
  public.word_game_guess_v2(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.word_game_start(uuid),
  public.word_game_guess(uuid,text,integer),
  public.word_game_guess_v2(uuid,text,integer)
  to authenticated;
