// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * The brain scene: a static cortex shell, region hubs joined by polysynaptic fibre tracts (chains of relay neurons and axons), and the
 * owner's memories as a network — episodes as neurons placed by meaning, real relations as synapses. Nothing moves
 * by itself: the only motion is an impulse travelling a real path when the service reports a real event (WORK_PLAN
 * 5b.6), and the short glow it leaves behind.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { type Atlas, type AtlasEdge } from './api';

export type Region = 'entry' | 'thalamus' | 'llm' | 'hippoL' | 'hippoR' | 'acc' | 'cortex' | 'prefrontal' | 'agent';
export const COLORS = { white: 0xdff6ff, cyan: 0x38e8ff, amber: 0xffb547, magenta: 0xff4fd8, lime: 0x9dff6a, violet: 0x9b7bff, red: 0xff5a6a } as const;

const HUB: Record<Region, { pos: THREE.Vector3; color: number; label?: string }> = {
  entry:      { pos: new THREE.Vector3(0, 3.6, -4.2), color: COLORS.white },
  thalamus:   { pos: new THREE.Vector3(0, 0.35, -0.2), color: COLORS.white, label: 'Talamo · ingest' },
  llm:        { pos: new THREE.Vector3(1.9, 0.8, 1.1), color: COLORS.amber, label: 'LLM' },
  hippoL:     { pos: new THREE.Vector3(-1.15, -0.55, -0.5), color: COLORS.cyan, label: 'Ippocampo' },
  hippoR:     { pos: new THREE.Vector3(1.15, -0.55, -0.5), color: COLORS.cyan },
  acc:        { pos: new THREE.Vector3(0, 1.4, 0.9), color: COLORS.red, label: 'Cingolo · terzi' },
  cortex:     { pos: new THREE.Vector3(-1.8, 1.35, -0.4), color: COLORS.violet, label: 'Neocorteccia · fatti' },
  prefrontal: { pos: new THREE.Vector3(0, 1.0, 2.7), color: COLORS.lime, label: 'Prefrontale · richiamo' },
  agent:      { pos: new THREE.Vector3(0, 3.0, 6.2), color: COLORS.lime },
};
/** Saltatory conduction: on an axon the impulse jumps from one node of Ranvier to the next (spacing in scene units). */
const RANVIER = 0.12;
/** Speed along myelinated axons (units/s) and the pause at each synapse while the next neuron integrates and fires. */
const CONDUCTION = 5.5, SYNAPTIC_DELAY = 0.075;
/** Fibre tracts actually used by the data flow. */
const TRACTS: Array<[Region, Region]> = [
  ['entry', 'thalamus'], ['thalamus', 'llm'], ['llm', 'hippoL'], ['llm', 'hippoR'], ['llm', 'cortex'], ['llm', 'acc'],
  ['hippoL', 'cortex'], ['hippoR', 'cortex'], ['hippoL', 'acc'], ['hippoR', 'acc'], ['agent', 'prefrontal'],
  ['prefrontal', 'hippoL'], ['prefrontal', 'hippoR'], ['prefrontal', 'cortex'], ['prefrontal', 'acc'], ['thalamus', 'acc'],
  ['hippoL', 'hippoR'], // the hippocampal commissure: relations between the two hemispheres cross here
];

interface Neuron { id: string; pos: THREE.Vector3; color: THREE.Color; base: number; glow: number; region: Region; dim: boolean }
/** A polysynaptic path: the points it passes and, for each, the relay neuron there (-1 = a hub or a memory neuron). */
interface Path { pts: THREE.Vector3[]; relays: number[] }
interface Relay { pos: THREE.Vector3; color: THREE.Color; size: number; glow: number }
/** An impulse hops segment by segment: fast along the axon, then a synaptic delay at the next neuron, which fires. */
interface Pulse { path: Path; seg: number; u: number; wait: number; speed: number; color: THREE.Color; size: number; tail: number; done?: () => void }

const reversed = (p: Path): Path => ({ pts: [...p.pts].reverse(), relays: [...p.relays].reverse() });
const joined = (p: Path, q: Path): Path => ({ pts: [...p.pts, ...q.pts.slice(1)], relays: [...p.relays, ...q.relays.slice(1)] });

const rnd = (seed: string) => { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296); };

function glowMaterial(scale: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { uScale: { value: scale } },
    vertexShader: `attribute float size; varying vec3 vColor; uniform float uScale;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vColor * a, a); }`,
  });
}

export class Brain {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly clock = new THREE.Clock();
  private readonly labels: Array<{ el: HTMLElement; pos: THREE.Vector3; region: Region }> = [];
  private readonly heat = new Map<Region, number>();
  /** Calls in flight per region (a real wait: the LLM is working); the region breathes until they return. */
  private readonly busy = new Map<Region, number>();
  private readonly hubRange = new Map<Region, { from: number; to: number; color: THREE.Color }>();
  private readonly tracts = new Map<string, Path>();
  /** Inside each hippocampus the input crosses dentate gyrus → CA3 → CA1 before reaching a memory (trisynaptic loop). */
  private readonly circuits = new Map<Region, Path>();
  private readonly relays: Relay[] = [];
  private relayPoints: THREE.Points | null = null;
  private neurons = new Map<string, Neuron>();
  private neuronPoints: THREE.Points | null = null;
  private synapses: THREE.LineSegments | null = null;
  private readonly pulses: Pulse[] = [];
  private readonly pulseGeo = new THREE.BufferGeometry();
  private readonly hubPoints: THREE.Points;
  private readonly MAXP = 3000;
  private readonly bloom: UnrealBloomPass;
  /** 0 = awake, 1 = asleep (nightly consolidation running): the palette follows it smoothly. */
  private sleep = 0;
  private sleepTarget = 0;
  private readonly AWAKE = new THREE.Color(0x04060b);
  private readonly ASLEEP = new THREE.Color(0x0a0520);
  private readonly bg = new THREE.Color(0x04060b);

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x04060b, 1);
    host.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x04060b, 0.028);
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
    this.camera.position.set(6.4, 2.6, 7.8);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.3, 0);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.05, 0.6, 0.06);
    this.composer.addPass(this.bloom);

    this.buildShell();
    this.hubPoints = this.buildHubs();
    this.buildTracts();
    const p = new Float32Array(this.MAXP * 3), c = new Float32Array(this.MAXP * 3), s = new Float32Array(this.MAXP);
    this.pulseGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.pulseGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.pulseGeo.setAttribute('size', new THREE.BufferAttribute(s, 1));
    this.pulseGeo.setDrawRange(0, 0);
    this.scene.add(new THREE.Points(this.pulseGeo, glowMaterial(this.renderer.getPixelRatio() * 1.3)));
    addEventListener('resize', () => this.resize());
    this.loop();
  }

  // ---------- static anatomy ----------
  private buildShell(): void {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    const r = rnd('shell'), c = new THREE.Color();
    const sphere = () => { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)); };
    for (const side of [1, -1]) for (let i = 0; i < 7000; i++) {
      const v = sphere(); const p = new THREE.Vector3(v.x * 2.15, v.y * 2.0, v.z * 3.2);
      if (p.y < 0) p.y *= 0.72;
      p.x = side * (0.12 + Math.abs(p.x));
      const g = 0.06 * Math.sin(p.x * 5.1 + Math.sin(p.y * 3.3)) * Math.cos(p.z * 4.7 + Math.sin(p.x * 2.1)) + 0.035 * Math.sin(p.y * 9 + p.z * 6);
      p.addScaledVector(p.clone().normalize(), g);
      pos.push(p.x, p.y + 0.4, p.z); c.setHSL(0.55, 0.7, 0.1 + r() * 0.12); col.push(c.r, c.g, c.b); size.push(0.03 + r() * 0.04);
    }
    for (let i = 0; i < 1800; i++) {
      const v = sphere(); pos.push(v.x * 1.5, v.y * 0.6 - 1.25, v.z * 0.95 - 2.35); c.setHSL(0.57, 0.6, 0.08 + r() * 0.1); col.push(c.r, c.g, c.b); size.push(0.03 + r() * 0.03);
    }
    this.scene.add(this.points(pos, col, size, 1));
  }

  private buildHubs(): THREE.Points {
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    for (const [name, h] of Object.entries(HUB) as Array<[Region, (typeof HUB)[Region]]>) {
      if (name === 'entry' || name === 'agent') continue;
      const c = new THREE.Color(h.color), r = rnd(name);
      this.hubRange.set(name, { from: size.length, to: size.length + 60, color: c });
      for (let i = 0; i < 60; i++) {
        const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(Math.pow(r(), 1.5) * 0.3);
        pos.push(h.pos.x + d.x, h.pos.y + d.y, h.pos.z + d.z); col.push(c.r * 0.6, c.g * 0.6, c.b * 0.6); size.push(0.06 + r() * 0.06);
      }
      if (h.label) {
        const el = document.createElement('div'); el.className = 'label'; el.textContent = h.label; el.style.color = `#${c.getHexString()}`;
        document.body.appendChild(el); this.labels.push({ el, pos: h.pos.clone().add(new THREE.Vector3(0, 0.45, 0)), region: name });
      }
    }
    const pts = this.points(pos, col, size, 1);
    this.scene.add(pts);
    return pts;
  }

  /**
   * Fibre tracts as polysynaptic chains, as between real brain regions: relay neurons (with their dendrites) joined by
   * straight axon segments. An impulse never glides from region to region; it crosses neuron after neuron.
   */
  private buildTracts(): void {
    const lines = { pos: [] as number[], col: [] as number[] }, dust = { pos: [] as number[], col: [] as number[], size: [] as number[] };
    const axon = (p: THREE.Vector3, q: THREE.Vector3, c: THREE.Color) => { lines.pos.push(p.x, p.y, p.z, q.x, q.y, q.z); lines.col.push(c.r, c.g, c.b, c.r, c.g, c.b); };
    for (const [a, b] of TRACTS) {
      const A = HUB[a].pos, B = HUB[b].pos, r = rnd(a + b);
      const dir = B.clone().sub(A).normalize();
      const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(side).normalize();
      const arch = 0.2 + r() * 0.35, n = Math.max(2, Math.round(A.distanceTo(B) / 0.55));
      const ca = new THREE.Color(HUB[a].color), cb = new THREE.Color(HUB[b].color);
      const path: Path = { pts: [A.clone()], relays: [-1] };
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const p = A.clone().lerp(B, t).addScaledVector(up, arch * Math.sin(Math.PI * t))
          .addScaledVector(side, (r() - 0.5) * 0.32).addScaledVector(up, (r() - 0.5) * 0.22);
        path.pts.push(p); path.relays.push(this.addRelay(p, ca.clone().lerp(cb, t), 0.15, r, lines));
      }
      path.pts.push(B.clone()); path.relays.push(-1);
      for (let i = 0; i < path.pts.length - 1; i++) {
        const p = path.pts[i]!, q = path.pts[i + 1]!, c = ca.clone().lerp(cb, i / path.pts.length);
        axon(p, q, c.clone().multiplyScalar(0.55));
        // bystander cells along the bundle: the tissue the axon crosses (static, dim)
        for (let k = 0; k < 4; k++) {
          const v = p.clone().lerp(q, r()).add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.22));
          dust.pos.push(v.x, v.y, v.z); dust.col.push(c.r * 0.25, c.g * 0.25, c.b * 0.25); dust.size.push(0.04 + r() * 0.03);
        }
      }
      this.tracts.set(`${a}>${b}`, path);
    }
    // Hippocampal circuit (entorhinal hub → dentate gyrus → CA3 → CA1), curled like a seahorse on each side.
    for (const region of ['hippoL', 'hippoR'] as const) {
      const s = region === 'hippoL' ? -1 : 1, H = HUB[region].pos, r = rnd(`circuit${region}`), c = new THREE.Color(COLORS.cyan);
      const path: Path = { pts: [H.clone()], relays: [-1] };
      for (const off of [[0.28, -0.18, 0.3], [0.5, 0.02, 0.05], [0.32, 0.16, -0.32]] as const) {
        const p = H.clone().add(new THREE.Vector3(s * off[0], off[1], off[2]));
        axon(path.pts[path.pts.length - 1]!, p, c.clone().multiplyScalar(0.4));
        path.pts.push(p); path.relays.push(this.addRelay(p, c, 0.13, r, lines));
      }
      this.circuits.set(region, path);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(lines.col, 3));
    this.scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.scene.add(this.points(dust.pos, dust.col, dust.size, 1));
    this.relayPoints = this.points(this.relays.flatMap((x) => [x.pos.x, x.pos.y, x.pos.z]), new Array(this.relays.length * 3).fill(0), new Array(this.relays.length).fill(0), 1);
    this.scene.add(this.relayPoints);
  }

  /** A relay neuron with a few short dendrites; returns its index (its glow flashes when an impulse fires through it). */
  private addRelay(pos: THREE.Vector3, color: THREE.Color, size: number, r: () => number, lines: { pos: number[]; col: number[] }): number {
    const dc = color.clone().multiplyScalar(0.3);
    for (let k = 0, n = 3 + Math.floor(r() * 3); k < n; k++) {
      const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.06 + r() * 0.1);
      lines.pos.push(pos.x, pos.y, pos.z, pos.x + d.x, pos.y + d.y, pos.z + d.z); lines.col.push(dc.r, dc.g, dc.b, dc.r * 0.3, dc.g * 0.3, dc.b * 0.3);
    }
    this.relays.push({ pos, color: color.clone().multiplyScalar(0.85), size, glow: 0 });
    return this.relays.length - 1;
  }

  private tract(a: Region, b: Region): Path | null {
    const f = this.tracts.get(`${a}>${b}`); if (f) return f;
    const back = this.tracts.get(`${b}>${a}`); return back ? reversed(back) : null;
  }

  /** Two memory neurons: directly when in the same region, otherwise through the relays of the tract between regions. */
  private edgePath(a: Neuron, b: Neuron): Path {
    const t = a.region === b.region ? null : this.tract(a.region, b.region);
    if (!t) return { pts: [a.pos, b.pos], relays: [-1, -1] };
    return { pts: [a.pos, ...t.pts.slice(1, -1), b.pos], relays: [-1, ...t.relays.slice(1, -1), -1] };
  }

  private points(pos: number[], col: number[], size: number[], scale: number): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    return new THREE.Points(g, glowMaterial(this.renderer.getPixelRatio() * scale));
  }

  // ---------- the owner's memory as a network ----------
  load(atlas: Atlas): void {
    const kindColor = (k: string) => new THREE.Color(k === 'plan' ? COLORS.amber : k === 'state_change' ? COLORS.magenta : COLORS.cyan);
    const neurons = new Map<string, Neuron>();
    for (const e of atlas.episodes) {
      const claim = e.authorRole === 'other' || e.authorRole === 'tool';
      const region: Region = claim ? 'acc' : e.xyz[0] < 0 ? 'hippoL' : 'hippoR';
      // Meaning → place: the first component picks the hemisphere, the others spread the neuron along an elongated,
      // seahorse-like volume (anterior–posterior), so related memories sit close.
      const side = region === 'hippoL' ? -1 : 1;
      const b = ball(e.xyz);
      const local = claim
        ? new THREE.Vector3(b.x * 0.45, b.y * 0.35, b.z * 0.45)
        : new THREE.Vector3(side * (0.1 + Math.abs(b.x) * 0.5), b.y * 0.45, b.z * 1.1);
      const pos = HUB[region].pos.clone().add(local);
      neurons.set(e.id, { id: e.id, pos, color: claim ? new THREE.Color(COLORS.red) : kindColor(e.kind), base: 0.1 + e.importance * 0.012, glow: 0, region, dim: !!e.hidden });
    }
    const cortexItem = (id: string, color: number, base: number) => {
      const r = rnd(id), v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.35 + r() * 0.75);
      neurons.set(id, { id, pos: HUB.cortex.pos.clone().add(v), color: new THREE.Color(color), base, glow: 0, region: 'cortex', dim: false });
    };
    for (const f of atlas.facts) cortexItem(f.id, COLORS.violet, f.status === 'current' ? 0.14 : 0.08);
    for (const n of atlas.notes) cortexItem(n.id, COLORS.violet, n.pending ? 0.08 : 0.12);
    for (const d of atlas.digests) cortexItem(d.id, COLORS.white, d.level === 'month' ? 0.14 : 0.08);
    this.neurons = neurons;
    this.rebuildNeurons();
    this.rebuildSynapses(atlas.edges);
  }

  private rebuildNeurons(): void {
    if (this.neuronPoints) { this.scene.remove(this.neuronPoints); this.neuronPoints.geometry.dispose(); }
    const list = [...this.neurons.values()];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((n) => [n.pos.x, n.pos.y, n.pos.z]), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(list.length * 3).fill(0), 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(new Array(list.length).fill(0), 1));
    this.neuronPoints = new THREE.Points(g, glowMaterial(this.renderer.getPixelRatio()));
    this.neuronPoints.userData.order = list.map((n) => n.id);
    this.scene.add(this.neuronPoints);
  }

  private edges: AtlasEdge[] = [];
  private rebuildSynapses(edges: AtlasEdge[]): void {
    this.edges = edges;
    if (this.synapses) { this.scene.remove(this.synapses); this.synapses.geometry.dispose(); }
    const pos: number[] = [], col: number[] = [];
    const tone: Record<AtlasEdge['kind'], [number, number]> = {
      similar: [COLORS.cyan, 0.05], people: [COLORS.magenta, 0.025], corrects: [COLORS.red, 0.22], duplicate: [0x8899aa, 0.12],
      outcome: [COLORS.amber, 0.2], rescheduled: [COLORS.amber, 0.15],
    };
    // "Same people" links are many (a partner appears everywhere): keep two per neuron so the network stays readable.
    const peopleCount = new Map<string, number>();
    for (const e of edges) {
      if (e.kind === 'people') {
        const n = Math.max(peopleCount.get(e.a) ?? 0, peopleCount.get(e.b) ?? 0);
        if (n >= 2) continue;
        peopleCount.set(e.a, (peopleCount.get(e.a) ?? 0) + 1); peopleCount.set(e.b, (peopleCount.get(e.b) ?? 0) + 1);
      }
      const a = this.neurons.get(e.a), b = this.neurons.get(e.b);
      if (!a || !b) continue;
      const [hex, k] = tone[e.kind]; const c = new THREE.Color(hex).multiplyScalar(k);
      // Straight synapses; across regions they converge on the relays of the tract that joins them.
      const pts = this.edgePath(a, b).pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i]!, q = pts[i + 1]!;
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.synapses = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.synapses);
  }

  // ---------- event-driven motion ----------
  /** Sends an impulse along the tract a → b, relay by relay (optionally on to one neuron); resolves on arrival. */
  fire(a: Region, b: Region, color: number, opts: { to?: string; size?: number } = {}): Promise<void> {
    let path = this.tract(a, b);
    if (!path) return Promise.resolve();
    const target = opts.to ? this.neurons.get(opts.to) : undefined;
    if (target) {
      const circuit = this.circuits.get(b);
      if (circuit) path = joined(path, circuit);
      path = { pts: [...path.pts, target.pos], relays: [...path.relays, -1] };
    }
    return new Promise((resolve) => {
      this.launch(path, CONDUCTION, color, opts.size ?? 0.26, 7, () => {
        this.heat.set(b, Math.min(1.5, (this.heat.get(b) ?? 0) + 0.8));
        if (target) target.glow = 1.6;
        resolve();
      });
    });
  }

  /** An impulse along a synapse between two neurons (a real link was written). */
  link(a: string, b: string, color: number): void {
    const A = this.neurons.get(a), B = this.neurons.get(b);
    if (!A || !B) return;
    this.launch(this.edgePath(A, B), CONDUCTION * 0.8, color, 0.2, 5, () => { B.glow = 1.4; });
  }

  private launch(path: Path, speed: number, color: number, size: number, tail: number, done: () => void): void {
    this.pulses.push({ path, seg: 0, u: 0, wait: 0, speed, color: new THREE.Color(color), size, tail, done });
  }

  /** A memory written now that is not in the snapshot yet: a provisional neuron in its region until the next refresh. */
  addNeuron(id: string, kind: string | undefined, authorRole: string | undefined, table: string): void {
    if (this.neurons.has(id)) return;
    const claim = authorRole === 'other' || authorRole === 'tool';
    const region: Region = table !== 'episodes' ? 'cortex' : claim ? 'acc' : (rnd(id)() < 0.5 ? 'hippoL' : 'hippoR');
    const r = rnd(id), v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.3 + r() * 0.6);
    const color = table !== 'episodes' ? COLORS.violet : claim ? COLORS.red : kind === 'plan' ? COLORS.amber : kind === 'state_change' ? COLORS.magenta : COLORS.cyan;
    this.neurons.set(id, { id, pos: HUB[region].pos.clone().add(v), color: new THREE.Color(color), base: 0.16, glow: 2, region, dim: false });
    this.rebuildNeurons();
    this.rebuildSynapses(this.edges);
  }

  forget(ids: string[]): void {
    for (const id of ids) this.neurons.delete(id);
    this.rebuildNeurons();
    this.rebuildSynapses(this.edges);
  }

  regionOf(id: string): Region | undefined { return this.neurons.get(id)?.region; }

  /** A call left (+1) or came back (−1) for this region. */
  wait(region: Region, delta: 1 | -1): void { this.busy.set(region, Math.max(0, (this.busy.get(region) ?? 0) + delta)); }

  /** A slow orbit of the point of view: the camera moves, the data never does on its own. */
  setOrbit(on: boolean): void {
    this.controls.autoRotate = on && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.controls.autoRotateSpeed = 0.35;
  }

  /** Sleep palette while the service really consolidates (deeper violet night, stronger glow); awake otherwise. */
  setSleep(on: boolean): void { this.sleepTarget = on ? 1 : 0; }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  }

  private readonly proj = new THREE.Vector3();
  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.sleep !== this.sleepTarget) {
      this.sleep += Math.sign(this.sleepTarget - this.sleep) * Math.min(Math.abs(this.sleepTarget - this.sleep), dt / 1.5);
      this.bg.copy(this.AWAKE).lerp(this.ASLEEP, this.sleep);
      this.renderer.setClearColor(this.bg, 1); (this.scene.fog as THREE.FogExp2).color.copy(this.bg);
      this.bloom.strength = 1.05 + 0.4 * this.sleep;
      document.body.style.background = `#${this.bg.getHexString()}`;
    }
    // neurons: steady light + the glow events leave behind
    if (this.neuronPoints) {
      const order = this.neuronPoints.userData.order as string[];
      const col = this.neuronPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
      const size = this.neuronPoints.geometry.getAttribute('size') as THREE.BufferAttribute;
      order.forEach((id, i) => {
        const n = this.neurons.get(id); if (!n) return;
        n.glow = Math.max(0, n.glow - dt * 0.8);
        const f = (n.dim ? 0.35 : 1) * (1 + n.glow * 1.5);
        col.setXYZ(i, n.color.r * f, n.color.g * f, n.color.b * f); size.setX(i, n.base + n.glow * 0.22);
      });
      col.needsUpdate = true; size.needsUpdate = true;
    }
    // hubs glow only after an arrival
    for (const [r, h] of this.heat) this.heat.set(r, Math.max(0, h - dt * 0.7));
    const now = this.clock.elapsedTime;
    for (const [r, n] of this.busy) if (n > 0) this.heat.set(r, Math.max(this.heat.get(r) ?? 0, 0.55 + 0.3 * Math.sin(now * 4)));
    // region hubs light up with their heat (arrivals, calls in flight)
    const hc = this.hubPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (const [r, { from, to, color }] of this.hubRange) {
      const f = 0.6 + (this.heat.get(r) ?? 0) * 1.1;
      for (let i = from; i < to; i++) hc.setXYZ(i, color.r * f, color.g * f, color.b * f);
    }
    hc.needsUpdate = true;
    for (const l of this.labels) l.el.classList.toggle('hot', (this.heat.get(l.region) ?? 0) > 0.15);
    // impulses
    const p = this.pulseGeo.getAttribute('position') as THREE.BufferAttribute, c = this.pulseGeo.getAttribute('color') as THREE.BufferAttribute, s = this.pulseGeo.getAttribute('size') as THREE.BufferAttribute;
    let k = 0;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pl = this.pulses[i]!;
      if (pl.wait > 0) { pl.wait -= dt; continue; } // synaptic delay: the signal is chemical for a moment, nothing travels
      const P = pl.path.pts[pl.seg]!, Q = pl.path.pts[pl.seg + 1]!, len = Math.max(0.01, P.distanceTo(Q));
      pl.u += dt * pl.speed / len;
      if (pl.u >= 1) {
        pl.seg++; pl.u = 0;
        if (pl.seg >= pl.path.pts.length - 1) { pl.done?.(); this.pulses.splice(i, 1); continue; }
        const relay = this.relays[pl.path.relays[pl.seg]!];
        if (relay) relay.glow = 1.6; // the next neuron fires
        pl.wait = SYNAPTIC_DELAY;
        continue;
      }
      // saltatory conduction: the head jumps node to node, leaving a beaded trail inside this axon segment only
      const nodes = Math.max(1, Math.round(len / RANVIER)), head = Math.floor(pl.u * nodes);
      for (let j = 0; j < pl.tail && k < this.MAXP; j++) {
        const n = head - j; if (n < 0) break;
        const fade = 1 - j / pl.tail; this.proj.copy(P).lerp(Q, n / nodes);
        p.setXYZ(k, this.proj.x, this.proj.y, this.proj.z); c.setXYZ(k, pl.color.r * 1.6 * fade, pl.color.g * 1.6 * fade, pl.color.b * 1.6 * fade); s.setX(k, pl.size * (0.4 + 0.6 * fade)); k++;
      }
    }
    // relay neurons: dim at rest, a flash when an impulse fires through them
    if (this.relayPoints) {
      const rc = this.relayPoints.geometry.getAttribute('color') as THREE.BufferAttribute, rs = this.relayPoints.geometry.getAttribute('size') as THREE.BufferAttribute;
      this.relays.forEach((r, i) => {
        r.glow = Math.max(0, r.glow - dt * 2.2);
        const f = 0.8 + r.glow * 2;
        rc.setXYZ(i, r.color.r * f, r.color.g * f, r.color.b * f); rs.setX(i, r.size + r.glow * 0.12);
      });
      rc.needsUpdate = true; rs.needsUpdate = true;
    }
    this.pulseGeo.setDrawRange(0, k); p.needsUpdate = true; c.needsUpdate = true; s.needsUpdate = true;
    this.controls.update();
    this.composer.render();
    for (const l of this.labels) {
      this.proj.copy(l.pos).project(this.camera);
      l.el.style.display = this.proj.z < 1 ? '' : 'none';
      l.el.style.left = `${(this.proj.x + 1) / 2 * innerWidth}px`; l.el.style.top = `${(1 - this.proj.y) / 2 * innerHeight}px`;
    }
    requestAnimationFrame(this.loop);
  };
}

/** Cube → ball: principal components span a box; this keeps their order but rounds the cloud like tissue. */
function ball(xyz: [number, number, number]): THREE.Vector3 {
  const v = new THREE.Vector3(...xyz);
  const inf = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)), l2 = v.length();
  return l2 > 0 ? v.multiplyScalar(inf / l2) : v;
}
