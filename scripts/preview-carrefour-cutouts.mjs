#!/usr/bin/env node
// Local previews only. Never uploads images or updates the catalogue.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const folder = resolve(process.argv[2] ?? 'assets/product-cutouts/carrefour-20261027-sample');
const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const excluded = new Set(['papeleria', 'bazar', 'calzado']);
if (manifest.store !== 'carrefour' || manifest.products.length !== 5) throw new Error('Solo cinco pruebas de Carrefour.');
const ids = new Set();
for (const product of manifest.products) {
  if (!/^[a-zA-Z0-9_-]+$/.test(product.id) || ids.has(product.id)) throw new Error('ID inválido o repetido.');
  if (!product.categoryName || excluded.has(normalize(product.categoryName))) throw new Error(`Categoría excluida: ${product.id}`);
  ids.add(product.id);
}
const scratch = await mkdtemp(join(tmpdir(), 'carrefour-alpha-'));
const previews = [];
const results = [];
try {
  for (const product of manifest.products) {
    const originalPath = join(folder, `${product.id}-original.jpg`);
    const decodedPath = join(scratch, `${product.id}.png`);
    execFileSync('sips', ['-s', 'format', 'png', originalPath, '--out', decodedPath], { stdio: 'ignore' });
    const source = PNG.sync.read(await readFile(decodedPath));
    const { width, height, data } = source;
    const original = Buffer.from(data);
    const pixels = width * height;
    const outside = new Uint8Array(pixels);
    const queue = new Int32Array(pixels);
    let size = 0;
    const visit = (index) => {
      if (outside[index]) return;
      const offset = index * 4;
      const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
      const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
      if (min < 245 || max - min > 10) return;
      outside[index] = 1;
      queue[size++] = index;
    };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    // Visually reviewed holes, e.g. the opening in the detergent handle.
    for (const [x, y] of product.backgroundSeeds ?? []) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) {
        throw new Error(`Semilla fuera de imagen: ${product.id}`);
      }
      visit(y * width + x);
      if (!outside[y * width + x]) throw new Error(`La semilla no es fondo blanco: ${product.id}`);
    }
    for (let cursor = 0; cursor < size; cursor++) {
      const index = queue[cursor];
      const x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < pixels - width) visit(index + width);
    }
    for (let index = 0; index < pixels; index++) if (outside[index]) data[index * 4 + 3] = 0;
    if (size < pixels * 0.1 || size > pixels * 0.95) throw new Error(`Máscara sospechosa: ${product.id}`);
    const output = PNG.sync.write(source);
    const outputPath = join(folder, `${product.id}-preview.png`);
    await writeFile(outputPath, output);
    const verified = PNG.sync.read(await readFile(outputPath));
    for (let i = 0; i < original.length; i++) {
      if (i % 4 !== 3 && original[i] !== verified.data[i]) throw new Error(`RGB modificado: ${product.id}`);
    }
    results.push({ id: product.id, categoryName: product.categoryName, width, height,
      transparentPixels: size, rgbUnchanged: true, backgroundSeeds: product.backgroundSeeds ?? [],
      originalSha256: createHash('sha256').update(await readFile(originalPath)).digest('hex'),
      outputSha256: createHash('sha256').update(output).digest('hex') });
    previews.push({ source: { width, height, data: original }, cutout: verified });
  }
  // Top row: originals. Bottom row: cutouts on a checkerboard, for visual QA.
  const cell = 370;
  const sheet = new PNG({ width: cell * 5, height: cell * 2 });
  sheet.data.fill(255);
  for (let n = 0; n < previews.length; n++) {
    for (const [row, picture] of [[0, previews[n].source], [1, previews[n].cutout]]) {
      const dx = cell * n + Math.floor((cell - picture.width) / 2);
      const dy = cell * row + Math.floor((cell - picture.height) / 2);
      for (let y = 0; y < picture.height; y++) for (let x = 0; x < picture.width; x++) {
        const from = (y * picture.width + x) * 4;
        const to = ((dy + y) * sheet.width + dx + x) * 4;
        const bg = row === 0 ? 255 : (Math.floor(x / 12) + Math.floor(y / 12)) % 2 ? 214 : 239;
        const alpha = picture.data[from + 3] / 255;
        for (let c = 0; c < 3; c++) sheet.data[to + c] = Math.round(picture.data[from + c] * alpha + bg * (1 - alpha));
      }
    }
  }
  await writeFile(join(folder, 'comparison.png'), PNG.sync.write(sheet));
  await writeFile(join(folder, 'verification.json'), JSON.stringify({
    method: 'Border-connected near-white background extraction and visually reviewed background seeds; alpha only; original dimensions and decoded RGB preserved.',
    excludedCategories: ['Papelería', 'Bazar', 'Calzado'], products: results,
    uploaded: false, databaseChanged: false,
  }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally { await rm(scratch, { recursive: true, force: true }); }
