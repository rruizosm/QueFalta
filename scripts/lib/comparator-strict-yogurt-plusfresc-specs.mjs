// Editorial transcription after reading all 219 frozen Plusfresc observations.
// No attributes are generated from names, sampling labels or another store.
// id | matrix | declared flavour | explicit claims | reviewed format
// Format: NxYg/ml = explicit each; cN = count only; qYg/ml = role unknown;
// combine cN,qYg; ! = source count conflict. See notes for unresolved sources.
export const PLUSFRESC_LAYER = 'ce202-yogurt-plusfresc-v1';
export const PLUSFRESC_TABLE = `
004449|yogurt|strawberry|milk added glutenfree|4x120g
004456|yogurt|lemon|milk added glutenfree|4x120g
004470|yogurt|macedonia|milk added glutenfree|4x120g
004471|yogurt|coconut|milk added glutenfree|4x120g
004537|yogurt|natural|milk glutenfree|c4,q480g
004541|yogurt|lemon|milk sweetened|4x120g
004542|yogurt|strawberry|milk sweetened|c4,q480g
005605|yogurt|natural|milk|4x125g
005606|yogurt|natural|milk skimmed|4x125g
005608|yogurt|strawberry|milk added|4x125g
005609|yogurt|lemon|milk added|4x125g
005610|yogurt|banana|milk added|4x125g
006995|yogurt|lemon|milk skimmed sweetened|4x125g
007379|yogurt|natural|milk bifidus|4x125g
007388|yogurt|natural|milk liquid added|6x100g
008000|yogurt|natural|milk|2x130g
008002|yogurt|natural|milk added|8x120g
008004|yogurt|natural|milk bifidus|4x120g
008007|yogurt|natural|milk|8x120g
008009|yogurt|natural|milk added|2x130g
008016|yogurt|strawberry|milk added bifidus|4x120g
008017|yogurt|forest_fruits|milk added bifidus|4x120g
008039|yogurt|strawberry|milk added|2x130g
008053|yogurt|natural|milk skimmed bifidus|c4
010871|yogurt|chocolate|-|c4
011548|yogurt|multifruits|liquid|c6
011554|yogurt|kiwi|milk skimmed sweetened bifidus|4x120g
011909|yogurt|strawberry|milk liquid sweetened sterols|6x100ml
011910|yogurt|natural|milk liquid sweetened sterols|6x100g
012249|yogurt|natural|milk|c4,q500g
012250|yogurt|natural|milk added|c4,q500g
012251|yogurt|strawberry|milk added|c4,q500g
012253|yogurt|macedonia|milk added|c4,q500g
012260|yogurt|natural|milk greek added|4x125g
012743|yogurt|strawberry|milk liquid added|6x100g
012746|yogurt|mango+papaya|milk added bifidus|c4,q480g
012999|yogurt|muesli|milk sweetened bifidus fibre bare_zero|c4,q460g
013161|yogurt|natural|milk greek|4x125g
013245|yogurt|coconut|milk added|c4,q500g
013469|yogurt|pear|milk added bifidus|4x120g
013618|yogurt|cereals|milk sweetened bifidus fibre bare_zero|c4,q460g
013647|yogurt|red_fruits|milk skimmed sweetened bifidus bare_zero|4x120g
013648|yogurt|strawberry|milk liquid skimmed sweetened glutenfree bare_zero|6x100g
013655|yogurt|tropical|milk liquid sweetened sterols|6x100ml
014003|yogurt|natural|milk added nolactose|4x125g
014056|yogurt|assorted|milk added glutenfree|c8
014400|yogurt|natural|milk skimmed bifidus|4x125g
014523|yogurt|muesli|milk added sweetened bifidus fibre|4x125g
015154|yogurt|natural|milk liquid added|12x100g
015155|yogurt|strawberry|milk liquid added glutenfree|12x100g
015192|biscuit|unknown|-|-
015460|yogurt|assorted|milk added|8x120g
015937|yogurt|mango|milk added bifidus|4x120g
016654|yogurt|natural|milk skimmed sweetened bifidus bare_zero|c4
017148|yogurt|natural|milk bifidus|8x120g
017149|yogurt|natural|milk skimmed bifidus bare_zero|8x120g
017600|yogurt|natural|liquid skimmed|c12
019447|yogurt|natural|milk sweetened bifidus|8x120g
019600|yogurt|strawberry|-|c4,q500g
019618|yogurt|lemon|-|c4,q500g
019660|yogurt|natural|milk greek added|4x125g
019661|yogurt|natural|milk greek|4x125g
019809|yogurt|strawberry|nolactose|c4,q500g
019884|yogurt|strawberry|milk liquid added|c6
019933|yogurt|strawberry|milk liquid added|c1
020315|biscuit|unknown|-|-
020622|yogurt|natural|sweetened|c4
020850|yogurt|natural|-|c4,q500g
020990|yogurt|coconut|milk sweetened|4x120g
020991|yogurt|forest_fruits|-|c4
020992|yogurt|strawberry+banana|liquid|c4
020993|yogurt|strawberry|milk liquid added|c4
021056|yogurt|natural|milk greek|4x110g
021298|yogurt|natural|milk skimmed nolactose|4x125g
021597|plant_unspecified|unknown|soy bifidus|c6
021893|yogurt|wild_fruits|milk added sweetened bifidus bare_zero|c4,q460g
021894|yogurt|mango|milk sweetened bifidus bare_zero|c4,q460g
021895|yogurt|lime+lemon|milk added bifidus|c4,q115g
021896|yogurt|coconut|milk added bifidus glutenfree|4x120g
021962|yogurt|natural|-|c2,q250g
021963|yogurt|unknown|skimmed|c2,q250g
021964|yogurt|strawberry|-|c2,q250g
021966|yogurt|orange|-|c2,q250g
022183|yogurt|strawberry|milk liquid added|1x550g
022184|yogurt|strawberry+banana|milk liquid added|1x550g
022382|yogurt|peach+passionfruit|milk cow added|1x125g
022886|yogurt|natural|sweetened bare_zero|c4
023464|yogurt|unknown|milk goat|c2
023465|yogurt|unknown|milk sheep|c2
023692|yogurt|natural|milk liquid sweetened sterols|c12
024110|yogurt|oat+walnut|milk added bifidus|c4,q480g
024113|yogurt|lime+lemon|milk sweetened sterols|!
024581|yogurt|natural|milk added nolactose|4x125g
024868|yogurt|lime+lemon|milk sweetened bifidus bare_zero|4x120g
024895|yogurt|natural|milk nolactose|4x125g
025084|yogurt|natural|milk goat|1x125g
025087|yogurt|mango|milk cow added organic|1x135g
025187|yogurt|natural|milk skimmed|c6,q750g
025346|plant_unspecified|chocolate|soy|c4,q400g
025401|yogurt|pineapple+coconut|skimmed|c2,q250g
025402|yogurt|lime+lemon|skimmed|c2,q250g
025506|yogurt|strawberry|milk cow added glutenfree|q500g
025507|yogurt|unknown|milk cow greek added|q500g
025509|yogurt|mango+forest_fruits|milk cow added|q150g
025510|yogurt|apple+baked|milk cow added glutenfree|1x150g
025865|yogurt|natural|milk|c4,q440g
025866|yogurt|natural|milk greek added|c4,q440g
026477|plant_fermented|assorted|soy added|4x125g
026478|plant_fermented|oat|soy added|q400g
026479|plant_fermented|coconut|soy_coconut dairy_free added glutenfree|1x400g
026480|yogurt|strawberry|liquid|c12,q1200g
026483|yogurt|muesli+raspberry|topping|q170g
026484|yogurt|oat|milk sweetened sterols|6x100g
027111|yogurt|strawberry+raspberry|milk liquid sweetened|q300g
027112|yogurt|vanilla+cookie|milk liquid sweetened|q300g
027119|unknown|dark_chocolate|-|c4,q500g
027291|yogurt|conflict|milk cow added|q500g
027336|yogurt|natural|milk zero_fat sweetened sugar_conflict|c4,q500g
027457|yogurt|chia+almond|bare_zero|c4,q480g
027687|yogurt|natural|milk total_sugar_free nolactose|4x125g
027737|skyr_unspecified|natural|-|q400g
027743|plant_fermented|mango|soy nolactose glutenfree|q400g
027757|yogurt|unknown|goat organic|q420g
028005|yogurt|raspberry|liquid|q550g
028274|yogurt|lime+lemon|milk added|c4,q440g
028276|yogurt|stracciatella|milk greek added|c4,q440g
028277|yogurt|strawberry|milk greek added|c4,q440g
028550|plant_fermented|coconut|coconut_base dairy_free nolactose glutenfree|1x350g
028870|unknown|vanilla|-|q400g
028947|yogurt|natural|milk cow|q500g
028948|yogurt|natural|milk cow skimmed bare_zero|q500g
029990|plant_fermented|blueberry|soy dairy_free added nolactose glutenfree|1x400g
030344|plant_fermented|lime+lemon|soy dairy_free added nolactose glutenfree|1x400g
030758|unknown|red_fruits+date|-|q400g
031077|yogurt|stracciatella|liquid|q300g
031083|unknown|coconut+stracciatella|-|q340g
031084|unknown|coconut+caramel|-|q340g
031243|pet_treat|unknown|-|-
031360|yogurt|natural|milk cow protein|q500g
031368|yogurt|stracciatella|milk greek added|4x125g
031456|yogurt|strawberry+banana|milk liquid added glutenfree|6x100g
031460|yogurt|natural|milk|2x160g
031462|yogurt|natural|milk greek|1x900g
031469|yogurt|stracciatella|milk added bifidus|c4,q460g
031877|yogurt|lime+lemon|milk greek added|4x110g
031878|yogurt|stracciatella|milk greek added|4x110g
031883|plant_fermented|passionfruit+mango|soy dairy_free added nolactose glutenfree|1x400g
031999|yogurt|pineapple+coconut|milk liquid added|q1000g
032117|yogurt|natural|milk skimmed nolactose|4x125g
032193|yogurt|natural|skimmed|c2,q250g
032308|yogurt|mango|milk liquid sweetened|1x300g
032310|yogurt|natural|protein|c4,q400g
032311|yogurt|strawberry|protein|c4,q400g
032312|yogurt|stracciatella|milk protein sweetened glutenfree|4x105g
032317|yogurt|strawberry|milk liquid added glutenfree|6x100g
032322|unknown|natural|-|c4,q500g
032656|yogurt|cookie|milk added glutenfree|4x120g
032657|yogurt|vanilla|-|c4,q480g
032658|yogurt|forest_fruits|milk added glutenfree|4x120g
032805|yogurt|strawberry|milk greek added|4x110g
032810|yogurt|oat+walnut+apple|milk added bifidus|4x115g
032996|yogurt|forest_fruits|milk added|4x125g
033248|unknown|peach|-|1x400g
033249|unknown|strawberry|-|1x400g
033375|yogurt|natural|milk added|4x125g
033681|yogurt|natural|skimmed|c4,q120g
033682|yogurt|strawberry|milk skimmed sweetened|4x120g
033685|yogurt|red_fruits|liquid protein|1x270g
033688|plant_fermented|assorted|soy dairy_free added glutenfree|4x125g
034084|unknown|apple|-|q400g
034089|yogurt|vanilla|milk sweetened|c4,q480g
034090|yogurt|blueberry|milk sweetened|c4,q480g
034091|yogurt|blueberry|-|c6,q600ml
034092|yogurt|multifruits+orange|-|c6,q600ml
034096|yogurt|caramel|milk greek added|c4,q440g
034097|yogurt|apple+cinnamon|milk greek added|c4,q440g
034134|yogurt|macedonia|milk added|4x125g
034277|yogurt|strawberry|liquid|c8,q800ml
034279|yogurt|strawberry|milk greek added|4x125g
034374|yogurt|natural|milk|4x125g
034561|plant_fermented|cherry|soy added nolactose glutenfree|1x400g
034562|pudding|unknown|-|-
034563|pudding|unknown|-|-
034564|pudding|unknown|-|-
035386|yogurt|coconut|milk greek added glutenfree|c4,q400g
035387|yogurt|pineapple|liquid|c6,q640g
035388|yogurt|coconut+pineapple|liquid|c6,q600g
035391|yogurt|strawberry|milk sweetened|c4,q480g
035392|yogurt|stracciatella|milk sweetened|c4,q480g
035393|skyr_unspecified|natural|milk glutenfree|q480g
035394|skyr_unspecified|strawberry|milk added glutenfree|c4,q400g
035395|skyr_unspecified|natural|milk glutenfree|c4,q400g
035396|yogurt|cereals+red_fruits|milk added bifidus|c4,q460g
035397|plant_fermented|lemon+cheesecake|soy dairy_free added glutenfree|q400g
035398|yogurt|stracciatella|milk sweetened glutenfree|1x450g
035793|yogurt|lemon|milk greek added|c4,q500g
035826|yogurt|peach|milk skimmed sweetened bare_zero|c4,q500g
035827|yogurt|pineapple|milk zero_fat noadded sweetened bifidus|c4,q500g
035828|yogurt|lemon|milk added|c4,q500g
035939|pudding|unknown|-|-
035940|yogurt|natural|milk greek glutenfree|q900g
035942|plant_fermented|blueberry+muffin|soy dairy_free added nolactose glutenfree|q400g
035944|unknown|tropical|protein|q200g
035948|kefir|unknown|-|-
036186|yogurt|unknown|milk cow greek|q500g
036225|kefir|unknown|-|-
036245|infant_dessert|unknown|-|-
036359|meal_replacement|unknown|-|-
036360|meal_replacement|unknown|-|-
036361|plant_fermented|apple+raspberry|soy dairy_free noadded nolactose glutenfree|q400g
036725|yogurt|caramel|milk greek added glutenfree|4x110g
036726|yogurt|blueberry+cake+cookie|milk greek added|4x110g
036727|yogurt|mango+papaya|milk greek added|4x110g
036733|yogurt|peach+apricot|milk sweetened sterols|!
036735|yogurt|natural|milk liquid noadded|6x100g
036736|yogurt|strawberry+pomegranate|milk added glutenfree|6x100g
036737|plant_fermented|blueberry|soy dairy_free added nolactose glutenfree|c4,q125g
036753|yogurt|mango+peach|milk greek added|q500g
036887|yogurt|unknown|milk goat organic|q420g`;

// Every warning is editorial. Its literals are independently validated in tests.
export const PLUSFRESC_NOTES = {
  '004537':'Descripción 4X120 sin unidad. Título 4 unidades 480 gramos: no inferir contenido unitario de 120 g.',
  '007388':'Título 641 gramos frente a descripción 6x100g. 641 no identifica claramente unidad/total; conservar ambigüedad, sin declarar automáticamente total erróneo.',
  '012746':'Pese a «yogur de soja», ingredientes con leche, nata y extracto de soja. No es prueba de ausencia de lácteos.',
  '012999':'Oligofructosa no es fructosa por coincidencia de subcadena. Edulcorantes explícitos; añadido desconocido, 0% sin objeto.',
  '013161':'Lactosa entre ingredientes no se convierte automáticamente en declaración de azúcar añadido para endulzar; mantener desconocido.',
  '013618':'Jarabe de oligofructosa y edulcorantes; no inventar azúcar añadido desde el nombre de esa fibra ni grasa desde 0%.',
  '013655':'Título 600gr frente a descripción 6x100 ml. Masa/volumen no resueltos; no usar densidad inventada.',
  '014056':'Surtido nombrado con descripción 8X120 sin unidad; faltan cantidad unitaria acreditada y distribución por sabor.',
  '014523':'Azúcar y edulcorantes E-955/E950 aparecen simultáneamente en ingredientes; no son etiquetas excluyentes.',
  '015460':'Surtido de cuatro sabores sin reparto acreditado. No copiar el 2+2+2+2 de la ficha de Carrefour.',
  '017148':'Título 8 unidades 1000 gramos frente a descripción 8x120 g; no adjudicar el papel de 1000 ni aprobar formato completo.',
  '019600':'Categoría griegos no declara estilo griego en el nombre; sin ingredientes adquiridos, no completar receta por marca.',
  '019618':'Categoría griegos no declara estilo griego en el nombre; sin ingredientes adquiridos, no completar receta por marca.',
  '019933':'Envase 940 ml frente a botella 750 g; ambos explicitan envase único pero no una conversión fiable entre masa y volumen.',
  '020990':'Título 500 gramos frente a descripción 4x120g: papel de 500 desconocido, no aprobar firma nominal.',
  '021056':'Título 460 gramos frente a descripción 110gx4: papel de 460 desconocido, no convertirlo automáticamente en total.',
  '021893':'Fructosa 1,8% y edulcorantes explícitos; 0% en título no contradice ese añadido porque no indica a qué atributo se refiere.',
  '021895':'Descripción «115gr 4 uds.» sin multiplicador ni «de» y título 460 gramos. No resolver por división ni por coincidencia aritmética.',
  '021896':'Título 460 gramos frente a descripción 4x120g; sin gluten explícito coexiste con advertencia de trazas, no contradicción automática.',
  '024113':'Conteo enfrentado: título seis unidades, descripción 8X100. Conflicto independiente de que falte unidad tras 100.',
  '024581':'Título 4 uds. 550 grs. frente a 4x125g en descripción. Mantener papel de 550 sin resolver; no inventar que es contenido neto total.',
  '024895':'Advertencia de alergia a proteína de vaca no se transforma por sí sola en identificación exhaustiva de especie de la receta.',
  '025510':'Manzana al horno como perfil nominal; receta con crocanti de almendra. No equivaler a yogur de manzana simple sin revisar complementos.',
  '025865':'Oikos y categoría griegos no son una declaración explícita de estilo; 4X110 carece de unidad.',
  '026477':'Dos recetas arándanos/frutos rojos, segunda lista truncada; no completar ingredientes ausentes ni repartir el pack 2+2.',
  '026479':'Base de soja y coco explícitas; sin lácteos y gluten declarados. El perfil base mixto no se completa a soja pura.',
  '027291':'Título arándanos frente a descripción e ingredientes frambuesa. Conflicto nominal de sabor, sin elegir un campo ganador.',
  '027336':'Título natural azucarado frente a descripción sin azúcares añadidos, con edulcorantes. Conflicto explícito; conservar texto truncado «contiene azúc» sin completarlo.',
  '027687':'Sin azúcar se registra en azúcares totales, no en azúcar añadido; lactasa y leche no prueban ausencia de lácteos.',
  '027737':'Skyr explícito pero base sin acreditar; ALPRO no se usa como sustituto de ingredientes ni de política de subtipo.',
  '028550':'Base de coco, no soja por marca. Puede contener trazas de soja no significa base de soja. Sin lácteos explícito.',
  '031462':'Estilo griego consta en descripción aunque no en título; categoría bífidus no prueba presencia de bifidobacterias.',
  '031877':'Título 460 gramos frente a 4x110g; conservar ambigüedad nominal.',
  '031878':'Título 460 gramos frente a 110gx4; conservar ambigüedad nominal.',
  '031883':'Skyr y base soja con ausencia de lácteos explícitos. Subtipo skyr conservado en texto; no homologar a yogur lácteo.',
  '032117':'Advertencia sobre proteína de vaca no completa la especie; desnatado y sin lactosa sí son declaraciones del producto.',
  '032312':'Título 400g frente a 4x105g; papel de 400 sin resolver. Proteína y edulcorantes explícitos; no inferir 0% MG.',
  '033681':'4 unidades 120 gramos sin descripción; puede ser unidad o total, no convertir a 4x120g automáticamente.',
  '033682':'Aquí la descripción sí dice 120gx4; los 120g del título pueden corresponder a unidad. No declarar conflicto por asumir que son total.',
  '033688':'Mix de sabores en título pero una receta de fresa-plátano en ingredientes. Composición del pack pendiente, no inventar surtido ni homogeneidad.',
  '034084':'Categoría kéfir frente a título yogur de manzana sin detalle: alcance desconocido, no exclusión automática por categoría.',
  '034279':'Título 500 ml frente a descripción 4x125g; masa/volumen sin conversión, aun cuando coincida la cifra 500.',
  '034562':'Pudding explícito y categoría postre/mousse, no yogur probado. X6 puede ser logística: fuera del piloto, no aprobar formato de venta.',
  '034563':'Pudding explícito y categoría postre/mousse, no yogur probado. No inventar pack de venta por X6.',
  '034564':'Pudding explícito y categoría postre/mousse, no yogur probado. No inventar pack de venta por X6.',
  '035393':'Skyr lácteo declarado, pero su homologación de subtipo no está aprobada. No deducir grasa final solo de leche desnatada ingrediente.',
  '035397':'Lemon cheesecake es perfil compuesto, no una tarta real ni yogur de limón simple; base vegetal fermentada respaldada.',
  '035827':'0% MG y 0% azúcares añadidos están explícitos en descripción. Edulcorantes presentes; no convertir no añadido en no edulcorado.',
  '035939':'Pudding explícito: fuera de yogur del piloto, aunque esté en la misma categoría y el título contenga yogur.',
  '035942':'Muffin arándanos es perfil compuesto de alternativa fermentada, no bollo. No equivaler a arándanos simple sin revisar variante.',
  '036186':'10% en descripción sin objeto: no asignarlo automáticamente a grasa. Leche de vaca y estilo griego sí constan.',
  '036245':'Potito/pouch: 52,5% plátano y 45% yogur como ingrediente, conservación ambiente. No es yogur refrigerado del piloto.',
  '036361':'Menos azúcar y sin añadido son claims diferentes pero no contradictorios por sí solos. Descripción acredita no añadido; categoría kéfir no lo convierte en kéfir.',
  '036726':'Pastel de arándanos es sabor de yogur con trozos de pastel/galleta, no tarta como producto; no excluir por keyword pastel.',
  '036733':'Título seis unidades 600g frente a descripción 8x96ml. Conteo contradictorio; masa/volumen es una incertidumbre adicional.',
  '036737':'125G P4 no acredita inequívocamente pack comercial: P4 puede ser logística. Conservar cuatro y 125g sin asignar papel.',
  '036753':'500g en título frente a 440g en descripción, ambas sin papel: no tratarlas como dos totales demostrados; formato no resuelto.',
};

export const PLUSFRESC_FORMAT_WARNINGS = {
  '007388':'unresolved_quantity_role','013655':'unresolved_mass_volume',
  '017148':'unresolved_quantity_role','019933':'unresolved_mass_volume',
  '020990':'unresolved_quantity_role','021056':'unresolved_quantity_role',
  '021895':'unresolved_quantity_role','021896':'unresolved_quantity_role',
  '024113':'conflicting_count','024581':'unresolved_quantity_role',
  '026477':'assortment_distribution_unknown','027336':'quantity_role_unknown',
  '031877':'unresolved_quantity_role','031878':'unresolved_quantity_role',
  '032312':'unresolved_quantity_role','033688':'assortment_distribution_unknown',
  '034279':'unresolved_mass_volume','036733':'conflicting_count',
  '036737':'commercial_count_unverified','036753':'unresolved_quantity_role',
};
