// The launcher's backdrop, a WGSL shader, after Path of Exile 2's site: a great round-arched doorway in the middle of a
// grey-black wall, its frame carved in receding orders — a bead, dog-tooth, voussoirs with sunk panels, a hood with
// crockets, on shafts with capitals, a keystone — seen from inside: the pale light of dusk is outside, high on the
// right, and comes in through the door in a beam cast into the room, dust and mist showing it in layers; ash in the air.
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

// A round arch, wider than it is tall: half width, the rise of the arch above the spring line, the spring line.
const DOOR_HW = 0.38;
const DOOR_RISE = 0.32;
const DOOR_SPRING = 0.44;
// The doorway runs down past the bottom of the view.
const FLOOR = 1.1;
const FRAME = 0.12;

// Distance-ish to the doorway: negative inside.
fn doorway(p: vec2f, cx: f32) -> f32 {
  var d: f32;
  if (p.y < DOOR_SPRING) {
    let e = vec2f((p.x - cx) / DOOR_HW, (p.y - DOOR_SPRING) / DOOR_RISE);
    d = (length(e) - 1.0) * DOOR_RISE;
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
  let theta = atan2((DOOR_SPRING - p.y) / DOOR_RISE, abs(p.x - cx) / DOOR_HW);
  return theta * (DOOR_HW + DOOR_RISE) * 0.5;
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

fn shade(uv: vec2f) -> vec4f {
  let aspect = nsh.size.x / nsh.size.y;
  let p = vec2f(uv.x * aspect, uv.y);
  let t = nsh.time;

  let cx = 0.5 * aspect;
  // Dusk: a pale light, faintly warm, outside; inside, grey-black stone in shadow.
  let dusk = vec3f(0.95, 0.92, 0.86);
  // We stand inside, looking out: the light is beyond the door, high up and a little to the right (at two o'clock),
  // and falls in through it almost straight down.
  let toSun = normalize(vec2f(0.27, -1.0));
  let dd = doorway(p, cx);
  let open = step(dd, 0.0);

  // Light through the door: walk from p towards the sun; where the way passes through the doorway, p is in the
  // beam. Parallel rays make the beam the door's shape, cast down and to the left into the room.
  // Three ways a little apart make the beam fan out; its edges soften the further it travels (a penumbra), and it
  // fades as it goes.
  var beam = 0.0;
  for (var k = -1.0; k <= 1.0; k += 1.0) {
    let a = k * 0.07;
    let dir = vec2f(toSun.x * cos(a) - toSun.y * sin(a), toSun.x * sin(a) + toSun.y * cos(a));
    var hit = 0.0;
    for (var i = 1; i <= 24; i++) {
      let s = f32(i) * 0.035;
      let pen = 0.015 + 0.11 * s;
      hit = max(hit, smoothstep(pen, -pen, doorway(p + dir * s, cx)) * exp(-s * 1.1));
    }
    beam += hit / 3.0;
  }
  let beamFall = beam * (1.0 - open);

  // The wall around the door, seen from inside: in shadow, but for light thrown back from the floor near the door.
  let m = masonry(p);
  let weather = fbm(p * 9.0);
  let stain = fbm(vec2f(p.x * 3.0, p.y * 0.8) + 11.0);
  let soot = smoothstep(0.35, 0.75, fbm(p * 2.2 + 5.0));
  var col = vec3f(0.03, 0.03, 0.032) * (0.65 + 0.5 * m.y) * (0.45 + 0.9 * weather) * (0.55 + 0.6 * stain);
  col *= 1.0 - 0.5 * soot;
  col = mix(col, vec3f(0.004), m.x * 0.55);
  let bounce = exp(-max(dd, 0.0) * 5.0) * smoothstep(0.0, 0.9, p.y);
  col *= 0.45 + 1.1 * bounce + 1.4 * beamFall;

  // The frame, backlit: dark, its carving caught only where light from the opening reaches round it.
  if (dd > 0.0 && dd < FRAME) {
    let carved = carving(p, cx, dd);
    let rim = exp(-carved.y * 2.5);
    let lit = 0.6 + 2.6 * rim + 1.8 * beamFall;
    col = vec3f(0.075, 0.075, 0.079) * carved.x * lit;
  }
  // Crockets: leaves climbing the outer edge of the arch, in silhouette.
  if (p.y < DOOR_SPRING && dd > FRAME && dd < FRAME + 0.022) {
    let w = fract(along(p, cx) / 0.075);
    let leaf = smoothstep(0.022, 0.0, (dd - FRAME) + abs(w - 0.5) * 0.06);
    col = mix(col, vec3f(0.05, 0.05, 0.053) * (0.4 + 0.8 * bounce), leaf);
  }
  // The keystone at the apex.
  let apex = vec2f(cx, DOOR_SPRING - DOOR_RISE);
  // A wedge set in the frame, wider at its top: u runs from its foot (0) at the opening up to its head (1).
  let u = (apex.y + 0.01 - p.y) / (FRAME + 0.02);
  let kw = 0.028 + 0.022 * u;
  if (abs(p.x - cx) < kw && u >= 0.0 && u <= 1.0) {
    col = vec3f(0.06, 0.06, 0.063) * (0.6 + 0.4 * fbm(p * 30.0)) * (0.5 + 1.4 * exp(-u * 3.0));
  }

  // Outside: bright haze, brightest high on the right where the sun is, mist drifting across.
  if (open > 0.5) {
    let haze = fbm(p * vec2f(2.5, 1.8) + vec2f(-t * 0.02, t * 0.008));
    let sun = smoothstep(1.1, -0.1, distance(p, vec2f(cx + 0.16, DOOR_SPRING - DOOR_RISE - 0.08)));
    // White at the sun, cold blue away from it.
    let sky = mix(vec3f(0.36, 0.46, 0.62), vec3f(1.03, 1.04, 1.06), clamp(sun * (0.6 + 0.5 * haze), 0.0, 1.0));
    // The land outside below the horizon: grey, darker near, a lit path running off into the haze.
    let horizon = 0.62;
    let depth = clamp((p.y - horizon) / (FLOOR - horizon), 0.0, 1.0);
    let ground = vec3f(0.62, 0.7, 0.82) * mix(0.55, 0.3, depth) * (0.8 + 0.3 * fbm(vec2f(p.x * 5.0 / (0.3 + depth), depth * 6.0 + t * 0.01)));
    col = mix(sky, ground, smoothstep(horizon - 0.04, horizon + 0.08, p.y));
  }
  // A thin edge of light round the opening, where it spills past the stone.
  col += dusk * 0.35 * smoothstep(0.012, 0.0, max(dd, 0.0)) * (1.0 - open);

  // The beam made visible by the dust and mist in the room: three layers at different depths, near ones broad and
  // slow, far ones fine and quicker.
  let across = dot(p, vec2f(-toSun.y, toSun.x));
  let along2 = dot(p, toSun);
  let layerFar = 0.55 + 0.45 * noise(vec2f(across * 9.0 + t * 0.05, along2 * 2.0));
  let layerMid = 0.5 + 0.5 * noise(vec2f(across * 5.0 - t * 0.03, along2 * 1.4 + 7.0));
  let layerNear = 0.45 + 0.55 * noise(vec2f(across * 2.4 + t * 0.018, along2 * 0.9 + 3.0));
  let mist = fbm(p * 2.2 + vec2f(t * 0.03, -t * 0.01));
  let shafts = beamFall * (0.18 * layerFar + 0.24 * layerMid + 0.3 * layerNear) * (0.6 + 0.7 * mist);
  // The beam itself: white where it is thick, cold blue where the mist thins it.
  let beamCol = mix(vec3f(0.55, 0.7, 1.0), vec3f(1.0, 1.0, 1.0), clamp(layerNear * mist, 0.0, 1.0));
  col += beamCol * shafts;
  // Where the beam meets the floor, a pool of light shaped like the door.
  col += vec3f(0.8, 0.88, 1.0) * 0.14 * beamFall * smoothstep(0.6, 1.05, p.y);

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
  let floorMist = fbm(p * vec2f(1.4, 3.5) + vec2f(-t * 0.025, 0.0));
  col += vec3f(0.2, 0.2, 0.21) * floorMist * smoothstep(0.45, 1.0, uv.y) * 0.2;

  // Black at the edges, deep shadows.
  let vig = smoothstep(1.05, 0.15, distance(uv, vec2f(0.55, 0.45)));
  col *= 0.08 + 0.92 * vig;
  let edge = uv * (1.0 - uv);
  col *= pow(clamp(edge.x * edge.y * 18.0, 0.0, 1.0), 0.35);
  col = pow(max(col, vec3f(0.0)), vec3f(1.15)) * 1.15;
  return vec4f(col, 1.0);
}
`;
