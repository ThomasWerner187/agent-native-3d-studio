// Optional macOS production helper. No speech service, API key or upload.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const output = resolve(process.argv[2] || 'scratch-submission-media');
mkdirSync(output, { recursive: true });
const script = JSON.parse(readFileSync('docs/video-narration.json', 'utf8'));
const timeline = [];
let start = 0;
for (const segment of script.segments) {
  const text = join(output, `${segment.id}.txt`);
  const audio = join(output, `${segment.id}.aiff`);
  writeFileSync(text, segment.narration.replaceAll('WebMCP', 'Web M C P').replaceAll('three.js', 'three dot J S'));
  execFileSync('say', ['-v', process.env.DEMO_VOICE || 'Samantha', '-r', '155', '-f', text, '-o', audio]);
  const audioDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audio], { encoding: 'utf8' }).trim());
  const duration = Math.max(segment.duration_seconds, Math.ceil(audioDuration + 1.2));
  timeline.push({ ...segment, start, duration, audio_duration: audioDuration, audio });
  start += duration;
}
if (start >= 180) throw new Error(`Narration exceeds the contest limit: ${start}s. Shorten the script.`);
writeFileSync(join(output, 'timeline.json'), JSON.stringify({ duration: start, voice: process.env.DEMO_VOICE || 'Samantha', segments: timeline }, null, 2));
console.log(`Prepared ${timeline.length} local narration tracks; timeline ${start}s.`);
