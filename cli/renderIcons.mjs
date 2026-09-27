// Renders the install icons (public/icons/*.png, listed in app/manifest.ts)
// from the app icon, app/icon.svg: the brand Nelore and its ear tag. Run once
// with `node cli/renderIcons.mjs` after the mark changes; the PNGs are
// committed. It draws with the Playwright chromium already on this machine,
// so the repo needs no image library.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire("/home/luketa/.npm/_npx/705bc6b22212b352/node_modules/");
const { chromium } = require("playwright");

const OUT = new URL("../public/icons/", import.meta.url);
const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// "any" icons are a rounded tile with transparent corners. The maskable one is
// a full-bleed tile with the mark inside the centre 60 % (20 % padding each
// side), which every launcher mask leaves visible.
const ICONS = [
  { file: "icon-192.png", size: 192, radius: "22%", art: 0.8 },
  { file: "icon-512.png", size: 512, radius: "22%", art: 0.8 },
  { file: "maskable-512.png", size: 512, radius: "0", art: 0.6 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
});
const page = await browser.newPage();
for (const { file, size, radius, art } of ICONS) {
  const side = Math.round(size * art);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">
      <div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius};background:#f4f1ea">
        <img src="${src}" width="${side}" height="${side}" alt="">
      </div>
    </body>`
  );
  await page.locator("img").evaluate((img) => img.decode());
  await page.screenshot({ path: fileURLToPath(new URL(file, OUT)), omitBackground: true });
  console.log(`${file} ${size}x${size}`);
}
await browser.close();
