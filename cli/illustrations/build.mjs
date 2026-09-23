// Writes the error-screen illustrations to public/illustrations/.
// Run with `node cli/illustrations/build.mjs` after changing a scene.
import { writeFileSync } from "node:fs";
import { W, svg404, svgError, svgOffline, svgNoAccess } from "./scenes.mjs";

const OUT = new URL("../../public/illustrations/", import.meta.url);
const files = {
  "pasto-404.svg": svg404,
  "catavento-erro.svg": svgError,
  "sem-sinal.svg": svgOffline,
  "porteira-fechada.svg": svgNoAccess,
};
for (const [name, draw] of Object.entries(files)) {
  const svg = draw(W, name.replace(".svg", ""));
  writeFileSync(new URL(name, OUT), svg + "\n");
  console.log(name, `${(svg.length / 1024).toFixed(1)} KB`);
}
