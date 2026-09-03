// Encode timestamped native-browser screencast frames without changing their speed.
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadDemoPlan } from './demo-plan.mjs';
import { clipTime, validateCaptureTimeline } from './demo-evidence.mjs';

const root = resolve('scratch-submission-media');
const plan = loadDemoPlan();
const selected = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
if (selected.some(id => !plan.shots.some(shot => shot.id === id))) throw new Error('Unknown capture shot. Use the IDs from docs/video-narration.json.');
if (process.argv.includes('--plan')) {
  console.log(JSON.stringify({ plan_only: true, duration: plan.duration, shots: plan.shots.filter(shot => !selected.length || selected.includes(shot.id)), capture: resolve(root, 'native-capture.json') }, null, 2));
  process.exit(0);
}
const capture = JSON.parse(await readFile(resolve(root, 'native-capture.json'), 'utf8'));
const clips = validateCaptureTimeline(capture, plan);
const width = capture.layout?.width ?? 1280;
const height = capture.layout?.height ?? 720;
if (width !== 1280 || height !== 720 || (capture.layout?.mode === 'demo-browser' &&
  (capture.layout.sidebar_width !== 320 || capture.layout.bar_height !== 42))) {
  throw new Error('Capture layout must be 1280×720; demo-browser uses a 320px sidebar and 42px bar.');
}
for (const { id: name, duration } of plan.shots) {
  if (selected.length && !selected.includes(name)) continue;
  const clip = clips.find(item => item.id === name);
  const source = JSON.parse(await readFile(resolve(root, name, 'frames.json'), 'utf8'));
  if (!Array.isArray(source) || source.some((frame, i) => !Number.isFinite(frame.time) || typeof frame.file !== 'string' || (i && frame.time <= source[i - 1].time))) throw Error(`${name}: invalid source frame timestamps`);
  // Frame times share the original capture clock. Remove only declared waiting
  // intervals; all retained source time continues at its original speed.
  const frames = source.filter(frame => frame.time >= clip.source_start_seconds && frame.time < clip.source_end_seconds &&
    !clip.cuts.some(cut => frame.time >= cut.start && frame.time < cut.end))
    .map(frame => ({ ...frame, editedTime: clipTime(clip, frame.time) }));
  if (frames.length < duration * 10) throw Error(`${name}: insufficient captured frames`);
  if (frames[0].editedTime > 0.12 || duration - frames.at(-1).editedTime > 0.2) throw Error(`${name}: source frames do not cover the full shot`);
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const next = frames[i + 1];
    const delta = next ? next.editedTime - frame.editedTime : duration - frame.editedTime;
    if (!(delta > 0)) continue;
    lines.push(`file ${quote(resolve(root, name, frame.file))}`, `duration ${delta.toFixed(6)}`);
  }
  lines.push(`file ${quote(resolve(root, name, frames.at(-1).file))}`);
  const manifest = resolve(root, `${name}.ffconcat`);
  await writeFile(manifest, `${lines.join('\n')}\n`);
  const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', manifest,
    '-vf', `fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', '-an', resolve(root, `${name}.mp4`)], { stdio: 'inherit' });
  if (encoded.status !== 0) throw Error(`${name}: ffmpeg failed`);
  console.log(`${name}: ${frames.length} genuine frames, ${duration}s`);
}
