const MAX_ARCHIVE_BYTES = 2_000_000;
const MAX_MANIFEST_BYTES = 65_536;
const MAX_ENTRIES = 64;
const MANIFEST_PATH = "ci-bridge-validation-manifest.json";

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error("Malformed ZIP archive.");
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error("Malformed ZIP archive.");
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(bytes: Uint8Array, maxOutput: number): Promise<Uint8Array> {
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  } catch {
    throw new Error("The validation manifest ZIP uses an unsupported compression format.");
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxOutput - total) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Validation manifest exceeds the decompressed size limit.");
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

/** Extract exactly one named UTF-8 file from a bounded, non-Zip64 GitHub Actions ZIP archive. */
export async function extractValidationManifest(archive: Uint8Array): Promise<string> {
  if (archive.byteLength < 22 || archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Validation manifest ZIP archive size is outside the allowed bounds.");
  }
  const minEocd = Math.max(0, archive.length - 65_557);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= minEocd; offset--) {
    if (u32(archive, offset) === 0x06054b50) {
      const commentLength = u16(archive, offset + 20);
      if (offset + 22 + commentLength === archive.length) { eocd = offset; break; }
    }
  }
  if (eocd < 0 || u16(archive, eocd + 4) !== 0 || u16(archive, eocd + 6) !== 0) {
    throw new Error("Validation manifest ZIP has an invalid central directory.");
  }
  const entries = u16(archive, eocd + 10);
  const centralSize = u32(archive, eocd + 12);
  const centralOffset = u32(archive, eocd + 16);
  if (entries > MAX_ENTRIES || entries !== u16(archive, eocd + 8) ||
      centralOffset + centralSize > eocd || centralSize > 262_144) {
    throw new Error("Validation manifest ZIP directory exceeds the configured limits.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let cursor = centralOffset;
  let selected: { method: number; crc: number; compressed: number; uncompressed: number; localOffset: number } | undefined;
  for (let index = 0; index < entries; index++) {
    if (u32(archive, cursor) !== 0x02014b50) throw new Error("Malformed ZIP central directory entry.");
    const flags = u16(archive, cursor + 8);
    const method = u16(archive, cursor + 10);
    const crc = u32(archive, cursor + 16);
    const compressed = u32(archive, cursor + 20);
    const uncompressed = u32(archive, cursor + 24);
    const nameLength = u16(archive, cursor + 28);
    const extraLength = u16(archive, cursor + 30);
    const commentLength = u16(archive, cursor + 32);
    const localOffset = u32(archive, cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > centralOffset + centralSize || (flags & 1) !== 0 || (flags & 0x40) !== 0) {
      throw new Error("Validation manifest ZIP contains an unsupported or encrypted entry.");
    }
    let name: string;
    try { name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength)); }
    catch { throw new Error("Validation manifest ZIP contains a non-UTF-8 path."); }
    if (name === MANIFEST_PATH) {
      if (selected) throw new Error("Validation manifest ZIP contains duplicate manifest entries.");
      selected = { method, crc, compressed, uncompressed, localOffset };
    }
    cursor = end;
  }
  if (cursor !== centralOffset + centralSize || !selected) {
    throw new Error("Validation manifest file is missing from the central artifact.");
  }
  if (selected.uncompressed > MAX_MANIFEST_BYTES || selected.compressed > MAX_ARCHIVE_BYTES ||
      ![0, 8].includes(selected.method)) {
    throw new Error("Validation manifest entry exceeds limits or uses unsupported compression.");
  }
  const local = selected.localOffset;
  if (u32(archive, local) !== 0x04034b50 || u16(archive, local + 8) !== selected.method) {
    throw new Error("Validation manifest local ZIP header is invalid.");
  }
  const localNameLength = u16(archive, local + 26);
  const localExtraLength = u16(archive, local + 28);
  const dataStart = local + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + selected.compressed;
  if (dataStart < 0 || dataEnd > centralOffset || dataEnd > archive.length) {
    throw new Error("Validation manifest ZIP entry data is out of bounds.");
  }
  let localName: string;
  try { localName = decoder.decode(archive.subarray(local + 30, local + 30 + localNameLength)); }
  catch { throw new Error("Validation manifest local path is invalid."); }
  if (localName !== MANIFEST_PATH) throw new Error("Validation manifest local and central paths do not match.");

  const compressed = archive.subarray(dataStart, dataEnd);
  const content = selected.method === 0 ? compressed.slice() : await inflateRaw(compressed, MAX_MANIFEST_BYTES);
  if (content.byteLength !== selected.uncompressed || crc32(content) !== selected.crc) {
    throw new Error("Validation manifest ZIP entry failed integrity checks.");
  }
  try { return decoder.decode(content); }
  catch { throw new Error("Validation manifest is not valid UTF-8."); }
}
