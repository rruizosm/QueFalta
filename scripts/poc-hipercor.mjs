#!/usr/bin/env node
// POC de lectura del catalogo publico de Hipercor.
//
// No usa Supabase ni escribe datos salvo que se indique HIPERCOR_OUTPUT.
// Recorre paginas SSR de una categoria con Chromium porque Akamai rechaza las
// peticiones HTTP directas desde algunos entornos de automatizacion.
//
// Env:
//   HIPERCOR_PATH=/supermercado/alimentacion/
//   MAX_PAGES=2
//   MIN_PRODUCTS=40
//   HIPERCOR_OUTPUT=/ruta/opcional/resultado.json
//   PW_CHANNEL=chrome     (opcional; vacio usa Chromium de Playwright)
//   HEADLESS=0            (opcional; muestra el navegador)
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://www.hipercor.es';
const PATH = process.env.HIPERCOR_PATH || '/supermercado/alimentacion/';
const MAX_PAGES = positiveInteger(process.env.MAX_PAGES, 2);
const MIN_PRODUCTS = positiveInteger(process.env.MIN_PRODUCTS, Math.min(MAX_PAGES * 20, 40));
const OUTPUT = process.env.HIPERCOR_OUTPUT || null;
const NAV_TIMEOUT = positiveInteger(process.env.NAV_TIMEOUT_MS, 45_000);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCategoryPath(value) {
  const url = new URL(value, BASE);
  if (url.origin !== BASE) throw new Error(`HIPERCOR_PATH debe pertenecer a ${BASE}`);
  let path = url.pathname.replace(/\/\d+\/$/, '/');
  if (!path.startsWith('/supermercado/')) {
    throw new Error('HIPERCOR_PATH debe ser una categoria bajo /supermercado/');
  }
  if (!path.endsWith('/')) path += '/';
  return path;
}

function pageUrl(categoryPath, pageNumber) {
  return new URL(`${categoryPath}${pageNumber}/`, BASE).href;
}

function parseEuro(value) {
  const match = String(value || '').match(/\d+(?:[.,]\d{1,2})?/);
  return match ? Number(match[0].replace(',', '.')) : null;
}

function chromeUserAgent(version) {
  const platform = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

async function assertCatalogPage(page, label) {
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText().catch(() => '');
  if (/request could not be satisfied|access denied|human verification/i.test(`${title}\n${body}`)) {
    throw new Error(`Akamai/WAF bloqueo ${label}: ${title || 'respuesta sin titulo'}`);
  }
  await page.locator('li[data-type="item"][data-pagination]').first()
    .waitFor({ state: 'attached', timeout: NAV_TIMEOUT });
}

async function extractPage(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const countMatch = text.match(/\(\s*([\d.]+)\s*\)/);
    const declaredCount = countMatch ? Number(countMatch[1].replace(/\./g, '')) : null;

    const pagination = [...document.querySelectorAll('[data-pagination]')]
      .map((element) => {
        try { return JSON.parse(element.getAttribute('data-pagination') || ''); }
        catch { return null; }
      })
      .filter(Boolean);
    const completePagination = pagination.find((entry) => Number.isInteger(entry.totalPages)) || null;

    const dataLayerText = [...document.scripts]
      .map((script) => script.textContent || '')
      .find((script) => script.includes('dataLayer =')) || '';
    const centerMatch = dataLayerText.match(/"store_id"\s*:\s*"([^"]+)"/);

    const products = [...document.querySelectorAll('li[data-type="item"][data-pagination]')]
      .map((card) => {
        const productLink = card.querySelector('a[href*="/supermercado/B"]');
        const href = productLink?.getAttribute('href') || null;
        const id = href?.match(/\/supermercado\/(B\d+)-/)?.[1] || null;
        const finalPriceText = card.querySelector('.food-prices__offer')?.textContent?.trim()
          || card.querySelector('.food-prices__price')?.textContent?.trim()
          || null;
        const regularPriceText = card.querySelector('.food-prices__price--original')?.textContent?.trim() || null;
        const promoNode = card.querySelector('.food-promotional-actions__content__title');
        const promoLink = promoNode?.closest('a') || card.querySelector('a[href*="/promo/"]');
        return {
          id,
          url: href ? new URL(href, location.origin).href : null,
          name: card.querySelector('.food-product-preview-responsive__description')?.textContent?.trim() || null,
          image: card.querySelector('img')?.getAttribute('src') || null,
          packaging: card.querySelector('.food-product-preview-responsive__sale_type')?.textContent
            ?.replace(/\s*\|\s*/, ' | ').trim() || null,
          finalPriceText,
          regularPriceText,
          pricePerUnitText: card.querySelector('.food-prices__measurement-unit')?.textContent?.trim() || null,
          promotionText: promoNode?.textContent?.trim() || null,
          promotionUrl: promoLink?.getAttribute('href')
            ? new URL(promoLink.getAttribute('href'), location.origin).href
            : null,
          available: !!card.querySelector('button[class*="--add"]'),
          rawText: card.innerText.trim(),
        };
      })
      .filter((product) => product.id && product.name);

    return {
      title: document.querySelector('h1')?.textContent?.trim() || document.title,
      centerId: centerMatch?.[1] || null,
      declaredCount,
      pageNumber: completePagination?.page || pagination.find((entry) => entry.page)?.page || null,
      pageSize: completePagination?.size || products.length,
      totalPages: completePagination?.totalPages || null,
      products,
    };
  });
}

function summarize(products, pages, categoryPath, elapsedMs) {
  const valid = products.filter((product) => product.id && product.name && product.url);
  const withFinalPrice = valid.filter((product) => product.finalPrice != null);
  const withUnitPrice = valid.filter((product) => product.pricePerUnitText);
  const withExplicitOffer = valid.filter((product) => product.regularPrice != null || product.promotionText);
  const withImage = valid.filter((product) => product.image);
  const declaredCount = pages.find((page) => page.declaredCount != null)?.declaredCount ?? null;
  const advertisedTotalPages = pages.find((page) => page.totalPages != null)?.totalPages
    ?? (declaredCount != null ? Math.ceil(declaredCount / 24) : null);

  return {
    source: BASE,
    categoryPath,
    centerIds: [...new Set(pages.map((page) => page.centerId).filter(Boolean))],
    pagesRequested: MAX_PAGES,
    pagesRead: pages.length,
    advertisedProducts: declaredCount,
    advertisedTotalPages,
    uniqueProducts: valid.length,
    coverage: {
      finalPrice: withFinalPrice.length,
      pricePerUnit: withUnitPrice.length,
      image: withImage.length,
      explicitOffer: withExplicitOffer.length,
      unavailable: valid.filter((product) => !product.available).length,
    },
    elapsedMs,
  };
}

async function main() {
  const startedAt = Date.now();
  const categoryPath = normalizeCategoryPath(PATH);
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || undefined,
    headless: process.env.HEADLESS !== '0',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      locale: 'es-ES',
      userAgent: chromeUserAgent(browser.version()),
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);

    const pages = [];
    const byId = new Map();
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const url = pageUrl(categoryPath, pageNumber);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await assertCatalogPage(page, `pagina ${pageNumber}`);
      const result = await extractPage(page);
      result.url = url;
      pages.push(result);
      for (const product of result.products) {
        product.finalPrice = parseEuro(product.finalPriceText);
        product.regularPrice = parseEuro(product.regularPriceText);
        byId.set(product.id, product);
      }
      console.log(`[hipercor-poc] pagina ${pageNumber}: ${result.products.length} productos`);
    }

    const products = [...byId.values()];
    const summary = summarize(products, pages, categoryPath, Date.now() - startedAt);
    const output = { generatedAt: new Date().toISOString(), summary, pages, products };

    console.log(JSON.stringify({ summary, samples: products.slice(0, 5) }, null, 2));
    if (OUTPUT) {
      writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
      console.log(`[hipercor-poc] resultado escrito en ${OUTPUT}`);
    }
    if (products.length < MIN_PRODUCTS) {
      throw new Error(`guardarrail: ${products.length} productos unicos < MIN_PRODUCTS=${MIN_PRODUCTS}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[hipercor-poc] ERROR: ${error.message}`);
  process.exit(1);
});
