import test from "node:test";
import assert from "node:assert/strict";

import { addImages, autoPair, createImageRecord, createProject, getActivePairs, setComparisonMode } from "../src/project.js";
import { comparisonAspect, computeExportSize, resolveFrameRatio } from "../src/renderer.js";

function record(name, width, height) {
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
  const pair = getActivePairs(project)[0];
  assert.equal(resolveFrameRatio(project, pair), 2 / 3);
  pair.settings.frameRatio = "right";
  assert.equal(resolveFrameRatio(project, pair), 16 / 9);
});

test("side-by-side export uses two equal horizontal frames", () => {
  const project = pairedProject();
  const pair = getActivePairs(project)[0];
  pair.settings.showLabels = false;
  setComparisonMode(project, "side");
  pair.settings.orientation = "horizontal";
  assert.equal(comparisonAspect(project, pair, false), 4 / 3);
  assert.deepEqual(computeExportSize(project, pair, 2400, false), { width: 2400, height: 1800 });
});

test("overlay export preserves the shared portrait frame", () => {
  const project = pairedProject();
  const pair = getActivePairs(project)[0];
  pair.settings.showLabels = false;
  setComparisonMode(project, "overlay");
  assert.equal(comparisonAspect(project, pair, false), 2 / 3);
  assert.deepEqual(computeExportSize(project, pair, 2400, false), { width: 1600, height: 2400 });
});
