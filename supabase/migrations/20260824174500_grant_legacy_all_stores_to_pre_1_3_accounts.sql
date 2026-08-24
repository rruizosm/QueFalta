-- El primer snapshot del acceso heredado se ejecutó antes del lanzamiento de
-- QuéFalta 1.3. Incluye también las cuentas creadas desde entonces y hasta este
-- segundo snapshot, para que todas las cuentas anteriores a 1.3 conserven el
-- selector conjunto "Todos". Las altas posteriores mantienen el DEFAULT false.

update public.profiles
set legacy_all_stores_access = true
where legacy_all_stores_access = false;
