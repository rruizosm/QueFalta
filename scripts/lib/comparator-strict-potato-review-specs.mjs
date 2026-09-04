// Assistant-authored first-pass judgements after reading the frozen source fields.
// NOT a parser, production taxonomy, human review or gold data. IDs are explicit.
// No facts are imported from the sampling family, drafts, embeddings or EAN aliases.
const N = '/display_name', D = '/denomination', I = '/ingredients', X = '/description';
const P = '/preparation', C = '/conservation', Q = '/packaging';
const CD = '/raw/productData/description', PI = '/raw/price_instructions';
const f = (attribute, value, pointer) => ({attribute, value, pointer});
const cut = (v, p) => f('cut_shape', v, p);
const thin = p => f('cut_thickness', 'thin', p);
const pre = p => f('preparation', 'prefried', p);
const coat = p => f('coating', 'present', p);
const skin = p => f('skin', 'with_skin', p);
const spice = p => f('seasoning', 'spiced', p);
const row = (key, grams, quantity_pointer, form, facts, note, single = false) =>
  ({key, grams, quantity_pointer, form, facts, note, single});

export const POTATO_REVIEW_SPECS = {
  version: 'ce202-potato-source-review-v1',
  review_date: '2026-09-03',
  authorship: 'assistant_source_review_with_deterministic_pair_composition',
  frozen: [
    row('carrefour:521031642', 600, N, 'cut_potato', [pre(D), cut('wedges', D), skin(D), coat(D), spice(D)], 'La denominación concreta gajos con piel sabor pimentón, rebozados y prefritos; no son patatas lisas genéricas. Ingredientes con trigo, ajo y cebolla; no se corrigen las erratas de la fuente.'),
    row('carrefour:521031644', 1000, N, 'cut_potato', [pre(D), thin(N)], 'Extra finas; denominación de prefritas ultracongeladas. Patata 96 %, girasol 4 % y dextrosa: no convertir esta lista en declaración sin piel, sin gluten ni sin rebozado.'),
    row('carrefour:521033712', 650, N, 'formed_potato', [pre(D), cut('smiling_faces', D), spice(D)], 'La denominación dice puré de patatas especiado en forma de caras sonrientes. Diferente matriz de producto frente a patata cortada; no identificarlo solo por McCain o congelación.'),
    row('carrefour:522714762', 750, N, 'cut_potato', [pre(D)], 'Corte para bravas no prueba salsa brava, picante, gajo ni un grosor exacto. Se conserva la errata «97%m» de ingredientes.'),
    row('carrefour:526600632', 1000, N, 'formed_potato', [pre(D), cut('balls', N), spice(I)], 'Bolitas elaboradas con patata y patata deshidratada, almidones y fibra. Pimienta y cúrcuma declaradas; no tratarlas como tiras de patata cortada.'),
    row('carrefour:530014441', 1000, N, 'cut_potato', [pre(D), thin(D), f('coating', 'absent_declared', I)], 'Golden Long: corte fino y ausencia de rebozado explícitos. «No está elaborado con aceite de cacahuete» no certifica ausencia de todos los alérgenos.'),
    row('carrefour:538002716', 2500, N, 'cut_potato', [pre(D)], 'Denominación patatas fritas largas; longitud no prueba grosor. Patata 97 %, aceite 3 % y dextrosa; piel y ausencia de condimentación no acreditadas.'),
    row('carrefour:611401637', 600, N, 'formed_potato', [pre(D), cut('letters', N)], 'Preparado de patata en letras, con harina de arroz y patata deshidratada. No es un corte de una patata entera; no inventar grosor ni piel.'),
    row('carrefour:677401667', 600, N, 'cut_potato', [pre(D), thin(D), coat(D)], 'Corte fino recubierto y prefrito, especial horno. Harinas de trigo/arroz y almidón no equivalen a ausencia de gluten; extractos colorantes no bastan para declarar sabor picante.'),
    row('carrefour:768405799', 1000, N, 'cut_potato', [pre(D), thin(D)], 'El título clásicas omite el corte fino que sí declara la denominación. No copiar al título los atributos ausentes de piel o rebozado.'),
    row('carrefour:791842998', 650, N, 'cut_potato', [], 'Corte rústico declarado en título, sin definición de grosor. Denominación, ingredientes, conservación y preparación nulos; congelación apoyada en la categoría, no en «Forno Country».'),
    row('carrefour:794041144', 1000, N, 'unknown', [pre(D)], 'Original Tradition prefritas ultracongeladas; 97 % patata y 3 % girasol. «Tradition» no demuestra corte, piel o receta íntegra común con otra tienda.'),
    row('carrefour:795411220', 2500, N, 'unknown', [pre(D)], 'Original Tradition 2,5 kg conserva denominación e ingredientes de patata/aceite. No reutilizar formato de la referencia de 1 kg ni interpretar la marca como equivalencia.'),
    row('carrefour:805525733', 600, N, 'unknown', [pre(D), coat(D)], 'Especial horno, recubiertas y prefritas. El corte no está especificado; no heredar el fino de la otra referencia Carrefour para horno.'),
    row('carrefour:805726789', 450, N, 'cut_potato', [pre(D), cut('dice', N)], 'Dados prefritos ultracongelados. Patata 97 %, girasol 3 % y dextrosa; no son necesariamente patata cruda por estar en dados.'),
    row('carrefour:809710839', 750, N, 'cut_potato', [pre(D), cut('wedges', D), skin(D), coat(D), spice(D)], 'Gajos con piel, rebozado y hierbas aromáticas. No igualar mediterráneas con gajos picantes o barbacoa; el perfil de condimentos queda descrito, sin equivalencia automática.'),
    row('carrefour:VC4AECOMM-120053', 750, N, 'cut_potato', [pre(D)], 'Corte ondulado Original Crinkle; ondulación no define grosor ni excluye otras geometrías. Se registra en el texto revisado, sin crear una oposición falsa ondulado/grueso.'),
    row('carrefour:VC4AECOMM-352051', 875, N, 'unknown', [pre(D)], 'Findus tradicional 875 g; prefritas ultracongeladas y patata 97,4 %. Tradicional no especifica corte, piel o rebozado.'),
    row('carrefour:VC4AECOMM-352052', 875, N, 'cut_potato', [pre(D), thin(N)], 'Findus finísimas 875 g, patata 96,8 %. Finísimas acredita fino a nivel grueso/fino; no acredita dimensiones milimétricas iguales a otras finas.'),
    row('carrefour:VC4AECOMM-437940', 600, N, 'cut_potato', [pre(D), thin(D), coat(D)], 'Juliana con rebozado crujiente explícito; patata 87 %, aceite 7 %, rebozado 6 %. No equiparar con Golden Long sin rebozado.'),
    row('carrefour:VC4AECOMM-482964', 500, N, 'unknown', [], 'Potato Petals: faltan denominación, ingredientes y preparación. No traducir el nombre de gama a una geometría, receta o corte verificado.'),
    row('carrefour:VC4AECOMM-528241', 600, N, 'unknown', [cut('waffle', N), spice(I)], 'Forma de gofre y especias con chile/pimienta/ajo/cebolla. La preparación confirma ultracongeladas; no asumir prefritura ni matriz de puré desde la forma.'),
    row('carrefour:VC4AECOMM-552064', 650, N, 'cut_potato', [cut('shredded', N)], 'Patata rallada, sin ingredientes ni denominación. Rallado no verifica prefritura, sal o piel.'),
    row('carrefour:VC4AECOMM-615033', 600, N, 'cut_potato', [pre(D), coat(D)], 'Steakhouse: grandes y recubiertas. «Grandes» no se normaliza a corte grueso porque podría referirse a longitud; conserva rebozado en denominación.'),
    row('carrefour:VC4AECOMM-709994', 750, N, 'unknown', [], 'Mini bravas McCain sin detalle: ni «bravas» demuestra salsa/picante ni «mini» acredita geometría o peso unitario.'),
    row('carrefour:VC4AECOMM-711814', 200, N, 'unknown', [pre(D), f('microwave_use', 'declared', P)], 'Findus 200 g en estuche preparado en microondas. Patata 87 %, aceite de nabina y dextrosa; una ración no fija por sí sola cuántos estuches se venden.'),
    row('carrefour:fprod1320006', 500, N, 'cut_potato', [pre(D), skin(D), coat(D)], 'Chef Gourmet declara corte V ondulado, piel, sal y rebozado. Corte V no se convierte automáticamente en gajos; preservar descripción literal.'),
    row('carrefour:prod1023612', 500, N, 'unknown', [pre(D), coat(D)], 'Express horno con rebozado y sal, patata 87 % y aceite 7 %. No deducir corte, piel o equivalencia con Chef Gourmet por misma marca y peso.'),
    row('carrefour:prod1161111', 600, N, 'unknown', [pre(D), f('organic_claim', 'declared', D)], 'Ecológicas para horno: declaración bio explícita, no heredable a convencionales. El porcentaje de ingredientes no resuelve piel/corte.'),
    row('carrefour:prod590387', 500, N, 'unknown', [], 'Fry’n Dip con detalle nulo. No inferir corte o recipiente comestible a partir de una gama comercial.'),
    row('carrefour:prod850177', 1000, N, 'cut_potato', [pre(D)], 'Original Steakhouse de corte rústico. No tratar «rústico» como antónimo demostrado de fino ni sinónimo exacto de grueso; conservar el término.'),
    row('carrefour:prod850197', 750, N, 'cut_potato', [pre(D), cut('wedges', D), skin(D), coat(D), spice(D)], 'Barbacoa: gajos con piel y rebozado especiado. Pimentón, ajo y cebolla pueden coexistir en otros perfiles; no declarar incompatibilidad por un solo condimento compartido.'),
    row('consum:7057706', 1000, Q, 'cut_potato', [pre(N), thin(N)], 'Corte fino prefrito, congelación en árbol original de categorías. No hay campos de ingredientes/conservación seleccionados; desconocido en esta proyección no significa inexistente en el retailer.'),
    row('consum:7255425', 1000, Q, 'cut_potato', [pre(N)], 'Corte casero prefrito. «Casero» no certifica grueso; envases por línea y atributos de piel/rebozado sin evidencia.'),
    row('consum:7370419', 500, Q, 'unknown', [], 'Chef Gourmet 500 g sin ingredientes. No importar el corte V ni piel desde Carrefour/Plusfresc o desde un EAN coincidente.'),
    row('consum:7393366', 750, Q, 'unknown', [], 'Bravas en sección congelados; el título no certifica prefritura, salsa picante, piel ni geometría.'),
    row('consum:7417413', 1000, Q, 'unknown', [], 'Horno extra crujiente no demuestra rebozado ni prefritura. El formato textual de 1 kg no acredita número de bolsas.'),
    row('consum:7431237', 750, Q, 'unknown', [], 'Mediterráneas McCain 750 g. Falta detalle propio; no propagar automáticamente piel/hierbas/corte de otra tienda.'),
    row('consum:844837', 1000, Q, 'unknown', [pre(N)], 'Golden Long prefritas 1 kg; no especifica corte ni rebozado. Tiene oferta global y zonas, pero no acredita elegibilidad bilateral para el CP.'),
    row('mercadona:17581', 600, PI, 'cut_potato', [], 'Troceadas ultracongeladas: no dar por crudas al no decir prefritas. No convertir troceadas en dados exactos. Paquete no pack, nominal 0,6 kg.', true),
    row('mercadona:19904', 750, PI, 'unknown', [pre(N)], 'Crispy Pops prefritas congeladas; el nombre comercial no prueba bolitas ni puré. Paquete nominal 0,75 kg con método de venta fijo.', true),
    row('mercadona:61405', 2000, PI, 'cut_potato', [pre(N), f('cut_thickness', 'thick', N)], 'Corte grueso, prefritas ultracongeladas; un paquete fijo de 2 kg. Ingredientes nulos: no inferir ausencia de rebozado, piel o sal.', true),
    row('mercadona:61416', 750, PI, 'cut_potato', [pre(N), cut('wedges', N)], 'Gajos prefritos ultracongelados; un paquete nominal de 750 g. Gajo no acredita piel ni condimentos.', true),
    row('mercadona:61421', 1000, PI, 'cut_potato', [pre(N), thin(N)], 'Corte fino prefrito ultracongelado, un paquete fijo de 1 kg. Ausencia de ingredientes no se rellena desde marcas ajenas.', true),
    row('mercadona:7879', 750, PI, 'unknown', [], 'Fritas horno y air fryer, ultracongeladas, un paquete nominal 750 g. No convertir «fritas» en una etapa exacta de prefritura ni inferir rebozado.', true),
    row('plusfresc:010985', 1000, X, 'cut_potato', [pre(X)], 'La descripción «corte gueso» parece una errata de grueso, pero no se normaliza sin confirmación; bolsa 1 kg explícita y sin alternativas de formato. Ingredientes no prueban sin piel.', true),
    row('plusfresc:019865', 1000, X, 'cut_potato', [thin(N)], 'Descripción «prefitas» conservada sin corregir a prefritas; corte fino explícito y bolsa 1 kg. Ingredientes patata/girasol no se convierten en declaración sin rebozado.', true),
    row('plusfresc:023552', 750, N, 'cut_potato', [pre(X), cut('wedges', X), spice(X)], 'Descripción bilingüe: gajos picantes, seasoned/prefried/deepfrozen. Condimento con trigo, ajo, cebolla y pimentón; no inferir piel ni denominarlo rebozado sin declaración inequívoca.'),
    row('plusfresc:028522', 1000, N, 'unknown', [], 'Bocaditos AVIKO: ingredientes y conservación nulos. La categoría acredita congelados, no forma, prefritura ni puré.'),
    row('plusfresc:032787', 1000, N, 'unknown', [f('coating', 'absent_declared', I)], 'Golden Long declara literalmente que no tiene rebozado; congelación en conservación. El corte fino de Carrefour no se transfiere a esta observación.'),
    row('plusfresc:032788', 1000, N, 'unknown', [], 'Tradition declara patata 97 % y girasol 3 %, conservación congelada. Título «fritas» no prueba etapa prefrita ni ausencia de recubrimiento.'),
    row('plusfresc:032789', 500, N, 'unknown', [coat(I)], 'Chef Gourmet declara rebozado 5,5 % y sal; piel/corte no están en estos campos. No importar el detalle de otra tienda ni atribuir ausencia de rebozado a Mercadona.'),
    row('plusfresc:037023', 200, N, 'unknown', [f('microwave_use', 'declared', N)], 'Microondas 200 g y conservación ultracongelada explícitos. Ingredientes 87 % patata, aceite de nabina y dextrosa; misma receta textual no completa formato/variante.'),
  ],
  // Every ID below was inspected with its title and original category context;
  // detail fields were read where present. These are not wildcard exclusions.
  exclusions: [
    {store: 'carrefour', kind: 'ambient_snack', ids: ['538001706','658001964','665802122','666701557','798285102','819256420','VC4AECOMM-099020','VC4AECOMM-128846','VC4AECOMM-142098','VC4AECOMM-332570','VC4AECOMM-354354','VC4AECOMM-520190','VC4AECOMM-561057','VC4AECOMM-577793','VC4AECOMM-718771','VC4AECOMM-772713','VC4AECOMM-772718','fprod1420163','prod1000084','prod1070551','prod190440','prod250231','prod301071','prod410271','prod460430','prod66978','prod70366'], note: 'Aperitivos de despensa, no patatas congeladas para cocinar. Título y ruta Aperitivos/La Despensa contrastados; los ingredientes/conservación cuando existen no contradicen ese uso. No corregir el llamativo «14 kg» de Trío a otro peso.'},
    {store: 'carrefour', kind: 'dehydrated_mash', ids: ['521005869','prod670269'], note: 'Puré deshidratado Mousline, patata deshidratada 99 % y conservación en lugar fresco y seco; no patata congelada.'},
    {store: 'carrefour', kind: 'prepared_meal', ids: ['589707585','VC4AECOMM-560793','VC4AECOMM-560805','VC4AECOMM-602198','VC4AECOMM-708253','fprod1260404','prod67219'], note: 'Platos preparados o mezclas (pollo, tortilla, verduras, dorada, panadera preparada de peso aproximado, revuelto con salchichas), no patata sola del piloto. Congelación del plato no cambia esa exclusión.'},
    {store: 'carrefour', kind: 'infant_food', ids: ['VC4AECOMM-354606','VC4AECOMM-659267'], note: 'Alimento infantil compuesto, con bacalao o ternera y verduras; patata como ingrediente no define la familia de comparación.'},
    {store: 'carrefour', kind: 'gnocchi', ids: ['VC4AECOMM-569469','prod1090094'], note: 'Ñoquis elaborados con puré/harinas y conservación no congelada acreditada o sin resolver; identidad explícita distinta de patatas congeladas.'},
    {store: 'carrefour', kind: 'fresh_potato', ids: ['VC4AECOMM-533347'], note: 'Patata princesa amandine en frescos/verduras y hortalizas; no heredar congelación por similitud del nombre.'},
    {store: 'consum', kind: 'ambient_snack', ids: ['7020659','7056554','7168651','7273266','7284847','7359060','7394328','7399462','7404887','7410728','7411858','7432040','7461598','7462039','7484889'], note: 'Títulos y árbol original sitúan estos productos en aperitivos de despensa. El nombre «patatas fritas» no los convierte en el congelado para freír; conservar el 2×135 g y los días de venta como evidencia, no como autorización comercial.'},
    {store: 'consum', kind: 'dehydrated_mash', ids: ['7185952','7449890'], note: 'Purés en despensa, no patatas congeladas; faltan ingredientes en esta proyección, sin inferir composición completa.'},
    {store: 'consum', kind: 'prepared_meal', ids: ['7291370','7331536','7346281','7362390','7443120','7458172'], note: 'Tortillas/croquetas/platos refrigerados o pollo en conserva. Bravas 7443120 está en preparados refrigerados, distinto del congelado 7393366 aun compartiendo título.'},
    {store: 'consum', kind: 'infant_food', ids: ['7436947'], note: 'Tarrito de bacalao, patata y verduras, árbol de alimentación infantil; fuera de las familias del piloto.'},
    {store: 'mercadona', kind: 'ambient_snack', ids: ['11522','14467','15757','15778','16387','17948','24053','33437','33555','33581','33639','33642','52720','8246','86145','8915','8953'], note: 'Título y categoría original Aperitivos, no familia de patatas congeladas. Torreznos, maíz y batata tampoco son patata; no inferir ingredientes que vienen nulos.'},
    {store: 'mercadona', kind: 'prepared_meal', ids: ['15534','60095'], note: 'Patatas cocidas en conservas o pincho de tortilla listo para comer, este último de peso aproximado. Ninguno es patata congelada del piloto.'},
    {store: 'mercadona', kind: 'fresh_potato', ids: ['69065','69166'], note: 'Patatas en Fruta y verdura, no Congelados. Se contrastó la categoría original incluida en raw, no una familia inferida de muestreo.'},
    {store: 'plusfresc', kind: 'ambient_snack', ids: ['019849','021694','025580'], note: 'Aperitivos de conservación fresca/seca. ALTEZA declara 2×150 g; FRIT RAVICH incluye sufijos 12U que podrían ser caja logística. No convertirlos en selección comercial ni en congelados.'},
    {store: 'plusfresc', kind: 'dehydrated_mash', ids: ['031541'], note: 'Copos de patata deshidratados WE NATURAL, conservación seca y protegida del calor; no patata congelada.'},
    {store: 'plusfresc', kind: 'fresh_potato', ids: ['008505'], note: 'Bolsa de patata fresca de 3 kg; ingredientes PATATAS y árbol de frescos, no congelados.'},
    {store: 'plusfresc', kind: 'prepared_meal', ids: ['034430','035535'], note: 'Base de tortilla refrigerada o tortilla fresca con huevo y cebolla. Patata como ingrediente de un plato no es la familia piloto de patata congelada.'},
  ],
};
