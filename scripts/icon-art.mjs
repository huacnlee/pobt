// Draws the app's icon, icon.png (1024×1024), in the manner of the launcher's plaques: a round medallion on dark
// stone, rimmed in tarnished gold with jewelled points at the compass, a face of brushed crimson metal, and POB in
// bevelled gold.
//   bun scripts/icon-art.mjs <Cinzel.ttf>     (Cinzel: https://github.com/google/fonts/tree/main/ofl/cinzel)
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const font = process.argv[2];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.ICON_OUT ?? join(root, "icon.png");

const S = 1024;
const C = S / 2;
const R = 330; // the face

// A jewelled point, as the plaques end in, pointing up from (0, 0).
const point = `
  <path d="M0 -96 L44 0 L0 30 L-44 0 Z" fill="#000" opacity=".85" transform="translate(0 6)"/>
  <path d="M0 -92 L40 0 L0 26 L-40 0 Z" fill="url(#gold)" stroke="#0c0803" stroke-width="7"/>
  <path d="M0 -60 L20 -10 L0 6 L-20 -10 Z" fill="#4e0b0a" stroke="#2a1608" stroke-width="3"/>
  <path d="M0 -52 L8 -30 L-8 -30 Z" fill="#d0624d" opacity=".55"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="stone" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="#24211d"/>
      <stop offset=".65" stop-color="#110f0d"/>
      <stop offset="1" stop-color="#060505"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9c48a"/>
      <stop offset=".3" stop-color="#9a8048"/>
      <stop offset=".62" stop-color="#4a3a1e"/>
      <stop offset="1" stop-color="#a68d58"/>
    </linearGradient>
    <radialGradient id="crimson" cx="45%" cy="35%" r="75%">
      <stop offset="0" stop-color="#b4302a"/>
      <stop offset=".45" stop-color="#7a1112"/>
      <stop offset="1" stop-color="#2a0405"/>
    </radialGradient>
    <linearGradient id="letters" x1="0" y1="${C - 120}" x2="0" y2="${C + 90}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fbf0c8"/>
      <stop offset=".38" stop-color="#e3c98a"/>
      <stop offset=".52" stop-color="#a7853f"/>
      <stop offset=".62" stop-color="#7a5c28"/>
      <stop offset="1" stop-color="#c9a560"/>
    </linearGradient>
    <filter id="brushed" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".004 .7" numOctaves="2" seed="7"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 -.18"/>
    </filter>
    <filter id="grime" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".02 .03" numOctaves="4" seed="3"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .04  0 0 0 0 .03  0 0 0 0 .01  0 0 0 1.4 -.6"/>
    </filter>
    <filter id="rub" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".12" numOctaves="2" seed="9"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .9  0 0 0 0 .8  0 0 0 0 .58  0 0 0 2.2 -1.3"/>
    </filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="bevel" x="-10%" y="-30%" width="120%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="5" specularConstant=".9" specularExponent="18" lighting-color="#fff3d0" result="spec">
        <feDistantLight azimuth="235" elevation="48"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0"/>
    </filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>
    <clipPath id="plate"><rect x="32" y="32" width="${S - 64}" height="${S - 64}" rx="196"/></clipPath>
    <clipPath id="face"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
    <mask id="rimMask"><circle cx="${C}" cy="${C}" r="${R + 34}" fill="none" stroke="#fff" stroke-width="44"/></mask>
  </defs>

  <!-- Dark stone -->
  <rect x="32" y="32" width="${S - 64}" height="${S - 64}" rx="196" fill="url(#stone)"/>
  <g clip-path="url(#plate)"><rect width="100%" height="100%" filter="url(#grime)" opacity=".45"/></g>
  <rect x="48" y="48" width="${S - 96}" height="${S - 96}" rx="182" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="10"/>

  <!-- The points at the compass -->
  <g transform="translate(${C} ${C - R - 70})">${point}</g>
  <g transform="translate(${C} ${C + R + 70}) rotate(180)">${point}</g>
  <g transform="translate(${C - R - 70} ${C}) rotate(-90)">${point}</g>
  <g transform="translate(${C + R + 70} ${C}) rotate(90)">${point}</g>

  <!-- The rim: a dark outline, tarnished gold, grimed and rubbed, a thin inner line -->
  <circle cx="${C}" cy="${C}" r="${R + 34}" fill="none" stroke="#000" stroke-width="62" opacity=".85"/>
  <circle cx="${C}" cy="${C}" r="${R + 34}" fill="none" stroke="url(#gold)" stroke-width="44"/>
  <g mask="url(#rimMask)" opacity=".9"><rect width="100%" height="100%" filter="url(#grime)"/></g>
  <g mask="url(#rimMask)" opacity=".6"><rect width="100%" height="100%" filter="url(#rub)"/></g>
  <circle cx="${C}" cy="${C}" r="${R + 6}" fill="none" stroke="url(#gold)" stroke-width="5" opacity=".7"/>

  <!-- The face: brushed crimson, darker at its rim -->
  <g clip-path="url(#face)">
    <rect width="100%" height="100%" fill="url(#crimson)"/>
    <rect width="100%" height="100%" filter="url(#brushed)"/>
    <rect width="100%" height="100%" filter="url(#grime)" opacity=".5"/>
    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#000" stroke-width="60" opacity=".55" filter="url(#soft)"/>
  </g>
  <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#000" stroke-width="6"/>

  <!-- POB in bevelled gold -->
  <g font-family="Cinzel" font-weight="700" text-anchor="middle">
    <text x="${C}" y="${C + 82}" font-size="250" letter-spacing="-6" fill="#000" stroke="#000" stroke-width="16" opacity=".85" filter="url(#shadow)">POB</text>
    <text x="${C}" y="${C + 70}" font-size="250" letter-spacing="-6" fill="none" stroke="#0c0803" stroke-width="22" stroke-linejoin="round">POB</text>
    <text x="${C}" y="${C + 70}" font-size="250" letter-spacing="-6" fill="none" stroke="#5b4420" stroke-width="12" stroke-linejoin="round">POB</text>
    <text x="${C}" y="${C + 70}" font-size="250" letter-spacing="-6" fill="url(#letters)" stroke="url(#letters)" stroke-width="8" stroke-linejoin="round" filter="url(#bevel)">POB</text>
  </g>
</svg>`;

const png = new Resvg(svg, {
  font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "Cinzel" },
  fitTo: { mode: "original" },
})
  .render()
  .asPng();
writeFileSync(out, png);
console.log(`wrote ${out}`);
