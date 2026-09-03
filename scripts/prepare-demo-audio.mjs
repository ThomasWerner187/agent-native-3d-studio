// Optional macOS production helper. No speech service, API key or upload.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadDemoPlan, voiceLeadInSeconds } from './demo-plan.mjs';

const planning = process.argv.includes('--plan');
const output = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'scratch-submission-media');
const script = loadDemoPlan();
if (planning) {
  console.log(JSON.stringify({ plan_only: true, provider: 'macOS rehearsal', voice: process.env.DEMO_VOICE || 'Samantha', duration: script.duration, shots: script.shots }, null, 2));
  process.exit(0);
}
mkdirSync(output, { recursive: true });
const timeline = [];
let start = 0;
for (const segment of script.segments) {
  const text = join(output, `${segment.id}.txt`);
  const audio = join(output, `${segment.id}.aiff`);
  writeFileSync(text, (segment.tts_narration || segment.narration).replaceAll('WebMCP', 'Web M C P').replaceAll('three.js', 'three dot J S'));
  execFileSync('say', ['-v', process.env.DEMO_VOICE || 'Samantha', '-r', '155', '-f', text, '-o', audio]);
  const audioDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audio], { encoding: 'utf8' }).trim());
  const duration = segment.duration_seconds;
  if (!Number.isFinite(audioDuration) || audioDuration <= 0 || audioDuration + voiceLeadInSeconds > duration) throw new Error(`${segment.id}: narration does not fit its ${duration}s shot. Shorten it; the shared timeline and audio speed are unchanged.`);
  timeline.push({ ...segment, start, duration, audio_duration: audioDuration, audio });
  start += duration;
}
if (start >= 180) throw new Error(`Narration exceeds the contest limit: ${start}s. Shorten the script.`);
writeFileSync(join(output, 'timeline.json'), JSON.stringify({ story_id: script.story_id, script_fingerprint: script.script_fingerprint, duration: start, voice: process.env.DEMO_VOICE || 'Samantha', segments: timeline }, null, 2));
console.log(`Prepared ${timeline.length} local narration tracks; timeline ${start}s.`);
