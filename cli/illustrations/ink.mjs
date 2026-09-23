// Ink toolkit for MeuBov's illustrations (run cli/illustrations/build.mjs): every line is a filled, tapered brush
// stroke, the way the MeuBov Nelore mark is drawn, so the scenery and the
// brand bull share one hand.
import { readFileSync } from "node:fs";

export const C = {
  paper: "#f4f1ea",
  ink: "#22301f",
  soft: "#6e6759",
  hill: "#e9e2d2",
  hill2: "#e0d7c4",
  green: "#3e7150",
  amber: "#b7791f",
  red: "#9a3324",
};

// The brand Nelore, read from the component that draws the logo so both stay one drawing.
const MARK = readFileSync(new URL("../../components/ui/nelore-mark.tsx", import.meta.url), "utf8");
const NELORE = MARK.match(/export const NELORE_PATH =\s*"([^"]+)"/)[1];

/** Centripetal Catmull-Rom through the points, sampled densely. */
function spline(pts, per = 10) {
  if (pts.length < 3) {
    const [a, b] = pts;
    return Array.from({ length: per + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / per, a[1] + ((b[1] - a[1]) * i) / per]);
  }
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 0; i < P.length - 3; i++) {
    const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((k) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
      ));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** One decimal, no trailing ".0": the files stay small. */
const f = (n) => String(Math.round(n * 10) / 10);

/**
 * A tapered brush stroke along the points: full width in the middle, thinning
 * to `min` at the ends over `taper` of the length, with a slight wobble so it
 * reads as drawn by hand.
 */
export function brush(pts, { w = 3, taper = 0.3, min = 0.18, color = C.ink, seed = 1, wobble = 0.1, end = null } = {}) {
  const pp = spline(pts);
  const n = pp.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = pp[Math.max(0, i - 1)];
    const b = pp[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const tIn = Math.min(1, t / taper);
    const tOut = end === "blunt" ? 1 : Math.min(1, (1 - t) / taper);
    const ease = (x) => Math.sin((x * Math.PI) / 2);
    const k = min + (1 - min) * ease(tIn) * ease(tOut);
    const hw = (w / 2) * k * (1 + wobble * Math.sin(t * 11 + seed * 2.3) * Math.sin(t * 5 + seed));
    left.push([pp[i][0] - dy * hw, pp[i][1] + dx * hw]);
    right.push([pp[i][0] + dy * hw, pp[i][1] - dx * hw]);
  }
  const pts2 = [...left, ...right.reverse()].map((p) => `${f(p[0])} ${f(p[1])}`);
  const d = `M${pts2[0]}L${pts2.slice(1).join(" ")}Z`;
  return `<path d="${d}" fill="${color}"></path>`;
}

/** Short parallel hatch strokes filling a band: engraving-style ground or shade. */
export function hatch(x0, x1, y, { rows = 3, gap = 5, len = 14, step = 9, w = 1.1, color = C.soft, seed = 3, slope = 0 } = {}) {
  let out = "";
  let s = seed;
  for (let r = 0; r < rows; r++) {
    const yy = y + r * gap;
    for (let x = x0 + (r % 2) * (step / 2); x < x1 - len; x += step) {
      s = (s * 9301 + 49297) % 233280;
      const jitter = (s / 233280 - 0.5) * 4;
      const l = len * (0.6 + (s % 7) / 14);
      out += brush([[x + jitter, yy], [x + jitter + l, yy + slope]], { w, taper: 0.45, color, seed: s % 17, wobble: 0.05 });
    }
  }
  return out;
}

// Outline of the artwork, so the bull hides what stands behind it.
const SILHOUETTE = [
  [80, 490], [150, 330], [220, 240], [320, 140], [480, 80], [580, 140], [640, 210], [720, 280], [840, 320],
  [940, 220], [1080, 190], [1240, 260], [1280, 380], [1348, 440], [1348, 1084], [600, 1084], [540, 960],
  [460, 840], [380, 640], [260, 600], [140, 600], [70, 560],
];

/**
 * The brand Nelore (1348 x 1084 artwork), placed and scaled, on a paper
 * silhouette; `clipY` cuts it at the ground (scene units); `tag` recolours the ear tag.
 */
export function nelore(x, y, s, { tag = C.green, clipY = null, id = "nel" } = {}) {
  const clip = clipY === null ? "" : `<clipPath id="${id}-clip"><rect x="-10" y="-10" width="2000" height="${clipY + 10}"></rect></clipPath>`;
  const shape = `<path d="M${SILHOUETTE.map((p) => p.join(" ")).join(" L")} Z" fill="${C.paper}"></path>`;
  return `${clip ? `<defs>${clip}</defs>` : ""}<g${clip ? ` clip-path="url(#${id}-clip)"` : ""}><g transform="translate(${x} ${y}) scale(${s})">${shape}<g fill="${C.ink}" transform="translate(0,1084) scale(0.1,-0.1)"><path d="${NELORE}"></path></g><rect x="610" y="535" width="95" height="80" rx="22" fill="${tag}"></rect></g></g>`;
}

/** A wooden plank between two points: paper fill hides what is behind, inked edges. */
export function plank(a, b, thick, { seed = 1, broken = false } = {}) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (thick / 2);
  const ny = (dx / len) * (thick / 2);
  const p1 = [a[0] + nx, a[1] + ny];
  const p2 = [b[0] + nx, b[1] + ny];
  const p3 = [b[0] - nx, b[1] - ny];
  const p4 = [a[0] - nx, a[1] - ny];
  const body = `<path d="M${f(p1[0])} ${f(p1[1])} L${f(p2[0])} ${f(p2[1])} L${f(p3[0])} ${f(p3[1])} L${f(p4[0])} ${f(p4[1])} Z" fill="${C.paper}"></path>`;
  const edgeTop = brush([p4, [(p4[0] + p3[0]) / 2, (p4[1] + p3[1]) / 2 - 0.4], p3], { w: 2.6, seed, taper: 0.12, min: 0.5 });
  const edgeBot = brush([p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + 0.4], p2], { w: 2.2, seed: seed + 3, taper: 0.12, min: 0.5 });
  const capA = brush([p1, p4], { w: 2, taper: 0.3, min: 0.5, seed });
  // a broken end is splintered: a zigzag instead of a clean cut
  const capB = broken
    ? brush([p2, [b[0] + nx * 0.2 - dx * 0.02, b[1] + ny * 0.2 - dy * 0.02], [b[0] - nx * 0.1 + dx * 0.03, b[1] - ny * 0.1 + dy * 0.03], p3], { w: 1.8, taper: 0.2, min: 0.5, seed })
    : brush([p2, p3], { w: 2, taper: 0.3, min: 0.5, seed });
  // grain: two thin lines along the plank
  const grain =
    brush([[a[0] + dx * 0.12 + nx * 0.2, a[1] + dy * 0.12 + ny * 0.2], [a[0] + dx * 0.45 + nx * 0.25, a[1] + dy * 0.45 + ny * 0.25]], { w: 0.9, color: C.soft, seed: seed + 5 }) +
    brush([[a[0] + dx * 0.55 - nx * 0.3, a[1] + dy * 0.55 - ny * 0.3], [a[0] + dx * 0.85 - nx * 0.25, a[1] + dy * 0.85 - ny * 0.25]], { w: 0.9, color: C.soft, seed: seed + 7 });
  return body + edgeTop + edgeBot + capA + capB + grain;
}

/** A post: an upright plank with a pointed top. */
export function post(x, yBottom, height, width = 9, { seed = 1, lean = 0 } = {}) {
  const top = yBottom - height;
  const l = x - width / 2;
  const r = x + width / 2;
  const d = `M${l + lean} ${top + 5} L${x + lean} ${top} L${r + lean} ${top + 5} L${r} ${yBottom} L${l} ${yBottom} Z`;
  return (
    `<path d="${d}" fill="${C.paper}"></path>` +
    brush([[l, yBottom], [l + lean * 0.5, (top + yBottom) / 2], [l + lean, top + 5], [x + lean, top]], { w: 2.6, seed, taper: 0.1, min: 0.45 }) +
    brush([[x + lean, top], [r + lean, top + 5], [r + lean * 0.5, (top + yBottom) / 2], [r, yBottom]], { w: 2.4, seed: seed + 2, taper: 0.1, min: 0.45 }) +
    brush([[x + lean * 0.8 - 1, top + 16], [x + lean * 0.4 - 1.5, top + height * 0.55]], { w: 0.9, color: C.soft, seed })
  );
}

export const tuft = (x, y, s = 1, color = C.green) =>
  brush([[x - 5 * s, y], [x - 3 * s, y - 6 * s], [x - 2 * s, y - 10 * s]], { w: 1.6 * s, color, taper: 0.5, seed: x }) +
  brush([[x, y], [x + 0.5 * s, y - 8 * s], [x + 0.8 * s, y - 14 * s]], { w: 1.7 * s, color, taper: 0.5, seed: x + 1 }) +
  brush([[x + 5 * s, y], [x + 4 * s, y - 6 * s], [x + 6 * s, y - 9 * s]], { w: 1.5 * s, color, taper: 0.5, seed: x + 2 });

/** Soft layered hills that fade out at the sides and bottom. */
export function land(W, H, horizon) {
  const hill1 = `M0 ${horizon + 6} C ${W * 0.18} ${horizon - 16} ${W * 0.36} ${horizon - 12} ${W * 0.5} ${horizon - 2} C ${W * 0.66} ${horizon + 8} ${W * 0.8} ${horizon - 18} ${W} ${horizon - 8} L${W} ${H} L0 ${H} Z`;
  const hill2 = `M0 ${horizon + 26} C ${W * 0.25} ${horizon + 14} ${W * 0.5} ${horizon + 18} ${W * 0.7} ${horizon + 24} C ${W * 0.85} ${horizon + 28} ${W * 0.95} ${horizon + 22} ${W} ${horizon + 20} L${W} ${H} L0 ${H} Z`;
  return `<path d="${hill1}" fill="${C.hill}"></path><path d="${hill2}" fill="${C.hill2}"></path>` +
    brush([[W * 0.04, horizon + 6 - 4], [W * 0.18, horizon - 14], [W * 0.36, horizon - 11], [W * 0.5, horizon - 2]], { w: 1.4, color: C.soft, taper: 0.4, seed: 4 }) +
    brush([[W * 0.62, horizon + 5], [W * 0.8, horizon - 16], [W * 0.96, horizon - 9]], { w: 1.4, color: C.soft, taper: 0.4, seed: 6 });
}

/** Wraps a scene in an svg whose content fades at the edges. */
export function frame(inner, W, H, width, id) {
  const defs = `<defs><linearGradient id="${id}-x" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000"></stop><stop offset="0.08" stop-color="#fff"></stop><stop offset="0.92" stop-color="#fff"></stop><stop offset="1" stop-color="#000"></stop></linearGradient><linearGradient id="${id}-y" x1="0" x2="0" y1="0" y2="1"><stop offset="0.86" stop-color="#fff"></stop><stop offset="1" stop-color="#000"></stop></linearGradient><mask id="${id}-mx" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}-x)"></rect></mask><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}-y)" mask="url(#${id}-mx)"></rect></mask></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round((width * H) / W)}" viewBox="0 0 ${W} ${H}">${defs}<g mask="url(#${id})">${inner}</g></svg>`;
}
