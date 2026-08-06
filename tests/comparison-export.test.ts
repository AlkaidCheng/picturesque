import assert from "node:assert/strict";

import { test } from "vitest";

import { encodeStaticCanvas, renderComparisonExport } from "../src/comparison-export.js";

function createCanvas(pixels = new Uint8ClampedArray(4 * 6 * 4)) {
  const calls: Array<{ mimeType: string; quality: number }> = [];
  return {
    width: 4,
    height: 6,
    calls,
    getContext: () => ({ getImageData: () => ({ data: pixels }) }),
    toBlob: (callback: (blob: Blob | null) => void, mimeType: string, quality: number) => {
      calls.push({ mimeType, quality });
      callback(new Blob([mimeType], { type: mimeType }));
    }
  };
}

test("static canvas encoding preserves PNG and JPEG codec behavior", async () => {
  const pngCanvas = createCanvas();
  const png = await encodeStaticCanvas(pngCanvas, "png", 0.2);
  assert.equal(png.type, "image/png");
  assert.deepEqual(pngCanvas.calls, [{ mimeType: "image/png", quality: 0.6 }]);

  const jpegCanvas = createCanvas();
  const jpeg = await encodeStaticCanvas(jpegCanvas, "jpeg", 2);
  assert.equal(jpeg.type, "image/jpeg");
  assert.deepEqual(jpegCanvas.calls, [{ mimeType: "image/jpeg", quality: 1 }]);
});

test("static canvas encoding rejects browser codec failures", async () => {
  const canvas = {
    toBlob: (callback: (blob: Blob | null) => void) => callback(null)
  };
  await assert.rejects(
    encodeStaticCanvas(canvas, "png"),
    /browser could not encode the comparison/
  );
});

test("comparison export defaults to one PNG render and preserves its dimensions", async () => {
  const canvas = createCanvas();
  const receivedOptions: unknown[] = [];
  const renderer = {
    renderToCanvas: async (_project: unknown, _pair: unknown, options: unknown) => {
      receivedOptions.push(options);
      return canvas;
    }
  };

  const result = await renderComparisonExport(
    renderer,
    {},
    { leftId: "image-a", rightId: null, settings: { blinkInterval: 700 } },
    "side"
  );

  assert.deepEqual(receivedOptions, [{ format: "png" }]);
  assert.equal(result.width, 4);
  assert.equal(result.height, 6);
  assert.equal(result.blob.type, "image/png");
  assert.deepEqual(canvas.calls, [{ mimeType: "image/png", quality: 0.92 }]);
});

test("Blink GIF export renders A then B with the saved pair interval", async () => {
  const pixelsA = new Uint8ClampedArray(4 * 6 * 4).fill(32);
  const pixelsB = new Uint8ClampedArray(4 * 6 * 4).fill(224);
  const canvases = [createCanvas(pixelsA), createCanvas(pixelsB)];
  const phases: number[] = [];
  const longEdges: string[] = [];
  const renderer = {
    renderToCanvas: async (_project: unknown, _pair: unknown, options: { blinkPhase: number; longEdge: string }) => {
      phases.push(options.blinkPhase);
      longEdges.push(options.longEdge);
      return canvases[options.blinkPhase];
    }
  };
  const pair = {
    leftId: "image-a",
    rightId: "image-b",
    settings: { blinkInterval: 700 }
  };
  let animation;
  const encodedBlob = new Blob(["gif"], { type: "image/gif" });

  const result = await renderComparisonExport(
    renderer,
    {},
    pair,
    "blink",
    { format: "gif", longEdge: "3840" },
    {
      encodeGif: async (value: unknown) => {
        animation = value;
        return encodedBlob;
      }
    }
  );

  assert.deepEqual(phases, [0, 1]);
  assert.deepEqual(longEdges, ["960", "960"]);
  assert.equal(result.blob, encodedBlob);
  assert.equal(result.width, 4);
  assert.equal(result.height, 6);
  assert.deepEqual(animation, {
    width: 4,
    height: 6,
    frames: [
      { pixels: pixelsA, delayMs: 700 },
      { pixels: pixelsB, delayMs: 700 }
    ]
  });
});

test("GIF export rejects non-Blink and unmapped comparisons", async () => {
  const renderer = { renderToCanvas: async () => createCanvas() };
  const pair = { leftId: "image-a", rightId: "image-b", settings: { blinkInterval: 700 } };
  await assert.rejects(
    renderComparisonExport(renderer, {}, pair, "overlay", { format: "gif" }),
    /only in Blink mode/
  );
  await assert.rejects(
    renderComparisonExport(renderer, {}, { ...pair, rightId: null }, "blink", { format: "gif" }),
    /mapped image in both collections/
  );
});
