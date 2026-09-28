# QuéFalta — 10-second vertical brand film

Final delivery: **quefalta-brand-film-10s.mp4**, 1080 × 1920, 60 fps, 10 seconds, H.264 with stereo AAC sound. Spanish product copy; 9:16 composition for Reels and TikTok.

## Creative and timing

Original 144 BPM electronic music, six bars, with UI accents and transition sound design. Beat-locked scene changes at 1.6667, 3.3333, 5.8333 and 7.5000 seconds.

| Time | Picture |
| --- | --- |
| 0–1.667 | Oversized “¿QUÉ FALTA?” reveal, official basket logo, independently animated real product tiles. |
| 1.667–3.333 | Deconstructed app list: photos, labels, quantity controls and cards animate separately; add interaction. |
| 3.333–5.833 | Two shared list panels, moving synchronization particles and sequential checkmarks. |
| 5.833–7.500 | Six supermarket marks orbit the official app identity. |
| 7.500–10 | Logo, QuéFalta wordmark, product proposition and quefalta.es end card. |

Motion uses masked typography, staggered springs, overshoot, curved paths, layered shadows, particle animation, three temporal samples per final frame, and four distinct geometric transitions. The final website address holds until the end.

## Actual product sources

- Official blue basket logo: repository `assets/quefalta-logo-blue.png` (copied to `assets/logo.png`).
- Published app screenshot: https://quefalta.es/mock/cesta.PNG, available in the local website checkout and copied unchanged to `assets/cesta.png`. Avocado, aubergine and peach photos are drawn directly from individual screenshot regions. Their original names, quantities and reference prices are reconstructed as crisp text. Cards and controls are independent animated vector layers.
- Additional reference: https://quefalta.es/mock/catalog_3.png (`assets/catalog.png`).
- Official supermarket assets from the existing project/web asset folders: Mercadona, Carrefour, Consum, Dia, Bonpreu/Esclat and bonÀrea. No count, promotion or price-comparison claims are made.
- Space Grotesk: the app's existing bundled font (OFL).
- Music and sound effects: original procedural composition in `score.py`; no third-party recordings or music samples.

Public product reference: https://quefalta.es/. The animation is a motion-design adaptation of the app UI, not a screen recording. No customer account data was accessed.

## Reproduce or edit

- `film.html`: editable animation composition; append `?play` for a looping browser preview.
- `render.mjs`: Playwright frame renderer; `node marketing/brand-film-10s/render.mjs --preview` renders review stills, without that flag renders all 600 frames.
- `score.py`: requires Python and NumPy; exports the 48 kHz stereo WAV master.
- `encode.swift`: macOS AVFoundation encoder and audio muxer. Compile with `xcrun swiftc -swift-version 5 encode.swift -o /tmp/qf-film-encode`, then pass this folder's absolute path.
- `verify.swift`: decodes the delivered MP4, checks sample counts/duration/audio and extracts final review frames.
- `audio-report.json`, `video-report.json`, `verification.json`: output technical checks.

Render intermediates (`frames/`, `silent-master.mov`) are ignored and can be regenerated. Nothing has been published to a social account. Application source code is unchanged.

## Repository validation

The requested `npx tsc --noEmit` was run. It reports three existing missing style properties in `src/components/StoreDropdown.tsx` (`triggerRow`, `infoButton`, `infoButtonPressed`), outside this standalone media work. Video validation is recorded separately above.
