// Draws the launcher's titles into assets/ui as Path of Exile sets its titles: small capitals with larger initials in
// tarnished gold, bevelled and lit from above, a dark outline, a drop shadow and a faint warm glow.
//   title.png  "Path of Building"
//   bun scripts/title-art.mjs <Cinzel.ttf>     (Cinzel: https://github.com/google/fonts/tree/main/ofl/cinzel)
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const font = process.argv[2];
const out = process.env.UI_ART_OUT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "ui");
mkdirSync(out, { recursive: true });

// A title: its words as [initial, rest], the sizes of the two, its canvas and spacing.
function title({ words, big, small, width, height, baseline, spacing, file }) {
  const line = words
    .map(([first, rest]) => `<tspan font-size="${big}">${first}</tspan><tspan font-size="${small}">${rest}</tspan>`)
    .join(`<tspan font-size="${small}"> </tspan>`);
  const text = (attrs) =>
    `<text x="${width / 2}" y="${baseline}" text-anchor="middle" font-family="Cinzel" font-weight="700" letter-spacing="${spacing}" ${attrs}>${line}</text>`;
  const scale = big / 132; // effects were tuned at 132
  const top = baseline - big * 0.83;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <!-- Tarnished gold: pale where the light falls, bronze below the middle, warm again at the foot. -->
    <linearGradient id="gold" x1="0" y1="${top}" x2="0" y2="${baseline + big * 0.08}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fbf0c8"/>
      <stop offset=".38" stop-color="#e3c98a"/>
      <stop offset=".52" stop-color="#a7853f"/>
      <stop offset=".62" stop-color="#7a5c28"/>
      <stop offset="1" stop-color="#c9a560"/>
    </linearGradient>
    <!-- The bevel: the letters' edges lit from the top left. -->
    <filter id="bevel" x="-5%" y="-30%" width="110%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${2.2 * scale}" result="blur"/>
      <feSpecularLighting in="blur" surfaceScale="4" specularConstant=".9" specularExponent="18" lighting-color="#fff3d0" result="spec">
        <feDistantLight azimuth="235" elevation="48"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0"/>
    </filter>
    <!-- Grime in the hollows of the letters. -->
    <filter id="grime" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${0.05 / scale} ${0.12 / scale}" numOctaves="3" seed="4" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .1  0 0 0 0 .07  0 0 0 0 .03  0 0 0 1.4 -.62" result="dirt"/>
      <feComposite in="dirt" in2="SourceAlpha" operator="in"/>
    </filter>
    <filter id="shadow" x="-10%" y="-40%" width="120%" height="180%">
      <feGaussianBlur stdDeviation="${9 * scale}"/>
    </filter>
    <filter id="glow" x="-10%" y="-60%" width="120%" height="220%">
      <feGaussianBlur stdDeviation="${22 * scale}"/>
    </filter>
  </defs>
  ${text(`fill="#d9a85a" opacity=".22" filter="url(#glow)"`)}
  <g transform="translate(0 ${7 * scale})">${text(`fill="#000" stroke="#000" stroke-width="${10 * scale}" opacity=".9" filter="url(#shadow)"`)}</g>
  ${text(`fill="none" stroke="#0c0803" stroke-width="${17 * scale}" stroke-linejoin="round"`)}
  ${text(`fill="none" stroke="#5b4420" stroke-width="${10 * scale}" stroke-linejoin="round"`)}
  ${text(`fill="url(#gold)" stroke="url(#gold)" stroke-width="${6 * scale}" stroke-linejoin="round" filter="url(#bevel)"`)}
  ${text(`fill="#000" stroke="#000" stroke-width="${6 * scale}" filter="url(#grime)"`)}
</svg>`;

  const png = new Resvg(svg, {
    font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "Cinzel" },
    fitTo: { mode: "original" },
  })
    .render()
    .asPng();
  writeFileSync(join(out, file), png);
  console.log(`wrote ${join(out, file)}`);
}

title({
  words: [
    ["P", "ATH"],
    ["", "OF"],
    ["B", "UILDING"],
  ],
  big: 132,
  small: 104,
  width: 1600,
  height: 220,
  baseline: 150,
  spacing: 6,
  file: "title.png",
});
