-- El comparador rellena su cache semantica de forma perezosa y una primera
-- consulta puede necesitar comparar el producto con muchos supermercados.
-- Sustituye el timeout de rol de 8 s por el maximo de 60 s admitido por la
-- Data API. El resto de llamadas conserva el limite normal de authenticated.

alter function public.catalog_cheaper_products_v6(text, text, text[])
  set statement_timeout to '60s';
