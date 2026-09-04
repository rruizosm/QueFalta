// Hand-authored after reading the frozen fields. Not a title extractor.
// Columns: id | matrix | declared flavour | explicit claims | count x each grams.
// '-' means unresolved, never false. A bare amount has no unit/total role.
// See CE-202-yogurt-source-review-guide.md for the deliberately partial scope.
export const YOGURT_REVIEW_VERSION = 'ce202-yogurt-source-review-v1';
export const YOGURT_REVIEW_AUTHOR = 'assistant_source_review_with_deterministic_pair_composition';
export const YOGURT_REVIEW_DATE = '2026-09-03';
export const YOGURT_TABLES = {
  mercadona: `
16999|dessert|natural|-|6x125
19985|dairy_drink|stracciatella|noadded protein|1x280
20029|kefir|natural|-|1x500
20031|yogurt|strawberry|-|4x120
20032|yogurt|coconut|-|4x125
20033|yogurt|macedonia|-|4x125
20037|yogurt|macedonia|-|4x120
20040|yogurt|strawberry|-|4x125
20041|yogurt|lemon|-|4x125
20057|yogurt|coconut|-|4x120
20083|yogurt|vanilla|-|8x125
20087|yogurt|natural|-|4x125
20164|dessert|natural|nolactose zero_fat noadded|4x125
20210|yogurt|natural|zero_fat noadded|6x125
20221|yogurt|natural|sweetened zero_fat noadded|6x125
20247|yogurt|natural|-|4x125
20248|yogurt|natural|added|4x125
20260|yogurt|natural|-|8x120
20286|bifidus_unspecified|vanilla|bifidus|4x125
20287|yogurt|natural|goat|4x125
20355|bifidus_unspecified|mango+passionfruit|bifidus|4x125
20357|bifidus_unspecified|cereals|bifidus fibre|4x125
20376|yogurt|wild_fruits|-|1x500
20379|yogurt|peach+passionfruit|-|1x500
20382|bifidus_unspecified|forest_fruits|bifidus zero_fat noadded|4x125
20395|bifidus_unspecified|kiwi+cereals|bifidus zero_fat noadded|4x125
20396|bifidus_unspecified|muesli+cereals|bifidus zero_fat|4x125
20399|bifidus_unspecified|walnut+cereals|bifidus zero_fat|4x125
20504|yogurt|strawberry|greek|6x125
20512|yogurt|natural|greek|1x1000
20531|yogurt|strawberry|greek|4x125
20536|petit_unspecified|assorted|-|12x60
20559|yogurt|natural|greek|6x125
20571|yogurt|stracciatella|greek|6x125
20584|yogurt|natural|added|6x125
20629|dairy_drink|pineapple+coconut|-|1x1000
20859|bifidus_unspecified|cereals+strawberry|bifidus added topping|1x170
20953|bifidus_unspecified|lime+lemon|bifidus zero_fat noadded|4x125
20976|dairy_drink|coconut|-|12x100
21160|yogurt|mango|greek|4x125
21193|bifidus_unspecified|natural|bifidus zero_fat noadded|6x125
21199|yogurt|strawberry|zero_fat noadded|4x125
21256|dessert|natural|protein zero_fat|1x500
21307|bifidus_unspecified|natural|bifidus|6x125
21311|bifidus_unspecified|mango|bifidus|4x125
21312|bifidus_unspecified|prune|bifidus|4x125
21318|bifidus_unspecified|kiwi|bifidus zero_fat noadded|4x125
21321|yogurt|assorted|-|8x125
21327|bifidus_unspecified|cereals|bifidus fibre|4x125
21329|bifidus_unspecified|walnut+cereals|bifidus zero_fat|4x125
21330|bifidus_unspecified|wild_fruits|bifidus zero_fat noadded|4x125
21331|bifidus_unspecified|pear|bifidus zero_fat noadded|4x125
21332|bifidus_unspecified|pineapple|bifidus zero_fat noadded|4x125
21336|bifidus_unspecified|coconut+almond+chocolate|bifidus topping|1x180
21358|yogurt|natural|greek light two_fat|1x1000
21362|yogurt|lemon|zero_fat noadded|4x125
21377|bifidus_unspecified|natural|bifidus sweetened zero_fat noadded|6x125
21447|bifidus_unspecified|banana+oat+chia|bifidus|4x125
22313|yogurt|natural|-|6x125
22651|yogurt|lemon|greek|6x125
23476|bifidus_unspecified|natural|bifidus sweetened zero_fat noadded|8x120
23477|bifidus_unspecified|natural|bifidus zero_fat noadded|8x120
52421|yogurt|natural|greek light|6x125
52441|yogurt|natural|greek added|6x125
52448|dessert|natural|greek light|6x125
60955|yogurt|unspecified_fruits|-|8x125
67977|bifidus_unspecified|coconut|bifidus|4x125
7878|yogurt|natural|liquid added|12x100
86087|dessert|unspecified_fruits|zero_fat noadded|8x125
86331|yogurt|strawberry|liquid|12x100
86838|bifidus_unspecified|fig|bifidus|4x125
9981|dairy_drink|natural|added|1x1000`,
  consum: `
4507471|infant_unspecified|banana|-|4x100
7031974|bifidus_unspecified|mango+papaya|-|4x120
7046514|yogurt|pear|bifidus|4x120
7067788|bifidus_unspecified|natural|bifidus skimmed|4x125
7141542|yogurt|natural|added nolactose|4x125
7154958|yogurt|lemon|-|4x125
7159705|yogurt|assorted|-|8x120
7173433|health_drink_unspecified|natural|bare_zero liquid|6x65
7192008|yogurt|natural|greek|4x125
7199623|yogurt|natural|added|12x125
7199636|yogurt|natural|-|12x125
7199771|yogurt|unspecified_fruits|bare_zero|12x125
7199776|yogurt|assorted|-|12x125
7206316|yogurt|banana|-|4x125
7206324|yogurt|strawberry|greek|4x125
7206329|yogurt|lemon|skimmed sweetened|4x125
7213721|bifidus_unspecified|wild_fruits|bare_zero|4x115
7213742|bifidus_unspecified|lime+lemon|-|4x115
7228849|yogurt|natural|-|500
7247674|kefir|unknown|cow|500
7260834|yogurt|blackberry+raspberry|greek layered|4x125
7263353|bifidus_unspecified|oat+walnut|bifidus|4x115
7275753|petit_unspecified|strawberry|-|4x80
7276210|yogurt|mango|organic|135
7280605|yogurt|natural|nolactose|4x125
7282155|health_drink_unspecified|strawberry|noadded|12x100
7288272|yogurt|natural|bare_zero sweetened|4x125
7294366|yogurt|strawberry|-|2x130
7294382|yogurt|natural|added|2x130
7294387|yogurt|natural|-|2x130
7294627|yogurt|peach|bifidus bare_zero|4x125
7294692|yogurt|forest_fruits|bifidus bare_zero|4x125
7294705|yogurt|natural|bifidus bare_zero sweetened|4x125
7294713|yogurt|natural|bifidus bare_zero|4x125
7294721|yogurt|cereals+muesli|bifidus|4x125
7300171|yogurt|natural|greek added|4x125
7302867|yogurt|blueberry|sheep jam|140
7302875|yogurt|chestnut|sheep jam|140
7303522|yogurt|natural|greek|4x110
7303527|yogurt|natural|greek added|4x110
7312015|infant_dessert|apple+banana|organic|120
7337876|yogurt|strawberry|nolactose|4x125
7340776|yogurt|natural|greek added|4x125
7340784|yogurt|natural|greek|4x125
7340789|yogurt|stracciatella|greek|4x125
7340792|yogurt|strawberry|greek|4x125
7340867|yogurt|natural|bare_zero sweetened|4x125
7340870|yogurt|natural|bare_zero|4x125
7340875|yogurt|strawberry|bare_zero|4x125
7340883|yogurt|lemon|bare_zero|4x125
7340888|yogurt|natural|-|4x125
7340896|yogurt|strawberry|-|4x125
7340904|yogurt|macedonia|-|4x125
7340909|yogurt|coconut|-|4x125
7340912|yogurt|lemon|-|4x125
7340953|bifidus_unspecified|chia+almond|bare_zero|4x115
7343283|kefir|natural|-|6x100
7354876|yogurt|natural|added|4x125
7358646|yogurt|natural|bare_zero nolactose|4x125
7364607|yogurt|lime+lemon|greek|4x110
7369093|yogurt|banana|-|4x120
7370984|yogurt|natural|goat|2x125
7371029|yogurt|natural|-|2x125
7371032|yogurt|natural|added|2x125
7371037|yogurt|strawberry|-|2x125
7371040|yogurt|peach|-|2x125
7375004|bifidus_unspecified|strawberry|-|4x120
7375009|bifidus_unspecified|mango|-|4x120
7391030|yogurt|mango+passionfruit|liquid bare_zero|1000
7391043|yogurt|natural|liquid added|1000
7391048|yogurt|pineapple+coconut|liquid|1000
7391050|yogurt|strawberry|liquid|1000
7391055|yogurt|peach+passionfruit|liquid|1000
7391063|yogurt|strawberry+banana|liquid|1000
7394851|yogurt|forest_fruits|liquid|1500
7394872|yogurt|strawberry+banana|liquid|1500
7397669|yogurt|strawberry|liquid bare_zero|1000
7406098|yogurt|forest_fruits|-|4x125
7406437|yogurt|walnut|greek added|4x125
7406440|yogurt|lemon|greek added|4x125
7413990|yogurt|natural|-|4x125
7414006|yogurt|natural|nolactose|4x125
7415461|yogurt|unspecified_fruits|-|8x125
7430312|yogurt|stracciatella|bare_zero protein|4x105
7430544|yogurt|natural|greek|4x125
7430762|yogurt|natural|-|4x125
7431385|yogurt|cookie|-|4x120
7434434|candy|strawberry|-|32
7443963|yogurt|natural|greek|4x110
7443968|yogurt|unknown|greek|4x110
7443971|yogurt|strawberry|greek|4x110
7444284|yogurt|macedonia|-|4x125
7444292|yogurt|unknown|greek|500
7445315|kefir|strawberry|-|500
7451784|icecream|honey+walnut|-|350
7452514|yogurt|strawberry|bare_zero protein|4x105
7452910|yogurt|stracciatella|greek|4x110
7453590|yogurt|unknown|greek light|4x125
7456056|yogurt|unknown|greek light|4x125
7458235|yogurt|coconut|liquid bare_zero protein|4x160
7458243|yogurt|tropical|liquid bare_zero protein|4x160
7460140|meal_replacement|chocolate|-|500ml
7463904|yogurt|natural|greek|1000
7465938|yogurt|unknown|greek nolactose|4x90
7468528|yogurt|unknown|greek goat|420
7473692|yogurt|natural|greek|920
7473754|yogurt|mango|bare_zero protein|4x105
7476992|bifidus_unspecified|natural|-|8x120
7477003|bifidus_unspecified|natural|bare_zero|8x120
7477008|bifidus_unspecified|natural|bare_zero sweetened|8x120
7478431|bifidus_unspecified|red_fruits+cereals|-|4x115
7478451|bifidus_unspecified|muesli|bare_zero|4x115
7482698|cake|red_fruits|-|375
937110|yogurt|natural|-|4x125
937151|yogurt|macedonia|-|4x120
937177|yogurt|natural|skimmed|4x125
937185|yogurt|natural|added|4x125
937193|yogurt|strawberry|-|4x125`,
  carrefour: `
852100300|fermented_milk|kiwi|skimmed sugar_conflict bifidus milk|4x125
521029633|fermented_milk|mango+papaya|added bifidus milk|4x120
522715570|fermented_milk|natural|skimmed added sweetened bifidus milk|4x120
647801823|fermented_milk|natural|skimmed added sweetened bifidus milk|8x120
521029695|fermented_milk|strawberry|liquid skimmed added sweetened milk glutenfree sterols|8x65ml
819115325|yogurt|assorted|greek layered added milk|4x125
804987724|fermented_milk|assorted|liquid added milk|12x100
521029416|yogurt|assorted|added milk glutenfree|8x120
521029418|yogurt|assorted|added milk|8x120
653701722|fermented_milk|strawberry|liquid added milk|4x70
VC4AECOMM-084930|yogurt|natural|goat|?2:125
641302318|yogurt|strawberry|greek layered added milk|4x125
521034442|yogurt|natural|cow organic milk|420
745416220|yogurt|natural|cow milk glutenfree|500
745416226|yogurt|natural|cow milk skimmed sweetened|500
745416228|yogurt|peach+passionfruit|cow milk added glutenfree|500
745416230|yogurt|strawberry|cow milk added glutenfree|500
814300793|yogurt|natural|greek cow milk|500
VC4AECOMM-164659|yogurt|natural|sheep milk|2x115
VC4AECOMM-164662|yogurt|natural|goat milk|2x115
590510306|plant_fermented|natural|soy total_sugar_free nolactose glutenfree bifidus|6x100
VC4AECOMM-004276|plant_fermented|lime+lemon|soy dairy_free added nolactose glutenfree|400`,
};

export const YOGURT_NOTES = {
  'mercadona:20859': 'Natural describe la base; cereales y fresas deshidratadas son complementos declarados. No registrar sabor natural simple.',
  'mercadona:21336': 'Base natural con coco, almendras y chocolate: no equivaler a natural sin complementos desde el título.',
  'consum:7031974': 'Soja en el nombre no prueba base exclusivamente vegetal. No copiar la receta con leche de Carrefour 521029633, aunque parezca la misma gama.',
  'consum:7443968': 'La ficha trunca «Stracciatell». No resolver sabor mediante una corrección silenciosa del texto; queda desconocido.',
  'consum:7430312': '0%0% no identifica azúcar o grasa. Categoría griego no convierte el título de proteína en una declaración explícita de estilo griego.',
  'consum:7312015': 'Potito infantil de fruta con yogur como componente, según título y categorías originales; no es una referencia de yogur del piloto.',
  'consum:7451784': 'Helado en tarrina, respaldado por la ruta original Congelados y helados > Helados. Yogur es el sabor, no la identidad.',
  'carrefour:852100300': 'Título sin azúcar añadido frente a denominación azucarada e ingredientes azúcar/jarabe. Conflicto explícito de azúcar añadido: arbitraje, sin prioridad automática.',
  'carrefour:521029633': 'La denominación declara leche fermentada con extracto de soja. La receta contiene leche, nata y azúcar; soja no implica sin lácteos.',
  'carrefour:522715570': 'Denominación con azúcar (fructosa) y edulcorantes; ingredientes no enumeran fructosa. Conservar discordancia documental para arbitraje, no inferir sin azúcar desde esa omisión.',
  'carrefour:647801823': 'Denominación con azúcar (fructosa) y edulcorantes; ingredientes no enumeran fructosa. Misma advertencia que 522715570, leída por separado, sin copiar evidencia.',
  'carrefour:521029695': 'Ocho unidades de 65 ml; no convertir a gramos sin densidad. La diferencia de conteo frente a 6x65 g es independiente de esa dimensión no resuelta.',
  'carrefour:819115325': 'Título de maracuyá y de melocotón, receta separada en ingredientes pero denominación combinada. Composición de surtido no resuelta: no aprobar mezcla única ni reparto de las cuatro unidades.',
  'carrefour:804987724': 'Dos recetas alternativas explícitas: fresa-plátano o piña-coco. Falta reparto por receta en las 12 unidades; no asumir 6+6 ni mezcla de cuatro sabores.',
  'carrefour:521029416': 'Surtido detallado en denominación: dos fresa, dos macedonia, dos limón y dos galleta. Conteo por receta sí acreditado.',
  'carrefour:521029418': 'Surtido detallado en denominación: dos fresa, dos macedonia, dos coco y dos frutos del bosque. No sustituye al surtido de limón y galleta.',
  'carrefour:653701722': 'El título acredita cuatro bolsitas de 70 g. Yogur en título y leche fermentada en denominación: matriz más específica pendiente, no son conceptos mutuamente excluyentes por sí solos.',
  'carrefour:VC4AECOMM-084930': 'Dos unidades 125 g, sin «de» ni x entre conteo y cantidad. Conservar conteo dos y 125 g sin papel; no inventar total 250 g.',
  'carrefour:641302318': 'Natural describe la base azucarada sobre fresa. Es yogur bicapa de fresa; no conflicto de sabor natural/fresa.',
  'carrefour:745416226': 'Desnatado y con estevia explícitos. No hay declaración sin azúcar añadido; su ausencia en la lista no se transforma en un claim.',
  'carrefour:590510306': 'Especialidad vegetal fermentada; sin azúcar es claim de azúcares totales, no el mismo campo que sin azúcar añadido. Calcio, vitamina D2 y fermentos conservados en evidencia.',
  'carrefour:VC4AECOMM-004276': 'Soja fermentada, azúcar y jarabe; sin lácteos explícito en ingredientes. Sin lactosa no es el fundamento de la ausencia de lácteos.',
};

export const YOGURT_ASSORTMENTS = {
  'carrefour:521029416': {strawberry: 2, macedonia: 2, lemon: 2, cookie: 2},
  'carrefour:521029418': {strawberry: 2, macedonia: 2, coconut: 2, forest_fruits: 2},
};
