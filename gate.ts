// The launcher's backdrop, a WGSL shader: a gothic doorway at the top left, light pouring through a rose window
// behind it, between fluted pillars on a wall of stone blocks; shafts of light, dust drifting in them, a pool of
// light on the floor and mist, as Path of Exile 2's site opens.
export const GATE = /* wgsl */ `
fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn hash2(p: vec2f) -> vec2f {
  return fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x), mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 5; i++) {
    v += a * noise(q);
    q = q * 2.03 + vec2f(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Distance-ish to a pointed (equilateral) arch: centre x, half width, spring line, bottom. Negative inside.
fn arch(p: vec2f, cx: f32, hw: f32, spring: f32, bottom: f32) -> f32 {
  var d: f32;
  if (p.y < spring) {
    let r = hw * 2.0;
    d = max(distance(p, vec2f(cx + hw, spring)) - r, distance(p, vec2f(cx - hw, spring)) - r);
  } else {
    d = abs(p.x - cx) - hw;
  }
  return max(d, p.y - bottom);
}

// Stone blocks: a running bond of rows; returns (mortar 0..1, the block's own shade).
fn masonry(p: vec2f) -> vec2f {
  let rowH = 0.052;
  let row = floor(p.y / rowH);
  let blockW = 0.11 + 0.03 * hash(vec2f(row, 7.0));
  let x = p.x / blockW + 0.5 * (row % 2.0);
  let cell = vec2f(floor(x), row);
  let f = vec2f(fract(x) * blockW, fract(p.y / rowH) * rowH);
  let edge = min(min(f.x, blockW - f.x), min(f.y, rowH - f.y));
  let mortar = smoothstep(0.0035, 0.0, edge);
  return vec2f(mortar, hash(cell));
}

// Tracery of a rose window: a ring, spokes and an inner ring, as a mask of stone.
fn rose(p: vec2f, c: vec2f, r: f32) -> f32 {
  let q = p - c;
  let d = length(q);
  let a = atan2(q.y, q.x);
  let ring = smoothstep(0.006, 0.0, abs(d - r)) + smoothstep(0.004, 0.0, abs(d - r * 0.45));
  let spokes = smoothstep(0.004, 0.0, abs(sin(a * 6.0)) * d) * step(r * 0.45, d) * step(d, r);
  let petals = smoothstep(0.004, 0.0, abs(length(q - normalize(q + vec2f(1e-5)) * r * 0.72) - r * 0.2)) * step(d, r);
  return clamp(ring + spokes + petals * 0.8, 0.0, 1.0) * step(d, r + 0.01);
}

fn shade(uv: vec2f) -> vec4f {
  let aspect = nsh.size.x / nsh.size.y;
  let p = vec2f(uv.x * aspect, uv.y);
  let t = nsh.time;

  let cx = 0.22 * min(aspect, 1.8);
  let lightPos = vec2f(cx, 0.3);
  let lightCol = vec3f(0.74, 0.85, 1.0);
  let toLight = distance(p, lightPos);
  let lit = exp(-toLight * 2.0);

  // The wall: blocks of cold stone, weathered, lit from the door.
  let m = masonry(p);
  let weather = fbm(p * 9.0);
  // Grime: broad stains running down the wall, and soot.
  let stain = fbm(vec2f(p.x * 3.0, p.y * 0.8) + 11.0);
  let soot = smoothstep(0.35, 0.75, fbm(p * 2.2 + 5.0));
  var col = vec3f(0.042, 0.045, 0.052) * (0.65 + 0.5 * m.y) * (0.45 + 0.9 * weather) * (0.55 + 0.6 * stain);
  col *= 1.0 - 0.55 * soot;
  col = mix(col, vec3f(0.008, 0.008, 0.01), m.x * 0.6 * (0.5 + weather));
  col *= 0.55 + 1.5 * lit;

  // Fluted pillars either side of the door, round and lit on the door's side.
  for (var side = -1.0; side <= 1.0; side += 2.0) {
    let px = cx + side * 0.23;
    let w = 0.045;
    let u = (p.x - px) / w;
    if (abs(u) < 1.0 && p.y > 0.06) {
      let round = sqrt(1.0 - u * u);
      let flutes = 0.75 + 0.25 * cos(u * 18.0);
      let facing = clamp(0.5 - 0.5 * u * side, 0.0, 1.0);
      var pillar = vec3f(0.07, 0.075, 0.085) * round * flutes * (0.4 + 1.4 * facing * lit) * (0.7 + 0.5 * fbm(p * 14.0));
      // A capital and a base.
      let cap = smoothstep(0.012, 0.0, abs(p.y - 0.14)) + smoothstep(0.012, 0.0, abs(p.y - 0.86));
      pillar += vec3f(0.09, 0.095, 0.11) * cap * (0.5 + facing * lit);
      col = pillar;
    }
  }

  // Receding orders of the arch, each a step deeper and darker.
  let d0 = arch(p, cx, 0.1, 0.24, 0.84);
  for (var k = 3.0; k >= 1.0; k -= 1.0) {
    let dk = arch(p, cx, 0.1 + 0.022 * k, 0.24, 0.84 + 0.012 * k);
    let band = smoothstep(0.003, -0.003, dk) * smoothstep(-0.003, 0.003, arch(p, cx, 0.1 + 0.022 * (k - 1.0), 0.24, 0.84 + 0.012 * (k - 1.0)));
    let stone = vec3f(0.08, 0.085, 0.095) * (0.45 + 0.25 * (3.0 - k)) * (0.6 + 0.7 * fbm(p * 20.0 + k));
    col = mix(col, stone * (0.6 + 1.8 * lit), band);
    // The edge of each order catches the light.
    col += lightCol * 0.12 * lit * smoothstep(0.004, 0.0, abs(dk));
  }

  // Through the door: the light, fog drifting over it, and the rose window's tracery against it.
  let inside = smoothstep(0.003, -0.003, d0);
  let fog = fbm(p * 3.0 + vec2f(t * 0.03, -t * 0.018));
  let core = exp(-pow(length((p - lightPos) * vec2f(1.0, 0.7)) * 3.4, 1.3));
  var door = mix(vec3f(0.05, 0.08, 0.14), lightCol * 0.95, core) * (0.7 + 0.5 * fog);
  let tracery = rose(p, lightPos, 0.075);
  door = mix(door, vec3f(0.03, 0.035, 0.05), tracery * 0.85);
  // Mullions under the rose.
  let mull = smoothstep(0.003, 0.0, abs(p.x - cx)) * step(lightPos.y + 0.075, p.y);
  door = mix(door, vec3f(0.03, 0.035, 0.05), mull * 0.8);
  col = mix(col, door, inside);

  // Shafts of light fanning down and out of the door, slowly turning.
  let outside = 1.0 - inside;
  let dir = p - lightPos;
  let angle = atan2(dir.y, dir.x);
  let shafts = pow(noise(vec2f(angle * 7.0 + t * 0.05, 3.0)), 2.5) * 0.7 + pow(noise(vec2f(angle * 15.0 - t * 0.08, 9.0)), 4.0) * 0.5;
  let fall = exp(-length(dir) * 1.4) * smoothstep(-0.2, 0.6, dir.y / (length(dir) + 1e-4));
  col += lightCol * 0.2 * shafts * fall * outside;
  // Spill onto the stone around the door.
  col += lightCol * 0.22 * exp(-max(d0, 0.0) * 9.0) * outside * (0.7 + 0.3 * fog);

  // Dust drifting up through the light.
  var dust = 0.0;
  for (var layer = 0.0; layer < 3.0; layer += 1.0) {
    let scale = 26.0 + layer * 14.0;
    let q = p * scale + vec2f(layer * 13.1, t * (0.25 + 0.1 * layer));
    let cell = floor(q);
    let jitter = hash2(cell + layer);
    let speck = 1.0 - smoothstep(0.0, 0.06 + 0.04 * jitter.x, length(fract(q) - jitter));
    let twinkle = 0.5 + 0.5 * sin(t * (1.0 + 2.0 * jitter.y) + jitter.x * 6.28);
    dust += speck * twinkle * step(0.7, hash(cell + 3.1 + layer));
  }
  col += lightCol * dust * 0.55 * exp(-toLight * 2.6);

  // A pool of light on the floor below the door, and mist drifting across it.
  let floorY = 0.86;
  if (p.y > floorY) {
    let fp = vec2f((p.x - cx) / (0.35 + (p.y - floorY) * 2.0), (p.y - floorY) * 6.0);
    col += lightCol * 0.18 * exp(-dot(fp, fp) * 3.0);
  }
  let mist = fbm(p * vec2f(1.4, 3.5) + vec2f(-t * 0.022, 0.0));
  col += vec3f(0.26, 0.31, 0.4) * mist * smoothstep(0.35, 1.0, uv.y) * 0.22;
  // Haze hanging in the air.
  col += vec3f(0.18, 0.21, 0.27) * fbm(p * 1.2 + vec2f(t * 0.01, t * 0.006)) * 0.06;

  // Darker away from the light, so what is drawn over it reads.
  let vig = smoothstep(1.3, 0.1, distance(uv, vec2f(0.22, 0.3)));
  col *= 0.16 + 0.84 * vig;
  // Black at the edges, as an old painting darkens.
  let edge = uv * (1.0 - uv);
  col *= pow(clamp(edge.x * edge.y * 18.0, 0.0, 1.0), 0.35);
  // Drained of colour but for the cold light.
  let grey = dot(col, vec3f(0.3, 0.59, 0.11));
  col = mix(vec3f(grey), col, 0.75);
  return vec4f(col, 1.0);
}
`;
