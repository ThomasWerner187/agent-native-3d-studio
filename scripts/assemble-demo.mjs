/** Assemble the reviewed, narrated demo from real browser captures. No upload or external service. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadDemoPlan, timelineMatchesPlan, voiceLeadInSeconds } from './demo-plan.mjs';
import { clipTime, validateNativeCapture } from './demo-evidence.mjs';

const argv = process.argv.slice(2);
const output = resolve(argv.find(arg => !arg.startsWith('--')) || 'scratch-submission-media');
const checking = argv.includes('--check');
const planning = argv.includes('--plan');
const captionsOnly = argv.includes('--captions');
const audioOnly = argv.includes('--audio-only');
const ffmpeg = process.env.DEMO_FFMPEG || 'ffmpeg';
const ffprobe = process.env.DEMO_FFPROBE || 'ffprobe';
const width = 1280, height = 720;
const assets = join(output, 'assembly-assets');
const plan = loadDemoPlan();
const shots = plan.shots;
const timelinePath = join(output, 'timeline.json');
if (!existsSync(timelinePath)) {
  if (!planning) throw new Error('Missing current narration timeline. Run npm run audio:elevenlabs after production authorization.');
  console.log(JSON.stringify({ plan_only: true, script_valid: true, story_id: plan.story_id, duration: plan.duration, shots, narration_ready: false, native_capture_ready: false, next: 'Generate the approved narration, then capture the native shared-scene session.' }, null, 2));
  process.exit(0);
}
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const music = resolve(process.env.DEMO_MUSIC_PATH || 'public/music/aurora-drift.mp3');
const voiceOffset = voiceLeadInSeconds;
const musicLoudness = -23;
const ducking = { threshold: 0.04, ratio: 3, attack_ms: 700, release_ms: 1000, knee: 4, detection: 'rms' };
const duckingFilter = `sidechaincompress=threshold=${ducking.threshold}:ratio=${ducking.ratio}:attack=${ducking.attack_ms}:release=${ducking.release_ms}:knee=${ducking.knee}:detection=${ducking.detection}:link=average:makeup=1`;
const narration = narrationMetadata();

function narrationMetadata() {
  const source = timeline.narration || (typeof timeline.voice === 'object' ? timeline.voice : {});
  const metadata = {
    provider: source.provider || 'macOS',
    voice: source.voice || source.name || timeline.voice,
    voice_id: source.voiceId || source.voice_id || null,
    model: source.model || source.model_id || null,
  };
  if (typeof metadata.voice !== 'string' || !metadata.voice) throw new Error('Timeline must identify the narration voice.');
  if (metadata.provider === 'ElevenLabs' && (!metadata.voice_id || !metadata.model)) {
    throw new Error('ElevenLabs narration requires its actual voice ID and model in timeline.narration.');
  }
  return metadata;
}

function run(executable, args, timeout = 600_000) {
  try {
    return execFileSync(executable, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout });
  } catch (error) {
    const details = typeof error.stderr === 'string' ? error.stderr.slice(-6000) : error.message;
    throw new Error(`${basename(executable)} failed: ${details}`);
  }
}

function probe(file) {
  return JSON.parse(run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,width,height,avg_frame_rate,duration', '-of', 'json', file], 30_000));
}

function measureAudio(file) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect,loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json', '-f', 'null', '-'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120_000,
  });
  if (result.error || result.status !== 0) throw new Error(`Audio measurement failed: ${result.error?.message || result.stderr?.slice(-3000)}`);
  const report = result.stderr;
  const loudnessJson = report.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  if (!loudnessJson) throw new Error('ffmpeg did not return the final mix loudness measurements.');
  const loudness = JSON.parse(loudnessJson);
  const metrics = {
    mean_volume_dbfs: Number(report.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1]),
    peak_volume_dbfs: Number(report.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]),
    integrated_lufs: Number(loudness.input_i),
    true_peak_dbtp: Number(loudness.input_tp),
    loudness_range_lu: Number(loudness.input_lra),
  };
  if (Object.values(metrics).some(value => !Number.isFinite(value))) throw new Error('Final mix loudness measurements are missing or non-finite.');
  return metrics;
}

function validateTimeline() {
  if (!timelineMatchesPlan(timeline, plan)) throw new Error('Narration timeline belongs to an earlier script. Prepare the current aligned takes before exporting.');
  let cursor = 0;
  for (let i = 0; i < timeline.segments.length; i++) {
    const segment = timeline.segments[i];
    if (segment.id !== plan.segments[i].id || segment.start !== cursor || !(segment.duration > 0) || !segment.narration || !segment.audio) {
      throw new Error(`Invalid narration segment ${i}; regenerate it with npm run audio:elevenlabs.`);
    }
    if (!existsSync(segment.audio)) throw new Error(`Missing narration: ${segment.audio}`);
    const actual = Number(probe(segment.audio).format.duration);
    if (!Number.isFinite(actual) || actual <= 0 || actual + voiceOffset > segment.duration) {
      throw new Error(`Voiceover ${segment.id}: measured ${actual}s plus ${voiceOffset}s lead-in does not fit its ${segment.duration}s window. Shorten or regenerate the narration; audio is never sped up.`);
    }
    segment.audio_duration = actual;
    const captionData = segmentCaptions(segment);
    segment.caption_cues = captionData.cues;
    segment.caption_timing = captionData.timing;
    cursor += segment.duration;
  }
  if (cursor !== plan.duration) throw new Error(`Narration timeline totals ${cursor} seconds, expected ${plan.duration}.`);
  if (!existsSync(music)) throw new Error(`Missing music: ${music}`);
}

validateTimeline();
if (planning) {
  console.log(JSON.stringify({ plan_only: true, script_valid: true, narration_ready: true, output, duration: timeline.duration, shots, music, narration, native_capture_ready: false, capture_note: 'Final rendering independently validates native continuity and the recorded source clips.', segments: timeline.segments.map(segment => ({ id: segment.id, start: segment.start, duration: segment.duration, audio_duration: segment.audio_duration, remaining_seconds: Number((segment.duration - voiceOffset - segment.audio_duration).toFixed(3)), captions: segment.caption_cues.length, caption_timing: segment.caption_timing })), transcript: join(output, 'native-capture.json') }, null, 2));
  process.exit(0);
}
mkdirSync(assets, { recursive: true });

// Homebrew's installed ffmpeg lacks drawtext/libass. AppKit renders transparent PNGs;
// ffmpeg handles only image compositing, media timing and encoding. No new dependencies.
const renderer = String.raw`
import AppKit
import CoreText
import Foundation

let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let document = try JSONSerialization.jsonObject(with: data) as! [String: Any]
for fontPath in document["fonts"] as! [String] {
  CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: fontPath) as CFURL, .process, nil)
}
func font(_ size: CGFloat, mono: Bool = false, bold: Bool = false) -> NSFont {
  if mono { return NSFont.monospacedSystemFont(ofSize: size, weight: .regular) }
  return NSFont(name: bold ? "Manrope-SemiBold" : "DMSans-Regular", size: size)
    ?? NSFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular)
}
func text(_ string: String, rect: NSRect, size: CGFloat, color: NSColor = .white,
          mono: Bool = false, bold: Bool = false, center: Bool = false) {
  let p = NSMutableParagraphStyle()
  p.alignment = center ? .center : .left
  p.lineBreakMode = .byWordWrapping
  p.lineSpacing = 3
  let attrs: [NSAttributedString.Key: Any] = [.font: font(size, mono: mono, bold: bold), .foregroundColor: color, .paragraphStyle: p]
  (string as NSString).draw(in: rect, withAttributes: attrs)
}
for job in document["jobs"] as! [[String: Any]] {
  try autoreleasepool {
    let w = job["width"] as! Int, h = job["height"] as! Int
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h,
      bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
      colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let bounds = NSRect(x: 0, y: 0, width: w, height: h)
    NSColor.clear.setFill(); bounds.fill(using: .copy)
    let kind = job["kind"] as! String
    if kind == "caption" {
      NSColor(calibratedWhite: 0.025, alpha: 0.76).setFill()
      NSBezierPath(roundedRect: bounds, xRadius: 13, yRadius: 13).fill()
      text(job["body"] as! String, rect: NSRect(x: 20, y: 8, width: w - 40, height: h - 15), size: 27, bold: true, center: true)
    } else if kind == "notice" {
      NSColor(calibratedRed: 0.026, green: 0.055, blue: 0.077, alpha: 0.9).setFill()
      NSBezierPath(roundedRect: bounds, xRadius: 10, yRadius: 10).fill()
      text(job["title"] as! String, rect: NSRect(x: 12, y: 25, width: w - 24, height: 20), size: 16, bold: true, center: true)
      text(job["label"] as! String, rect: NSRect(x: 12, y: 8, width: w - 24, height: 15), size: 10, color: NSColor(calibratedWhite: 0.8, alpha: 1), center: true)
    } else if kind == "title" {
      NSColor(calibratedRed: 0.026, green: 0.055, blue: 0.077, alpha: 0.88).setFill()
      NSBezierPath(roundedRect: bounds, xRadius: 14, yRadius: 14).fill()
      NSColor(calibratedRed: 0.61, green: 0.88, blue: 0.80, alpha: 1).setFill()
      NSBezierPath(roundedRect: NSRect(x: 0, y: 12, width: 3, height: h - 24), xRadius: 1, yRadius: 1).fill()
      text(job["title"] as! String, rect: NSRect(x: 20, y: 31, width: w - 40, height: 32), size: 25, bold: true)
      text(job["label"] as! String, rect: NSRect(x: 20, y: 9, width: w - 40, height: 22), size: 13, color: NSColor(calibratedWhite: 0.78, alpha: 1))
    } else {
      NSColor(calibratedRed: 0.025, green: 0.048, blue: 0.065, alpha: 0.94).setFill()
      NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 18, yRadius: 18).fill()
      NSColor(calibratedWhite: 0.6, alpha: 0.18).setStroke()
      NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 18, yRadius: 18).stroke()
      text(job["label"] as! String, rect: NSRect(x: 24, y: h - 37, width: w - 48, height: 21), size: 12, color: NSColor(calibratedRed: 0.61, green: 0.88, blue: 0.80, alpha: 1), bold: true)
      text(job["title"] as! String, rect: NSRect(x: 24, y: h - 73, width: w - 48, height: 30), size: 22, bold: true)
      let bodySize = job["fontSize"] as? Int ?? 18
      let lineHeight = bodySize + 6
      for (index, line) in (job["body"] as! String).components(separatedBy: "\n").enumerated() {
        text(line, rect: NSRect(x: 24, y: h - 94 - (index + 1) * lineHeight, width: w - 48, height: lineHeight), size: CGFloat(bodySize), color: NSColor(calibratedWhite: 0.91, alpha: 1), mono: true)
      }
    }
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: job["path"] as! String))
  }
}
`;

const jobs = [];
const overlays = new Map(shots.map(shot => [shot.id, []]));
function addAsset(name, properties, shotId, start, end, x, y) {
  const file = join(assets, `${name}.png`);
  jobs.push({ ...properties, path: file });
  if (shotId) overlays.get(shotId).push({ file, start, end, x, y });
  return file;
}

function demoBrowserLayout(capture) {
  if (capture?.layout?.mode !== 'demo-browser') return false;
  const layout = capture.layout;
  if (layout.width !== width || layout.height !== height || layout.sidebar_width !== 320 || layout.bar_height !== 42) {
    throw new Error('Demo-browser capture requires the recorded 1280×720 layout, 320px sidebar and 42px bar.');
  }
  const states = capture.presentation;
  const first = capture.clips[0].source_start_seconds;
  const last = capture.clips.at(-1).source_end_seconds;
  if (!Array.isArray(states) || !states.length || states[0].source_seconds > first || states.some((state, index) =>
    !Number.isFinite(state.source_seconds) || state.source_seconds < 0 || state.source_seconds > last ||
    typeof state.sidebar_open !== 'boolean' || (index && state.source_seconds <= states[index - 1].source_seconds))) {
    throw new Error('Demo-browser capture needs an initial observed sidebar state and chronological presentation changes on the source clock.');
  }
  return true;
}

function sidebarIntervals(capture, shot) {
  const clip = capture.clips.find(item => item.id === shot.id);
  const changes = capture.presentation;
  let open = changes.findLast(state => state.source_seconds <= clip.source_start_seconds).sidebar_open;
  let cursor = 0;
  const intervals = [];
  for (const state of changes) {
    if (state.source_seconds <= clip.source_start_seconds || state.source_seconds >= clip.source_end_seconds) continue;
    // A state change during a declared recording gap takes effect at the next
    // retained frame. No video or transition is manufactured for the gap.
    const at = clipTime(clip, state.source_seconds);
    if (at > cursor) intervals.push({ start: cursor, end: at, sidebar_open: open });
    cursor = at;
    open = state.sidebar_open;
  }
  if (cursor < shot.duration) intervals.push({ start: cursor, end: shot.duration, sidebar_open: open });
  return intervals;
}

function addCaptionAssets(capture = null) {
  const demoBrowser = demoBrowserLayout(capture);
  if (!demoBrowser) addAsset('title-' + shots[0].id, {
    kind: 'title', width: 550, height: 77,
    title: 'A moment, built together', label: 'AGENT-NATIVE 3D SCENE STUDIO · WEBMCP',
  }, shots[0].id, 0.15, 3.2, 34, 525);
  for (const shot of shots) {
    const intervals = demoBrowser ? sidebarIntervals(capture, shot) : [{ start: 0, end: shot.duration, sidebar_open: false }];
    for (const cue of cues.filter(item => item.shot_id === shot.id)) {
      intervals.forEach((interval, index) => {
        const start = Math.max(cue.start - shot.start, interval.start);
        const end = Math.min(cue.end - shot.start, interval.end);
        if (end <= start) return;
        const sidebarOpen = demoBrowser && interval.sidebar_open;
        addAsset(`${cue.asset_id}-${index}`, {
          kind: 'caption', width: sidebarOpen ? 880 : 1040,
          height: demoBrowser ? 76 : 77, body: cue.text,
        }, shot.id, start, end, sidebarOpen ? 40 : 120, 620);
      });
    }
  }
  return demoBrowser;
}

function wrap(text, max = 50) {
  const lines = [];
  for (const input of String(text).split('\n')) {
    let line = '';
    // JSON tool recipes contain long tokens without spaces. Wrap those too so
    // the PNG height matches the lines AppKit will draw, rather than clipping.
    const words = input.split(/\s+/).flatMap(word => word.match(new RegExp(`.{1,${max}}`, 'gu')) || ['']);
    for (const word of words) {
      if (line && line.length + word.length + 1 > max) { lines.push(line); line = ''; }
      line += (line ? ' ' : '') + word;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function subtitleChunks(text) {
  const words = text.trim().split(/\s+/), chunks = [];
  let chunk = [], from = 0;
  for (let i = 0; i < words.length; i++) {
    chunk.push(words[i]);
    if (chunk.length >= 8 || chunk.join(' ').length >= 53 || (chunk.length >= 4 && /[.!?;]$/.test(words[i])) || i === words.length - 1) {
      chunks.push({ text: wrap(chunk.join(' '), 59), from, to: i + 1 });
      from = i + 1; chunk = [];
    }
  }
  if (chunks.length > 1 && chunks.at(-1).to - chunks.at(-1).from === 1) {
    const last = chunks.pop(), previous = chunks.at(-1);
    previous.text = wrap(`${previous.text.replaceAll('\n', ' ')} ${last.text}`, 59);
    previous.to = last.to;
  }
  return { words: words.length, chunks };
}

function canonicalCharacters(text) {
  return Array.from(String(text).normalize('NFKD').toLowerCase()).filter(character => /[\p{L}\p{N}]/u.test(character)).join('');
}

function segmentCaptions(segment) {
  const chunks = subtitleChunks(segment.narration);
  if (!segment.alignment) {
    if (narration.provider === 'ElevenLabs') throw new Error(`Missing ElevenLabs character alignment for ${segment.id}; refusing estimated captions.`);
    return {
      timing: 'Approximate word timing from measured per-segment narration duration.',
      cues: chunks.chunks.map(chunk => ({ text: chunk.text, start: segment.audio_duration * chunk.from / chunks.words, end: segment.audio_duration * chunk.to / chunks.words })),
    };
  }
  const document = JSON.parse(readFileSync(segment.alignment, 'utf8'));
  const words = segment.narration.trim().split(/\s+/);
  const offsets = [0];
  for (const word of words) offsets.push(offsets.at(-1) + canonicalCharacters(word).length);
  const expected = canonicalCharacters(segment.narration);
  const candidates = [
    ['normalized_alignment', document.normalized_alignment],
    ['alignment', document.alignment || (document.characters ? document : null)],
  ];
  const failures = [];
  for (const [source, alignment] of candidates) {
    if (!alignment) continue;
    const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
    if (!Array.isArray(characters) || !characters.length || !Array.isArray(starts) || !Array.isArray(ends) || starts.length !== characters.length || ends.length !== characters.length) {
      failures.push(`${source}: incomplete character arrays`); continue;
    }
    const mapped = [];
    // v3 returns alignment entries for non-spoken direction tags too. Keep
    // the provider's real word timestamps and exclude only bracketed tags
    // present in the submitted TTS text; visible subtitles use plain narration.
    const directionTags = new Set((segment.spoken_text || '').match(/\[[^\]]+\]/g) || []);
    const rawText = characters.join('');
    const omittedIndexes = new Set();
    for (const match of rawText.matchAll(/\[[^\]]+\]/g)) {
      if (!directionTags.has(match[0])) continue;
      for (let at = match.index; at < match.index + match[0].length; at++) omittedIndexes.add(at);
    }
    let characterOffset = 0;
    let previousStart = 0, previousEnd = 0, invalid = false;
    for (let i = 0; i < characters.length; i++) {
      if (typeof characters[i] !== 'string' || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < previousStart || ends[i] < previousEnd || ends[i] < starts[i] || ends[i] > segment.audio_duration + 0.1) {
        invalid = true; break;
      }
      previousStart = starts[i]; previousEnd = ends[i];
      const visible = Array.from(characters[i]).filter((_, j) => !omittedIndexes.has(characterOffset + j)).join('');
      characterOffset += characters[i].length;
      for (const character of canonicalCharacters(visible)) mapped.push({ character, start: starts[i], end: ends[i] });
    }
    if (invalid) { failures.push(`${source}: invalid or out-of-range character times`); continue; }
    if (mapped.map(item => item.character).join('') !== expected) {
      failures.push(`${source}: spoken characters differ from narration`); continue;
    }
    const aligned = chunks.chunks.map(chunk => {
      const first = mapped[offsets[chunk.from]], last = mapped[offsets[chunk.to] - 1];
      if (!first || !last || last.end <= first.start) throw new Error(`Invalid caption timing in ${segment.id}.`);
      return { text: chunk.text, start: first.start, end: Math.min(last.end, segment.audio_duration) };
    });
    // The provider can assign overlapping phoneme boundaries. A single displayed
    // caption must end when the next one begins, while retaining its real onset.
    for (let i = 0; i < aligned.length - 1; i++) aligned[i].end = Math.min(aligned[i].end, aligned[i + 1].start);
    if (aligned.some(cue => cue.end <= cue.start)) throw new Error(`Overlapping caption timing in ${segment.id}.`);
    return { timing: `ElevenLabs character alignment (${source}); original audio speed.`, cues: aligned };
  }
  throw new Error(`Cannot align captions for ${segment.id}: ${failures.join('; ') || 'no character alignment found'}. Check the script and cached response before rendering.`);
}

const cues = [];
for (const segment of timeline.segments) {
  const shot = shots.find(item => segment.start >= item.start && segment.start < item.start + item.duration);
  segment.caption_cues.forEach((chunk, index) => {
    const start = segment.start + voiceOffset + chunk.start;
    const end = segment.start + voiceOffset + chunk.end;
    cues.push({ start, end, text: chunk.text, shot_id: shot.id, asset_id: `caption-${segment.id}-${index}` });
  });
}

const stamp = seconds => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3_600_000)).padStart(2, '0')}:${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
writeFileSync(join(output, 'submission-demo.srt'), cues.map((cue, i) => `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n'));
if (captionsOnly) {
  console.log('Prepared ' + cues.length + ' aligned captions for ' + plan.duration + 's; no native film was assembled.');
  process.exit(0);
}
if (audioOnly) {
  const audioFile = join(output, 'audio-rehearsal.wav');
  renderMix(null, audioFile);
  const metadata = { kind: 'audio_rehearsal', native_capture: false, story_id: plan.story_id, duration: plan.duration, narration, narration_speed: 1, voice_seconds: timeline.segments.reduce((sum, segment) => sum + segment.audio_duration, 0), captions: cues.length, music, format: probe(audioFile), audio_metrics: measureAudio(audioFile) };
  writeFileSync(join(output, 'audio-rehearsal.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify({ file: audioFile, ...metadata }, null, 2));
  process.exit(0);
}


async function waitForCaptures() {
  const seconds = Number(process.env.DEMO_WAIT_SECONDS || 900);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('DEMO_WAIT_SECONDS must be a non-negative number.');
  const deadline = Date.now() + seconds * 1000;
  let previous = '', announced = 0;
  for (;;) {
    const missing = [];
    for (const shot of shots) {
      const file = join(output, `${shot.id}.mp4`);
      if (!existsSync(file)) { missing.push(`${shot.id}.mp4`); continue; }
      try {
        const duration = Number(probe(file).format.duration);
        if (duration < shot.duration - 0.12) missing.push(`${shot.id}.mp4 (${duration.toFixed(2)}s; need ${shot.duration}s)`);
      } catch { missing.push(`${shot.id}.mp4 (still encoding)`); }
    }
    let events;
    try {
      events = JSON.parse(readFileSync(join(output, 'native-capture.json'), 'utf8'));
      if (!events || Array.isArray(events)) throw new Error('Expected a versioned native capture manifest.');
    } catch { missing.push('native-capture.json'); }
    if (!missing.length) return events;
    if (Date.now() >= deadline) throw new Error(`Capture wait expired: ${missing.join(', ')}. No final video was exported.`);
    const status = missing.join(', ');
    if (status !== previous || Date.now() - announced > 30_000) {
      console.log(`Waiting for real captures: ${status}`); previous = status; announced = Date.now();
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

function addEvidence(capture) {
  if (capture.layout?.mode === 'demo-browser') return;
  const { proof } = capture;
  // Requests are visible in the real page. Keep protocol excerpts compact so
  // that evidence supplements the scene rather than covering half the image.
  const evidence = [
    { event: proof.forest, title: '40 trees · our starting point preserved', label: 'RECORDED NATIVE WEBMCP RESULT' },
    { event: proof.details, title: `${capture.path_object_ids.length} individually editable path stones`, label: 'RECORDED NATIVE WEBMCP RESULT' },
    { event: proof.changed, title: 'Both of my stone edits are still here', label: 'LIVE STATE READ BACK BY THE AGENT' },
  ];
  for (const { event, title, label } of evidence) {
    const shot = shots.find(item => item.id === event.clip);
    const end = Math.min(event.t + 3.5, shot.duration - 0.15);
    if (end - event.t < 1) throw new Error(`Leave one second after ${event.clip}'s native readback.`);
    addAsset('native-' + event.clip, { kind: 'notice', width: 390, height: 52, title, label }, event.clip, event.t, end, 850, 22);
  }
  // Sub-second capture handoffs remain documented in the manifest. Only longer
  // recording pauses need an on-screen note; this also keeps early readbacks clear.
  for (const clip of capture.clips.filter(item => item.cuts.reduce((seconds, cut) => seconds + cut.end - cut.start, 0) > 1 && item.id !== 'closing')) {
    addAsset('waiting-cut-' + clip.id, {
      kind: 'notice', width: 285, height: 52,
      title: 'Recording pause omitted', label: 'SAME SCENE · ACTIONS AT REAL SPEED',
    }, clip.id, 0.2, 2.2, 960, 22);
  }
  // The closing is deliberately free of code cards and branding overlays.
  // Its remaining music-only seconds show the actual moving native scene.
}

function renderAssets() {
  const swift = join(assets, 'render-overlays.swift');
  const input = join(assets, 'render-jobs.json');
  writeFileSync(swift, renderer);
  writeFileSync(input, JSON.stringify({ fonts: [resolve('public/fonts/dm-sans.ttf'), resolve('public/fonts/manrope.ttf')], jobs }));
  console.log(`Rendering ${jobs.length} restrained title, transcript and caption assets.`);
  run('swift', [swift, input], 120_000);
}

function overlayGraph(base, items) {
  const graph = [base];
  let current = 'base';
  items.forEach((item, i) => {
    const next = `layer${i}`;
    graph.push(`[${current}][${i + 1}:v]overlay=${item.x}:${item.y}:eof_action=repeat:enable='gte(t,${item.start.toFixed(3)})*lt(t,${item.end.toFixed(3)})'[${next}]`);
    current = next;
  });
  graph.push(`[${current}]format=yuv420p[video]`);
  return graph.join(';');
}

if (checking) {
  // A local compositing check has no native evidence cards.
  const checkManifest = join(output, 'native-capture.json');
  addCaptionAssets(existsSync(checkManifest) ? JSON.parse(readFileSync(checkManifest, 'utf8')) : null);
  renderAssets();
  const caption = jobs.find(job => job.kind === 'caption').path;
  const title = jobs.find(job => job.kind === 'title')?.path;
  const placement = overlays.get(shots[0].id).find(item => item.file === caption);
  const items = [
    ...(title ? [{ file: title, start: 0, end: 1, x: 34, y: 525 }] : []),
    { file: caption, start: 0, end: 1, x: placement.x, y: placement.y },
  ];
  const graph = overlayGraph('[0:v]setsar=1[base]', items);
  const voiceIndex = items.length + 1, musicIndex = items.length + 2;
  const mix = `[${voiceIndex}:a]loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][sidechain];[${musicIndex}:a]loudnorm=I=${musicLoudness}:TP=-4:LRA=11,aresample=48000,aformat=channel_layouts=stereo[music];[music][sidechain]${duckingFilter}[ducked];[voice][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.96:level=false[mix]`;
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x132a31:s=1280x720:r=30:d=1', ...items.flatMap(item => ['-i', item.file]), '-i', timeline.segments[0].audio, '-i', music,
    '-filter_complex_threads', '1', '-filter_complex', `${graph};${mix}`, '-map', '[video]', '-map', '[mix]', '-t', '1', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', join(output, '_overlay-check.mp4')]);
  run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(output, '_overlay-check.mp4'), '-frames:v', '1', '-q:v', '2', join(output, '_overlay-check.jpg')]);
  console.log(`Validated AppKit alpha, ffmpeg compositing, normalized audio mixing and H.264/AAC encoding. Review ${join(output, '_overlay-check.jpg')}`);
  process.exit(0);
}

const capture = validateNativeCapture(await waitForCaptures(), plan);
const events = capture.events;
const demoBrowser = addCaptionAssets(capture);
addEvidence(capture);
renderAssets();
const rendered = [];
for (const shot of shots) {
  console.log(`Rendering ${shot.id}: ${shot.duration}s, ${overlays.get(shot.id).length} timed overlays.`);
  const items = overlays.get(shot.id);
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(output, `${shot.id}.mp4`)];
  for (const item of items) args.push('-i', item.file);
  const graph = overlayGraph(`[0:v]fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${shot.duration},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.12[base]`, items);
  const file = join(assets, `${shot.id}-finished.mp4`);
  args.push('-filter_complex_threads', '1', '-filter_complex', graph, '-map', '[video]', '-an', '-t', String(shot.duration), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file);
  run(ffmpeg, args);
  rendered.push(file);
}

function renderMix(videoList, outputFile) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (videoList) args.push('-f', 'concat', '-safe', '0', '-i', videoList);
  for (const segment of timeline.segments) args.push('-i', segment.audio);
  args.push('-stream_loop', '-1', '-i', music);
  const offset = videoList ? 1 : 0;
  const audio = timeline.segments.map((segment, i) => '[' + (i + offset) + ':a]loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,aformat=channel_layouts=stereo,adelay=' + Math.round((segment.start + voiceOffset) * 1000) + ':all=1[voice' + i + ']');
  // Keep continuous sample-derived PTS through delayed MP3s and the music tail.
  // Narration is never time-stretched or faded across the final spoken line.
  audio.push(timeline.segments.map((_, i) => '[voice' + i + ']').join('') + 'amix=inputs=' + timeline.segments.length + ':normalize=0:duration=longest,asetpts=N/SR/TB,apad=pad_dur=' + plan.duration + ',atrim=duration=' + plan.duration + ',asplit=2[voices][sidechain]');
  audio.push('[' + (timeline.segments.length + offset) + ':a]atrim=duration=' + plan.duration + ',asetpts=PTS-STARTPTS,loudnorm=I=' + musicLoudness + ':TP=-4:LRA=11,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:st=0:d=2,afade=t=out:st=' + (plan.duration - 4) + ':d=4[music]');
  audio.push('[music][sidechain]' + duckingFilter + '[ducked]');
  audio.push('[voices][ducked]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.96:level=false,atrim=duration=' + plan.duration + '[mix]');
  args.push('-filter_complex_threads', '1', '-filter_complex', audio.join(';'));
  if (videoList) args.push('-map', '0:v:0', '-c:v', 'copy');
  args.push('-map', '[mix]', '-c:a', videoList ? 'aac' : 'pcm_s16le');
  if (videoList) args.push('-b:a', '192k', '-movflags', '+faststart');
  args.push('-ar', '48000', '-t', String(plan.duration), '-metadata', 'title=' + (videoList ? plan.title : 'Audio rehearsal — ' + plan.title), outputFile);
  run(ffmpeg, args);
}

// Concat syntax is its own format, not a shell command.
const list = join(assets, 'shots.txt');
writeFileSync(list, rendered.map(file => "file '" + file.replaceAll("'", "'\\''") + "'").join('\n') + '\n');
const master = join(output, 'submission-demo.mp4');
const temporaryMaster = join(output, '_submission-demo-rendering.mp4');
console.log('Mixing original-speed narration and a lofi bed; only the music fades at the end.');
renderMix(list, temporaryMaster);

const final = probe(temporaryMaster);
const video = final.streams.find(stream => stream.codec_type === 'video');
const sound = final.streams.find(stream => stream.codec_type === 'audio');
if (Math.abs(Number(final.format.duration) - plan.duration) > 0.1 || video?.width !== width || video?.height !== height || video?.codec_name !== 'h264' || sound?.codec_name !== 'aac' || !Number.isFinite(Number(sound?.duration)) || Math.abs(Number(sound.duration) - plan.duration) > 0.1) {
  throw new Error(`Unexpected final media format: ${JSON.stringify(final)}`);
}
const audioMetrics = measureAudio(temporaryMaster);
console.log(`Final mix measurements: ${JSON.stringify(audioMetrics)}`);
renameSync(temporaryMaster, master);
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', master, '-vf', `fps=12/${plan.duration},scale=320:180,tile=4x3`, '-frames:v', '1', '-q:v', '2', join(output, 'submission-contact-sheet.jpg')]);
run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(plan.duration - 8), '-i', master, '-frames:v', '1', '-q:v', '2', join(output, 'submission-poster.jpg')]);
const captionSources = [...new Set(timeline.segments.map(segment => segment.caption_timing))];
const segmentMetadata = timeline.segments.map(segment => ({ id: segment.id, start: segment.start, duration: segment.duration, voice_offset: voiceOffset, audio: segment.audio, audio_duration: segment.audio_duration, alignment: segment.alignment || null, provenance: segment.provenance || null, caption_timing: segment.caption_timing, captions: segment.caption_cues.length }));
const captionLayout = demoBrowser ? {
  sidebar_open: { x: 40, y: 620, width: 880, height: 76 },
  sidebar_closed: { x: 120, y: 620, width: 1040, height: 76 },
  other_editorial_overlays: false,
} : { default: { x: 120, y: 620, width: 1040, height: 77 }, other_editorial_overlays: true };
writeFileSync(join(output, 'export-metadata.json'), JSON.stringify({ generated_at: new Date().toISOString(), story_id: plan.story_id, capture_id: capture.capture_id, app_revision: capture.app_revision, capture_continuity: capture.continuity, capture_layout: capture.layout || null, presentation: capture.presentation || [], caption_layout: captionLayout, master, format: final, shots, voice: narration.voice, provider: narration.provider, model: narration.model, narration, segments: segmentMetadata, captions: cues.length, native_events: events.length, music, source: 'native-capture.json', caption_timing: captionSources.join(' '), audio_processing: { narration_speed: 1, narration_time_stretch: false, voice_lead_in_seconds: voiceOffset, narration_loudness_target_lufs: -16, music_loudness_target_lufs: musicLoudness, music_ducking: { ...ducking, sidechain: 'normalized narration bus' } }, audio_metrics: audioMetrics }, null, 2));
const narrationCredit = narration.provider === 'ElevenLabs'
  ? `English narration: ElevenLabs ${narration.voice}, model ${narration.model}, voice ID ${narration.voice_id}. Eight source MP3 tracks, character alignments and generation provenance are retained with [timeline.json](timeline.json).`
  : `English narration is synthesized locally using the macOS ${narration.voice} voice. Eight source AIFF tracks are retained with [timeline.json](timeline.json).`;
const captureCredit = demoBrowser
  ? 'The captured Demo browser is a functional interface, visibly labelled as a demo; it is not Chrome or ChatGPT. Only narration captions are added in the edit. Their placement follows the recorded sidebar state and never covers the open sidebar. No title, result or recording-pause cards are composited.'
  : 'Compact notices summarize actual recorded results; they are editorial annotations, not recreated chat.';
writeFileSync(join(output, 'README.md'), `# Submission film\n\n- Master: [submission-demo.mp4](submission-demo.mp4), ${plan.duration} seconds, ${width} × ${height}, H.264 CRF 18 video / AAC audio.\n- [Captions](submission-demo.srt): ${captionSources.join(' ')}\n- [Contact sheet](submission-contact-sheet.jpg) and [poster](submission-poster.jpg) are inspection artifacts.\n- Native tool evidence comes from [native-capture.json](native-capture.json). ${captureCredit}\n- ${narrationCredit}\n- Narration is normalized and placed in its shot without time stretching or playback-speed changes. Final mix: ${audioMetrics.integrated_lufs} LUFS integrated, ${audioMetrics.true_peak_dbtp} dBTP true peak, ${audioMetrics.mean_volume_dbfs} dBFS mean and ${audioMetrics.peak_volume_dbfs} dBFS sample peak.\n- Music: Aurora Drift, created and supplied by Thomas Werner using Suno, mixed quietly beneath the narration.\n- Export is 30 FPS; browser capture timing is preserved. The 30 FPS file is not a claim that the original screencast captured every displayed frame.\n- The app footage retains one scene on one native browser page, from human placement through agent additions and later human edits. Capture runs in original segments, not as an uninterrupted video stream. Original frames and timestamp manifests are retained unchanged in each shot folder. Declared cuts document idle waiting and recording gaps; retained actions run at their original speed. No action is invented, reconstructed or accelerated. Source ranges and object continuity evidence are retained in native-capture.json. No upload or Devpost submission is performed by this script.\n\nRebuild: \`node scripts/assemble-demo.mjs\` from the repository root. The script waits for complete raw clips and native evidence. \`--plan\` validates audio lengths and character alignment before rendering; \`--check\` checks local text rendering and ffmpeg compositing without waiting for captures.\n`);
console.log(`Ready for full playback review: ${master}`);
