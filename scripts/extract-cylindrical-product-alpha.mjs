#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { PNG } from 'pngjs';

const [inputPath, outputPath = inputPath] = process.argv.slice(2);
if (!inputPath || extname(inputPath).toLowerCase() !== '.png' || extname(outputPath).toLowerCase() !== '.png') {
  throw new Error('Uso: node scripts/extract-cylindrical-product-alpha.mjs <entrada.png> [salida.png]');
}

const source = PNG.sync.read(await readFile(inputPath));
const { width, height, data } = source;

// Silueta normalizada de una lata frontal: media elipse superior, cuerpo recto
// y media elipse inferior. Los valores se calibran sobre el lienzo completo,
// no sobre el contenido de la etiqueta, para no erosionar los aros metálicos.
const centerX = width * 0.5;
const radiusX = width * 0.279;
const topCenterY = height * 0.113;
const topRadiusY = height * 0.064;
const bottomCenterY = height * 0.84;
const bottomRadiusY = height * 0.099;
const samplesPerAxis = 4;

const inside = (x, y) => {
  const normalizedX = (x - centerX) / radiusX;
  if (y < topCenterY) {
    const normalizedY = (y - topCenterY) / topRadiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }
  if (y <= bottomCenterY) return Math.abs(normalizedX) <= 1;
  const normalizedY = (y - bottomCenterY) / bottomRadiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
};

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    let covered = 0;
    for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
      for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
        if (inside(x + (sampleX + 0.5) / samplesPerAxis, y + (sampleY + 0.5) / samplesPerAxis)) {
          covered += 1;
        }
      }
    }
    const alpha = Math.round((covered / (samplesPerAxis * samplesPerAxis)) * 255);
    data[(y * width + x) * 4 + 3] = alpha;
    if (alpha > 0) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}

if (maxX < minX || maxY < minY) throw new Error('No se detectó la silueta del producto.');

const margin = 16;
minX = Math.max(0, minX - margin);
minY = Math.max(0, minY - margin);
maxX = Math.min(width - 1, maxX + margin);
maxY = Math.min(height - 1, maxY + margin);

const cropped = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
PNG.bitblt(source, cropped, minX, minY, cropped.width, cropped.height, 0, 0);

const temporaryPath = join(dirname(outputPath), `.${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
await writeFile(temporaryPath, PNG.sync.write(cropped));
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ inputPath, outputPath, width: cropped.width, height: cropped.height, alpha: true }));
