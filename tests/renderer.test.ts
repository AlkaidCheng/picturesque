import assert from "node:assert/strict";

import { afterEach, test, vi } from "vitest";

import {
  addImages,
  autoPair,
  createImageRecord,
  createProject,
  getActivePairs,
  setComparisonMode
} from "../src/project.js";
import {
  ComparisonRenderer,
  comparisonAspect,
  computeExportSize,
  resolveBlinkLayer,
  resolveFrameRatio
} from "../src/renderer.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function requireValue<T>(value: T | null | undefined): T {
  assert.ok(value);
  return value;
}

function record(name: string, width: number, height: number) {
  return createImageRecord({
    name,
    type: "image/png",
    size: 10,
    width,
    height,
    dataUrl: "data:image/png;base64,AA=="
  });
}

function pairedProject() {
  const project = createProject("Renderer");
  addImages(project, "left", [record("one.png", 800, 1200)]);
  addImages(project, "right", [record("one-clean.png", 1600, 900)]);
  autoPair(project);
  return project;
}

test("automatic frame ratio follows collection A", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  assert.equal(resolveFrameRatio(project, pair), 2 / 3);
  pair.settings.frameRatio = "right";
  assert.equal(resolveFrameRatio(project, pair), 16 / 9);
});

test("numeric frame ratios are accepted and invalid values fall back", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);

  pair.settings.frameRatio = "1.5";
  assert.equal(resolveFrameRatio(project, pair), 1.5);
  pair.settings.frameRatio = "invalid";
  assert.equal(resolveFrameRatio(project, pair), 2 / 3);
});

test("side-by-side export uses two equal horizontal frames", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  pair.settings.showLabels = false;
  setComparisonMode(project, "side");
  pair.settings.orientation = "horizontal";
  assert.equal(comparisonAspect(project, pair, false), 4 / 3);
  assert.deepEqual(computeExportSize(project, pair, 2400, false), { width: 2400, height: 1800 });
});

test("vertical side-by-side export stacks two portrait frames", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  pair.settings.showLabels = false;
  pair.settings.orientation = "vertical";
  setComparisonMode(project, "side");

  assert.equal(comparisonAspect(project, pair, false), 1 / 3);
  assert.deepEqual(computeExportSize(project, pair, 2400, false), { width: 800, height: 2400 });
});

test("labels reserve vertical space in the exported aspect ratio", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  pair.settings.orientation = "horizontal";
  setComparisonMode(project, "side");

  assert.ok(comparisonAspect(project, pair, true) < comparisonAspect(project, pair, false));
});

test("overlay export preserves the shared portrait frame", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  pair.settings.showLabels = false;
  setComparisonMode(project, "overlay");
  assert.equal(comparisonAspect(project, pair, false), 2 / 3);
  assert.deepEqual(computeExportSize(project, pair, 2400, false), { width: 1600, height: 2400 });
});

test("export dimensions clamp the requested long edge", () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  pair.settings.showLabels = false;
  setComparisonMode(project, "overlay");

  assert.deepEqual(computeExportSize(project, pair, 1, false), { width: 427, height: 640 });
  assert.deepEqual(computeExportSize(project, pair, 100_000, false), { width: 5461, height: 8192 });
});

test("Blink phases select collection A then collection B", () => {
  const left = { id: "left" };
  const right = { id: "right" };
  const images = { left, right };

  assert.deepEqual(resolveBlinkLayer(images, 0), { image: left, layer: "left" });
  assert.deepEqual(resolveBlinkLayer(images, 1), { image: right, layer: "right" });
  assert.deepEqual(resolveBlinkLayer(images, 2), { image: left, layer: "left" });
});

test("export rendering forwards an explicit Blink phase to the compositor", async () => {
  const project = pairedProject();
  const pair = requireValue(getActivePairs(project)[0]);
  setComparisonMode(project, "blink");
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({})
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  const renderer = Object.create(ComparisonRenderer.prototype);
  renderer.loadPair = async () => ({ left: {}, right: {}, leftRecord: {}, rightRecord: {} });
  let drawOptions;
  renderer.drawComparison = (...args: unknown[]) => {
    drawOptions = args[5];
  };

  await renderer.renderToCanvas(project, pair, {
    format: "gif",
    longEdge: 640,
    includeLabels: false,
    blinkPhase: 1
  });

  assert.deepEqual(drawOptions, { includeGrid: false, includeLabels: false, blinkPhase: 1 });
});
