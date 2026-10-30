# Clasificación sin gluten por nombre

Aplica a Ametller, El Jamón, Hipercor, HiperDino, Lidl y Mercadona. El detector
`lib/gluten-free-names.mjs` se usa en los seis syncs y comprueba ambos nombres
ES/CA en Ametller y Mercadona, después de completar la pasada catalana.

Reconoce expresiones completas como «sin gluten», «sense gluten», «libre de
gluten», «gluten-free», «sin lactosa, ni gluten», abreviaturas S/GLUTEN y
variantes observadas como «singluten», «sin glutren» o «sin glutenl».
También admite cantidades pegadas al marcador, por ejemplo «sin gluten13-18».
S/G se acepta junto a tipos de alimento sólido como pan o galletas; no basta
para clasificar agua o cerveza, donde puede significar «sin gas». Glutamato,
glutamina y Gluta-Hya no activan la bandera.

`gluten_free_label` se escribe en la tabla maestra. Lidl e Hipercor usan sus
`*_product_master` actuales y proyectan el dato en las vistas por tienda/centro;
los espejos legados también mantienen la columna por compatibilidad. Ninguna
tabla de precios recibe una nueva columna. En Hipercor el usuario eligió dejar
preparada la consulta por centro y posponer su integración en el cliente.

La migración `20261022125140_name_gluten_free_catalogs.sql` está aplicada y
define `public.catalog_name_gluten_free(text)` con los mismos patrones.
Si cambia el detector, actualizar esa función en una migración nueva y volver
a verificar el backfill; los patrones SQL deben proceder del módulo compartido.

Validación del 22-10-2026: 2.678 nombres/casos con cero diferencias JS/SQL.
Los casos de regresión cubren declaraciones equivalentes, nombres en ambos
idiomas, cantidades sin separación, falsos positivos y la ambigüedad S/G:

```bash
node --test scripts/lib/gluten-free-names.test.mjs
```
