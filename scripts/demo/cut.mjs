// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright © 2026 Andrea Genovese

/**
 * Turns a recording (record.mjs) into the README animation. The only edit is cutting idle gaps: a frame is kept when
 * it lies near a real event (the service's telemetry, the arrival of the agent's spans, the switch to only-brain) —
 * from PRE seconds before to POST seconds after it — and the kept stretches are joined with a short cross-fade.
 * Frame times are the screencast's own; nothing is sped up, reordered or drawn.
 * Needs ffmpeg and img2webp (libwebp). Usage: node cut.mjs <recording dir> <output.webp>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dir, output] = process.argv.slice(2).map((p) => resolve(p));
if (!dir || !output) throw new Error('usage: node cut.mjs <recording dir> <output.webp>');
const num = (name, d) => Number(process.env[name] ?? d);
const PRE = num('PRE', 0.4), POST = num('POST', 1.5), FADE = num('FADE', 0.3), FPS = num('FPS', 12);
// Lossy WebP; a key frame at least every KMAX frames (lossy delta frames otherwise keep stale blocks during the slow
// change of palette at night).
const WIDTH = num('WIDTH', 1280), QUALITY = num('QUALITY', 36), KMAX = num('KMAX', 8);
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';

const tl = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
const marks = [
  ...tl.events.map((e) => e.t),
  ...tl.steps.filter((s) => s.name.startsWith('span ') || s.name === 'only brain').map((s) => s.t),
].map((t) => t / 1000).sort((a, b) => a - b);
const end = (tl.steps.find((s) => s.name.startsWith('consolidation finished'))?.t ?? tl.steps.at(-1).t) / 1000;

// Stretches to keep: around each event, merged; the first one starts a little earlier (the brain at rest), the last
// one ends shortly after the night is over.
const keep = [];
for (const m of marks) {
  const from = Math.max(0, m - (keep.length ? PRE : 1.5)), to = Math.min(m + POST, end + 0.4);
  const last = keep.at(-1);
  if (last && from <= last[1] + FADE * 2) last[1] = Math.max(last[1], to);
  else keep.push([from, to]);
}
console.log('kept', keep.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join(', '));

// One clip per stretch from the screencast frames, each shown for its real duration.
const work = join(dir, 'cut');
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'png'), { recursive: true });
const frames = tl.frames.map((f) => ({ ...f, t: f.t / 1000 }));
const clips = keep.map(([a, b], i) => {
  const inside = frames.filter((f, j) => f.t < b && (frames[j + 1]?.t ?? Infinity) > a);
  const lines = inside.map((f, j) => {
    const next = Math.min(inside[j + 1]?.t ?? b, b);
    return `file '${join(dir, 'frames', f.file)}'\nduration ${Math.max(0.001, next - Math.max(f.t, a)).toFixed(4)}`;
  });
  lines.push(`file '${join(dir, 'frames', inside.at(-1).file)}'`); // concat demuxer: the last duration needs a following entry
  writeFileSync(join(work, `clip${i}.txt`), lines.join('\n'));
  const out = join(work, `clip${i}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, `clip${i}.txt`),
    '-vf', `fps=30,scale=${WIDTH}:-2:flags=lanczos,format=yuv444p`, '-c:v', 'libx264', '-crf', '8', '-preset', 'veryfast', out]);
  return { out, duration: b - a };
});

// Join with cross-fades, then the animation frames.
const inputs = clips.flatMap((c) => ['-i', c.out]);
let filter = '', label = '[0:v]', offset = 0;
clips.slice(1).forEach((c, i) => {
  offset += clips[i].duration - FADE;
  filter += `${label}[${i + 1}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[x${i}];`;
  label = `[x${i}]`;
});
filter += `${label}fps=${FPS}[out]`;
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', join(work, 'png', 'f%05d.png')]);
const pngs = readdirSync(join(work, 'png')).sort().map((f) => join(work, 'png', f));
const total = pngs.length / FPS;
execFileSync(process.env.IMG2WEBP ?? 'img2webp', ['-loop', '0', '-kmin', String(KMAX - 1), '-kmax', String(KMAX), '-lossy', '-q', String(QUALITY), '-m', '4', '-d', String(Math.round(1000 / FPS)), ...pngs, '-o', output]);
console.log(`${output}: ${pngs.length} frames, ${total.toFixed(1)} s at ${FPS} fps`);
