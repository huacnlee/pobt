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
  // On the jambs the frame is a Roman column: fluted and round, its capital at the spring line.
  if (jamb) {
    let u = (k - 0.5) * 2.0;
    let round = sqrt(max(1.0 - u * u, 0.0));
    tone = round * (0.7 + 0.3 * cos(u * PI * 6.0));
    let ck = (p.y - DOOR_SPRING) / 0.07;
    if (ck < 1.0) {
      let leaf = 0.5 + 0.5 * sin(u * 8.0) * sin(ck * 16.0);
      let curl = smoothstep(0.1, 0.0, abs(length(vec2f(abs(u) - 0.85, (ck - 0.35) * 1.2)) - 0.22));
      tone = select(0.35 + 0.45 * leaf + 0.5 * curl, 0.6 + 0.2 * step(0.08, ck), ck < 0.18);
    }
    return vec2f(tone * (0.6 + 0.6 * fbm(p * 26.0)), k);
  }
  // Capitals at the spring line, bases at the floor.
  let capital = smoothstep(0.02, 0.0, abs(p.y - DOOR_SPRING - 0.01));
  let leaf = 0.5 + 0.5 * sin(p.x * 220.0) * sin((p.y - DOOR_SPRING) * 240.0);
  tone = mix(tone, 0.45 + 0.45 * leaf, capital);
  let base = smoothstep(0.03, 0.0, abs(p.y - (FLOOR - 0.03))) * f32(jamb);
  tone = mix(tone, 0.5 + 0.3 * cos((p.y - FLOOR) * 200.0), base);
  return vec2f(tone * (0.6 + 0.6 * fbm(p * 26.0)), k);
}


// The wall's architecture, away from the door: an entablature (architrave,
// a frieze of rosettes, a dentilled cornice) along the top, sunk panels with medallions between the columns, a
// band of running scrolls at the foot. Returns the relief (0 deep .. 1 proud) and where there is carving (0 or 1).
fn wallCarving(p: vec2f, cx: f32) -> vec2f {
  let w = 0.045;
  // The door frame's jambs are its columns; the wall's carving starts beyond them.
  let first = DOOR_HW + FRAME + w * 0.2;
  let bay = 0.5;
  var tone = 0.0;
  var mask = 0.0;

  // Either side of the door.
  for (var side = -1.0; side <= 1.0; side += 2.0) {
    for (var n = 0.0; n < 1.0; n += 1.0) {
      let xc = cx + side * (first + n * bay);
      let u = (p.x - xc) / w;
      // A sunk panel on the wall beyond the column, with a medallion.
      if (n == 0.0) {
        let px = xc + side * (w * 1.8 + bay * 0.4);
        let half = bay * 0.4 - w * 0.4;
        let q = vec2f(abs(p.x - px), p.y);
        if (q.x < half && p.y > 0.32 && p.y < 0.78) {
          let edge = min(half - q.x, min(p.y - 0.32, 0.78 - p.y));
          let frame = smoothstep(0.0, 0.006, edge) * (1.0 - smoothstep(0.012, 0.02, edge));
          let r = length(vec2f(p.x - px, p.y - 0.55));
          let a = atan2(p.y - 0.55, p.x - px);
          let medal = step(r, 0.065) * (0.4 + 0.35 * cos(a * 8.0) * smoothstep(0.065, 0.02, r) + 0.3 * smoothstep(0.012, 0.0, abs(r - 0.06)));
          tone = 0.18 + 0.5 * frame + medal;
          mask = 1.0;
        }
      }
    }
  }

  // The entablature along the top, broken by the doorway.
  if (p.y > 0.06 && p.y < 0.18 && doorway(p, cx) > FRAME + 0.03) {
    if (p.y > 0.155) {
      tone = 0.45 + 0.2 * step(0.168, p.y);
    } else if (p.y > 0.11) {
      let cellx = fract(p.x / 0.07) - 0.5;
      let r = length(vec2f(cellx * 0.07, p.y - 0.1325));
      tone = 0.3 + 0.5 * smoothstep(0.02, 0.0, r) * (0.6 + 0.4 * cos(atan2(p.y - 0.1325, cellx) * 6.0));
    } else if (p.y > 0.085) {
      tone = 0.3 + 0.4 * step(fract(p.x / 0.018), 0.6);
    } else {
      tone = 0.55 + 0.3 * (p.y - 0.06) / 0.025;
    }
    mask = 1.0;
  }

  // Running scrolls along the foot of the wall.
  if (p.y > 0.8 && p.y < 0.84 && mask < 0.5 && doorway(p, cx) > FRAME) {
    let s = sin(p.x * 70.0 + sin(p.x * 35.0) * 1.5);
    tone = 0.3 + 0.45 * smoothstep(0.15, 0.0, abs((p.y - 0.82) / 0.02 - s * 0.6));
    mask = 1.0;
  }
  return vec2f(tone, mask);
}

fn shade(uv: vec2f) -> vec4f {
  let aspect = nsh.size.x / nsh.size.y;
  let p = vec2f(uv.x * aspect, uv.y);
  // Drawn once (and again when resized): it reads no time. What moves is GATE_MOTION's, laid over it.
  let t = 0.0;

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
  // Streaks running down the wall, soot, and broad patches lighter and darker, all at random.
  let stain = fbm(vec2f(p.x * 3.0, p.y * 0.8) + 11.0);
  let soot = smoothstep(0.4, 0.8, fbm(p * 2.2 + 5.0));
  let patches = fbm(p * 1.3 + 20.0);
  var col = vec3f(0.058, 0.058, 0.062) * (0.6 + 0.6 * m.y) * (0.5 + 0.8 * weather) * (0.6 + 0.55 * stain) * (0.6 + 0.8 * patches);
  col *= 1.0 - 0.4 * soot;
  // Some blocks broken: sunk, their edges chipped.
  let broken = step(0.93, m.y) * (0.5 + 0.5 * fbm(p * 40.0));
  col *= 1.0 - 0.45 * broken;
  // Cracks wandering across the blocks.
  let crack = smoothstep(0.012, 0.0, abs(fbm(p * vec2f(3.0, 5.0) + 40.0) - 0.5)) * step(0.55, fbm(p * 2.0 + 60.0));
  col *= 1.0 - 0.6 * crack;
  col = mix(col, vec3f(0.008), m.x * 0.5);
  let bounce = exp(-max(dd, 0.0) * 5.0) * smoothstep(0.0, 0.9, p.y);
  // The wall's carving, lit by what comes in through the door, worn and chipped at random.
  let carvedWall = wallCarving(p, cx);
  if (carvedWall.y > 0.5) {
    let wear = (0.65 + 0.5 * fbm(p * 22.0 + 3.0)) * (1.0 - 0.6 * step(0.78, fbm(p * 9.0 + 70.0)));
    let towardDoor = clamp(1.0 - abs(p.x - cx) * 0.9, 0.2, 1.0);
    col = vec3f(0.07, 0.07, 0.074) * (0.25 + 1.1 * carvedWall.x) * wear * (0.7 + 0.8 * towardDoor);
  }
  col *= 0.8 + 1.0 * bounce + 1.4 * beamFall;

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

  // Outside: the land beyond the door in layers, each further one paler and bluer in the haze — mountains, hills
  // with ruined spires, near ground with dead trees — mist lying between them, the sun's glow high on the right,
  // crows crossing slowly.
  if (open > 0.5) {
    let x = p.x - cx;
    let haze = fbm(p * vec2f(2.5, 1.8) + vec2f(-t * 0.02, t * 0.008));
    let sunAt = vec2f(cx + 0.16, DOOR_SPRING - DOOR_RISE - 0.02);
    let sun = smoothstep(1.1, -0.1, distance(p, sunAt));
    // White at the sun, cold blue away from it, a bright core.
    var view = mix(vec3f(0.3, 0.39, 0.53), vec3f(0.8, 0.82, 0.86), clamp(sun * (0.6 + 0.5 * haze), 0.0, 1.0));
    view += vec3f(1.0) * 0.18 * exp(-distance(p, sunAt) * 9.0);
    // Clouds drifting high up.
    let cloud = smoothstep(0.5, 0.8, fbm(vec2f(p.x * 2.2 - t * 0.012, p.y * 5.0)));
    view = mix(view, view * 0.86 + vec3f(0.04, 0.05, 0.07), cloud * smoothstep(0.45, 0.2, p.y));

    // Far mountains.
    let farTop = 0.66 + 0.07 * fbm(vec2f(x * 2.4, 1.0)) - 0.035 * sin(x * 3.1 + 0.8);
    let farCol = mix(view, vec3f(0.5, 0.58, 0.72), 0.32);
    view = mix(view, farCol, smoothstep(farTop, farTop + 0.004, p.y));
    view = mix(view, vec3f(0.85, 0.9, 0.98), 0.4 * smoothstep(farTop + 0.08, farTop + 0.01, p.y) * smoothstep(farTop - 0.01, farTop + 0.03, p.y) * (0.5 + 0.5 * fbm(vec2f(p.x * 3.0 + t * 0.02, 2.0))));

    // Hills, with ruined spires on them.
    let midTop = 0.75 + 0.035 * fbm(vec2f(x * 5.0, 3.0));
    var mid = smoothstep(midTop, midTop + 0.004, p.y);
    let cell = floor(x * 7.0);
    if (hash(vec2f(cell, 11.0)) > 0.5) {
      let tc = (cell + 0.3 + 0.4 * hash(vec2f(cell, 12.0))) / 7.0;
      let tw = 0.008 + 0.012 * hash(vec2f(cell, 13.0));
      let th = 0.05 + 0.13 * hash(vec2f(cell, 14.0));
      let top = midTop - th;
      // A tower with a pointed roof, its top broken off on some.
      let roof = clamp((p.y - top) / (tw * 3.0), 0.0, 1.0);
      let broken = step(0.6, hash(vec2f(cell, 15.0))) * step(p.y, top + tw * 1.5) * step(0.3, fract((x - tc) * 90.0));
      mid = max(mid, step(abs(x - tc), tw * roof) * step(top, p.y) * (1.0 - broken));
    }
    view = mix(view, mix(view, vec3f(0.3, 0.36, 0.46), 0.62), mid);
    view = mix(view, vec3f(0.8, 0.86, 0.95), 0.35 * smoothstep(midTop + 0.06, midTop + 0.01, p.y) * smoothstep(midTop - 0.005, midTop + 0.02, p.y) * (0.5 + 0.5 * fbm(vec2f(p.x * 4.0 - t * 0.025, 5.0))));

    // Near ground, with dead trees standing on it, darkening towards us.
    let nearTop = 0.83 + 0.03 * fbm(vec2f(x * 9.0, 5.0));
    var near = smoothstep(nearTop, nearTop + 0.003, p.y);
    let tcell = floor(x * 11.0);
    if (hash(vec2f(tcell, 21.0)) > 0.62) {
      let tx = (tcell + 0.5) / 11.0 + 0.02 * (hash(vec2f(tcell, 22.0)) - 0.5);
      let height = 0.07 + 0.08 * hash(vec2f(tcell, 23.0));
      let up = clamp((nearTop - p.y) / height, 0.0, 1.0);
      // A trunk thinning upwards, leaning, with two branches.
      let lean = (hash(vec2f(tcell, 24.0)) - 0.5) * 0.04 * up;
      let trunk = step(abs(x - tx - lean), 0.004 * (1.0 - up * 0.8)) * step(p.y, nearTop) * step(nearTop - height, p.y);
      let b1 = step(abs((x - tx) - (nearTop - height * 0.55 - p.y) * 0.9), 0.0018) * step(nearTop - height * 0.95, p.y) * step(p.y, nearTop - height * 0.5);
      let b2 = step(abs((x - tx) + (nearTop - height * 0.7 - p.y) * 1.1), 0.0016) * step(nearTop - height * 1.0, p.y) * step(p.y, nearTop - height * 0.65);
      near = max(near, max(trunk, max(b1, b2)));
    }
    let depth = clamp((p.y - nearTop) / (FLOOR - nearTop), 0.0, 1.0);
    let ground = vec3f(0.17, 0.19, 0.23) * mix(1.0, 0.55, depth) * (0.75 + 0.4 * fbm(vec2f(p.x * 14.0 / (0.3 + depth), depth * 9.0)));
    view = mix(view, ground, near);
    // Mist lying on the near ground.
    view += vec3f(0.6, 0.66, 0.75) * 0.22 * smoothstep(0.12, 0.0, abs(p.y - nearTop - 0.02)) * (0.4 + 0.6 * fbm(vec2f(p.x * 3.0 + t * 0.03, 8.0)));

    col = view;
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
  let shafts = beamFall * (0.13 * layerFar + 0.17 * layerMid + 0.22 * layerNear) * (0.6 + 0.7 * mist);
  // The beam itself: white where it is thick, cold blue where the mist thins it.
  let beamCol = mix(vec3f(0.55, 0.7, 1.0), vec3f(1.0, 1.0, 1.0), clamp(layerNear * mist, 0.0, 1.0));
  col += beamCol * shafts;
  // Where the beam meets the floor, a pool of light shaped like the door.
  col += vec3f(0.8, 0.88, 1.0) * 0.1 * beamFall * smoothstep(0.6, 1.05, p.y);


  // Mist on the floor, haze in the air.
  let floorMist = fbm(p * vec2f(1.4, 3.5) + vec2f(-t * 0.025, 0.0));
  col += vec3f(0.2, 0.2, 0.21) * floorMist * smoothstep(0.45, 1.0, uv.y) * 0.2;

  // Black at the edges, deep shadows.
  let vig = smoothstep(1.05, 0.15, distance(uv, vec2f(0.55, 0.45)));
  col *= 0.35 + 0.65 * vig;
  let edge = uv * (1.0 - uv);
  col *= pow(clamp(edge.x * edge.y * 30.0, 0.0, 1.0), 0.2);
  col = pow(max(col, vec3f(0.0)), vec3f(1.15)) * 1.15;
  return vec4f(col, 1.0);
}
`;

// What moves over the backdrop, kept cheap since it draws every frame: mist rolling through the beam, ash drifting
// down, brighter in the light, and crows crossing the sky beyond the door. Transparent where nothing moves.
export const GATE_MOTION = /* wgsl */ `
struct Uniforms { time: f32 }

const DOOR_HW = 0.38;
const DOOR_RISE = 0.32;
const DOOR_SPRING = 0.44;
const FLOOR = 1.1;

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

fn shade(uv: vec2f) -> vec4f {
  let aspect = nsh.size.x / nsh.size.y;
  let p = vec2f(uv.x * aspect, uv.y);
  let t = uniforms.time; // seconds, at a low frame rate (see App.tsx)
  let cx = 0.5 * aspect;
  let toSun = normalize(vec2f(0.27, -1.0));
  let dd = doorway(p, cx);
  let inside = step(0.0, dd);

  // The beam, roughly: a few steps towards the sun, skipped where the way to it is nowhere near the door.
  var beam = 0.0;
  let nearDoor = min(doorway(p + toSun * 0.25, cx), doorway(p + toSun * 0.6, cx)) < 0.3;
  for (var i = 1; i <= 6; i++) {
    if (!nearDoor || dd < 0.0) {
      break;
    }
    let s = f32(i) * 0.13;
    let pen = 0.02 + 0.1 * s;
    beam = max(beam, smoothstep(pen, -pen, doorway(p + toSun * s, cx)) * exp(-s * 1.1));
  }
  beam *= inside;

  // Mist rolling through the beam.
  let across = dot(p, vec2f(-toSun.y, toSun.x));
  var roll = 0.0;
  if (beam > 0.001) {
    roll = noise(vec2f(across * 4.0 + t * 0.06, dot(p, toSun) * 1.5 - t * 0.04)) * noise(vec2f(across * 9.0 - t * 0.09, 3.0));
  }
  var light = beam * roll * 0.12;

  // Ash drifting down, brighter in the light.
  var ash = 0.0;
  for (var layer = 0.0; layer < 2.0; layer += 1.0) {
    let scale = 24.0 + layer * 18.0;
    let drift = vec2f(sin(t * 0.25 + layer) * 0.3 - t * 0.05, -t * (0.12 + 0.05 * layer));
    let g = p * scale + drift + layer * 17.0;
    let cell = floor(g);
    let j = hash2(cell);
    let speck = 1.0 - smoothstep(0.0, 0.05 + 0.05 * j.x, length(fract(g) - j));
    ash += speck * step(0.74, hash(cell + 4.0));
  }
  light += ash * (0.08 + beam * 0.9);
  var col = mix(vec3f(0.62, 0.74, 1.0), vec3f(1.0), clamp(roll, 0.0, 1.0));
  var alpha = clamp(light, 0.0, 1.0);

  // Crows crossing the sky beyond the door, wings beating.
  if (dd < 0.0 && p.y < 0.45) {
    for (var k = 0.0; k < 3.0; k += 1.0) {
      let bx = cx - 0.3 + fract(t * (0.008 + 0.003 * k) + k * 0.37) * 0.6;
      let by = 0.16 + 0.035 * k + 0.008 * sin(t * 0.5 + k);
      let q = (p - vec2f(bx, by)) * 420.0;
      let flap = 0.4 + 0.3 * sin(t * 6.0 + k * 2.0);
      let crow = step(abs(abs(q.x) * flap - q.y), 0.6) * step(abs(q.x), 3.0);
      if (crow > 0.5) {
        col = vec3f(0.1, 0.11, 0.13);
        alpha = 0.8;
      }
    }
  }
  return vec4f(col, alpha);
}
`;
