// The launcher's backdrop, a WGSL shader, after Path of Exile 2's site: a great pointed doorway in the middle of a
// grey-black wall, its frame carved in receding orders — a bead, dog-tooth, voussoirs with sunk panels, a hood with
// crockets, on shafts with capitals, a keystone — and the pale light of dusk slanting down from the top right in
// shafts, three layers of them at different depths, drifting slowly; mist in the doorway, ash in the air.
export const GATE = /* wgsl */ `
const PI = 3.14159265;

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

fn noise1(x: f32) -> f32 {
  let i = floor(x);
  let f = fract(x);
  return mix(hash(vec2f(i, 0.0)), hash(vec2f(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f));
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

const DOOR_HW = 0.27;
const DOOR_SPRING = 0.5;
const FLOOR = 0.95;
const FRAME = 0.12;

// Distance-ish to the pointed doorway: negative inside.
fn doorway(p: vec2f, cx: f32) -> f32 {
  var d: f32;
  if (p.y < DOOR_SPRING) {
    let r = DOOR_HW * 2.0;
    d = max(distance(p, vec2f(cx + DOOR_HW, DOOR_SPRING)) - r, distance(p, vec2f(cx - DOOR_HW, DOOR_SPRING)) - r);
  } else {
    d = abs(p.x - cx) - DOOR_HW;
  }
  return max(d, p.y - FLOOR);
}

// Where along the frame p is: down the jambs from the spring line (negative), round the arch towards the apex.
fn along(p: vec2f, cx: f32) -> f32 {
  if (p.y >= DOOR_SPRING) {
    return -(p.y - DOOR_SPRING);
  }
  let side = sign(p.x - cx);
  let v = p - vec2f(cx - side * DOOR_HW, DOOR_SPRING);
  return atan2(-v.y, abs(v.x)) * DOOR_HW * 2.0;
}

fn masonry(p: vec2f) -> vec2f {
  let rowH = 0.055;
  let row = floor(p.y / rowH);
  let blockW = 0.12 + 0.04 * hash(vec2f(row, 7.0));
  let x = p.x / blockW + 0.5 * (row % 2.0);
  let f = vec2f(fract(x) * blockW, fract(p.y / rowH) * rowH);
  let edge = min(min(f.x, blockW - f.x), min(f.y, rowH - f.y));
  return vec2f(smoothstep(0.004, 0.0, edge), hash(vec2f(floor(x), row)));
}

// The carved frame's relief at p (0 deep .. 1 proud) and how far out p is in it (0 at the opening, 1 outside).
fn carving(p: vec2f, cx: f32, dd: f32) -> vec2f {
  let k = dd / FRAME;
  let s = along(p, cx);
  let jamb = p.y >= DOOR_SPRING;
  var tone = 0.0;
  if (k < 0.22) {
    // A round bead.
    tone = 0.25 + 0.75 * sin(k / 0.22 * PI);
  } else if (k < 0.48) {
    // Dog-tooth: little pyramids in a row.
    let u = (k - 0.22) / 0.26;
    let w = fract(s / 0.034);
    tone = 0.12 + 0.88 * clamp(1.0 - abs(w - 0.5) * 2.0 - abs(u - 0.5) * 2.0, 0.0, 1.0);
  } else if (k < 0.78) {
    // Voussoirs (blocks on the jambs), each with a sunk panel.
    let u = (k - 0.48) / 0.3;
    let w = fract(s / select(0.07, 0.05, jamb));
    let joint = smoothstep(0.06, 0.0, min(w, 1.0 - w));
    let panel = step(0.18, u) * step(u, 0.82) * step(0.2, w) * step(w, 0.8);
    tone = 0.55 - 0.3 * panel - 0.45 * joint + 0.15 * (1.0 - abs(u - 0.5) * 2.0);
  } else {
    // The hood: a ridge.
    let u = (k - 0.78) / 0.22;
    tone = 0.3 + 0.6 * sin(u * PI) * (0.8 + 0.2 * cos(u * 9.0));
  }
  // Capitals at the spring line, bases at the floor.
  let capital = smoothstep(0.02, 0.0, abs(p.y - DOOR_SPRING - 0.01));
  let leaf = 0.5 + 0.5 * sin(p.x * 220.0) * sin((p.y - DOOR_SPRING) * 240.0);
  tone = mix(tone, 0.45 + 0.45 * leaf, capital);
  let base = smoothstep(0.03, 0.0, abs(p.y - (FLOOR - 0.03))) * f32(jamb);
  tone = mix(tone, 0.5 + 0.3 * cos((p.y - FLOOR) * 200.0), base);
  return vec2f(tone * (0.6 + 0.6 * fbm(p * 26.0)), k);
}

// Shafts of dusk light slanting down from the top right: one layer at a given depth — its spacing, width, strength
// and drift — as a pattern across the slant, fading as the light travels.
fn shaftLayer(p: vec2f, aspect: f32, seed: f32, density: f32, width: f32, speed: f32, t: f32) -> f32 {
  let dir = normalize(vec2f(-0.55, 1.0));
  let across = vec2f(dir.y, -dir.x);
  let x = dot(p, across);
  let along = dot(p - vec2f(aspect, 0.0), dir);
  let pattern = noise1(x * density + seed * 37.0 + t * speed);
  let shaft = smoothstep(1.0 - width, 1.0, pattern);
  let breakup = 0.6 + 0.4 * noise(vec2f(x * density * 0.5 + seed, along * 2.0 - t * speed * 0.6));
  return shaft * breakup * exp(-max(along, 0.0) * 0.6);
}

fn shade(uv: vec2f) -> vec4f {
  let aspect = nsh.size.x / nsh.size.y;
  let p = vec2f(uv.x * aspect, uv.y);
  let t = nsh.time;

  let cx = 0.5 * aspect;
  // Dusk: a pale light, faintly warm, against grey-black stone.
  let dusk = vec3f(0.95, 0.92, 0.86);
  // The light falls from the top right.
  let fromLight = exp(-distance(p, vec2f(aspect * 0.95, -0.1)) * 1.1);

  // The wall: grey-black blocks, stained and sooty.
  let m = masonry(p);
  let weather = fbm(p * 9.0);
  let stain = fbm(vec2f(p.x * 3.0, p.y * 0.8) + 11.0);
  let soot = smoothstep(0.35, 0.75, fbm(p * 2.2 + 5.0));
  var col = vec3f(0.034, 0.034, 0.036) * (0.65 + 0.5 * m.y) * (0.45 + 0.9 * weather) * (0.55 + 0.6 * stain);
  col *= 1.0 - 0.5 * soot;
  col = mix(col, vec3f(0.005), m.x * 0.55);
  col *= 0.5 + 1.6 * fromLight;

  // The frame, lit from the top right: the faces turned to the light are brighter.
  let dd = doorway(p, cx);
  let rightSide = smoothstep(-0.1, 0.25, p.x - cx);
  if (dd > 0.0 && dd < FRAME) {
    let carved = carving(p, cx, dd);
    let lit = 0.45 + 1.8 * fromLight + 0.5 * rightSide * (1.0 - carved.y);
    col = vec3f(0.058, 0.058, 0.06) * carved.x * lit;
    col += dusk * 0.12 * smoothstep(0.004, 0.0, abs(dd - FRAME)) * (0.3 + rightSide);
  }
  // Crockets: leaves climbing the outer edge of the arch.
  if (p.y < DOOR_SPRING && dd > FRAME && dd < FRAME + 0.022) {
    let w = fract(along(p, cx) / 0.075);
    let leaf = smoothstep(0.022, 0.0, (dd - FRAME) + abs(w - 0.5) * 0.06);
    col = mix(col, vec3f(0.062, 0.062, 0.065) * (0.5 + 1.6 * fromLight), leaf);
  }
  // The keystone at the apex.
  let apex = vec2f(cx, DOOR_SPRING - DOOR_HW * 1.732);
  let ky = p.y - apex.y + 0.035;
  let kw = 0.03 - ky * 0.25;
  if (abs(p.x - cx) < kw && abs(ky) < 0.06 && dd > -0.01) {
    col = vec3f(0.07, 0.07, 0.073) * (0.6 + 0.4 * fbm(p * 30.0)) * (0.6 + 1.5 * fromLight);
    col += dusk * 0.15 * smoothstep(0.004, 0.0, abs(abs(p.x - cx) - kw));
  }

  // Beyond the door: a pale haze, brightest high on the right, mist drifting through it.
  let open = step(dd, 0.0);
  if (open > 0.5) {
    let haze = fbm(p * vec2f(2.5, 1.8) + vec2f(-t * 0.02, t * 0.008));
    let glow = smoothstep(0.9, -0.1, distance(p, vec2f(cx + 0.2, 0.15)));
    col = mix(vec3f(0.05, 0.05, 0.055), dusk * 0.85, clamp(glow * (0.55 + 0.6 * haze), 0.0, 1.0));
    // The floor beyond, catching the light.
    if (p.y > FLOOR - 0.14) {
      col *= 0.7 + 0.3 * fbm(vec2f(p.x * 18.0, (p.y - FLOOR) * 50.0));
    }
  }
  // Light spilling round the doorway's edge onto the frame.
  col += dusk * 0.1 * exp(-max(dd, 0.0) * 18.0) * (1.0 - open) * (0.4 + rightSide);

  // Shafts of dusk light from the top right, three layers at different depths: near ones broad, bright and slow,
  // far ones fine, faint and quicker. They are seen against the dark, less so against the light.
  let far = shaftLayer(p, aspect, 1.0, 9.0, 0.4, 0.05, t) * 0.22;
  let mid = shaftLayer(p, aspect, 2.0, 5.0, 0.36, 0.03, t) * 0.34;
  let nearL = shaftLayer(p, aspect, 3.0, 2.6, 0.3, 0.018, t) * 0.45;
  let shafts = (far + mid + nearL) * (0.6 + 0.6 * fbm(p * 2.5 + vec2f(t * 0.03, 0.0)));
  col += dusk * shafts * (1.0 - 0.5 * open);

  // Ash drifting down through the light.
  var ash = 0.0;
  for (var layer = 0.0; layer < 3.0; layer += 1.0) {
    let scale = 22.0 + layer * 16.0;
    let drift = vec2f(sin(t * 0.25 + layer) * 0.3 - t * 0.05, -t * (0.12 + 0.05 * layer));
    let g = p * scale + drift + layer * 17.0;
    let cell = floor(g);
    let j = hash2(cell);
    let speck = 1.0 - smoothstep(0.0, 0.05 + 0.05 * j.x, length(fract(g) - j));
    ash += speck * step(0.74, hash(cell + 4.0));
  }
  col += dusk * ash * 0.3 * (0.3 + shafts * 4.0);

  // Mist on the floor, haze in the air.
  let mist = fbm(p * vec2f(1.4, 3.5) + vec2f(-t * 0.025, 0.0));
  col += vec3f(0.2, 0.2, 0.21) * mist * smoothstep(0.45, 1.0, uv.y) * 0.2;

  // Black at the edges, deep shadows.
  let vig = smoothstep(1.05, 0.15, distance(uv, vec2f(0.55, 0.45)));
  col *= 0.08 + 0.92 * vig;
  let edge = uv * (1.0 - uv);
  col *= pow(clamp(edge.x * edge.y * 18.0, 0.0, 1.0), 0.35);
  col = pow(max(col, vec3f(0.0)), vec3f(1.15)) * 1.15;
  return vec4f(col, 1.0);
}
`;
