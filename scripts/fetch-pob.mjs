// Fetches a Path of Building for the tests (`POB_DIR`): its portable release without the passive trees' art and the
// timeless jewels' data, 17 MB of its 650 MB, read out of the release's zip with ranged requests.
//
//   node scripts/fetch-pob.mjs <tag> <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

const [tag, out] = process.argv.slice(2);
if (!tag || !out) {
  console.error("usage: node scripts/fetch-pob.mjs <tag> <dir>");
  process.exit(2);
}
const SKIP = ["TreeData/", "Data/TimelessJewelData/"];
const release = `https://github.com/PathOfBuildingCommunity/PathOfBuilding/releases/download/${tag}/PathOfBuildingCommunity-Portable.zip`;

// The release's redirect, once: the storage behind it serves ranges.
const head = await fetch(release, { method: "HEAD" });
if (!head.ok) throw new Error(`${release}: ${head.status}`);
const url = head.url;
const size = Number(head.headers.get("content-length"));

async function range(start, end) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== end - start) throw new Error(`${buf.length} of ${end - start} bytes`);
      return buf;
    } catch (e) {
      if (attempt === 3) throw new Error(`bytes ${start}-${end - 1}: ${e.message}`);
    }
  }
}

// The central directory, from the end of central directory record (no zip64: the archive is under 4 GB).
const tail = await range(Math.max(0, size - 65557), size);
const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) throw new Error("no end of central directory");
const count = tail.readUInt16LE(eocd + 10);
const cdSize = tail.readUInt32LE(eocd + 12);
const cdOffset = tail.readUInt32LE(eocd + 16);
const cd = await range(cdOffset, cdOffset + cdSize);
const entries = [];
for (let p = 0, i = 0; i < count; i++) {
  if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
  const nameLen = cd.readUInt16LE(p + 28);
  entries.push({
    method: cd.readUInt16LE(p + 10),
    crc: cd.readUInt32LE(p + 16),
    compressed: cd.readUInt32LE(p + 20),
    size: cd.readUInt32LE(p + 24),
    offset: cd.readUInt32LE(p + 42),
    name: cd.toString("utf8", p + 46, p + 46 + nameLen),
  });
  p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
}

// Each entry ends where the next begins: the entries kept, merged into runs that are fetched whole.
entries.sort((a, b) => a.offset - b.offset);
entries.forEach((e, i) => (e.end = entries[i + 1]?.offset ?? cdOffset));
const kept = entries.filter((e) => !e.name.endsWith("/") && !SKIP.some((s) => e.name.startsWith(s)));
const runs = [];
for (const e of kept) {
  const last = runs.at(-1);
  if (last && last.end === e.offset) {
    last.end = e.end;
    last.entries.push(e);
  } else {
    runs.push({ start: e.offset, end: e.end, entries: [e] });
  }
}

const CRC = new Int32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

async function extract(run) {
  const buf = await range(run.start, run.end);
  for (const e of run.entries) {
    const p = e.offset - run.start;
    if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`${e.name}: bad local header`);
    const data = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
    const raw = buf.subarray(data, data + e.compressed);
    const bytes = e.method === 0 ? raw : e.method === 8 ? inflateRawSync(raw) : null;
    if (!bytes) throw new Error(`${e.name}: compression method ${e.method}`);
    if (bytes.length !== e.size || crc32(bytes) !== e.crc) throw new Error(`${e.name}: corrupt`);
    const path = join(out, e.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
}

// A few runs at a time.
const queue = [...runs];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (queue.length) await extract(queue.shift());
}));
const bytes = runs.reduce((n, r) => n + r.end - r.start, 0);
console.log(`${kept.length} files of ${tag} (${(bytes / 1e6).toFixed(1)} MB in ${runs.length} requests) into ${out}`);
