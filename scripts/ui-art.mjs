// Draws the launcher's art into assets/ui: plaques of three parts (a left cap, a middle that stretches, a right cap)
// in Path of Exile 2's manner — tarnished gold trim with pointed ends around a crimson, dark or brass face, worn and
// grimy — and a rule for under titles.
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
  brass: { stops: ["#ebdfb2", "#dccb93", "#c8b077", "#d6c088"], grime: 0.22, glow: "#fff4d0", rail: ["#8a6c3a", "#5e4622", "#2e210f", "#6b5129"] },
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
    <filter id="rub" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".25" numOctaves="2" seed="${seed + 23}"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.8  0 0 0 0 0.58  0 0 0 2.2 -1.3"/>
    </filter>
  </defs>`;

const faceLayers = (shape, ao) => `
  <clipPath id="faceClip"><path d="${shape}"/></clipPath>
  <g clip-path="url(#faceClip)">
    <rect width="100%" height="100%" fill="url(#face)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <rect width="100%" height="100%" filter="url(#grime)"/>
    <rect width="100%" height="100%" filter="url(#wear)"/>
    <path d="${ao}" fill="none" stroke="#000" stroke-width="16" stroke-opacity=".6" filter="url(#soft)"/>
  </g>`;

const middle = (face, seed) => {
  const shape = `M0 10 H${MID} V86 H0 Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MID}" height="${H}">${defs(face, seed)}
  ${faceLayers(shape, `M-20 10 H${MID + 20} M-20 86 H${MID + 20}`)}
  <rect x="0" y="5" width="${MID}" height="1.5" fill="#000" fill-opacity=".85"/>
  <rect x="0" y="6" width="${MID}" height="7" fill="url(#gold)"/>
  <rect x="0" y="83" width="${MID}" height="7" fill="url(#gold)"/>
  <rect x="0" y="89.5" width="${MID}" height="1.5" fill="#000" fill-opacity=".85"/>
  <clipPath id="railClip"><rect x="0" y="6" width="${MID}" height="7"/><rect x="0" y="83" width="${MID}" height="7"/></clipPath>
  <g clip-path="url(#railClip)" opacity=".9"><rect width="100%" height="100%" filter="url(#grime)"/></g>
  <g clip-path="url(#railClip)" opacity=".6"><rect width="100%" height="100%" filter="url(#rub)"/></g>
  <rect x="0" y="17" width="${MID}" height="1.6" fill="url(#gold)" opacity=".55"/>
  <rect x="0" y="77.4" width="${MID}" height="1.6" fill="url(#gold)" opacity=".55"/>
  <rect x="0" y="13" width="${MID}" height="3" fill="#000" fill-opacity=".5"/>
  <rect x="0" y="80" width="${MID}" height="3" fill="#000" fill-opacity=".35"/>
</svg>`;
};

const leftCap = (face, seed) => {
  const shape = `M${CAP} 10 H34 L12 48 L34 86 H${CAP} Z`;
  const outer = `M${CAP} 9.5 H33 L10 48 L33 86.5 H${CAP}`;
  const inner = `M${CAP} 17.8 H38 L20.5 48 L38 78.2 H${CAP}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CAP}" height="${H}">${defs(face, seed)}
  ${faceLayers(shape, `M${CAP + 20} 10 H34 L12 48 L34 86 H${CAP + 20}`)}
  <path d="${outer}" fill="none" stroke="#000" stroke-width="10" stroke-opacity=".85"/>
  <path d="${outer}" fill="none" stroke="url(#gold)" stroke-width="6.5"/>
  <path d="${inner}" fill="none" stroke="url(#gold)" stroke-width="1.6" opacity=".6"/>
  <mask id="railMask"><path d="${outer}" fill="none" stroke="#fff" stroke-width="6.5"/></mask>
  <g mask="url(#railMask)" opacity=".9"><rect width="100%" height="100%" filter="url(#grime)"/></g>
  <g mask="url(#railMask)" opacity=".6"><rect width="100%" height="100%" filter="url(#rub)"/></g>
  <path d="M31 28 Q21 48 31 68" fill="none" stroke="url(#gold)" stroke-width="1.6" opacity=".45"/>
  <path d="M40 26 q-6 4 -2 9 q4 3 7 -1" fill="none" stroke="url(#gold)" stroke-width="1.4" opacity=".4"/>
  <path d="M40 70 q-6 -4 -2 -9 q4 -3 7 1" fill="none" stroke="url(#gold)" stroke-width="1.4" opacity=".4"/>
  <g transform="translate(9 48)">
    <path d="M-9 0 L0 -12 L9 0 L0 12 Z" fill="url(#gold)" stroke="#000" stroke-width="2"/>
    <path d="M-4.5 0 L0 -6 L4.5 0 L0 6 Z" fill="#4e0b0a"/>
    <path d="M-1.5 -2 L0 -4 L1.5 -2 Z" fill="#c95a47" opacity=".6"/>
  </g>
  <circle cx="34" cy="10" r="3" fill="url(#gold)" stroke="#000" stroke-width="1.2"/>
  <circle cx="34" cy="86" r="3" fill="url(#gold)" stroke="#000" stroke-width="1.2"/>
</svg>`;
};

function render(svg, file) {
  const png = new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
  writeFileSync(join(out, file), png);
}

let seed = 3;
for (const [name, face] of Object.entries(faces)) {
  const left = leftCap(face, seed);
  render(left, `${name}-left.png`);
  // The right cap is the left one mirrored (its grime too).
  render(left.replace(/(<svg [^>]*>)/, `$1<g transform="translate(${CAP} 0) scale(-1 1)">`).replace(/<\/svg>$/, "</g></svg>"), `${name}-right.png`);
  render(middle(face, seed + 5), `${name}-middle.png`);
  seed += 7;
}

render(
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="32">${defs(faces.dark, 1)}
  <defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#8f7646" stop-opacity="0"/><stop offset=".5" stop-color="#b9a370"/><stop offset="1" stop-color="#8f7646" stop-opacity="0"/></linearGradient></defs>
  <rect x="0" y="14.5" width="960" height="3" fill="#000" fill-opacity=".6"/>
  <rect x="0" y="15" width="960" height="2" fill="url(#fade)"/>
  <path d="M458 16 L480 3 L502 16 L480 29 Z" fill="url(#gold)" stroke="#000" stroke-width="2"/>
  <path d="M470 16 L480 10 L490 16 L480 22 Z" fill="#640d0e"/>
</svg>`,
  "rule.png",
);

console.log(`wrote ${out}`);
