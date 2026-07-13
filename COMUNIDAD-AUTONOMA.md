# Comunidad autónoma del usuario → filtro de supermercados

> Documento de diseño por fases (F0–F5), estilo `LIQUID-GLASS.md` / `ANDROID.md`.
> Objetivo: pedir la **comunidad autónoma (CCAA)** al usuario y usarla para
> **filtrar qué supermercados** aparecen en el catálogo (los regionales solo en su
> zona; los nacionales siempre). Escrito para que otra sesión lo implemente sin
> re-investigar. Rutas reales `archivo:línea` verificadas el 2026-07-12.

---

## 1. Contexto y objetivo

QuéFalta es un espejo de catálogos de supermercados españoles. Hoy hay **12
súpers** implementados (`CatalogStore` en `src/constants/stores.ts:8`) y **Hiperdino
está en camino como 13º** (Canarias). Muchos son **regionales**: no tiene sentido
enseñarle Bonpreu/Sorli/Caprabo a un usuario de Sevilla, ni Hiperdino fuera de
Canarias.

Se quiere:

1. **Onboarding**: nuevo paso "¿En qué comunidad autónoma compras?" (antes del
   paso de supermercados, para pre-filtrarlo).
2. **Usuarios ya registrados** (`onboarded_at` no nulo): al entrar, un **gate
   ligero de una sola pregunta** que pida la CCAA, sin repetir el asistente.
3. **Filtrar los súpers** del catálogo por CCAA. Nacionales (Mercadona, Carrefour,
   Dia, Aldi) siempre visibles; los regionales, solo en su(s) comunidad(es).

### Lo que ya existe y encaja (NO reinventar)

- **Preferencia de súpers por usuario**: columna `profiles.catalog_stores text[]`
  (`supabase/migrations/profile_catalog_stores.sql`). NULL/[] = "todos"
  (`normalizeCatalogStores` en `src/api/profile.ts:29-34`). Es la lista que el
  usuario marcó en onboarding y edita en Ajustes.
- **Filtro de súpers en el catálogo**: `CatalogScreen.tsx:140-143`
  ```ts
  const enabledStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const visibleStores = CATALOG_STORES.filter((s) => enabledStores.includes(s.key));
  ```
  y auto-salto si la tienda activa deja de estar permitida (`CatalogScreen.tsx:181-185`).
- **Gate de onboarding**: `navigation/index.tsx:338`
  `if (profile && !profile.onboardedAt) return <OnboardingNavigator/>`. El patrón
  a reutilizar para el gate de CCAA.
- **Vocabulario de CCAA ya en el repo**: el sync de Mercadona ya mapea
  provincia→CCAA (`scripts/sync-catalog.mjs:58-77`, `PROVINCE_COMMUNITY`) y guarda
  `mercadona_products.regions text[]` con la exclusividad regional de cada producto
  (`supabase/migrations/mercadona_region_exclusive.sql`). Ese mapa usa **nombres en
  forma local** (`Catalunya`, `Comunitat Valenciana`, `Illes Balears`, `Euskadi`…),
  NO códigos. Ver §2 la decisión sobre códigos y cómo se puentea.

### Estado de partida clave

- Onboarding = stack de 9 pantallas (`OnboardingNavigator.tsx:22-30`): `Language`,
  `Welcome`, `Name` (1/6), `Username` (2/6), `Stores` (3/6), `Avatar` (4/6),
  `Friends` (5/6), `Group` (6/6), `Done`. Los pasos numerados usan
  `OnboardingLayout step/totalSteps` (`ProgressBar`).
- Chrome compartido: `OnboardingLayout.tsx` (barra de progreso, título, footer
  Continuar/Omitir). Todas las pantallas nuevas deben usarlo.
- Convención de estilos: `colors.*` son getters mutables sobre el accent; los
  `StyleSheet.create` que usen accent van como fábrica `const themedStyles = () =>
  StyleSheet.create({…})` + `const styles = useThemedStyles(themedStyles)`
  (`ThemeContext`). Seguir el patrón (ver `StoresScreen.tsx:107`, `LanguageStepScreen.tsx:71`).
- i18n bilingüe es/ca en `src/i18n/translations.ts` (bloque `onboarding:` en es
  ~línea 520 y ca ~línea 1112). Claves se sincronizan **a mano** en ambos idiomas.

---

## 2. Modelo de datos (F0)

### Columna nueva: `profiles.region`

**Decisión:** guardar un **código ISO 3166-2:ES** corto (`ES-CT`, `ES-CN`, …) en
lugar del nombre. Justificación:

- Clave **estable e independiente del idioma** (la app tiene es/ca; el nombre
  visible se resuelve por i18n, el código no cambia).
- Evita problemas de acentos/mayúsculas/variantes ("Cataluña" vs "Catalunya").
- Es el estándar de facto; fácil de mapear a provincias/nombres.

Valores posibles: los **19** códigos del §3 **más** el sentinel **`ES`** = "toda
España / no filtrar" (para quien no quiere elegir o compra en varias). Distinción
importante:

| `region` | Significado |
|----------|-------------|
| `NULL`   | Aún NO ha respondido → dispara onboarding (nuevos) o el gate (existentes). |
| `ES`     | Respondió "toda España" → se muestran TODOS los súpers, no se vuelve a preguntar. |
| `ES-CT`… | CCAA concreta → filtra súpers a esa región. |

> **Ojo — mismatch con `mercadona_products.regions`:** esa columna guarda
> *nombres locales* (`Catalunya`…), no códigos, y es de otra feature (insignia
> "producto exclusivo de X"). NO se toca. Para futuras sinergias (filtrar también
> productos regionales de Mercadona por la CCAA del usuario) hay un puente
> código→nombre en `regions.ts` (`REGION_MERCADONA_NAME`, ver §4). Fuera de alcance
> de este doc.

### Migración SQL

Crear `supabase/migrations/profile_region.sql` (autocontenida, idempotente, aditiva,
mismo estilo que `profile_catalog_stores.sql` / `profile_onboarding.sql`):

```sql
-- profiles.region — comunidad autónoma del usuario (código ISO 3166-2:ES).
-- Sirve para filtrar qué supermercados se muestran en el catálogo: los
-- regionales solo en su(s) comunidad(es); los nacionales siempre.
--
-- NULL   = aún no ha respondido → la app pide la CCAA (paso de onboarding para
--          nuevos; gate de una sola pregunta para usuarios ya registrados).
-- 'ES'   = "toda España" (no filtrar): se muestran todos los súpers, no se
--          vuelve a preguntar.
-- 'ES-CT', 'ES-CN'… = comunidad concreta (19 códigos, ver src/constants/regions.ts).
--
-- Decisión de producto: SIN backfill. Todos los usuarios actuales nacen con
-- region NULL → verán el gate una vez. (Si algún día se quisiera saltar a los
-- existentes:  update public.profiles set region = 'ES';)
--
-- ⚠️ IMPRESCINDIBLE ejecutar antes de arrancar la app tras este cambio:
-- `fetchProfile` (src/api/profile.ts) ya selecciona `region` y falla si la
-- columna no existe (mismo patrón que onboarded_at / catalog_stores).
--
-- Ejecutar en: Supabase → SQL Editor. Aditivo. No se valida con CHECK para no
-- acoplar la BD a la lista de códigos (la valida el cliente).

alter table public.profiles
  add column if not exists region text;

comment on column public.profiles.region is
  'Comunidad autónoma del usuario (ISO 3166-2:ES). NULL = sin responder; '
  '''ES'' = toda España (sin filtro).';
```

### RLS

No hay que tocar RLS. La policy UPDATE de `profiles` (el usuario edita su propia
fila) ya cubre la columna nueva, igual que con `catalog_stores`. Las policies
SELECT restringidas de `supabase/policies/profiles_visibility.sql` seleccionan la
fila entera; `region` es de baja sensibilidad (equivale a `catalog_stores`, que ya
viaja). No añade superficie.

### Cambios en `src/api/profile.ts`

- `UserProfile`: añadir `region: RegionCode | null;` (importar de `constants/regions.ts`).
- `fetchProfile` (`profile.ts:39`): añadir `region` al `select(...)` y al objeto
  devuelto (`region: (data.region as RegionCode) ?? null`).
- `updateProfile` (`profile.ts:60-80`): aceptar `region?: RegionCode | null` y
  mapearlo a `updates.region`.
- (Opcional) helper `completeRegion(userId, region)` análogo a `completeOnboarding`,
  o simplemente reusar `updateProfile({ region })` + `applyProfile({ region })`.

`ProfileContext` no necesita cambios (ya cachea el perfil entero y `applyProfile`
parchea cualquier campo).

---

## 3. Catálogo de comunidades autónomas (19 valores)

ISO 3166-2:ES. Nombre visible por i18n (§9). Se incluyen Ceuta y Melilla.

| Código  | Nombre (es)              | Nombre (ca)              |
|---------|--------------------------|--------------------------|
| `ES-AN` | Andalucía                | Andalusia                |
| `ES-AR` | Aragón                   | Aragó                    |
| `ES-AS` | Asturias                 | Astúries                 |
| `ES-CB` | Cantabria                | Cantàbria                |
| `ES-CL` | Castilla y León          | Castella i Lleó          |
| `ES-CM` | Castilla-La Mancha       | Castella-la Manxa        |
| `ES-CN` | Canarias                 | Canàries                 |
| `ES-CT` | Cataluña                 | Catalunya                |
| `ES-EX` | Extremadura              | Extremadura              |
| `ES-GA` | Galicia                  | Galícia                  |
| `ES-IB` | Islas Baleares           | Illes Balears            |
| `ES-MC` | Región de Murcia         | Regió de Múrcia          |
| `ES-MD` | Comunidad de Madrid      | Comunitat de Madrid      |
| `ES-NC` | Navarra                  | Navarra                  |
| `ES-PV` | País Vasco               | País Basc                |
| `ES-RI` | La Rioja                 | La Rioja                 |
| `ES-VC` | Comunidad Valenciana     | Comunitat Valenciana     |
| `ES-CE` | Ceuta                    | Ceuta                    |
| `ES-ML` | Melilla                  | Melilla                  |

Más el sentinel **`ES` = "Toda España"** (última opción del selector).

---

## 4. Mapa comunidad → supermercados (`src/constants/regions.ts`, nuevo)

### Decisión de estructura

Guardar la **huella de cada súper** (`Record<CatalogStore, RegionCode[] | null>`),
NO `Record<RegionCode, CatalogStore[]>`. Justificación:

- La lista de súpers es corta y estable (13); la de CCAA es larga (19). Menos
  entradas, menos duplicación.
- "En qué comunidades opera este súper" es la unidad natural de conocimiento
  (añadir un súper = 1 línea, como en `CATALOG_STORES`).
- Los **nacionales** se expresan con el sentinel `null` (= todas) en vez de listar
  19 códigos.
- El mapa inverso `RegionCode → CatalogStore[]` se **deriva una vez** al cargar el
  módulo (memoizado), que es como lo consume la UI.

### Cobertura semilla (de la investigación + lo aportado)

| Súper (`CatalogStore`) | Alcance | Comunidades |
|------------------------|---------|-------------|
| `mercadona`  | Nacional | `null` |
| `carrefour`  | Nacional | `null` |
| `dia`        | Nacional | `null` |
| `aldi`       | Nacional | `null` |
| `esclat` (Bonpreu/Esclat) | Regional | `ES-CT` |
| `sorli`      | Regional | `ES-CT` |
| `caprabo`    | Regional | `ES-CT` |
| `ametller`   | Regional | `ES-CT` |
| `condis`     | Regional | `ES-CT`, `ES-MD` |
| `bonarea`    | Regional | `ES-CT`, `ES-AR`, `ES-VC` |
| `consum`     | Regional | `ES-VC`, `ES-MC`, `ES-CM`, `ES-AN`, `ES-CT` |
| `eroski`     | Regional | `ES-PV`, `ES-NC`, `ES-GA`, `ES-CT`, `ES-IB` |
| `hiperdino`  | Regional (13º, en camino) | `ES-CN` |

> Notas:
> - **Hiperdino** aún NO está en el tipo `CatalogStore` (`stores.ts:8`). Cuando se
>   implemente, se añade allí y su entrada aquí. Mientras tanto, dejar la línea
>   comentada o guardada tras un `// TODO Hiperdino` para no romper el tipo.
> - Eroski es fuerte en el norte; su presencia en `ES-CT`/`ES-IB` es real pero
>   menor. La cobertura es afinable sin migrar (es solo cliente), igual que
>   `zones.ts`.
> - Consum en Cataluña es limitado; se incluye porque el usuario lo pidió. Ajustar
>   si se quiere ser más estricto.

### Código propuesto

```ts
// src/constants/regions.ts
import type { CatalogStore } from './stores';

/** Códigos ISO 3166-2:ES de las 17 CCAA + Ceuta/Melilla. */
export type RegionCode =
  | 'ES-AN' | 'ES-AR' | 'ES-AS' | 'ES-CB' | 'ES-CL' | 'ES-CM' | 'ES-CN'
  | 'ES-CT' | 'ES-EX' | 'ES-GA' | 'ES-IB' | 'ES-MC' | 'ES-MD' | 'ES-NC'
  | 'ES-PV' | 'ES-RI' | 'ES-VC' | 'ES-CE' | 'ES-ML';

/** Sentinel: el usuario eligió "toda España" (sin filtro). */
export const REGION_ALL = 'ES' as const;
export type RegionValue = RegionCode | typeof REGION_ALL;

/** Orden de aparición en el selector (alfabético por nombre es; 'ES' va aparte). */
export const REGION_CODES: RegionCode[] = [
  'ES-AN','ES-AR','ES-AS','ES-CB','ES-CL','ES-CM','ES-CN','ES-CT','ES-EX',
  'ES-GA','ES-IB','ES-MC','ES-MD','ES-NC','ES-PV','ES-RI','ES-VC','ES-CE','ES-ML',
];

/** Huella de cada súper. null = nacional (disponible en todas las CCAA). */
export const STORE_REGIONS: Record<CatalogStore, RegionCode[] | null> = {
  mercadona: null,
  carrefour: null,
  dia:       null,
  aldi:      null,
  esclat:    ['ES-CT'],
  sorli:     ['ES-CT'],
  caprabo:   ['ES-CT'],
  ametller:  ['ES-CT'],
  condis:    ['ES-CT', 'ES-MD'],
  bonarea:   ['ES-CT', 'ES-AR', 'ES-VC'],
  consum:    ['ES-VC', 'ES-MC', 'ES-CM', 'ES-AN', 'ES-CT'],
  eroski:    ['ES-PV', 'ES-NC', 'ES-GA', 'ES-CT', 'ES-IB'],
  // hiperdino: ['ES-CN'],  // añadir junto con el súper en stores.ts
};

/** ¿Está `store` disponible en `region`?  'ES'/null → todos visibles. */
export function storeInRegion(store: CatalogStore, region: RegionValue | null): boolean {
  if (region == null || region === REGION_ALL) return true;
  const regions = STORE_REGIONS[store];
  return regions == null || regions.includes(region);
}

/** Súpers disponibles en una CCAA (en el orden canónico de CATALOG_STORE_KEYS). */
export function storesForRegion(region: RegionValue | null): CatalogStore[] {
  // usar CATALOG_STORE_KEYS para conservar el orden de aparición
  return (Object.keys(STORE_REGIONS) as CatalogStore[]).filter((s) => storeInRegion(s, region));
}

/** Puente a los nombres locales que usa mercadona_products.regions (futuro). */
export const REGION_MERCADONA_NAME: Partial<Record<RegionCode, string>> = {
  'ES-CT': 'Catalunya', 'ES-VC': 'Comunitat Valenciana', 'ES-IB': 'Illes Balears',
  'ES-PV': 'Euskadi',   'ES-AN': 'Andalucía', 'ES-CM': 'Castilla-La Mancha',
  'ES-CL': 'Castilla y León', 'ES-AR': 'Aragón', 'ES-GA': 'Galicia',
  'ES-CN': 'Canarias',  'ES-MD': 'Comunidad de Madrid', 'ES-MC': 'Región de Murcia',
  'ES-NC': 'Navarra',   'ES-AS': 'Asturias', 'ES-CB': 'Cantabria',
  'ES-EX': 'Extremadura','ES-RI': 'La Rioja', 'ES-CE': 'Ceuta', 'ES-ML': 'Melilla',
};
```

Los nombres visibles NO van aquí sino en i18n (§9): `t(\`region.names.${code}\`)`.

---

## 5. Cambio en el onboarding (F1)

### Inserción del paso

Nueva pantalla `src/screens/onboarding/RegionScreen.tsx`, insertada **antes** de
`Stores` (para pre-filtrar el selector de súpers):

- `OnboardingNavigator.tsx:26`: añadir `<Stack.Screen name="Region" component={RegionScreen} />`
  entre `Username` y `Stores`.
- `types.ts:328-338` (`OnboardingStackParamList`): añadir `Region: undefined;`.
- `UsernameScreen.tsx` (paso 2): su `onContinue` navega hoy a `Stores`; cambiar a
  `navigation.navigate('Region')`.
- `RegionScreen` navega a `Stores` al continuar.

### Renumeración de pasos (6 → 7)

Los `step/totalSteps` de `OnboardingLayout` pasan a `totalSteps={7}`:

| Pantalla | Antes | Ahora |
|----------|-------|-------|
| `NameScreen.tsx:54` | 1/6 | 1/7 |
| `UsernameScreen.tsx:82` | 2/6 | 2/7 |
| **`RegionScreen`** (nuevo) | — | **3/7** |
| `StoresScreen.tsx:59` | 3/6 | 4/7 |
| `AvatarScreen.tsx:69` | 4/6 | 5/7 |
| `FriendsScreen.tsx:71` | 5/6 | 6/7 |
| `GroupScreen.tsx:50` | 6/6 | 7/7 |

Region es **obligatorio** (`eyebrow={t('onboarding.required')}`), como Stores. Se
puede permitir "Toda España" como opción válida dentro de la lista (no un "Omitir"),
así el paso siempre deja `region` no-nulo.

### Guardado

Al pulsar Continuar: `updateProfile(userId, { region })` + `applyProfile({ region })`
(mismo patrón que `StoresScreen.tsx:43-55`). Guardar la selección (no diferir a Done)
para que Stores ya la lea.

### Pre-filtro del paso de súpers

En `StoresScreen.tsx` el grid recorre hoy `CATALOG_STORES` (`StoresScreen.tsx:71`).
Cambiarlo para **mostrar solo los súpers de la CCAA elegida**:

```ts
const { profile } = useProfile();
const region = profile?.region ?? null;
const shown = CATALOG_STORES.filter((s) => storeInRegion(s.key, region));
// ...map sobre `shown` en vez de CATALOG_STORES
```

- Si `region === 'ES'`, `storeInRegion` devuelve true para todos → grid completo.
- Idealmente **pre-marcar** los súpers de la región (arranca con `selected =
  shown.map(s => s.key)` en vez de `[]`), ya que el usuario declaró comprar allí.
  Mantener el mínimo de 1 (`continueDisabled={selected.length === 0}`).
- La preferencia guardada (`catalog_stores`) sigue siendo la lista final elegida;
  el filtro por región del catálogo (§7) se aplica ADEMÁS en tiempo de render.

### Wireframe — RegionScreen

```
┌─────────────────────────────────────┐
│ ←            ▓▓▓▓▓▓▓░░░░  PASO 3 DE 7 │
│                                       │
│  OBLIGATORIO                          │
│  ¿En qué comunidad                    │
│  autónoma compras?                    │
│  Te mostraremos los supermercados     │
│  disponibles en tu zona.              │
│                                       │
│  ┌───────────────────────────────┐   │
│  │ 📍  Andalucía            ○      │   │
│  ├───────────────────────────────┤   │
│  │ 📍  Aragón               ○      │   │
│  ├───────────────────────────────┤   │
│  │ 📍  Cataluña             ◉      │   │  ← seleccionada (accent)
│  ├───────────────────────────────┤   │
│  │ …  (scroll, 19 CCAA)           │   │
│  ├───────────────────────────────┤   │
│  │ 🇪🇸  Toda España         ○      │   │  ← sentinel 'ES', al final
│  └───────────────────────────────┘   │
│                                       │
│  ┌───────────────────────────────┐   │
│  │           Continuar           │   │  ← disabled hasta elegir
│  └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

Reutiliza `OnboardingLayout` + lista de tarjetas seleccionables idéntica a
`LanguageStepScreen.tsx:44-66` (icono + nombre + check `checkmark-circle`/
`ellipse-outline`, `cardOn` con `colors.accentLight`). Lista larga → dentro del
ScrollView del layout ya funciona.

---

## 6. Gate para usuarios ya registrados (F2)

### Detección

Reutilizar el patrón del gate de onboarding en `navigation/index.tsx:338`. Añadir
**justo después** del bloque de onboarding:

```tsx
// Usuario ya incorporado pero sin CCAA (columna nueva → todos empiezan NULL):
// pide la comunidad autónoma UNA vez, sin re-hacer el onboarding.
if (profile && profile.onboardedAt && !profile.region) {
  return (
    <NavigationContainer theme={theme}>
      <RegionGateScreen />
    </NavigationContainer>
  );
}
```

Puntos clave:
- Va **después** del gate de onboarding: un usuario nuevo hace el onboarding
  (que ya fija `region` en F1) y nunca llega aquí. El gate solo lo ven los
  **existentes** (onboarded, `region NULL`).
- `RegionGateScreen` es **una sola pantalla** (no un navigator): al guardar,
  `applyProfile({ region })` re-renderiza `Navigation`, la condición pasa a false
  y entra al Home. Sin sellar nada nuevo (la propia `region` no-nula es el sello).
- Si el fetch del perfil falló (`profile === null`), NO se bloquea (igual que hoy
  con onboarding): cae a la app.

### `RegionGateScreen` (nuevo, `src/screens/onboarding/RegionGateScreen.tsx`)

Comparte cuerpo con `RegionScreen` (extraer la lista a un componente
`RegionPicker` reutilizable, o duplicar). Diferencias con el paso de onboarding:
- Sin barra de progreso (`OnboardingLayout` sin `step/totalSteps`).
- Copy de bienvenida corta ("Una cosa más…").
- `onContinue`: `updateProfile({ region }) + applyProfile({ region })`.
- Sin botón atrás (es un gate, no hay a dónde volver).

### Wireframe — RegionGateScreen

```
┌─────────────────────────────────────┐
│                                       │  (sin barra de progreso)
│  Una cosa más 👋                      │
│  ¿En qué comunidad                    │
│  autónoma compras?                    │
│  Así te mostramos solo los            │
│  supermercados de tu zona. Puedes     │
│  cambiarlo luego en Ajustes.          │
│                                       │
│  ┌───────────────────────────────┐   │
│  │ 📍  Cataluña             ◉      │   │
│  │ …  (19 CCAA + Toda España)     │   │
│  └───────────────────────────────┘   │
│                                       │
│  ┌───────────────────────────────┐   │
│  │           Continuar           │   │
│  └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

> Alternativa considerada y descartada: un `<Modal>` sobre el Home. Se descarta
> porque el gate de navegación (reemplazar el árbol) es el patrón ya establecido y
> evita condiciones de carrera con los coach marks / deep links que corren al
> montar el Home.

---

## 7. Filtrado de súpers por región (F3)

### Dónde se aplica

**1) Catálogo (`CatalogScreen.tsx:140-143`)** — punto principal. Combinar la
preferencia del usuario con la región:

```ts
const region = profile?.region ?? null;
const prefStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
// Preferencia ∩ disponibles en la región:
const enabledStores = prefStores.filter((k) => storeInRegion(k, region));
const visibleStores = CATALOG_STORES.filter((s) => enabledStores.includes(s.key));
```

El auto-salto ya existente (`CatalogScreen.tsx:181-185`) se encarga de que, si la
tienda activa deja de estar en `enabledStores`, salte a la primera visible. Con
`region = 'ES'` o `null` no cambia nada respecto a hoy.

**2) Selector de súpers en onboarding (`StoresScreen.tsx`)** — ya cubierto en §5
(pre-filtro del grid).

**3) Ajustes de súpers (`CatalogStoresScreen.tsx:71`)** — el usuario solo debería
poder activar/desactivar súpers de su región. Filtrar el `CATALOG_STORES.map` por
`storeInRegion(s.key, region)`. Con "Toda España" se ven todos.

**4) Agrupado de Lista/Cesta (`stores.ts:63-85`, `groupByStore`/`storeOfItem`)** —
NO filtrar por región. Ahí la tienda se **deduce del ítem** ya añadido (dominio de
la imagen); si el usuario ya metió un producto de un súper, debe seguir viéndolo
agrupado aunque cambie de región. El filtro es solo de **descubrimiento** (qué
puedes explorar/añadir), no de lo ya guardado.

### ¿Filtro duro o blando? — Recomendación

**Blando con escape**: por defecto se muestran los súpers de la región del usuario,
pero se ofrece **"Ver todos los supermercados"**. Implementación mínima y barata:
tratar el filtro de región como un **default de la preferencia**, no como una jaula:

- El filtro duro vive solo mientras `region` es una CCAA concreta.
- En `CatalogStoresScreen` (Ajustes de súpers), si el usuario quiere uno de fuera,
  puede poner su CCAA a "Toda España" (un toque en Ajustes → Comunidad, §8). No se
  necesita un toggle extra si el cambio de CCAA es accesible.
- Alternativa si se quiere un escape sin salir de la pantalla: un pie "¿Compras en
  otra comunidad? Ver todos" que expande el grid a `CATALOG_STORES` completo (solo
  UI, no cambia `region`). Opcional; el camino por Ajustes ya lo cubre.

Motivo: un filtro duro sin salida frustra a quien vive en la frontera de dos CCAA
o viaja; y el coste de un catálogo con súpers que no operan en tu zona es solo
ruido, no un error. El default correcto cubre al 95%.

### Súpers ya seleccionados que quedan fuera de la nueva región

`catalog_stores` es la lista que el usuario marcó; puede contener súpers que su
nueva CCAA no cubre (p.ej. eligió Cataluña con Bonpreu y luego cambia a Madrid).
Política recomendada — **no destruir la preferencia**:

- El catálogo intersecta en render (`enabledStores` arriba): los de fuera de la
  región simplemente **no se muestran**, pero **siguen en `catalog_stores`**.
- Si el usuario vuelve a su CCAA original, reaparecen (la preferencia estaba
  intacta). Esto es preferible a re-escribir `catalog_stores` al cambiar de región
  (destructivo e irreversible).
- Caso degenerado: la intersección queda vacía (p.ej. eligió SOLO Bonpreu y se
  muda a Canarias). Fallback: si `enabledStores.length === 0`, mostrar los
  **nacionales** de la región (`storesForRegion(region)` filtrado a los `null` de
  `STORE_REGIONS`) o directamente `storesForRegion(region)` completo. Nunca dejar
  el catálogo vacío.

---

## 8. Ajustes: cambiar la CCAA después (F4)

Permitir editar la comunidad desde Perfil, junto a "Supermercados".

- **Nueva fila en `ProfileScreen.tsx`** (junto a la de Supermercados,
  `ProfileScreen.tsx:218-223`):
  ```tsx
  <ProfileRow
    icon="location-outline"
    label={t('profile.region')}
    value={regionSummary}         // t(`region.names.${region}`) o t('region.all')
    onPress={() => navigation.navigate('Region')}
  />
  ```
  `regionSummary` = nombre localizado de `profile.region` (o `t('region.all')` si
  `ES`, o `t('region.notSet')` si null — aunque tras F2 nunca será null).

- **Pantalla de Ajustes `RegionSettingsScreen`** (o reutilizar `RegionGateScreen`
  con barra/atrás): misma lista de CCAA, guarda con `updateProfile({ region }) +
  applyProfile`. Registrarla en el `HomeStack` de `navigation/index.tsx:144-163`
  (como `CatalogStores`, `Appearance`, `Language`) y en `HomeStackParamList`
  (`types.ts`).

- Al cambiar de CCAA, el catálogo se re-filtra solo (deriva de `profile.region` vía
  contexto). Si la tienda activa deja de estar disponible, el auto-salto de
  `CatalogScreen.tsx:181-185` la corrige.

> Reutilización: extraer el cuerpo del selector a `components/RegionPicker.tsx`
> (lista + estado seleccionado + onChange) y consumirlo desde RegionScreen (onboarding),
> RegionGateScreen (F2) y RegionSettingsScreen (F4). Evita triplicar la lista de 19 CCAA.

---

## 9. i18n (es/ca) — claves nuevas

Añadir en `src/i18n/translations.ts` en AMBOS bloques (es ~520, ca ~1112). Se
sincronizan a mano.

**Bloque `onboarding:`** (junto a `storesTitle`/`storesSubtitle`, `translations.ts:553`):
```
regionTitle:    '¿En qué comunidad autónoma compras?' / 'En quina comunitat autònoma compres?'
regionSubtitle: 'Te mostraremos los supermercados disponibles en tu zona.' /
                'Et mostrarem els supermercats disponibles a la teva zona.'
regionGateTitle:    'Una cosa más' / 'Una cosa més'
regionGateSubtitle: 'Así te mostramos solo los supermercados de tu zona. Puedes cambiarlo luego en Ajustes.' /
                    'Així et mostrem només els supermercats de la teva zona. Ho pots canviar després a Configuració.'
```

**Bloque nuevo `region:`** (top level, junto a `language:` / `catalogStores:`):
```
region: {
  all:      'Toda España' / 'Tota Espanya',
  notSet:   'Sin elegir'  / 'Sense triar',
  names: {
    'ES-AN': 'Andalucía'/'Andalusia', 'ES-AR': 'Aragón'/'Aragó',
    'ES-AS': 'Asturias'/'Astúries',   'ES-CB': 'Cantabria'/'Cantàbria',
    'ES-CL': 'Castilla y León'/'Castella i Lleó',
    'ES-CM': 'Castilla-La Mancha'/'Castella-la Manxa',
    'ES-CN': 'Canarias'/'Canàries',   'ES-CT': 'Cataluña'/'Catalunya',
    'ES-EX': 'Extremadura'/'Extremadura', 'ES-GA': 'Galicia'/'Galícia',
    'ES-IB': 'Islas Baleares'/'Illes Balears', 'ES-MC': 'Región de Murcia'/'Regió de Múrcia',
    'ES-MD': 'Comunidad de Madrid'/'Comunitat de Madrid', 'ES-NC': 'Navarra'/'Navarra',
    'ES-PV': 'País Vasco'/'País Basc', 'ES-RI': 'La Rioja'/'La Rioja',
    'ES-VC': 'Comunidad Valenciana'/'Comunitat Valenciana',
    'ES-CE': 'Ceuta'/'Ceuta',         'ES-ML': 'Melilla'/'Melilla',
  },
},
```

**Bloque `profile:`**: `region: 'Comunidad autónoma' / 'Comunitat autònoma'`.

Toast de error de guardado: reutilizar `onboarding.saveError` (ya existe).

---

## 10. Casos borde

- **No quiere elegir / compra en varias CCAA** → opción **"Toda España"** (`ES`)
  al final del selector. Deja `region` no-nulo (no re-pregunta) y desactiva el
  filtro (todos los súpers). Es la vía oficial de "escape".
- **CCAA con pocos/ningún súper regional** (Extremadura, Cantabria, La Rioja,
  Ceuta, Melilla…) → solo verá los 4 nacionales + Hiperdino si aplica. Correcto y
  esperado; nunca queda vacío (Mercadona/Carrefour/Dia/Aldi son `null` = todas).
- **Migración de datos** → SIN backfill: todos los usuarios existentes nacen con
  `region NULL` y ven el gate F2 una vez. Documentado en la migración.
- **`catalog_stores` con súpers fuera de la nueva región** → §7: se conservan pero
  no se muestran; reaparecen si vuelve a su CCAA. Fallback a nacionales si la
  intersección queda vacía.
- **Interacción con amigos/grupos** → **ninguna**. La región es una preferencia de
  descubrimiento de catálogo por usuario; no afecta a grupos, listas compartidas ni
  a qué ve el resto de miembros. Dos amigos de CCAA distintas comparten lista sin
  problema: cada uno añade desde su catálogo y el agrupado de la lista (§7 punto 4)
  deduce la tienda del ítem, no de la región. (Sí puede darse que un miembro vea en
  la lista un producto de un súper que él no puede explorar; es inofensivo — lo ve
  agrupado, con su icono, y puede repetirlo si el ítem trae `store_product_id`.)
- **Hiperdino aún no implementado** → la línea del mapa queda comentada hasta que
  el súper entre en `stores.ts`. Un usuario de Canarias antes de eso ve solo los
  nacionales; al implementarse Hiperdino, aparece automáticamente (deriva del mapa).
- **Cambio de idioma** → los nombres de CCAA salen por i18n (`region.names.*`), se
  re-renderizan al cambiar idioma como el resto. El código guardado (`ES-CT`) no
  depende del idioma.
- **Sentinel vs NULL** → nunca guardar `''` ni `'ES'` por accidente para "sin
  responder"; NULL es el único estado que dispara la pregunta. El gate comprueba
  `!profile.region` (NULL/'' falsy); `'ES'` es truthy → no re-pregunta.

---

## 11. Checklist de implementación por fases

### F0 — Modelo de datos y constantes
- [ ] `supabase/migrations/profile_region.sql` (columna `region text`, §2). Ejecutar en Supabase.
- [ ] `src/constants/regions.ts` nuevo (`RegionCode`, `REGION_ALL`, `REGION_CODES`, `STORE_REGIONS`, `storeInRegion`, `storesForRegion`, `REGION_MERCADONA_NAME`) — §4.
- [ ] `src/api/profile.ts`: `UserProfile.region`, `fetchProfile` select+map (`:39`, `:45-57`), `updateProfile` (`:60-80`).
- [ ] i18n: bloque `region:` + claves `onboarding.region*` + `profile.region` (es y ca) — §9.

### F1 — Onboarding
- [ ] `src/components/RegionPicker.tsx` (lista reutilizable de CCAA + "Toda España").
- [ ] `src/screens/onboarding/RegionScreen.tsx` (usa `OnboardingLayout` step 3/7 + RegionPicker).
- [ ] `OnboardingNavigator.tsx:26`: registrar `Region` entre `Username` y `Stores`.
- [ ] `types.ts:328` (`OnboardingStackParamList`): `Region: undefined`.
- [ ] `UsernameScreen.tsx`: `onContinue` → `navigate('Region')`.
- [ ] Renumerar `totalSteps` a 7 en Name/Username/Stores/Avatar/Friends/Group (§5) + step de Region = 3.
- [ ] `StoresScreen.tsx:71`: filtrar grid con `storeInRegion` + pre-marcar los de la región (`:33`).

### F2 — Gate usuarios existentes
- [ ] `src/screens/onboarding/RegionGateScreen.tsx` (sin barra de progreso; guarda + applyProfile).
- [ ] `navigation/index.tsx`: gate `if (profile && profile.onboardedAt && !profile.region)` tras el de onboarding (`:338`).

### F3 — Filtrado
- [ ] `CatalogScreen.tsx:140-143`: `enabledStores = prefStores ∩ storeInRegion(region)` + fallback a nacionales si vacío.
- [ ] `CatalogStoresScreen.tsx:71`: filtrar `CATALOG_STORES` por región (con "Toda España" = todos).
- [ ] Verificar auto-salto `CatalogScreen.tsx:181-185` con la nueva `enabledStores`.
- [ ] NO tocar `groupByStore`/`storeOfItem` (`stores.ts:63-85`).

### F4 — Ajustes
- [ ] `RegionSettingsScreen` (o RegionGateScreen con atrás) + registrar en `HomeStack` (`navigation/index.tsx:144-163`) + `HomeStackParamList` (`types.ts`).
- [ ] `ProfileScreen.tsx:218`: `ProfileRow` "Comunidad autónoma" con `regionSummary` → navega a la pantalla.

### F5 — Pulido / verificación
- [ ] Typecheck verde (`CatalogStore` cerrado; ojo Hiperdino comentado).
- [ ] Probar en device: onboarding nuevo (paso 3), gate de usuario existente, cambio en Ajustes, catálogo filtrado, "Toda España".
- [ ] (Futuro) Hiperdino 13º: añadir a `stores.ts:8`+`:11` y descomentar en `STORE_REGIONS`.
- [ ] (Futuro) Sinergia: filtrar `mercadona_products.regions` por la CCAA del usuario vía `REGION_MERCADONA_NAME` (fuera de alcance).

---

### Resumen de archivos reales tocados

| Archivo | Rol |
|---------|-----|
| `supabase/migrations/profile_region.sql` | **nuevo** — columna `region` |
| `src/constants/regions.ts` | **nuevo** — tipos, mapa súper↔CCAA, helpers |
| `src/api/profile.ts` | `UserProfile.region`, fetch/update |
| `src/i18n/translations.ts` | bloque `region:` + claves onboarding/profile (es+ca) |
| `src/components/RegionPicker.tsx` | **nuevo** — selector reutilizable |
| `src/screens/onboarding/RegionScreen.tsx` | **nuevo** — paso 3/7 |
| `src/screens/onboarding/RegionGateScreen.tsx` | **nuevo** — gate F2 |
| `src/screens/onboarding/OnboardingNavigator.tsx` | registrar `Region` |
| `src/screens/onboarding/StoresScreen.tsx` | pre-filtro por región |
| `src/screens/onboarding/UsernameScreen.tsx` | navegar a `Region` |
| `src/screens/onboarding/{Name,Avatar,Friends,Group}Screen.tsx` | `totalSteps` 6→7 |
| `src/navigation/index.tsx` | gate F2 + registrar pantalla de ajustes |
| `src/screens/CatalogScreen.tsx` | filtro región en `enabledStores` |
| `src/screens/CatalogStoresScreen.tsx` | filtrar lista por región |
| `src/screens/ProfileScreen.tsx` | fila "Comunidad autónoma" |
| `src/types.ts` | `OnboardingStackParamList.Region`, `HomeStackParamList` |
