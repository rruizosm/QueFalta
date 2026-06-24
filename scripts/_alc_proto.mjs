import { chromium } from 'playwright';

const REF = 'https://www.compraonline.alcampo.es/categories/leche-huevos-l%C3%A1cteos-yogures-y-bebidas-vegetales/leche/OC1603';

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({
  locale: 'es-ES',
  viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

const gqlResponses = [];
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('/graphql') || u.includes('product-listing')) {
    let bodyLen = 0, hasProducts = false;
    try { const t = await res.text(); bodyLen = t.length; hasProducts = /retailerProductId|productsByInternal|productGroups/.test(t); } catch {}
    gqlResponses.push({ status: res.status(), url: u.slice(0, 60), bodyLen, hasProducts });
  }
});

console.log('goto…');
await page.goto(REF, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

// scroll progresivo para forzar carga lazy
let prevCount = 0;
for (let i = 0; i < 25; i++) {
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(900);
  const count = await page.evaluate(() => {
    // contar cards de producto en el DOM
    return document.querySelectorAll('[data-test*="product"], article, [class*="ProductTile"], [class*="product-tile"]').length;
  });
  if (i % 5 === 0 || count !== prevCount) console.log(`  scroll ${i}: cards DOM ≈ ${count}`);
  prevCount = count;
}

const after = await page.evaluate(() => ({
  cookie: /aws-waf-token/.test(document.cookie),
  // intentar leer cuántos productEntities hay ahora en el store (si accesible)
  hydrated: window.__INITIAL_STATE__ ? Object.keys(window.__INITIAL_STATE__.data.products.productEntities || {}).length : -1,
  bodyText: document.body.innerText.length,
}));
console.log('\ntras scroll →', after);
console.log('\nrespuestas /graphql|product-listing capturadas:', gqlResponses.length);
for (const r of gqlResponses.slice(0, 15)) console.log(' ', r);

await browser.close();
