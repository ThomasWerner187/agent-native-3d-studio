// Paid production helper. --plan is read-only and never calls ElevenLabs.
// Only ELEVENLABS_API_KEY from the environment supplies credentials.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemoPlan, voiceLeadInSeconds } from './demo-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'scratch-submission-media');
const assets = join(output, 'elevenlabs'); // Ignored production assets, never committed.
const script = loadDemoPlan();
const ffprobe = process.env.DEMO_FFPROBE || 'ffprobe';
const expectedIds = script.segments.map(segment => segment.id);
const defaultVoiceId = script.voice.voice_id;
const outputFormat = 'mp3_44100_128';
const voiceSettings = { stability: 0.5, similarity_boost: 0.75, style: 0 };
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;

function argumentsFromCli() {
  const options = { plan: false, only: null, help: false };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan') options.plan = true;
    else if (args[i] === '--help' || args[i] === '-h') options.help = true;
    else if (args[i] === '--only' && !options.only && expectedIds.includes(args[i + 1])) options.only = args[++i];
    else throw new Error(`Unknown or invalid argument: ${args[i]}. Use --help.`);
  }
  return options;
}

function atomicWrite(path, data) {
  const temp = `${path}.tmp.${process.pid}`;
  writeFileSync(temp, data);
  renameSync(temp, path);
}

function durationOf(audio) {
  const duration = Number(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audio], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
  }).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Cannot measure valid audio duration: ${audio}`);
  return duration;
}

function requireFit(item, duration) {
  if (duration > item.segment.duration_seconds - voiceLeadInSeconds) {
    throw new Error(`${item.segment.id}: ${duration.toFixed(3)}s audio exceeds its ${(item.segment.duration_seconds - voiceLeadInSeconds).toFixed(3)}s limit by ${(duration - item.segment.duration_seconds + voiceLeadInSeconds).toFixed(3)}s. Cached audio is retained. Shorten tts_narration/narration and run --only ${item.segment.id}; no retry or speed change was applied.`);
  }
}

function readCache(item) {
  const paths = [item.audio, item.alignment, item.provenance];
  const found = paths.filter(existsSync);
  if (!found.length) return null;
  if (found.length !== paths.length) throw new Error(`${item.segment.id}: incomplete cached assets at ${item.prefix}. Inspect them before any paid regeneration.`);
  const metadata = JSON.parse(readFileSync(item.provenance, 'utf8'));
  if (metadata.fingerprint !== item.fingerprint || metadata.audio_sha256 !== hash(readFileSync(item.audio)) || metadata.alignment_sha256 !== hash(readFileSync(item.alignment))) {
    throw new Error(`${item.segment.id}: cached asset fingerprint/checksum mismatch. No paid regeneration attempted.`);
  }
  return metadata;
}

async function generate(item, key) {
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(item.voiceId)}/with-timestamps?output_format=${outputFormat}`;
  console.log(`Generating ${item.segment.id} once with ${item.voiceId} / ${item.request.model_id}…`);
  // Normal Node TLS verification; no automatic retries after an uncertain/failed request.
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(item.request),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error(`${item.segment.id}: ElevenLabs request failed or timed out. Its billing outcome may be uncertain; no automatic retry was attempted.`);
  }
  if (!response.ok) {
    // Do not log response bodies or request headers; they may contain credentials.
    throw new Error(`${item.segment.id}: ElevenLabs returned HTTP ${response.status}. No automatic retry was attempted.`);
  }
  const result = await response.json();
  if (typeof result.audio_base64 !== 'string' || !result.audio_base64.length || result.audio_base64.length > 14_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio_base64)) {
    throw new Error(`${item.segment.id}: ElevenLabs returned invalid or oversized audio. No retry was attempted.`);
  }
  const audio = Buffer.from(result.audio_base64, 'base64');
  const alignment = json({ text: item.request.text, alignment: result.alignment ?? null, normalized_alignment: result.normalized_alignment ?? null });
  const metadata = {
    provider: 'ElevenLabs', generated_at: new Date().toISOString(),
    fingerprint: item.fingerprint, voice_id: item.voiceId, model_id: item.request.model_id,
    output_format: outputFormat, request: item.request,
    request_id: response.headers.get('request-id') || response.headers.get('x-request-id'),
    audio_sha256: hash(audio), alignment_sha256: hash(alignment), audio_duration: null,
  };
  // Persist even an overlong take before probing, so repeated runs never buy it again.
  atomicWrite(item.audio, audio);
  atomicWrite(item.alignment, alignment);
  atomicWrite(item.provenance, json(metadata));
  return metadata;
}

function validateAlignment(item) {
  const value = JSON.parse(readFileSync(item.alignment, 'utf8'));
  const blocks = [value.normalized_alignment, value.alignment].filter(Boolean);
  const valid = blocks.some(block => Array.isArray(block.characters) && block.characters.length > 0 &&
    Array.isArray(block.character_start_times_seconds) && Array.isArray(block.character_end_times_seconds) &&
    block.character_start_times_seconds.length === block.characters.length && block.character_end_times_seconds.length === block.characters.length &&
    block.characters.every((character, i) => typeof character === 'string' &&
      Number.isFinite(block.character_start_times_seconds[i]) && block.character_start_times_seconds[i] >= 0 &&
      Number.isFinite(block.character_end_times_seconds[i]) && block.character_end_times_seconds[i] >= block.character_start_times_seconds[i]));
  if (value.text !== item.request.text || !valid) throw new Error(`${item.segment.id}: missing or invalid character alignment. Cached take retained; no automatic retry.`);
}

async function main() {
  const options = argumentsFromCli();
  if (options.help) {
    console.log('Usage: npm run audio:elevenlabs -- [--plan] [--only SEGMENT_ID]\n\n--plan reads the script/cache only; no credentials, API calls or file writes.\n--only generates one segment, then writes timeline.json if all eight matching takes exist.\n\nGeneration requires ELEVENLABS_API_KEY. Optional ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID and DEMO_FFPROBE overrides.\nAssets: scratch-submission-media/elevenlabs/; complete timeline: scratch-submission-media/timeline.json.\nNo automatic API retries or audio speed changes.');
    return;
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID || defaultVoiceId;
  const model = process.env.ELEVENLABS_MODEL_ID || script.voice.model_id;
  if (!/^[A-Za-z0-9_-]+$/.test(voiceId) || !/^[A-Za-z0-9_-]+$/.test(model)) throw new Error('Invalid ElevenLabs voice/model identifier.');
  const voice = voiceId === defaultVoiceId ? script.voice.name : voiceId;
  let cursor = 0;
  const items = script.segments.map((segment, i) => {
    if (segment.id !== expectedIds[i] || !Number.isFinite(segment.duration_seconds) || segment.duration_seconds <= voiceLeadInSeconds || typeof segment.narration !== 'string' || !segment.narration.trim() ||
      (segment.tts_narration !== undefined && (typeof segment.tts_narration !== 'string' || !segment.tts_narration.trim()))) throw new Error(`Invalid narration segment ${i + 1}.`);
    const request = { text: segment.tts_narration ?? segment.narration, model_id: model, voice_settings: voiceSettings };
    const fingerprint = hash(JSON.stringify({ format: 1, provider: 'ElevenLabs', voice_id: voiceId, output_format: outputFormat, request }));
    const prefix = join(assets, `${segment.id}-${fingerprint}`);
    const item = { segment, start: cursor, voiceId, request, fingerprint, prefix, audio: `${prefix}.mp3`, alignment: `${prefix}.alignment.json`, provenance: `${prefix}.provenance.json` };
    cursor += segment.duration_seconds;
    return item;
  });
  if (cursor !== script.duration) throw new Error(`Narration slots total ${cursor}s; expected ${script.duration}s.`);
  const selected = items.filter(item => !options.only || item.segment.id === options.only);
  if (options.plan) {
    console.log(json({ plan_only: true, provider: 'ElevenLabs', voice, voice_id: voiceId, model_id: model, voice_settings: voiceSettings, output_format: outputFormat, duration: cursor, output: assets,
      segments: selected.map(item => {
        const cached = readCache(item);
        return { id: item.segment.id, start: item.start, duration: item.segment.duration_seconds, max_audio_duration: item.segment.duration_seconds - voiceLeadInSeconds, words: item.request.text.trim().split(/\s+/).length, spoken_text: item.request.text, fingerprint: item.fingerprint, cached: Boolean(cached), cached_audio_duration: cached?.audio_duration ?? null };
      }),
    }));
    return;
  }
  // Fail before spending if the local measurement tool or a selected cache is broken.
  execFileSync(ffprobe, ['-version'], { stdio: 'ignore', timeout: 10_000 });
  const caches = new Map(selected.map(item => [item.fingerprint, readCache(item)]));
  const needsApi = selected.some(item => !caches.get(item.fingerprint));
  const key = process.env.ELEVENLABS_API_KEY;
  if (needsApi && !key) throw new Error('Set ELEVENLABS_API_KEY in the environment before generation. --plan requires no key.');
  mkdirSync(assets, { recursive: true });
  for (const item of selected) {
    const metadata = caches.get(item.fingerprint) || await generate(item, key);
    validateAlignment(item);
    const duration = durationOf(item.audio);
    atomicWrite(item.provenance, json({ ...metadata, audio_duration: duration }));
    requireFit(item, duration);
    console.log(`${item.segment.id}: ${duration.toFixed(3)}s / ${(item.segment.duration_seconds - voiceLeadInSeconds).toFixed(3)}s allowed${caches.get(item.fingerprint) ? ' (cached; no API call)' : ''}.`);
  }
  const missing = items.filter(item => !readCache(item));
  if (missing.length) {
    console.log(`Selected segments ready. timeline.json was not updated; matching audio is still missing for: ${missing.map(item => item.segment.id).join(', ')}.`);
    return;
  }
  const segments = items.map(item => {
    validateAlignment(item);
    const duration = durationOf(item.audio);
    requireFit(item, duration);
    return { ...item.segment, start: item.start, duration: item.segment.duration_seconds, audio_duration: duration, spoken_text: item.request.text, audio: item.audio, alignment: item.alignment, provenance: item.provenance, fingerprint: item.fingerprint };
  });
  atomicWrite(join(output, 'timeline.json'), json({ story_id: script.story_id, script_fingerprint: script.script_fingerprint, duration: cursor, voice, narration: { provider: 'ElevenLabs', voice, voiceId, model }, segments }));
  console.log(`Prepared eight ElevenLabs narration tracks, original speed, fixed ${cursor}s timeline: ${join(output, 'timeline.json')}`);
}

main().catch(error => {
  // Defense in depth: never expose the env credential even through unexpected errors.
  const key = process.env.ELEVENLABS_API_KEY;
  console.error(key ? String(error.message).replaceAll(key, '[REDACTED]') : String(error.message));
  process.exitCode = 1;
});
