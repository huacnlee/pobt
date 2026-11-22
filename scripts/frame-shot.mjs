// Frames a screenshot of POBT's window as Windows 11 shows it: rounded corners, a thin light edge and the window's
// shadow, on a transparent ground, `width` wide in the end (the frame included).
//   bun scripts/frame-shot.mjs <in.png> <out.png> [width]
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "fs";

const [input, output, width = "1600"] = process.argv.slice(2);
const png = readFileSync(input);
const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);
const pad = Math.round(w * 0.04);
const r = Math.round(w / 120); // 8 points at 2x on a 1920 wide window
const W = w + pad * 2;
const H = h + pad * 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="${pad / 3}"/></filter>
    <clipPath id="round"><rect x="${pad}" y="${pad}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  </defs>
  <rect x="${pad}" y="${pad + pad / 4}" width="${w}" height="${h}" rx="${r}" fill="#000" opacity=".55" filter="url(#shadow)"/>
  <image x="${pad}" y="${pad}" width="${w}" height="${h}" clip-path="url(#round)" href="data:image/png;base64,${png.toString("base64")}"/>
  <rect x="${pad + 0.5}" y="${pad + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r}" fill="none" stroke="#fff" stroke-opacity=".14"/>
</svg>`;
writeFileSync(output, new Resvg(svg, { fitTo: { mode: "width", value: Number(width) } }).render().asPng());
console.log(`wrote ${output}`);
