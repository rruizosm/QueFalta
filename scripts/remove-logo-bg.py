"""
Quita el fondo crema del logo (assets/quefalta.jpg) y lo deja transparente.

Estrategia segura: en vez de borrar todo pixel "parecido al crema" (que se
comeria el pan/fruta claros), hace un recorte por COMPONENTE CONEXO desde los
bordes: solo el fondo que toca el borde de la imagen y la sombra contigua se
vuelven transparentes. Despues suaviza el borde y recorta el margen sobrante.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/quefalta.jpg"
OUT = "assets/quefalta-logo.png"
TOL_CONN = 80     # umbral para el fondo conectado al borde (+ sombra)
TOL_HOLE = 40     # umbral ESTRICTO para crema encerrado (triangulo de las asas)
PAD_FRAC = 0.04   # margen transparente alrededor del recorte final

img = np.asarray(Image.open(SRC).convert("RGB")).astype(np.int16)
h, w, _ = img.shape

# Color de fondo = mediana de los pixeles del borde.
border = np.concatenate([img[0, :], img[-1, :], img[:, 0], img[:, -1]])
bg = np.median(border, axis=0)
print("bg color:", bg.tolist())

# Distancia de cada pixel al color de fondo.
dist = np.sqrt(((img - bg) ** 2).sum(axis=2))

# 1) Fondo conectado al borde (incluye la sombra contigua), umbral generoso.
candidate = dist < TOL_CONN
lbl, n = ndimage.label(candidate)
edge_labels = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
edge_labels.discard(0)
bg_connected = np.isin(lbl, list(edge_labels))

# 2) Crema "puro" encerrado (p.ej. el triangulo entre las asas), umbral estricto
#    para no tocar el pan/fruta claros.
hole = dist < TOL_HOLE

bg_mask = bg_connected | hole
print("componentes:", n, "| fondo %.1f%%" % (100 * bg_mask.mean()))

# Alpha: opaco en el sujeto, transparente en el fondo. Suaviza 1px el borde.
alpha = np.where(bg_mask, 0.0, 255.0)
alpha = ndimage.gaussian_filter(alpha, sigma=0.8)
alpha = np.clip(alpha, 0, 255).astype(np.uint8)

rgba = np.dstack([img.astype(np.uint8), alpha])

# Recorta al bounding box del sujeto + un pequeno margen transparente.
ys, xs = np.where(alpha > 12)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
pad = int(max(y1 - y0, x1 - x0) * PAD_FRAC)
y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
y1, x1 = min(h, y1 + pad), min(w, x1 + pad)
rgba = rgba[y0:y1, x0:x1]
print("recorte:", rgba.shape[1], "x", rgba.shape[0])

Image.fromarray(rgba, "RGBA").save(OUT)
print("guardado:", OUT)
