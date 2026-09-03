/** Portable scene links: gz1 is gzip + base64url; legacy raw links stay readable. */
const MAX_SCENE_BYTES = 4_000_000;
const MAX_LINK_CHARACTERS = 5_400_000;

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SCENE_BYTES) {
        await reader.cancel();
        throw new Error('Scene exceeds the 4 MB size limit.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function encodeSceneHash(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_SCENE_BYTES) throw new Error('Scene exceeds the 4 MB size limit.');
  if (typeof CompressionStream === 'undefined') throw new Error('Scene sharing requires a browser with gzip compression support.');
  const compressed = await readBounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
  return `#scene=gz1.${encodeBase64(compressed)}`;
}

export async function decodeSceneLink(link: string): Promise<string> {
  if (link.length > MAX_LINK_CHARACTERS) throw new Error('Scene link is too large.');
  const hash = link.slice(link.indexOf('#'));
  const match = hash.match(/^#scene=(gz1\.)?([A-Za-z0-9_-]+)$/);
  if (!match) throw new Error('Missing, damaged or unsupported scene link.');
  let binary: string;
  try { binary = atob(match[2].replace(/-/g, '+').replace(/_/g, '/')); }
  catch { throw new Error('Scene link contains invalid base64 data.'); }
  if (binary.length > MAX_SCENE_BYTES) throw new Error('Scene exceeds the 4 MB size limit.');
  let bytes: Uint8Array = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (match[1]) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This scene link requires a browser with gzip decompression support.');
    bytes = await readBounded(new Blob([new Uint8Array(bytes).buffer]).stream().pipeThrough(new DecompressionStream('gzip')));
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
