import assert from "node:assert/strict";

import { test } from "vitest";

import { buildZip, crc32 } from "../src/zip.js";

const encoder = new TextEncoder();

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(encoder.encode("123456789")), 0xcbf43926);
});

test("buildZip emits local, central, and end records", async () => {
  const zip = await buildZip([
    { name: "first.txt", data: encoder.encode("alpha") },
    { name: "folder/second.txt", data: encoder.encode("beta") }
  ], new Date("2025-01-02T03:04:06"));
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = new TextDecoder().decode(bytes);

  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(bytes.length - 14, true), 2);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.match(text, /first\.txt/);
  assert.match(text, /folder\/second\.txt/);
});

test("buildZip emits a valid empty archive", async () => {
  const zip = await buildZip([]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);

  assert.equal(bytes.length, 22);
  assert.equal(view.getUint32(0, true), 0x06054b50);
  assert.equal(view.getUint16(8, true), 0);
});

test("buildZip accepts Blob data and marks Unicode names as UTF-8", async () => {
  const zip = await buildZip([
    { name: "/照片.txt", data: new Blob(["portrait"]) }
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = new TextDecoder().decode(bytes);

  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  assert.match(text, /照片\.txt/);
  assert.doesNotMatch(text, /\/照片\.txt/);
});

test("buildZip rejects archives beyond the ZIP32 entry limit", async () => {
  await assert.rejects(buildZip(new Array(65_536)), /up to 65,535 files/);
});
