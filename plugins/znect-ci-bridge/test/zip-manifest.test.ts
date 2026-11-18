import { describe, expect, it } from "vitest";
import { extractValidationManifest } from "../src/providers/zip-manifest";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function put16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function put32(view: DataView, offset: number, value: number) { view.setUint32(offset, value, true); }

function storedZip(name: string, content: string): Uint8Array {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const data = encoder.encode(content);
  const crc = crc32(data);
  const localLength = 30 + nameBytes.length + data.length;
  const centralLength = 46 + nameBytes.length;
  const output = new Uint8Array(localLength + centralLength + 22);
  const view = new DataView(output.buffer);
  put32(view, 0, 0x04034b50); put16(view, 4, 20); put16(view, 6, 0); put16(view, 8, 0);
  put32(view, 14, crc); put32(view, 18, data.length); put32(view, 22, data.length);
  put16(view, 26, nameBytes.length); put16(view, 28, 0);
  output.set(nameBytes, 30); output.set(data, 30 + nameBytes.length);
  const central = localLength;
  put32(view, central, 0x02014b50); put16(view, central + 4, 20); put16(view, central + 6, 20);
  put16(view, central + 8, 0); put16(view, central + 10, 0);
  put32(view, central + 16, crc); put32(view, central + 20, data.length); put32(view, central + 24, data.length);
  put16(view, central + 28, nameBytes.length); put16(view, central + 30, 0); put16(view, central + 32, 0);
  put16(view, central + 34, 0); put16(view, central + 36, 0); put32(view, central + 38, 0);
  put32(view, central + 42, 0); output.set(nameBytes, central + 46);
  const end = central + centralLength;
  put32(view, end, 0x06054b50); put16(view, end + 4, 0); put16(view, end + 6, 0);
  put16(view, end + 8, 1); put16(view, end + 10, 1);
  put32(view, end + 12, centralLength); put32(view, end + 16, localLength); put16(view, end + 20, 0);
  return output;
}

describe("central validation manifest ZIP extraction", () => {
  it("extracts only the exact manifest path from a bounded ZIP", async () => {
    const json = JSON.stringify({ schema_version: 1, project_id: "znect-ci-bridge" });
    await expect(extractValidationManifest(storedZip("ci-bridge-validation-manifest.json", json))).resolves.toBe(json);
  });

  it("rejects archives without the exact manifest entry", async () => {
    await expect(extractValidationManifest(storedZip("../ci-bridge-validation-manifest.json", "{}")))
      .rejects.toThrow(/missing/i);
  });

  it("rejects a corrupt manifest entry by CRC", async () => {
    const archive = storedZip("ci-bridge-validation-manifest.json", "{}");
    archive[30 + new TextEncoder().encode("ci-bridge-validation-manifest.json").length] ^= 1;
    await expect(extractValidationManifest(archive)).rejects.toThrow();
  });
});
