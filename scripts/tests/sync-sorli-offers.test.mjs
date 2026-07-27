import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DRY_RUN = '1';
const { sorliOfferColumns } = await import('../sync-sorli.mjs');

test('normaliza un precio rebajado y conserva el precio anterior', () => {
  assert.deepEqual(sorliOfferColumns({
    pvp: 5.9,
    pvpoferta: 5.75,
    ofertaEnVigor: true,
    ofertaCompleja: false,
    oferta: { descripcion: 'Precio', descripcionCat: 'Preu' },
    fechaInicioOferta: '2026-07-20T00:00:00Z',
    fechaFinOferta: '2026-07-26T00:00:00Z',
  }), {
    promo_name: 'Precio rebajado',
    promo_name_ca: 'Preu rebaixat',
    promo_text: null,
    promo_text_ca: null,
    promo_base_price: 5.9,
    promo_start: '2026-07-20',
    promo_end: '2026-07-26',
  });
});

test('prioriza la condición real de segunda unidad sobre un tipo genérico inconsistente', () => {
  const offer = sorliOfferColumns({
    pvp: 2.59,
    pvpoferta: 2.59,
    ofertaEnVigor: true,
    ofertaCompleja: true,
    oferta: { descripcion: '2ª 70%', descripcionCat: '2ª 70%' },
    descripcionOferta: 'ACEITUNAS 130 G 2ª50%',
    descripcionOfertaCat: 'OLIVES 130 G 2ª50%',
  });
  assert.equal(offer?.promo_name, '2ª unidad al 50%');
  assert.equal(offer?.promo_name_ca, '2a unitat al 50%');
  assert.equal(offer?.promo_text, 'ACEITUNAS 130 G 2ª50%');
});

test('distingue lotes a precio fijo de promociones 3x2', () => {
  assert.equal(sorliOfferColumns({
    ofertaEnVigor: true,
    ofertaCompleja: true,
    oferta: { descripcion: 'Lote Fijo', descripcionCat: 'Lot Fixe' },
    descripcionOferta: 'EMMENTAL 3 X 3.99',
  })?.promo_name, '3 uds. por 3,99 €');

  assert.equal(sorliOfferColumns({
    ofertaEnVigor: true,
    ofertaCompleja: true,
    oferta: { descripcion: '3x2', descripcionCat: '3x2' },
    descripcionOferta: 'CERVEZA 33 CL 3X2',
  })?.promo_name, '3x2');
});

test('no marca como oferta una promoción fuera de vigor', () => {
  assert.equal(sorliOfferColumns({
    pvp: 3,
    pvpoferta: 2,
    ofertaEnVigor: false,
    oferta: { descripcion: 'Precio' },
  }), null);
});
