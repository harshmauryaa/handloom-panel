# Handloom Panel

Browser tool for handloom BMP designs. Everything runs in the browser; no server or install needed.

| Tab | What it does |
|---|---|
| **Split** | Each row becomes one row per colour (that colour kept, everything else white), followed by one white row. |
| **Split (No White)** | Same split, without the white row. |
| **Merge** | Upload two BMPs in any order. The one with more rows (A) is split; each added white row is replaced by the next row of the other image (B), cycling 1, 2, 3, 1, 2, 3, … |

Each tab has a preview with zoom, a row inspector, and BMP / PNG download.

Example (Split): `BBBPPBBB` → `WWWPPWWW`, `BBBWWBBB`, `WWWWWWWW`

## Run locally

Open `public/index.html` in a browser.

## Build and test

```bash
npm run build   # syntax check
npm test        # split / merge / BMP tests
```

Every push to `main` runs the build and tests in GitHub Actions and publishes `public/` to GitHub Pages.
The Cloudflare Pages copy (https://handloom-panel.pages.dev) is deployed with `npm run deploy:cloudflare`.
