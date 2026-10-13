# Mercadona illustrations — 1000 products

Completed 2026-10-09. This batch published **1000 unique products** to Supabase as WebP illustrations: 900 from lots 01–09, 97 eligible products from lot 10, and 3 supplementary replacements.

ImageGen rejected three original lot-10 requests at output moderation: product IDs `46920`, `8260`, and `52821`. Those requests were not retried, their product rows and evidence were preserved, and three unrelated published Mercadona products with empty `illustration_url` fields were selected instead:

| Replacement ID | Product | Replaces blocked ID |
| --- | --- | --- |
| `19740` | Escamas de sal marina natural Polasal | `46920` |
| `68233` | Escarola rizada | `8260` |
| `69656` | Espárragos verdes finos | `52821` |

All 1000 publications passed the remote readback checks for WebP MIME type, SHA-256, byte length, dimensions, and alpha channel. The source JPG and temporary WebP were deleted only after a matching Supabase receipt. The 2,959 prior illustrations and thumbnails remained unchanged. No `.jpg`, `.jpeg`, or `.webp` files remain under `assets/product-illustrations/`; generated PNGs, prompts, receipts, and QA reports are retained.

`npx tsc --noEmit` passed. The original manifests cover 1000 selected IDs, including the three blocked IDs; the supplemental manifest adds three replacement IDs, so the audit contains 1003 unique IDs and 1000 verified publications.

See the [lot 10 report](lot-10/README.md), the [three-product supplement](lot-11-supplement-3/README.md), and the lot-level `verification.json` files for detailed receipts and audits.
