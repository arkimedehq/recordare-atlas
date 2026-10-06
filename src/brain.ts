// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * The brain scene: a static cortex shell, region hubs joined by visible fibre tracts (relay neurons + axons), and the
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
/** Centre of the brain, through which long synapses bend. */
const CORE = new THREE.Vector3(0, 0.2, -0.3);
/** Fibre tracts actually used by the data flow. */
const TRACTS: Array<[Region, Region]> = [
  ['entry', 'thalamus'], ['thalamus', 'llm'], ['llm', 'hippoL'], ['llm', 'hippoR'], ['llm', 'cortex'], ['llm', 'acc'],
  ['hippoL', 'cortex'], ['hippoR', 'cortex'], ['hippoL', 'acc'], ['hippoR', 'acc'], ['agent', 'prefrontal'],
  ['prefrontal', 'hippoL'], ['prefrontal', 'hippoR'], ['prefrontal', 'cortex'], ['prefrontal', 'acc'], ['thalamus', 'acc'],
];

interface Neuron { id: string; pos: THREE.Vector3; color: THREE.Color; base: number; glow: number; region: Region; dim: boolean }
interface Pulse { curve: THREE.Curve<THREE.Vector3>; t: number; speed: number; color: THREE.Color; size: number; tail: number; done?: () => void }

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
  private readonly tractCurves = new Map<string, THREE.CatmullRomCurve3>();
  private neurons = new Map<string, Neuron>();
  private neuronPoints: THREE.Points | null = null;
  private synapses: THREE.LineSegments | null = null;
  private readonly pulses: Pulse[] = [];
  private readonly pulseGeo = new THREE.BufferGeometry();
  private readonly hubPoints: THREE.Points;
  private readonly MAXP = 3000;

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
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.05, 0.6, 0.06));

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

  /** Fibre tracts: curved axons with relay neurons; impulses travel exactly along these curves. */
  private buildTracts(): void {
    const linePos: number[] = [], lineCol: number[] = [], relayPos: number[] = [], relayCol: number[] = [], relaySize: number[] = [];
    for (const [a, b] of TRACTS) {
      const A = HUB[a].pos, B = HUB[b].pos, r = rnd(a + b);
      const mid = A.clone().lerp(B, 0.5).add(new THREE.Vector3((r() - 0.5) * 0.8, 0.5 + r() * 0.6, (r() - 0.5) * 0.8));
      const q1 = A.clone().lerp(mid, 0.55).add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3));
      const q2 = mid.clone().lerp(B, 0.45).add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3));
      const curve = new THREE.CatmullRomCurve3([A, q1, mid, q2, B]);
      this.tractCurves.set(`${a}>${b}`, curve);
      const pts = curve.getPoints(48), ca = new THREE.Color(HUB[a].color), cb = new THREE.Color(HUB[b].color);
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i]!, q = pts[i + 1]!, t = i / pts.length;
        const col = ca.clone().lerp(cb, t).multiplyScalar(0.55);
        linePos.push(p.x, p.y, p.z, q.x, q.y, q.z); lineCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
      }
      // The bundle: many small glowing points along the axon (thickness), plus brighter relay neurons.
      for (let i = 1; i < 60; i++) {
        const p = curve.getPoint(i / 60); const col = ca.clone().lerp(cb, i / 60).multiplyScalar(0.35);
        relayPos.push(p.x + (r() - 0.5) * 0.05, p.y + (r() - 0.5) * 0.05, p.z + (r() - 0.5) * 0.05); relayCol.push(col.r, col.g, col.b); relaySize.push(0.05);
      }
      for (let i = 1; i < 6; i++) { const p = curve.getPoint(i / 6); const col = ca.clone().lerp(cb, i / 6).multiplyScalar(0.8); relayPos.push(p.x, p.y, p.z); relayCol.push(col.r, col.g, col.b); relaySize.push(0.14); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 3));
    this.scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.scene.add(this.points(relayPos, relayCol, relaySize, 1));
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
      // Synapses bend through the tissue (pulled toward the brain's core, like fibres through the corpus callosum)
      // instead of cutting straight lines across the space.
      const mid = a.pos.clone().lerp(b.pos, 0.5);
      const ctrl = mid.clone().lerp(CORE, Math.min(0.6, a.pos.distanceTo(b.pos) * 0.25));
      const curve = new THREE.QuadraticBezierCurve3(a.pos, ctrl, b.pos);
      const segs = a.pos.distanceTo(b.pos) > 0.8 ? 8 : 2, pts = curve.getPoints(segs);
      for (let i = 0; i < segs; i++) {
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
  /** Sends an impulse along the tract a → b (optionally continuing to a neuron); resolves on arrival. */
  fire(a: Region, b: Region, color: number, opts: { to?: string; size?: number } = {}): Promise<void> {
    const forward = this.tractCurves.get(`${a}>${b}`), backward = this.tractCurves.get(`${b}>${a}`);
    const tract = forward ?? (backward ? new ReversedCurve(backward) : null);
    if (!tract) return Promise.resolve();
    const target = opts.to ? this.neurons.get(opts.to) : undefined;
    const path: THREE.Curve<THREE.Vector3> = target ? new ChainedCurve(tract, target.pos) : tract;
    return new Promise((resolve) => {
      this.pulses.push({ curve: path, t: 0, speed: 0.9, color: new THREE.Color(color), size: opts.size ?? 0.26, tail: 10, done: () => {
        this.heat.set(b, Math.min(1.5, (this.heat.get(b) ?? 0) + 0.8));
        if (target) target.glow = 1.6;
        resolve();
      } });
    });
  }

  /** A short glow along a synapse between two neurons (a real link was written). */
  link(a: string, b: string, color: number): void {
    const A = this.neurons.get(a), B = this.neurons.get(b);
    if (!A || !B) return;
    this.pulses.push({ curve: new THREE.LineCurve3(A.pos.clone(), B.pos.clone()), t: 0, speed: 1.6, color: new THREE.Color(color), size: 0.2, tail: 6, done: () => { B.glow = 1.4; } });
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

  /** A slow orbit of the point of view (screensaver): the camera moves, the data never does on its own. */
  setOrbit(on: boolean): void {
    this.controls.autoRotate = on && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.controls.autoRotateSpeed = 0.35;
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
  }

  private readonly proj = new THREE.Vector3();
  private loop = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
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
    for (const l of this.labels) l.el.classList.toggle('hot', (this.heat.get(l.region) ?? 0) > 0.15);
    // impulses
    const p = this.pulseGeo.getAttribute('position') as THREE.BufferAttribute, c = this.pulseGeo.getAttribute('color') as THREE.BufferAttribute, s = this.pulseGeo.getAttribute('size') as THREE.BufferAttribute;
    let k = 0;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pl = this.pulses[i]!; pl.t += dt * pl.speed;
      if (pl.t >= 1) { pl.done?.(); this.pulses.splice(i, 1); continue; }
      for (let j = 0; j < pl.tail && k < this.MAXP; j++) {
        const t = pl.t - j * 0.012; if (t < 0) break;
        const v = pl.curve.getPoint(t); const fade = 1 - j / pl.tail;
        p.setXYZ(k, v.x, v.y, v.z); c.setXYZ(k, pl.color.r * 1.6 * fade, pl.color.g * 1.6 * fade, pl.color.b * 1.6 * fade); s.setX(k, pl.size * (0.4 + 0.6 * fade)); k++;
      }
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

/** A tract travelled backwards. */
class ReversedCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly inner: THREE.Curve<THREE.Vector3>) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 { return this.inner.getPoint(1 - t, target); }
}

/** A tract followed by the last hop from the region hub to one neuron. */
class ChainedCurve extends THREE.Curve<THREE.Vector3> {
  private readonly hop: THREE.LineCurve3;
  constructor(private readonly tract: THREE.Curve<THREE.Vector3>, to: THREE.Vector3) {
    super();
    this.hop = new THREE.LineCurve3(tract.getPoint(1), to.clone());
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return t < 0.8 ? this.tract.getPoint(t / 0.8, target) : this.hop.getPoint((t - 0.8) / 0.2, target);
  }
}
