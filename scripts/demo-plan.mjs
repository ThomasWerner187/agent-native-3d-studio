// Shared source of truth for narration slots, capture clips and export timing.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const defaultMediaDirectory = join(projectRoot, 'scratch-submission-media');
export const voiceLeadInSeconds = 0.5;

export function loadDemoPlan() {
  const source = JSON.parse(readFileSync(join(projectRoot, 'docs/video-narration.json'), 'utf8'));
  if (source.story_id !== 'zen-co-creation-v2' || !Array.isArray(source.segments) || source.segments.length !== 8) {
    throw new Error('Expected the eight-shot zen-co-creation-v2 story.');
  }
  if (!Number.isFinite(source.target_duration_seconds) || source.target_duration_seconds < 135 || source.target_duration_seconds >= 180) {
    throw new Error('The collaborative film must last at least 135 seconds and stay under three minutes.');
  }
  let cursor = 0;
  const ids = new Set();
  const segments = source.segments.map(segment => {
    if (!/^[a-z][a-z0-9_]*$/.test(segment.id) || ids.has(segment.id) || !Number.isFinite(segment.duration_seconds) || segment.duration_seconds <= voiceLeadInSeconds ||
      !['title', 'narration', 'visual'].every(key => typeof segment[key] === 'string' && segment[key].trim()) ||
      (segment.tts_narration !== undefined && (typeof segment.tts_narration !== 'string' || !segment.tts_narration.trim()))) {
      throw new Error(`Invalid or repeated shot: ${segment.id}`);
    }
    ids.add(segment.id);
    const prepared = { ...segment, start: cursor, duration: segment.duration_seconds };
    cursor += segment.duration_seconds;
    return prepared;
  });
  if (cursor !== source.target_duration_seconds) throw new Error(`Shot durations total ${cursor}s, expected ${source.target_duration_seconds}s.`);
  const scriptFingerprint = createHash('sha256').update(JSON.stringify({ story_id: source.story_id, segments, voice: source.voice })).digest('hex');
  return { ...source, duration: cursor, segments, script_fingerprint: scriptFingerprint, shots: segments.map(({ id, start, duration }) => ({ id, start, duration })) };
}

export function timelineMatchesPlan(timeline, plan) {
  return timeline.story_id === plan.story_id && timeline.script_fingerprint === plan.script_fingerprint && timeline.duration === plan.duration &&
    timeline.segments?.length === plan.segments.length && timeline.segments.every((segment, i) => {
      const expected = plan.segments[i];
      return segment.id === expected.id && segment.start === expected.start && segment.duration === expected.duration && segment.narration === expected.narration;
    });
}
