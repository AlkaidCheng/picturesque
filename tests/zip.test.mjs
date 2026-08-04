import test from "node:test";
import assert from "node:assert/strict";

import { buildZip, crc32 } from "../src/zip.js";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("buildZip emits local, central, and end records", async () => {
  const zip = await buildZip([
    { name: "first.txt", data: new TextEncoder().encode("alpha") },
    { name: "folder/second.txt", data: new TextEncoder().encode("beta") }
  ], new Date("2025-01-02T03:04:06"));
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = new TextDecoder().decode(bytes);

  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.match(text, /first\.txt/);
  assert.match(text, /folder\/second\.txt/);
});
