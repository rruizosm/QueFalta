// Provincia (código INE 01–52) → comunidad autónoma. El nombre se muestra tal cual
// en la app ("Producto solo disponible en {CCAA}"), por eso van en su forma local
// (Catalunya, Comunitat Valenciana, Illes Balears, Euskadi…). Compartida por los
// syncs que barren varias zonas/almacenes por provincia (Mercadona, Dia).
export const PROVINCE_COMMUNITY = {
  '01': 'Euskadi', '20': 'Euskadi', '48': 'Euskadi',
  '02': 'Castilla-La Mancha', '13': 'Castilla-La Mancha', '16': 'Castilla-La Mancha', '19': 'Castilla-La Mancha', '45': 'Castilla-La Mancha',
  '03': 'Comunitat Valenciana', '12': 'Comunitat Valenciana', '46': 'Comunitat Valenciana',
  '04': 'Andalucía', '11': 'Andalucía', '14': 'Andalucía', '18': 'Andalucía', '21': 'Andalucía', '23': 'Andalucía', '29': 'Andalucía', '41': 'Andalucía',
  '05': 'Castilla y León', '09': 'Castilla y León', '24': 'Castilla y León', '34': 'Castilla y León', '37': 'Castilla y León', '40': 'Castilla y León', '42': 'Castilla y León', '47': 'Castilla y León', '49': 'Castilla y León',
  '06': 'Extremadura', '10': 'Extremadura',
  '07': 'Illes Balears',
  '08': 'Catalunya', '17': 'Catalunya', '25': 'Catalunya', '43': 'Catalunya',
  '15': 'Galicia', '27': 'Galicia', '32': 'Galicia', '36': 'Galicia',
  '22': 'Aragón', '44': 'Aragón', '50': 'Aragón',
  '26': 'La Rioja',
  '28': 'Comunidad de Madrid',
  '30': 'Región de Murcia',
  '31': 'Navarra',
  '33': 'Asturias',
  '35': 'Canarias', '38': 'Canarias',
  '39': 'Cantabria',
  '51': 'Ceuta', '52': 'Melilla',
};
