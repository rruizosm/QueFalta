#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { PNG } from 'pngjs';

const MARGIN = 16;
const CORE_ALPHA = 224;
const MIN_VISIBLE_ALPHA = 16;

const [inputPath, outputPath = inputPath] = process.argv.slice(2);
if (!inputPath || extname(inputPath).toLowerCase() !== '.png' || extname(outputPath).toLowerCase() !== '.png') {
  throw new Error('Uso: node scripts/clean-product-illustration-alpha.mjs <entrada.png> [salida.png]');
}

const source = PNG.sync.read(await readFile(inputPath));
const { width, height, data } = source;
const pixelCount = width * height;

const alphaAt = (index) => data[index * 4 + 3];
const isOpaqueSource = Array.from({ length: pixelCount }, (_, index) => alphaAt(index) === 255).every(Boolean);

const neighbours = (index) => {
  const x = index % width;
  const y = Math.floor(index / width);
  const values = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) values.push(ny * width + nx);
    }
  }
  return values;
};

const largestComponent = (mask) => {
  const seen = new Uint8Array(pixelCount);
  let largest = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    const component = [];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      component.push(index);
      for (const next of neighbours(index)) {
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const result = new Uint8Array(pixelCount);
  for (const index of largest) result[index] = 1;
  return result;
};

const dilate = (mask, radius) => {
  let current = mask;
  for (let pass = 0; pass < radius; pass += 1) {
    const next = current.slice();
    for (let index = 0; index < pixelCount; index += 1) {
      if (!current[index]) continue;
      for (const neighbour of neighbours(index)) next[neighbour] = 1;
    }
    current = next;
  }
  return current;
};

const fillHoles = (mask) => {
  const outside = new Uint8Array(pixelCount);
  const queue = [];
  const enqueue = (index) => {
    if (!mask[index] && !outside[index]) {
      outside[index] = 1;
      queue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of neighbours(queue[cursor])) enqueue(next);
  }
  const filled = mask.slice();
  for (let index = 0; index < pixelCount; index += 1) {
    if (!outside[index]) filled[index] = 1;
  }
  return filled;
};

let keep;
if (isOpaqueSource) {
  const backgroundCandidate = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const lightness = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    backgroundCandidate[index] = chroma <= 14 && lightness >= 88 && lightness <= 238 ? 1 : 0;
  }

  const outside = new Uint8Array(pixelCount);
  const queue = [];
  const enqueue = (index) => {
    if (backgroundCandidate[index] && !outside[index]) {
      outside[index] = 1;
      queue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of neighbours(queue[cursor])) enqueue(next);
  }

  const foreground = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) foreground[index] = outside[index] ? 0 : 1;
  keep = fillHoles(dilate(largestComponent(foreground), 2));
  for (let index = 0; index < pixelCount; index += 1) data[index * 4 + 3] = keep[index] ? 255 : 0;
} else {
  const core = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) core[index] = alphaAt(index) >= CORE_ALPHA ? 1 : 0;
  keep = dilate(fillHoles(largestComponent(core)), 3);
  for (let index = 0; index < pixelCount; index += 1) {
    if (!keep[index]) data[index * 4 + 3] = 0;
  }
}

for (let index = 0; index < pixelCount; index += 1) {
  if (alphaAt(index) < MIN_VISIBLE_ALPHA) data[index * 4 + 3] = 0;
}

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let index = 0; index < pixelCount; index += 1) {
  if (alphaAt(index) === 0) continue;
  const x = index % width;
  const y = Math.floor(index / width);
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
}
if (maxX < minX || maxY < minY) throw new Error('No se detectó ningún producto.');

minX = Math.max(0, minX - MARGIN);
minY = Math.max(0, minY - MARGIN);
maxX = Math.min(width - 1, maxX + MARGIN);
maxY = Math.min(height - 1, maxY + MARGIN);

const cropped = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
PNG.bitblt(source, cropped, minX, minY, cropped.width, cropped.height, 0, 0);

const temporaryPath = join(dirname(outputPath), `.${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
await writeFile(temporaryPath, PNG.sync.write(cropped));
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ inputPath, outputPath, width: cropped.width, height: cropped.height, alpha: true }));
