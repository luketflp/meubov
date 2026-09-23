// The four error scenes, drawn in ink with the brand Nelore as the character.
import { C, brush, hatch, nelore, plank, post, tuft, land, frame } from "./ink.mjs";

export const W = 480;
export const H = 300;
const GROUND = 262;

const sun = (x, y, r = 16) =>
  brush(
    Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2 + 0.3;
      return [x + Math.cos(a) * r, y + Math.sin(a) * r];
    }),
    { w: 2.2, color: C.amber, taper: 0.08, min: 0.3, seed: 2 }
  );

const bird = (x, y, s = 1) =>
  brush([[x - 7 * s, y - 2 * s], [x - 3 * s, y - 4 * s], [x, y]], { w: 1.5 * s, taper: 0.5, seed: x }) +
  brush([[x, y], [x + 3 * s, y - 4 * s], [x + 7 * s, y - 2 * s]], { w: 1.5 * s, taper: 0.5, seed: x + 1 });

const trees = (x, y, n = 3) =>
  Array.from({ length: n }, (_, i) => {
    const cx = x + i * 13;
    const h = 16 + ((i * 7) % 3) * 4;
    return (
      `<path d="M${cx - 7} ${y} C ${cx - 9} ${y - h * 0.7} ${cx - 3} ${y - h} ${cx} ${y - h} C ${cx + 3} ${y - h} ${cx + 9} ${y - h * 0.7} ${cx + 7} ${y} Z" fill="${C.hill2}"></path>` +
      brush([[cx - 7, y], [cx - 8, y - h * 0.6], [cx - 3, y - h], [cx + 2, y - h], [cx + 8, y - h * 0.6], [cx + 7, y]], { w: 1.3, color: C.soft, taper: 0.2, seed: cx })
    );
  }).join("");

const groundLine = () =>
  brush([[24, GROUND], [140, GROUND - 1], [260, GROUND + 1], [380, GROUND], [456, GROUND - 1]], { w: 1.8, color: C.soft, taper: 0.15, seed: 9 }) +
  hatch(40, 440, GROUND + 9, { rows: 3, gap: 6, len: 16, step: 13, seed: 5 });

/** 404: the bull has pushed its head through the fence; the top rail snapped. */
export function scene404() {
  const railY = [210, 242];
  const [p1, p2, p3, p4] = [34, 176, 356, 470];
  const fence =
    post(p1, GROUND, 76, 10, { seed: 1 }) +
    plank([p1, railY[0]], [p2, railY[0]], 11, { seed: 2 }) +
    plank([p1, railY[1]], [p2, railY[1]], 11, { seed: 3 }) +
    post(p2, GROUND, 82, 10, { seed: 4 }) +
    // the snapped top rail: a stub left on one post, the rest hanging from the other
    plank([p2, railY[0]], [p2 + 30, railY[0] + 3], 11, { seed: 5, broken: true }) +
    plank([p3, railY[0] - 1], [p3 - 58, GROUND - 5], 11, { seed: 6, broken: true }) +
    plank([p2, railY[1]], [p3, railY[1]], 11, { seed: 7 }) +
    post(p3, GROUND, 80, 10, { seed: 8, lean: 5 }) +
    plank([p3, railY[0]], [p4, railY[0]], 11, { seed: 9 }) +
    plank([p3, railY[1]], [p4, railY[1]], 11, { seed: 10 }) +
    post(p4, GROUND, 74, 10, { seed: 11 });
  return (
    land(W, H, 170) +
    trees(40, 166, 3) +
    sun(76, 66, 13) +
    bird(118, 50) + bird(138, 40, 0.75) +
    nelore(158, 16, 0.27, { clipY: GROUND, id: "n404" }) +
    fence +
    groundLine() +
    tuft(18, GROUND, 1.2) + tuft(268, GROUND, 1.1) + tuft(104, GROUND, 0.9) + tuft(420, GROUND, 1)
  );
}

export const svg404 = (width, id = "s404") => frame(scene404(), W, H, width, id);

// ─── shared props ────────────────────────────────────────────────────────────

const circle = (x, y, r, n = 24) => Array.from({ length: n + 1 }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r]);

/** A cloud: paper body, inked puffy top, flat base. */
function cloud(x, y, s = 1, seed = 1) {
  const pts = [
    [x, y], [x - 6 * s, y - 8 * s], [x + 2 * s, y - 17 * s], [x + 14 * s, y - 17 * s], [x + 20 * s, y - 27 * s],
    [x + 36 * s, y - 29 * s], [x + 46 * s, y - 20 * s], [x + 58 * s, y - 20 * s], [x + 64 * s, y - 10 * s], [x + 58 * s, y],
  ];
  const body = `<path d="M${pts.map((p) => p.join(" ")).join(" L")} Z" fill="${C.paper}"></path>`;
  return body + brush(pts, { w: 2.4 * s, taper: 0.08, min: 0.35, seed }) + brush([[x + 4 * s, y + 0.5], [x + 50 * s, y + 0.5]], { w: 1.6 * s, color: C.soft, taper: 0.3, seed: seed + 1 });
}

const rain = (x, y, n = 5, seed = 1) =>
  Array.from({ length: n }, (_, i) => {
    const xx = x + i * 11 + (i % 2) * 3;
    const yy = y + (i % 3) * 7;
    return brush([[xx, yy], [xx - 3, yy + 9]], { w: 1.4, color: C.soft, taper: 0.45, seed: seed + i });
  }).join("");

// ─── erro: the windmill lost a blade in the storm ───────────────────────────

function windmill(cx, ground, hubY) {
  const legL = [[cx - 26, ground], [cx - 16, (ground + hubY) / 2], [cx - 5, hubY + 12]];
  const legR = [[cx + 26, ground], [cx + 16, (ground + hubY) / 2], [cx + 5, hubY + 12]];
  const span = (t) => {
    const y = ground - (ground - hubY - 12) * t;
    const half = 26 - 21 * t;
    return [[cx - half, y], [cx + half, y]];
  };
  let out = brush(legL, { w: 3.2, taper: 0.06, min: 0.5, seed: 1 }) + brush(legR, { w: 3.2, taper: 0.06, min: 0.5, seed: 2 });
  [0.18, 0.42, 0.64, 0.84].forEach((t, i) => (out += brush(span(t), { w: 1.8, taper: 0.2, min: 0.4, seed: 3 + i })));
  // cross bracing
  [[0.18, 0.42], [0.42, 0.64], [0.64, 0.84]].forEach(([a, b], i) => {
    const [la] = span(a);
    const [, rb] = span(b);
    out += brush([la, rb], { w: 1.1, color: C.soft, taper: 0.3, seed: 9 + i });
  });
  // blades: a ring of narrow sails around the hub; the one at 5 o'clock is gone
  const hub = [cx, hubY];
  for (let i = 0; i < 12; i++) {
    if (i === 4) continue;
    const a = (i / 12) * Math.PI * 2;
    const inner = 9;
    const outer = 40;
    const spread = 0.13;
    const p = [
      [hub[0] + Math.cos(a - spread * 0.4) * inner, hub[1] + Math.sin(a - spread * 0.4) * inner],
      [hub[0] + Math.cos(a - spread) * outer, hub[1] + Math.sin(a - spread) * outer],
      [hub[0] + Math.cos(a + spread) * outer, hub[1] + Math.sin(a + spread) * outer],
      [hub[0] + Math.cos(a + spread * 0.4) * inner, hub[1] + Math.sin(a + spread * 0.4) * inner],
    ];
    out += `<path d="M${p.map((q) => q.map((v) => v.toFixed(2)).join(" ")).join(" L")} Z" fill="${C.paper}"></path>`;
    out += brush([p[0], p[1]], { w: 1.5, taper: 0.15, min: 0.5, seed: 20 + i }) + brush([p[1], p[2]], { w: 1.5, taper: 0.2, min: 0.5, seed: 30 + i }) + brush([p[2], p[3]], { w: 1.5, taper: 0.15, min: 0.5, seed: 40 + i });
  }
  out += brush(circle(hub[0], hub[1], 34, 36), { w: 1.2, color: C.soft, taper: 0.02, min: 0.6, seed: 40 });
  out += `<circle cx="${hub[0]}" cy="${hub[1]}" r="5" fill="${C.ink}"></circle>`;
  // tail vane
  const tail = [[cx + 4, hubY], [cx + 52, hubY + 2], [cx + 62, hubY - 12], [cx + 62, hubY + 16], [cx + 52, hubY + 2]];
  out += `<path d="M${cx + 52} ${hubY + 2} L${cx + 62} ${hubY - 12} L${cx + 62} ${hubY + 16} Z" fill="${C.paper}"></path>`;
  out += brush(tail, { w: 1.8, taper: 0.1, min: 0.45, seed: 50 });
  return out;
}

/** The lost blade, on the ground. */
function fallenBlade(x, y) {
  const p = [[x, y], [x + 34, y - 9], [x + 36, y - 2], [x + 3, y + 2]];
  return `<path d="M${p.map((q) => q.join(" ")).join(" L")} Z" fill="${C.paper}"></path>` + brush([...p, p[0]], { w: 1.7, taper: 0.08, min: 0.45, seed: 61 });
}

function trough(x, y) {
  const p = [[x, y - 18], [x + 64, y - 18], [x + 58, y], [x + 6, y]];
  return (
    `<path d="M${p.map((q) => q.join(" ")).join(" L")} Z" fill="${C.paper}"></path>` +
    brush([...p, p[0]], { w: 2.2, taper: 0.05, min: 0.5, seed: 71 }) +
    brush([[x + 6, y - 12], [x + 58, y - 12]], { w: 1, color: C.soft, taper: 0.3, seed: 72 })
  );
}

const bolt = (x, y) => `<path d="M${x} ${y} L${x - 11} ${y + 20} L${x - 2} ${y + 20} L${x - 9} ${y + 38} L${x + 11} ${y + 13} L${x + 1} ${y + 13} L${x + 8} ${y} Z" fill="${C.amber}"></path>`;

export function sceneError() {
  return (
    land(W, H, 176) +
    trees(410, 172, 3) +
    cloud(250, 70, 1.25, 3) + bolt(292, 76) + rain(262, 82, 5, 4) +
    windmill(150, GROUND, 70) +
    trough(40, GROUND) +
    fallenBlade(196, GROUND - 1) +
    nelore(318, 92, 0.2, { clipY: GROUND, id: "nerr" }) +
    groundLine() +
    tuft(24, GROUND, 1.1) + tuft(250, GROUND, 1) + tuft(300, GROUND, 0.9)
  );
}

// ─── sem conexão: the radio mast lost its signal ─────────────────────────────

function mast(cx, ground, top) {
  const legL = [[cx - 20, ground], [cx - 3, top + 10]];
  const legR = [[cx + 20, ground], [cx + 3, top + 10]];
  let out = brush(legL, { w: 3, taper: 0.05, min: 0.5, seed: 81 }) + brush(legR, { w: 3, taper: 0.05, min: 0.5, seed: 82 });
  const at = (t) => {
    const y = ground - (ground - top - 10) * t;
    const half = 20 - 17 * t;
    return [[cx - half, y], [cx + half, y]];
  };
  [0.22, 0.46, 0.68, 0.86].forEach((t, i) => (out += brush(at(t), { w: 1.6, taper: 0.2, min: 0.4, seed: 83 + i })));
  [[0.22, 0.46], [0.46, 0.68], [0.68, 0.86]].forEach(([a, b], i) => {
    out += brush([at(a)[0], at(b)[1]], { w: 1.1, color: C.soft, taper: 0.3, seed: 90 + i });
  });
  out += brush([[cx, top + 12], [cx, top - 6]], { w: 2.2, taper: 0.1, min: 0.5, seed: 95 });
  out += `<circle cx="${cx}" cy="${top - 9}" r="4.5" fill="${C.ink}"></circle>`;
  // waves on both sides, then the red cut across them
  [16, 28, 40].forEach((r, i) => {
    const arc = (dir) => Array.from({ length: 9 }, (_, k) => {
      const a = (-0.55 + (k / 8) * 1.1) + (dir < 0 ? Math.PI : 0);
      return [cx + Math.cos(a) * r, top - 9 + Math.sin(a) * r];
    });
    out += brush(arc(1), { w: 2, color: C.soft, taper: 0.3, seed: 100 + i }) + brush(arc(-1), { w: 2, color: C.soft, taper: 0.3, seed: 110 + i });
  });
  out += brush([[cx - 50, top + 26], [cx + 50, top - 44]], { w: 3.4, color: C.red, taper: 0.15, min: 0.5, seed: 120 });
  return out;
}

function house(x, ground) {
  const wall = [[x, ground], [x, ground - 30], [x + 46, ground - 30], [x + 46, ground]];
  const roof = [[x - 6, ground - 28], [x + 23, ground - 50], [x + 52, ground - 28]];
  return (
    `<path d="M${x} ${ground} L${x} ${ground - 30} L${x + 23} ${ground - 50} L${x + 46} ${ground - 30} L${x + 46} ${ground} Z" fill="${C.paper}"></path>` +
    brush(wall, { w: 2.2, taper: 0.05, min: 0.5, seed: 131 }) +
    brush(roof, { w: 2.6, taper: 0.1, min: 0.5, seed: 132 }) +
    brush([[x + 16, ground], [x + 16, ground - 18], [x + 28, ground - 18], [x + 28, ground]], { w: 1.8, taper: 0.1, min: 0.5, seed: 133 }) +
    brush([[x + 34, ground - 22], [x + 42, ground - 22], [x + 42, ground - 14], [x + 34, ground - 14], [x + 34, ground - 22]], { w: 1.4, taper: 0.05, min: 0.6, seed: 134 })
  );
}

export function sceneOffline() {
  return (
    land(W, H, 172) +
    cloud(40, 74, 1.1, 5) + rain(50, 84, 5, 6) +
    mast(176, 186, 72) +
    house(56, GROUND - 2) +
    nelore(300, 96, 0.2, { clipY: GROUND, id: "noff" }) +
    groundLine() +
    tuft(26, GROUND, 1.1) + tuft(130, GROUND, 1) + tuft(270, GROUND, 0.9)
  );
}

// ─── sem acesso: the porteira is shut and locked; the bull waits behind it ──

function gate(l, r, top, ground) {
  const x0 = l + 8;
  const x1 = r - 12;
  const bars = [0, 0.34, 0.67, 1].map((t) => top + 8 + (ground - top - 26) * t);
  let out = "";
  bars.forEach((y, i) => (out += plank([x0, y], [x1, y], 7, { seed: 140 + i })));
  out += plank([x0 + 2, bars[0] - 3], [x0 + 2, bars[3] + 5], 8, { seed: 150 });
  out += plank([x1 - 2, bars[0] - 3], [x1 - 2, bars[3] + 5], 8, { seed: 151 });
  out += plank([x0 + 8, bars[3]], [x1 - 8, bars[0]], 7, { seed: 152 });
  return out;
}

function padlock(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})">` + (
    brush([[x - 6, y], [x - 6, y - 8], [x - 3, y - 13], [x + 3, y - 13], [x + 6, y - 8], [x + 6, y]], { w: 2.8, color: C.red, taper: 0.1, min: 0.6, seed: 160 }) +
    `<rect x="${x - 10}" y="${y - 1}" width="20" height="16" rx="3.5" fill="${C.red}"></rect>` +
    `<circle cx="${x}" cy="${y + 6}" r="2.2" fill="${C.paper}"></circle><rect x="${x - 1}" y="${y + 6}" width="2" height="5" fill="${C.paper}"></rect>`
  ) + "</g>";
}

function chain(x0, y0, x1, y1) {
  let out = "";
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 6;
    const pts = Array.from({ length: 13 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      return [x + Math.cos(a) * (i % 2 ? 2 : 3.6), y + Math.sin(a) * (i % 2 ? 3.6 : 2)];
    });
    out += brush(pts, { w: 1.3, color: C.soft, taper: 0.02, min: 0.7, seed: 170 + i });
  }
  return out;
}

export function sceneNoAccess() {
  const [l, r] = [138, 352];
  const top = 176;
  const wires = (xa, xb, seed) =>
    [196, 218, 240].map((y, i) => brush([[xa, y], [xb, y + 2]], { w: 1.3, color: C.soft, taper: 0.1, min: 0.5, seed: seed + i })).join("");
  return (
    land(W, H, 168) +
    trees(398, 160, 3) +
    sun(70, 70, 13) +
    nelore(176, 38, 0.24, { clipY: GROUND, id: "nacc", tag: C.green }) +
    wires(18, l, 180) + wires(r, 468, 190) +
    post(40, GROUND, 70, 9, { seed: 200 }) + post(446, GROUND, 70, 9, { seed: 201 }) +
    post(l, GROUND, 98, 14, { seed: 202 }) + post(r, GROUND, 98, 14, { seed: 203 }) +
    gate(l, r, top, GROUND) +
    chain(r - 26, 206, r + 10, 206) + padlock(r - 8, 216, 1.45) +
    groundLine() +
    tuft(90, GROUND, 1.1) + tuft(398, GROUND, 1.1) + tuft(20, GROUND)
  );
}

export const svgError = (width, id = "serr") => frame(sceneError(), W, H, width, id);
export const svgOffline = (width, id = "soff") => frame(sceneOffline(), W, H, width, id);
export const svgNoAccess = (width, id = "sacc") => frame(sceneNoAccess(), W, H, width, id);
