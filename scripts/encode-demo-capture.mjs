// Encode timestamped native-browser screencast frames without changing their speed.
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve('scratch-submission-media');
const durations = { opening: 12, composition: 36, state: 16, next: 24, endless: 14, human: 14, closing: 19 };
const selected = process.argv.slice(2);
for (const [name, duration] of Object.entries(durations)) {
  if (selected.length && !selected.includes(name)) continue;
  const frames = JSON.parse(await readFile(resolve(root, name, 'frames.json'), 'utf8'));
  if (frames.length < duration * 10) throw Error(`${name}: insufficient captured frames`);
  const first = frames[0].time;
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const next = frames[i + 1];
    const delta = next ? next.time - frame.time : duration - (frame.time - first);
    if (!(delta > 0)) continue;
    lines.push(`file ${quote(resolve(root, name, frame.file))}`, `duration ${delta.toFixed(6)}`);
  }
  lines.push(`file ${quote(resolve(root, name, frames.at(-1).file))}`);
  const manifest = resolve(root, `${name}.ffconcat`);
  await writeFile(manifest, `${lines.join('\n')}\n`);
  const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', manifest,
    '-vf', 'fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
    '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', '-an', resolve(root, `${name}.mp4`)], { stdio: 'inherit' });
  if (encoded.status !== 0) throw Error(`${name}: ffmpeg failed`);
  console.log(`${name}: ${frames.length} genuine frames, ${duration}s`);
}
