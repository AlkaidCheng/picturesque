import assert from "node:assert/strict";

import { afterEach, test, vi } from "vitest";

import { decodeFrames } from "modern-gif";

import { encodeGifAnimation, normalizeGifDelay } from "../src/gif.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface ParsedGif {
  signature: string;
  width: number;
  height: number;
  delaysMs: number[];
  frameSizes: Array<{ width: number; height: number }>;
  loopCount: number | null;
  hasTrailer: boolean;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return readByte(bytes, offset) | (readByte(bytes, offset + 1) << 8);
}

function readByte(bytes: Uint8Array | Uint8ClampedArray, offset: number): number {
  const value = bytes[offset];
  if (value === undefined) throw new RangeError("Unexpected end of GIF data.");
  return value;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let offset = start;
  while (offset < bytes.length) {
    const length = readByte(bytes, offset);
    offset += 1;
    if (length === 0) return offset;
    offset += length;
  }
  throw new Error("Unterminated GIF data sub-block.");
}

function parseGif(bytes: Uint8Array): ParsedGif {
  const signature = readAscii(bytes, 0, 6);
  const width = readUint16(bytes, 6);
  const height = readUint16(bytes, 8);
  const screenPacked = readByte(bytes, 10);
  let offset = 13;
  if (screenPacked & 0x80) offset += 3 * 2 ** ((screenPacked & 0x07) + 1);

  const delaysMs: number[] = [];
  const frameSizes: Array<{ width: number; height: number }> = [];
  let loopCount: number | null = null;
  let hasTrailer = false;

  while (offset < bytes.length) {
    const marker = readByte(bytes, offset);
    offset += 1;
    if (marker === 0x3b) {
      hasTrailer = true;
      break;
    }
    if (marker === 0x2c) {
      const frameWidth = readUint16(bytes, offset + 4);
      const frameHeight = readUint16(bytes, offset + 6);
      const imagePacked = readByte(bytes, offset + 8);
      frameSizes.push({ width: frameWidth, height: frameHeight });
      offset += 9;
      if (imagePacked & 0x80) offset += 3 * 2 ** ((imagePacked & 0x07) + 1);
      offset += 1;
      offset = skipSubBlocks(bytes, offset);
      continue;
    }
    if (marker !== 0x21) throw new Error(`Unexpected GIF block marker 0x${marker.toString(16)}.`);

    const extensionLabel = readByte(bytes, offset);
    offset += 1;
    if (extensionLabel === 0xf9) {
      assert.equal(readByte(bytes, offset), 4);
      delaysMs.push(readUint16(bytes, offset + 2) * 10);
      offset += 6;
      continue;
    }

    const headerLength = readByte(bytes, offset);
    offset += 1;
    const applicationName = extensionLabel === 0xff
      ? readAscii(bytes, offset, headerLength)
      : "";
    offset += headerLength;
    if (applicationName === "NETSCAPE2.0") {
      const subBlockLength = readByte(bytes, offset);
      assert.equal(subBlockLength, 3);
      assert.equal(readByte(bytes, offset + 1), 1);
      loopCount = readUint16(bytes, offset + 2);
    }
    offset = skipSubBlocks(bytes, offset);
  }

  return { signature, width, height, delaysMs, frameSizes, loopCount, hasTrailer };
}

function solidFrame(red: number, green: number, blue: number): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray([
    red, green, blue, 255,
    red, green, blue, 255,
    red, green, blue, 255,
    red, green, blue, 255
  ]);
}

test("animated GIF encoding writes two timed frames that loop forever", async () => {
  const blob = await encodeGifAnimation({
    width: 2,
    height: 2,
    useWorker: false,
    frames: [
      { pixels: solidFrame(220, 20, 40), delayMs: 700 },
      { pixels: solidFrame(20, 80, 230), delayMs: 700 }
    ]
  });
  const buffer = await blob.arrayBuffer();
  const parsed = parseGif(new Uint8Array(buffer));
  const decodedFrames = decodeFrames(buffer);

  assert.equal(blob.type, "image/gif");
  assert.equal(parsed.signature, "GIF89a");
  assert.equal(parsed.width, 2);
  assert.equal(parsed.height, 2);
  assert.deepEqual(parsed.frameSizes, [{ width: 2, height: 2 }, { width: 2, height: 2 }]);
  assert.deepEqual(parsed.delaysMs, [700, 700]);
  assert.equal(parsed.loopCount, 0);
  assert.equal(parsed.hasTrailer, true);
  assert.equal(decodedFrames.length, 2);
  assert.ok(decodedFrames[0]);
  assert.ok(decodedFrames[1]);
  assert.ok(readByte(decodedFrames[0].data, 0) > readByte(decodedFrames[0].data, 2));
  assert.ok(readByte(decodedFrames[1].data, 2) > readByte(decodedFrames[1].data, 0));
});

test("browser encoding transfers frames to a one-shot worker and terminates it", async () => {
  type WorkerListener = (event: { data: { buffer?: ArrayBuffer; error?: string }; message?: string }) => void;
  class FakeWorker {
    static instance: FakeWorker;
    listeners = new Map<string, WorkerListener>();
    message: unknown;
    transfers: Transferable[] = [];
    terminated = false;

    constructor() {
      FakeWorker.instance = this;
    }

    addEventListener(type: string, listener: WorkerListener) {
      this.listeners.set(type, listener);
    }

    postMessage(message: unknown, transfers: Transferable[]) {
      this.message = message;
      this.transfers = transfers;
      queueMicrotask(() => {
        const buffer = new TextEncoder().encode("GIF89a").buffer;
        this.listeners.get("message")?.({ data: { buffer } });
      });
    }

    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", FakeWorker);
  const first = solidFrame(220, 20, 40);
  const second = solidFrame(20, 80, 230);

  const blob = await encodeGifAnimation({
    width: 2,
    height: 2,
    useWorker: true,
    frames: [
      { pixels: first, delayMs: 700 },
      { pixels: second, delayMs: 800 }
    ]
  });

  assert.equal(blob.type, "image/gif");
  assert.equal(FakeWorker.instance.terminated, true);
  assert.deepEqual(FakeWorker.instance.transfers, [first.buffer, second.buffer]);
  assert.deepEqual(FakeWorker.instance.message, {
    animation: {
      width: 2,
      height: 2,
      frames: [
        { pixels: first, delayMs: 700 },
        { pixels: second, delayMs: 800 }
      ]
    }
  });
});

test("browser worker failures reject and still terminate the worker", async () => {
  type WorkerListener = (event: { data: { error: string } }) => void;
  class FailingWorker {
    static instance: FailingWorker;
    listeners = new Map<string, WorkerListener>();
    terminated = false;

    constructor() {
      FailingWorker.instance = this;
    }

    addEventListener(type: string, listener: WorkerListener) {
      this.listeners.set(type, listener);
    }

    postMessage() {
      queueMicrotask(() => this.listeners.get("message")?.({ data: { error: "Palette failed." } }));
    }

    terminate() {
      this.terminated = true;
    }
  }
  vi.stubGlobal("Worker", FailingWorker);

  await assert.rejects(
    encodeGifAnimation({
      width: 2,
      height: 2,
      useWorker: true,
      frames: [
        { pixels: solidFrame(0, 0, 0), delayMs: 700 },
        { pixels: solidFrame(255, 255, 255), delayMs: 700 }
      ]
    }),
    /Palette failed/
  );
  assert.equal(FailingWorker.instance.terminated, true);
});

test("GIF delays are rounded to centiseconds and bounded", () => {
  assert.equal(normalizeGifDelay(704), 700);
  assert.equal(normalizeGifDelay(706), 710);
  assert.equal(normalizeGifDelay(1), 20);
  assert.equal(normalizeGifDelay(999_999), 655_350);
  assert.throws(() => normalizeGifDelay(0), /positive finite/);
});

test("GIF encoding validates dimensions, frame count, and RGBA length", async () => {
  const frame = { pixels: solidFrame(0, 0, 0), delayMs: 700 };
  await assert.rejects(
    encodeGifAnimation({ width: 0, height: 2, frames: [frame, frame], useWorker: false }),
    /GIF width/
  );
  await assert.rejects(
    encodeGifAnimation({ width: 2, height: 2, frames: [frame], useWorker: false }),
    /at least two frames/
  );
  await assert.rejects(
    encodeGifAnimation({
      width: 2,
      height: 2,
      useWorker: false,
      frames: [frame, { pixels: new Uint8ClampedArray(4), delayMs: 700 }]
    }),
    /16 RGBA values/
  );
  await assert.rejects(
    encodeGifAnimation({ width: 5000, height: 5000, frames: [frame, frame], useWorker: false }),
    /at most 16,777,216 pixels/
  );
});
