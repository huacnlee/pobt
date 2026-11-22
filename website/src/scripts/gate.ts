// The launcher's backdrop on the site: the same WGSL (../../../gate.ts) on WebGPU, as NSH's Shader element runs it.
// The doorway draws once (and again on a resize) and its motion over it at 24 frames a second, as in the app.
// Without WebGPU the page keeps its CSS doorway.
import { GATE, GATE_MOTION } from '../../../gate';

// What NSH gives a shader: `nsh.size` in pixels and `nsh.time`; the motion's own `uniforms.time`. `shade(uv)` is
// called with uv across the view, 0..1; its colour is straight alpha.
const wrap = (source: string, motion: boolean) => `
struct Nsh { size: vec2f, time: f32, pad: f32 }
@group(0) @binding(0) var<uniform> nsh: Nsh;
${motion ? '@group(0) @binding(1) var<uniform> uniforms: Uniforms;' : ''}
${source}
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = shade(pos.xy / nsh.size);
  return vec4f(c.rgb * c.a, c.a);
}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gpu = any;

async function layer(gpu: Gpu, device: Gpu, canvas: HTMLCanvasElement, source: string, motion: boolean) {
  const context = canvas.getContext('webgpu') as Gpu;
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  const module = device.createShaderModule({ code: wrap(source, motion) });
  const pipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });
  const usage = 0x40 | 0x08; // UNIFORM | COPY_DST
  const nsh = device.createBuffer({ size: 16, usage });
  const time = motion ? device.createBuffer({ size: 16, usage }) : null;
  const entries = [{ binding: 0, resource: { buffer: nsh } }];
  if (time) entries.push({ binding: 1, resource: { buffer: time } });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
  return (t: number) => {
    device.queue.writeBuffer(nsh, 0, new Float32Array([canvas.width, canvas.height, t, 0]));
    if (time) device.queue.writeBuffer(time, 0, new Float32Array([t, 0, 0, 0]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };
}

export async function startGate(host: HTMLElement) {
  const gpu = (navigator as Gpu).gpu;
  if (!gpu) return;
  const adapter = await gpu.requestAdapter();
  if (!adapter) return;
  const device = await adapter.requestDevice();
  const [still, moving] = host.querySelectorAll('canvas');
  const drawStill = await layer(gpu, device, still, GATE, false);
  const drawMoving = await layer(gpu, device, moving, GATE_MOTION, true);

  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [still, moving]) {
      c.width = Math.max(1, Math.round(host.clientWidth * scale));
      c.height = Math.max(1, Math.round(host.clientHeight * scale));
    }
    drawStill(0);
  };
  new ResizeObserver(resize).observe(host);
  resize();
  host.classList.add('gpu');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const begin = performance.now();
  let last = 0;
  const frame = (now: number) => {
    if (now - last >= 1000 / 24) {
      last = now;
      drawMoving((now - begin) / 1000);
    }
    if (!reduced) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
