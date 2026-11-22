// Draws the launcher's plaques into assets/ui/plaques.png, an atlas: in Path of Exile 2's manner, tarnished gold
// trim with pointed ends around a crimson, dark or old brass face, worn, a row per face, each row a left cap, a middle
// that stretches and a right cap.
//   bun scripts/ui-art.mjs     (needs `bun add -d @resvg/resvg-js`)
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const out = process.env.UI_ART_OUT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "ui");
mkdirSync(out, { recursive: true });

const H = 96; // drawn at 2x: 48 points tall
const CAP = 64;
const MID = 512; // wide, so stretching it barely smears the grime

// Each face: its gradient from top to bottom, how much grime darkens it, and a glow at its heart.
// The gold of the trim, unless a face has its own.
const RAIL = ["#cdb882", "#8f7646", "#45361d", "#977f50"];

const faces = {
  red: { stops: ["#941d1a", "#6a0e0f", "#3c0707", "#2a0505"], grime: 0.18, glow: "#b82a24" },
  dark: { stops: ["#1d1a16", "#110f0d", "#090807", "#0e0c0a"], grime: 0.12, glow: null },
  // Old brass: a sheen high up, darker below, tarnish in patches, pitted.
  brass: { stops: ["#dcc386", "#b4934f", "#7a5e2c", "#a2844c"], grime: 0.1, glow: null, rail: ["#8a6c3a", "#5e4622", "#2e210f", "#6b5129"], metal: true },
};

const defs = (face, seed) => `
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${face.stops[0]}"/>
      <stop offset=".45" stop-color="${face.stops[1]}"/>
      <stop offset=".8" stop-color="${face.stops[2]}"/>
      <stop offset="1" stop-color="${face.stops[3]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="60%">
      <stop offset="0" stop-color="${face.glow ?? "#000"}" stop-opacity="${face.glow ? 0.5 : 0}"/>
      <stop offset="1" stop-color="${face.glow ?? "#000"}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${(face.rail ?? RAIL)[0]}"/>
      <stop offset=".3" stop-color="${(face.rail ?? RAIL)[1]}"/>
      <stop offset=".62" stop-color="${(face.rail ?? RAIL)[2]}"/>
      <stop offset="1" stop-color="${(face.rail ?? RAIL)[3]}"/>
    </linearGradient>
    <filter id="grime" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".09 .22" numOctaves="3" seed="${seed}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.03  0 0 0 0 0.02  0 0 0 0 0.01  0 0 0 ${face.grime * 1.6} ${-face.grime * 0.55}"/>
    </filter>
    <filter id="wear" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".008 1.4" numOctaves="2" seed="${seed + 11}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .45 -.16"/>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
    <!-- Metal: a band of sheen, patches of tarnish, pits. -->
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".1" stop-color="#fff4cf" stop-opacity="0"/>
      <stop offset=".24" stop-color="#fff4cf" stop-opacity=".55"/>
      <stop offset=".36" stop-color="#fff4cf" stop-opacity="0"/>
      <stop offset=".78" stop-color="#fff4cf" stop-opacity="0"/>
      <stop offset=".9" stop-color="#ffe9b0" stop-opacity=".18"/>
    </linearGradient>
    <filter id="tarnish" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".018 .045" numOctaves="4" seed="${seed + 31}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .2  0 0 0 0 .14  0 0 0 0 .05  0 0 0 2.0 -0.98"/>
    </filter>
    <filter id="pits" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="${seed + 41}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .08  0 0 0 0 .05  0 0 0 0 .02  0 0 0 6 -4.1"/>
    </filter>
    <filter id="rub" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".25" numOctaves="2" seed="${seed + 23}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.8  0 0 0 0 0.58  0 0 0 2.2 -1.3"/>
    </filter>
  </defs>`;

const faceLayers = (face, shape, ao) => `
  <clipPath id="faceClip"><path d="${shape}"/></clipPath>
  <g clip-path="url(#faceClip)">
    <rect width="100%" height="100%" fill="url(#face)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <rect width="100%" height="100%" filter="url(#grime)"/>
    ${face.metal ? `<rect width="100%" height="100%" fill="url(#sheen)"/>
    <rect width="100%" height="100%" filter="url(#tarnish)"/>
    <rect width="100%" height="100%" filter="url(#pits)"/>
    <rect width="100%" height="100%" filter="url(#wear)" opacity=".5"/>
    <rect x="0" y="14" width="100%" height="2" fill="#fff2c4" opacity=".5"/>` : `<rect width="100%" height="100%" filter="url(#wear)"/>`}
    <path d="${ao}" fill="none" stroke="#000" stroke-width="16" stroke-opacity=".6" filter="url(#soft)"/>
  </g>`;

const W = CAP * 2 + MID;

// The ornaments at the left end: scrolls, a jewelled knob at the point, studs where the rails turn.
const endOrnaments = `
  <path d="M31 28 Q21 48 31 68" fill="none" stroke="url(#gold)" stroke-width="1.6" opacity=".45"/>
  <path d="M40 26 q-6 4 -2 9 q4 3 7 -1" fill="none" stroke="url(#gold)" stroke-width="1.4" opacity=".4"/>
  <path d="M40 70 q-6 -4 -2 -9 q4 -3 7 1" fill="none" stroke="url(#gold)" stroke-width="1.4" opacity=".4"/>
  <g transform="translate(9 48)">
    <path d="M-9 0 L0 -12 L9 0 L0 12 Z" fill="url(#gold)" stroke="#000" stroke-width="2"/>
    <path d="M-4.5 0 L0 -6 L4.5 0 L0 6 Z" fill="#4e0b0a"/>
    <path d="M-1.5 -2 L0 -4 L1.5 -2 Z" fill="#c95a47" opacity=".6"/>
  </g>
  <circle cx="34" cy="10" r="3" fill="url(#gold)" stroke="#000" stroke-width="1.2"/>
  <circle cx="34" cy="86" r="3" fill="url(#gold)" stroke="#000" stroke-width="1.2"/>`;

// A whole plaque in one drawing — both pointed ends and the middle share one face, one grime and one light, so the
// parts cut from it meet without a seam.
const plaque = (face, seed) => {
  const shape = `M34 10 H${W - 34} L${W - 12} 48 L${W - 34} 86 H34 L12 48 Z`;
  const outer = `M33 9.5 H${W - 33} L${W - 10} 48 L${W - 33} 86.5 H33 L10 48 Z`;
  const inner = `M38 17.8 H${W - 38} L${W - 20.5} 48 L${W - 38} 78.2 H38 L20.5 48 Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${defs(face, seed)}
  ${faceLayers(face, shape, outer)}
  <path d="${outer}" fill="none" stroke="#000" stroke-width="10" stroke-opacity=".85"/>
  <path d="${outer}" fill="none" stroke="url(#gold)" stroke-width="6.5"/>
  <path d="${inner}" fill="none" stroke="url(#gold)" stroke-width="1.6" opacity=".6"/>
  <path d="M38 14.5 H${W - 38}" stroke="#000" stroke-width="3" stroke-opacity=".5"/>
  <mask id="railMask"><path d="${outer}" fill="none" stroke="#fff" stroke-width="6.5"/></mask>
  <g mask="url(#railMask)" opacity=".9"><rect width="100%" height="100%" filter="url(#grime)"/></g>
  <g mask="url(#railMask)" opacity=".6"><rect width="100%" height="100%" filter="url(#rub)"/></g>
  ${endOrnaments}
  <g transform="translate(${W} 0) scale(-1 1)">${endOrnaments}</g>
</svg>`;
};

const toPng = (svg) => new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();

// One atlas, a row per face (in ROWS' order): the launcher cuts each row into the left cap (CAP wide), the middle
// (MID, stretched) and the right cap.
const ROWS = ["red", "dark", "brass"];
const rows = ROWS.map((name, row) => {
  const png = toPng(plaque(faces[name], 3 + row * 7));
  return `<image x="0" y="${row * H}" width="${W}" height="${H}" href="data:image/png;base64,${png.toString("base64")}"/>`;
});
writeFileSync(join(out, "plaques.png"), toPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H * ROWS.length}">${rows.join("")}</svg>`));

console.log(`wrote ${join(out, "plaques.png")}: ${W}×${H * ROWS.length}, rows ${ROWS.join(", ")}, caps ${CAP}, middle ${MID}`);
