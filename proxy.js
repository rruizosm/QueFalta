/**
 * Local CORS proxy for Mercadona API.
 * Only needed when running the app in a web browser (Expo web).
 * Native devices (Expo Go / APK) connect directly — no proxy needed.
 *
 * Usage:  node proxy.js
 */
const http = require('http');
const https = require('https');

const PORT = 3001;
const TARGET_HOST = 'tienda.mercadona.es';

http.createServer((req, res) => {
  // Allow all origins for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const options = {
    hostname: TARGET_HOST,
    path: req.url,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MercaApp/1.0)',
      'Accept': 'application/json',
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, {
      'Content-Type': proxyRes.headers['content-type'] ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.end();
}).listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Proxy running on http://localhost:${PORT}`);
  console.log(`  Forwarding → https://${TARGET_HOST}`);
  console.log('  Press Ctrl+C to stop.\n');
});
